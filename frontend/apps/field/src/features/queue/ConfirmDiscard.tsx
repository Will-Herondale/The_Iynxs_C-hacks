import { Button } from '@setu/ui';

export interface ConfirmDiscardProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Discard is never silent: the volunteer must confirm deleting an unsent report. */
export function ConfirmDiscard({ open, onConfirm, onCancel }: ConfirmDiscardProps) {
  if (!open) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="discard-title" className="sync-confirm" data-testid="discard-dialog">
      <h3 id="discard-title">Discard this report?</h3>
      <p>It will be deleted from this device and never sent. This cannot be undone.</p>
      <Button data-testid="discard-cancel" onClick={onCancel}>
        Keep report
      </Button>{' '}
      <Button data-testid="discard-confirm" variant="danger" onClick={onConfirm}>
        Discard report
      </Button>
    </div>
  );
}
