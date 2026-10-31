import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

type Listener = () => void;
let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
let needRefresh = false;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

/** Registers the service worker (production only). Call once from main.tsx. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || updateSW) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      emit();
    },
  });
}

/** True when a new service worker is waiting; `reload()` activates it and reloads. */
export function useUpdateAvailable() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const dismiss = useCallback(() => {
    needRefresh = false;
    emit();
  }, []);
  const reload = useCallback(() => void updateSW?.(true), []);
  return { available: needRefresh, reload, dismiss };
}
