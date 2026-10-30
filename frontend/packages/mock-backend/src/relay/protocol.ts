/** Dev-only relay wire shapes. Not a SETU backend API; only the mock-backend relay and its client use these. */
export const RELAY_HOST = '127.0.0.1';
export const RELAY_PORT = 5199;
export const RELAY_URL = `http://${RELAY_HOST}:${RELAY_PORT}`;

export interface RelayState {
  /** Monotonic revision, bumped on every accepted save. 0 = nothing saved yet. */
  rev: number;
  /** Opaque JSON owned by the mock store (the relay never inspects it). */
  state: unknown | null;
}

export type SaveResult = { ok: true; rev: number } | { ok: false; rev: number; state: unknown | null };
