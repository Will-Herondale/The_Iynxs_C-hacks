import {
  FieldEventSchema,
  ProjectionSnapshotSchema,
  type FieldEvent,
  type ProjectionSnapshot,
  type SubmitAck,
  type ValidationIssue,
} from '@setu/contract';
import { getMockConfig, type RuleContext } from './config.js';
import { emptyScenarioRules, type MockRelay, type MockSyncState, type ScenarioRules, type StoredEvent } from './scenario.js';
import { CHANNEL_NAME, STATE_KEY, defaultStorage, type KeyValueStorage } from './storage.js';

export interface MockStoreOptions {
  rules?: ScenarioRules;
  storage?: KeyValueStorage;
  relay?: MockRelay;
  /** BroadcastChannel name, or false to disable. */
  channel?: string | false;
}

const rank: Record<StoredEvent['serverState'], number> = { accepted: 0, applied: 1, conflict: 1 };

function eventIdFor(clientEventId: string): string {
  return `evt_${clientEventId.replace(/-/g, '').slice(0, 12)}`;
}

function issuesFrom(error: { issues: { path: PropertyKey[]; message: string }[] }): ValidationIssue[] {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export class MockStore {
  private state: MockSyncState;
  private readonly rules: ScenarioRules;
  private readonly storage: KeyValueStorage;
  private readonly relay?: MockRelay;
  private readonly listeners = new Set<(v: number) => void>();
  /** Events this instance is responsible for applying. */
  private readonly owned = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private channel?: BroadcastChannel;
  private relayUnsub?: () => void;
  private closed = false;

  constructor(opts: MockStoreOptions = {}) {
    this.rules = opts.rules ?? emptyScenarioRules;
    this.storage = opts.storage ?? defaultStorage();
    this.relay = opts.relay;
    this.state = this.load() ?? this.fresh();
    for (const e of this.state.events) if (e.serverState === 'accepted') this.owned.add(e.clientEventId);

    const name = opts.channel === undefined ? CHANNEL_NAME : opts.channel;
    if (name && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(name);
      (this.channel as unknown as { unref?: () => void }).unref?.();
      this.channel.onmessage = (m: MessageEvent) => this.adopt(m.data as MockSyncState);
    }
    this.relayUnsub = this.relay?.subscribe((s) => this.adopt(s));
    this.scheduleNext();
  }

  private fresh(): MockSyncState {
    const snapshot = this.rules.initialSnapshot();
    return { version: snapshot.version, snapshot, events: [] };
  }

  private load(): MockSyncState | null {
    try {
      const raw = this.storage.getItem(STATE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as MockSyncState;
      if (!ProjectionSnapshotSchema.safeParse(s.snapshot).success || !Array.isArray(s.events)) return null;
      return s;
    } catch {
      return null;
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(STATE_KEY, JSON.stringify(this.state));
    } catch {
      /* quota: keep in-memory state */
    }
  }

  private broadcast(): void {
    this.channel?.postMessage(this.state);
    this.relay?.publish(this.state);
  }

  // ---- reads -------------------------------------------------------------------------------

  get version(): number {
    return this.state.version;
  }
  get snapshot(): ProjectionSnapshot {
    return this.state.snapshot;
  }
  get events(): readonly StoredEvent[] {
    return this.state.events;
  }
  find(clientEventId: string): StoredEvent | undefined {
    return this.state.events.find((e) => e.clientEventId === clientEventId);
  }

  // ---- subscribe ---------------------------------------------------------------------------

  subscribe(cb: (version: number) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  private notify(): void {
    for (const cb of [...this.listeners]) cb(this.state.version);
  }

  // ---- writes ------------------------------------------------------------------------------

  /** Server-side handling of one submitted item. Never throws; transport failures live in the client. */
  submitOne(input: unknown): SubmitAck {
    const parsed = FieldEventSchema.safeParse(input);
    if (!parsed.success) {
      const id = (input as { clientEventId?: unknown } | null)?.clientEventId;
      return { clientEventId: typeof id === 'string' ? id : '', result: 'rejected', errors: issuesFrom(parsed.error) };
    }
    const event: FieldEvent = parsed.data;
    const existing = this.find(event.clientEventId);
    if (existing) return { clientEventId: event.clientEventId, result: 'duplicate', eventId: existing.eventId };

    const cfg = getMockConfig();
    const ctx: RuleContext = { events: this.state.events, snapshot: this.state.snapshot };

    const rejected = cfg.rejectRule?.(event, ctx);
    if (rejected) {
      const errors = typeof rejected === 'string' ? [{ path: '', message: rejected }] : rejected;
      return { clientEventId: event.clientEventId, result: 'rejected', errors };
    }

    const now = Date.now();
    const receivedAt = new Date(now).toISOString();
    const eventId = eventIdFor(event.clientEventId);

    const conflict = cfg.conflictRule?.(event, ctx);
    if (conflict) {
      const c = typeof conflict === 'string' ? { reason: conflict } : conflict;
      this.state.events.push({
        eventId, clientEventId: event.clientEventId, event, serverState: 'conflict', receivedAt, conflictReason: c.reason,
      });
      this.commit(false);
      return { clientEventId: event.clientEventId, result: 'conflict', eventId, reason: c.reason, serverState: (c as { serverState?: unknown }).serverState };
    }

    const pending = this.state.events.filter((e) => e.serverState === 'accepted').length;
    const acceptedAtVersion = this.state.version + pending + 1;
    this.state.events.push({
      eventId, clientEventId: event.clientEventId, event, serverState: 'accepted', receivedAt,
      acceptedAtVersion, applyAt: now + cfg.applyDelayMs,
    });
    this.owned.add(event.clientEventId);
    this.commit(false);
    this.scheduleNext();
    return { clientEventId: event.clientEventId, result: 'accepted', eventId, acceptedAtVersion };
  }

  private commit(versionChanged: boolean): void {
    this.persist();
    this.broadcast();
    if (versionChanged) this.notify();
  }

  private scheduleNext(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.closed) return;
    const head = this.state.events.find((e) => e.serverState === 'accepted' && this.owned.has(e.clientEventId));
    if (!head) return;
    const wait = Math.max(0, (head.applyAt ?? 0) - Date.now());
    this.timer = setTimeout(() => this.applyDue(false), wait);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  /** Apply due accepted events in FIFO order. `force` applies everything pending now (test hook). */
  applyDue(force: boolean): number {
    this.timer = undefined;
    let applied = 0;
    for (;;) {
      const head = this.state.events.find((e) => e.serverState === 'accepted' && this.owned.has(e.clientEventId));
      if (!head || (!force && (head.applyAt ?? 0) > Date.now())) break;
      const now = new Date().toISOString();
      const next = this.rules.apply(head.event, this.state.snapshot, { now }).snapshot;
      const version = this.state.version + 1;
      const stamp = <T extends { version: number; generatedAt: string }>(c: T): T => ({ ...c, version, generatedAt: now });
      this.state.snapshot = {
        ...next, version, generatedAt: now,
        flood: stamp(next.flood), roads: stamp(next.roads), settlements: stamp(next.settlements),
        routes: stamp(next.routes), shelters: stamp(next.shelters),
      };
      this.state.version = version;
      head.serverState = 'applied';
      head.appliedAtVersion = version;
      delete head.applyAt;
      applied++;
    }
    if (applied > 0) this.commit(true);
    this.scheduleNext();
    return applied;
  }

  // ---- replication (other tabs / relay) ----------------------------------------------------

  private adopt(remote: MockSyncState): void {
    if (this.closed || !remote || !Array.isArray(remote.events)) return;
    const byId = new Map(this.state.events.map((e) => [e.clientEventId, e]));
    let changed = false;
    for (const r of remote.events) {
      const l = byId.get(r.clientEventId);
      if (!l) {
        this.state.events.push(r);
        changed = true;
      } else if (rank[r.serverState] > rank[l.serverState]) {
        Object.assign(l, r);
        changed = true;
      }
    }
    const versionChanged = remote.version > this.state.version;
    if (versionChanged) {
      this.state.snapshot = remote.snapshot;
      this.state.version = remote.version;
    }
    if (!changed && !versionChanged) return;
    this.persist(); // no re-broadcast: avoids echo loops
    this.scheduleNext();
    if (versionChanged) this.notify();
  }

  /** Drop all state back to the scenario baseline (and tell other tabs). */
  reset(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.owned.clear();
    this.state = this.fresh();
    try {
      this.storage.removeItem(STATE_KEY);
    } catch {
      /* ignore */
    }
  }

  close(): void {
    this.closed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.channel?.close();
    this.relayUnsub?.();
    this.listeners.clear();
  }
}
