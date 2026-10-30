import { newClientEventId } from '@setu/contract';

const REPORTER_KEY = 'setu.reporterId';
const DEVICE_KEY = 'setu.deviceId';

function persisted(key: string, make: () => string): string {
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = make();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return make();
  }
}

/** Stable per-browser identities, persisted in localStorage. Forms use these for reporterId/deviceId. */
export const getReporterId = (): string => persisted(REPORTER_KEY, () => `volunteer-${newClientEventId().slice(0, 8)}`);
export const getDeviceId = (): string => persisted(DEVICE_KEY, () => `device-${newClientEventId().slice(0, 8)}`);
