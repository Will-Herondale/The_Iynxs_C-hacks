import { useSyncExternalStore } from 'react';

export type StorageWriteErrorKind = 'quota' | 'unavailable' | 'unknown';

/** A failed IndexedDB write. The caller still holds the form data; nothing was saved. */
export class StorageWriteError extends Error {
  constructor(
    readonly kind: StorageWriteErrorKind,
    readonly cause?: unknown,
  ) {
    super(storageErrorMessage(kind));
    this.name = 'StorageWriteError';
  }
}

export function storageErrorMessage(kind: StorageWriteErrorKind): string {
  switch (kind) {
    case 'quota':
      return 'Not saved: device storage is full. Free up space and try again. Your entries are still on screen.';
    case 'unavailable':
      return 'Not saved: local storage is unavailable (private mode or blocked). Your entries are still on screen.';
    default:
      return 'Not saved: could not write to local storage. Your entries are still on screen; try again.';
  }
}

export function classifyStorageError(err: unknown): StorageWriteErrorKind {
  const name = (err as { name?: string } | null)?.name ?? '';
  const inner = (err as { inner?: unknown } | null)?.inner;
  const innerName = (inner as { name?: string } | null)?.name ?? '';
  if ([name, innerName].includes('QuotaExceededError')) return 'quota';
  if (['InvalidStateError', 'SecurityError', 'OpenFailedError', 'DatabaseClosedError', 'MissingAPIError'].some((n) => n === name || n === innerName)) {
    return 'unavailable';
  }
  return 'unknown';
}

export type StorageStatus = {
  /** undefined = not asked yet / unsupported */
  persisted?: boolean;
  usage?: number;
  quota?: number;
  lastWriteError?: { kind: StorageWriteErrorKind; message: string; at: number };
};

let status: StorageStatus = {};
const listeners = new Set<() => void>();
const set = (p: Partial<StorageStatus>) => {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
};

/** Record a failed write so the UI can show it; returns the typed error to throw. */
export function reportWriteFailure(err: unknown): StorageWriteError {
  if (err instanceof StorageWriteError) return err;
  const e = new StorageWriteError(classifyStorageError(err), err);
  set({ lastWriteError: { kind: e.kind, message: e.message, at: Date.now() } });
  return e;
}

export function clearWriteFailure(): void {
  if (status.lastWriteError) set({ lastWriteError: undefined });
}

/** Ask the browser not to evict our data; best-effort and idempotent. */
export async function requestPersistence(): Promise<boolean | undefined> {
  const s = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!s?.persist) return undefined;
  try {
    const persisted = (await s.persisted?.()) || (await s.persist());
    set({ persisted });
    await refreshEstimate();
    return persisted;
  } catch {
    return undefined;
  }
}

export async function refreshEstimate(): Promise<void> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) set({ usage: est.usage, quota: est.quota });
  } catch {
    // estimate is informational only
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function getStorageStatus(): StorageStatus {
  return status;
}

export function useStorageStatus(): StorageStatus {
  return useSyncExternalStore(subscribe, getStorageStatus, getStorageStatus);
}
