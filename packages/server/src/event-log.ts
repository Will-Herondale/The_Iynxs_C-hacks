// Append-only event log — planning doc 04, §2.
//
// Persistence: JSONL file (one canonical-JSON event per line), fsync per append.
// Indices rebuilt in memory at startup.
// No SQLite dependency — JSONL is legible and fast enough at demo scale.

import { appendFile, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createEnvelope, type Envelope } from '../../core/src/index';
import { validateNoFloats } from '../../core/src/index';

export class EventLog {
  private readonly path: string;
  private entries: Envelope[] = [];
  private idIndex = new Map<string, Envelope>(); // event id → envelope
  private appliedVersionIndex = new Map<string, number>(); // event id → 1-based applied version
  private originSeqIndex = new Map<string, Map<number, Envelope>>(); // origin → seq → envelope
  private hwm = new Map<string, number>(); // origin → highest contiguous seq
  private closed = false;

  constructor(logDir: string) {
    this.path = join(logDir, 'log.jsonl');
    mkdirSync(logDir, { recursive: true });
  }

  /** Load existing log from disk, rebuild indices. */
  async load(): Promise<void> {
    if (!existsSync(this.path)) {
      this.entries = [];
      return;
    }

    const content = await readFile(this.path, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Envelope;
        this.addEntry(parsed);
      } catch {
        // Corrupted line — skip (torn write recovery)
        continue;
      }
    }
  }

  private addEntry(env: Envelope): void {
    this.entries.push(env);
    this.idIndex.set(env.id, env);
    // The server bumps the projection version once per accepted event, and
    // rebuilds it from the log length on startup. The append position is
    // therefore the event's historical applied version, even after restart.
    this.appliedVersionIndex.set(env.id, this.entries.length);

    const originSeqs = this.originSeqIndex.get(env.origin) ?? new Map();
    originSeqs.set(env.seq, env);
    this.originSeqIndex.set(env.origin, originSeqs);

    // Advance contiguous hwm
    let currentHwm = this.hwm.get(env.origin) ?? 0;
    while (originSeqs.has(currentHwm + 1)) {
      currentHwm++;
    }
    this.hwm.set(env.origin, currentHwm);
  }

  /** Get the highest contiguous seq for an origin. */
  getHwm(origin: string): number {
    return this.hwm.get(origin) ?? 0;
  }

  /** Get the full version vector (origin → contiguous hwm). */
  getVersionVector(): Record<string, number> {
    const vv: Record<string, number> = {};
    for (const [origin, hwm] of this.hwm.entries()) {
      vv[origin] = hwm;
    }
    return vv;
  }

  /** Check if an event id has been seen. */
  hasEventId(id: string): boolean {
    return this.idIndex.has(id);
  }

  /** Get an event by id. */
  getEvent(id: string): Envelope | undefined {
    return this.idIndex.get(id);
  }

  /** Historical version at which the event was applied (1-based). */
  getAppliedVersion(id: string): number | undefined {
    return this.appliedVersionIndex.get(id);
  }

  /** Get event by origin + seq. */
  getEventByOriginSeq(origin: string, seq: number): Envelope | undefined {
    return this.originSeqIndex.get(origin)?.get(seq);
  }

  /** Get all events since a given version vector (for sync). */
  getEventsSince(vv: Record<string, number>, limit: number = 500): Envelope[] {
    const result: Envelope[] = [];

    // Collect all origins known to either side
    const allOrigins = new Set([
      ...Object.keys(this.hwm),
      ...Object.keys(vv),
    ]);

    for (const origin of allOrigins) {
      const fromSeq = (vv[origin] ?? 0) + 1;
      const toSeq = this.hwm.get(origin) ?? 0;
      const originSeqs = this.originSeqIndex.get(origin);

      if (!originSeqs) continue;

      for (let seq = fromSeq; seq <= toSeq && result.length < limit; seq++) {
        const env = originSeqs.get(seq);
        if (env) result.push(env);
      }
    }

    // Sort by (origin, seq) for deterministic delivery
    result.sort((a, b) => {
      if (a.origin < b.origin) return -1;
      if (a.origin > b.origin) return 1;
      return a.seq - b.seq;
    });

    return result;
  }

  /** Check if there are more events beyond the limit. */
  hasMoreEvents(vv: Record<string, number>, limit: number): boolean {
    return this.getEventsSince(vv, limit + 1).length > limit;
  }

  /**
   * Append a new event to the log. Returns the envelope with assigned seq.
   * The caller must ensure (origin, seq) uniqueness.
   */
  async append(envInput: {
    origin: string;
    seq: number;
    hlc: { l: number; c: number };
    vv: Record<string, number>;
    type: string;
    actor: { id: string; role: string };
    subject: string | null;
    at: number;
    payload: unknown;
  }): Promise<Envelope> {
    if (this.closed) throw new Error('Log is closed');

    const env = await createEnvelope(envInput);

    // Validate no floats in payload
    const floatIssues = validateNoFloats(env.payload);
    if (floatIssues.length > 0) {
      throw new Error(`Payload contains floats at ${floatIssues.join(', ')}`);
    }

    const line = JSON.stringify({
      v: env.v,
      id: env.id,
      origin: env.origin,
      seq: env.seq,
      hlc: env.hlc,
      vv: env.vv,
      type: env.type,
      actor: env.actor,
      subject: env.subject,
      at: env.at,
      payload: env.payload,
      hash: env.hash,
      sig: env.sig,
    });

    await appendFile(this.path, line + '\n');
    this.addEntry(env);

    return env;
  }

  /** Get all events (for replay/audit). */
  getAllEvents(): Envelope[] {
    return [...this.entries];
  }

  /** Get event count. */
  get count(): number {
    return this.entries.length;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
