import type { FieldEvent, ProjectionSnapshot, ValidationIssue } from '@setu/contract';
import { CONFIG_KEY, defaultStorage, type KeyValueStorage } from './storage.js';
import type { StoredEvent } from './scenario.js';

export interface RuleContext {
  /** All events the mock server currently holds. */
  events: readonly StoredEvent[];
  snapshot: ProjectionSnapshot;
}
export type ConflictResult = string | { reason: string; serverState?: unknown } | null | undefined | false;
export type RejectResult = string | ValidationIssue[] | null | undefined | false;
export type ConflictRule = (event: FieldEvent, ctx: RuleContext) => ConflictResult;
export type RejectRule = (event: FieldEvent, ctx: RuleContext) => RejectResult;

export interface MockConfig {
  /** Added to every call. */
  latencyMs: number;
  /** 0..1 chance a call fails with ServerError(503). */
  failRate5xx: number;
  /** 0..1 chance a call fails with TimeoutError. */
  timeoutRate: number;
  /** accepted -> applied delay. */
  applyDelayMs: number;
  /** Every call throws NetworkError; subscribe callbacks are muted. */
  offline: boolean;
  conflictRule: ConflictRule | null;
  rejectRule: RejectRule | null;
  random: () => number;
}

/** Conflict toggle: a road_blockage for a road another reporter already marked cleared. */
export const defaultConflictRule: ConflictRule = (event, ctx) => {
  if (event.type !== 'road_blockage' || !event.roadId) return null;
  const cleared = ctx.events.find((e) => e.event.type === 'road_cleared' && e.event.roadId === event.roadId);
  if (!cleared) return null;
  return {
    reason: `Road ${event.roadId} was already reported cleared (${cleared.eventId})`,
    serverState: { roadId: event.roadId, clearedBy: cleared.eventId },
  };
};

/** Reject toggle: every event fails server-side validation. */
export const defaultRejectRule: RejectRule = () => [{ path: 'note', message: 'Rejected by mock reject toggle' }];

export const defaultMockConfig = (): MockConfig => ({
  latencyMs: 0,
  failRate5xx: 0,
  timeoutRate: 0,
  applyDelayMs: 1500,
  offline: false,
  conflictRule: null,
  rejectRule: null,
  random: Math.random,
});

export type MockConfigInput = Partial<Omit<MockConfig, 'conflictRule' | 'rejectRule'>> & {
  /** `true` installs the default rule, `false`/null removes it. */
  conflictRule?: ConflictRule | boolean | null;
  rejectRule?: RejectRule | boolean | null;
};

let current: MockConfig = defaultMockConfig();

export function getMockConfig(): MockConfig {
  return current;
}

/** Serialisable subset persisted for testers (custom rule functions are not persisted). */
interface PersistedConfig {
  latencyMs?: number;
  failRate5xx?: number;
  timeoutRate?: number;
  applyDelayMs?: number;
  offline?: boolean;
  conflict?: boolean;
  reject?: boolean;
}

function persist(storage: KeyValueStorage): void {
  const p: PersistedConfig = {
    latencyMs: current.latencyMs,
    failRate5xx: current.failRate5xx,
    timeoutRate: current.timeoutRate,
    applyDelayMs: current.applyDelayMs,
    offline: current.offline,
    conflict: current.conflictRule === defaultConflictRule,
    reject: current.rejectRule === defaultRejectRule,
  };
  try {
    storage.setItem(CONFIG_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota errors */
  }
}

export function configureMock(input: MockConfigInput, storage: KeyValueStorage = defaultStorage()): MockConfig {
  const { conflictRule, rejectRule, ...rest } = input;
  const next: MockConfig = { ...current };
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
  if (conflictRule !== undefined) next.conflictRule = conflictRule === true ? defaultConflictRule : conflictRule || null;
  if (rejectRule !== undefined) next.rejectRule = rejectRule === true ? defaultRejectRule : rejectRule || null;
  current = next;
  persist(storage);
  return current;
}

/** Back to defaults and forget the persisted toggle. */
export function resetMockConfig(storage: KeyValueStorage = defaultStorage()): void {
  current = defaultMockConfig();
  try {
    storage.removeItem(CONFIG_KEY);
  } catch {
    /* ignore */
  }
}

function fromPersisted(p: PersistedConfig): MockConfigInput {
  const out: MockConfigInput = {};
  if (typeof p.latencyMs === 'number') out.latencyMs = p.latencyMs;
  if (typeof p.failRate5xx === 'number') out.failRate5xx = p.failRate5xx;
  if (typeof p.timeoutRate === 'number') out.timeoutRate = p.timeoutRate;
  if (typeof p.applyDelayMs === 'number') out.applyDelayMs = p.applyDelayMs;
  if (typeof p.offline === 'boolean') out.offline = p.offline;
  if (typeof p.conflict === 'boolean') out.conflictRule = p.conflict;
  if (typeof p.reject === 'boolean') out.rejectRule = p.reject;
  return out;
}

/**
 * Parse the `?mock=` toggle, e.g. `?mock=offline`, `?mock=latency:800,5xx:0.3,timeout:0.2,conflict,reject,delay:3000`.
 * `?mock=off` clears every toggle.
 */
export function parseMockQuery(value: string): MockConfigInput | 'reset' {
  if (value === 'off' || value === 'reset' || value === 'none') return 'reset';
  const out: MockConfigInput = {};
  for (const part of value.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [key, raw] = part.split(':');
    const n = raw === undefined ? NaN : Number(raw);
    switch (key) {
      case 'offline': out.offline = true; break;
      case 'conflict': out.conflictRule = true; break;
      case 'reject': out.rejectRule = true; break;
      case 'latency': if (!Number.isNaN(n)) out.latencyMs = n; break;
      case '5xx': if (!Number.isNaN(n)) out.failRate5xx = n; break;
      case 'timeout': if (!Number.isNaN(n)) out.timeoutRate = n; break;
      case 'delay': if (!Number.isNaN(n)) out.applyDelayMs = n; break;
    }
  }
  return out;
}

/** Load persisted toggles, then apply the URL query (if any). Safe in Node (no-ops without location). */
export function loadMockConfigFromEnvironment(storage: KeyValueStorage = defaultStorage()): void {
  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (raw) configureMock(fromPersisted(JSON.parse(raw) as PersistedConfig), storage);
  } catch {
    /* corrupt toggle: ignore */
  }
  const search = (globalThis as { location?: { search?: string } }).location?.search;
  if (!search) return;
  const q = new URLSearchParams(search).get('mock');
  if (q === null) return;
  const parsed = parseMockQuery(q);
  if (parsed === 'reset') resetMockConfig(storage);
  else configureMock(parsed, storage);
}
