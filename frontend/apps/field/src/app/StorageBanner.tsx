import { useStorageStatus } from '../offline/storage.js';

/** Surfaces a failed local write; the form keeps its data, so the volunteer can retry or free space. */
export function StorageBanner() {
  const { lastWriteError } = useStorageStatus();
  if (!lastWriteError) return null;
  return (
    <div role="alert" className="setu-panel" data-testid="storage-error" data-kind={lastWriteError.kind}>
      <strong>Not saved on this device.</strong> {lastWriteError.message} Your entries are still in the form.
    </div>
  );
}
