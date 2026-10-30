export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory fallback (Node/tests). Module-level default is shared so two stores simulate two tabs. */
export function createMemoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const sharedMemory = createMemoryStorage();

export function defaultStorage(): KeyValueStorage {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (ls) {
      const probe = '__setu_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    /* blocked / unavailable: fall through */
  }
  return sharedMemory;
}

export const STATE_KEY = 'setu:mock-backend:state:v1';
export const CONFIG_KEY = 'setu:mock-backend:config:v1';
export const CHANNEL_NAME = 'setu-mock';
