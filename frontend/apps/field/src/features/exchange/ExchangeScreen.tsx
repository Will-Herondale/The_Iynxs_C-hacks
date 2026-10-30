import { useState } from 'react';
import type { FieldEvent } from '@setu/contract';
import { Button, ConfirmDialog, ErrorState, Mono, Panel, StatusBadge } from '@setu/ui';
import { getDeviceId } from '../../app/identity.js';
import { classify, exportJsonl, parseJsonl } from './jsonl.js';
import { collectExportable, existingClientEventIds, importEvents, recordExport } from './store.js';

export const EXCHANGE_NOTE = 'Imported events are saved on this device and will appear in district projections after sync.';

type Result = 'accepted' | 'duplicate' | 'rejected';
interface Row {
  id: string;
  lineNo: number;
  clientEventId: string;
  result: Result;
  errors: string[];
  event?: FieldEvent;
}

const errText = (e: unknown): string => {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const { path, message } = e as { path?: unknown; message?: unknown };
    const p = Array.isArray(path) ? path.join('.') : typeof path === 'string' ? path : '';
    return `${p ? `${p}: ` : ''}${String(message ?? JSON.stringify(e))}`;
  }
  return String(e);
};
const errList = (e: unknown): string[] => (e == null ? [] : Array.isArray(e) ? e.map(errText) : [errText(e)]);

const BADGE: Record<Result, { label: string; status: 'queued' | 'synced' | 'rejected' }> = {
  accepted: { label: 'Will import', status: 'queued' },
  duplicate: { label: 'Duplicate — skipped', status: 'synced' },
  rejected: { label: 'Rejected', status: 'rejected' },
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExchangeScreen() {
  const [exported, setExported] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    setFileError(null);
    try {
      const items = await collectExportable();
      const text = exportJsonl(items);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      download(`setu-events-${getDeviceId()}-${stamp}.jsonl`, text);
      const n = text.split('\n').filter((l) => l.trim()).length;
      await recordExport(n);
      setExported(n);
    } catch (e) {
      setFileError(`Export failed: ${errText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    setDone(null);
    setFileError(null);
    setRows(null);
    if (!file) return;
    try {
      const parsed = parseJsonl(await file.text());
      if (parsed.fileError) {
        setFileError(parsed.fileError);
        return;
      }
      const lines = classify(parsed.lines, await existingClientEventIds());
      setRows(
        lines.map((l) => ({
          id: `line-${l.lineNo}`,
          lineNo: l.lineNo,
          clientEventId: l.clientEventId,
          result: l.result,
          errors: errList(l.errors),
          ...(l.result === 'accepted' && l.event ? { event: l.event } : {}),
        })),
      );
    } catch (e) {
      setFileError(errText(e));
    }
  };

  const count = (r: Result) => rows?.filter((x) => x.result === r).length ?? 0;
  const accepted = count('accepted');

  const commit = async () => {
    setConfirming(false);
    if (!rows) return;
    setBusy(true);
    try {
      await importEvents(rows.filter((r) => r.result === 'accepted').flatMap((r) => (r.event ? [r.event] : [])));
      setDone({ imported: accepted, skipped: rows.length - accepted });
      setRows(null);
    } catch (e) {
      setFileError(`Import failed; nothing was discarded: ${errText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="exchange" data-testid="exchange-screen">
      <h1>Exchange reports</h1>
      <p data-testid="exchange-note">{EXCHANGE_NOTE}</p>

      <Panel title="Export">
        <p>Save the reports on this device to a .jsonl file you can hand to another device. No network needed.</p>
        <Button variant="primary" data-testid="exchange-export" disabled={busy} onClick={onExport} style={{ minHeight: 44 }}>
          Export reports
        </Button>
        {exported !== null && <p data-testid="exchange-export-count" role="status">Exported {exported} event{exported === 1 ? '' : 's'}.</p>}
      </Panel>

      <Panel title="Import">
        <label>
          Choose a .jsonl file
          <input
            type="file"
            accept=".jsonl,.ndjson,application/x-ndjson,application/json,text/plain"
            data-testid="exchange-import-file"
            style={{ display: 'block', minHeight: 44 }}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {fileError && <ErrorState kind="invalid" detail={fileError} />}
        {rows && (
          <>
            <p data-testid="exchange-preview-summary" role="status">
              Preview: {accepted} will be imported, {count('duplicate')} duplicate, {count('rejected')} rejected. Nothing is saved until you confirm.
            </p>
            <div className="setu-table__scroll" style={{ overflowX: 'auto' }}>
              <table className="exchange-table" data-testid="exchange-results">
                <caption className="setu-visually-hidden">Import preview</caption>
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col">Event ID</th>
                    <th scope="col">Result</th>
                    <th scope="col">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4}>The file has no events.</td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} data-testid="exchange-result-row" data-result={r.result}>
                      <td>{r.lineNo}</td>
                      <td>
                        <Mono>{r.clientEventId || '—'}</Mono>
                      </td>
                      <td>
                        <StatusBadge status={BADGE[r.result].status} /> {BADGE[r.result].label}
                      </td>
                      <td>{r.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              variant="primary"
              data-testid="exchange-import-confirm"
              disabled={accepted === 0 || busy}
              onClick={() => setConfirming(true)}
              style={{ minHeight: 44 }}
            >
              Import {accepted} event{accepted === 1 ? '' : 's'}
            </Button>
          </>
        )}
        {done && (
          <p data-testid="exchange-import-done" role="status">
            Imported {done.imported} event{done.imported === 1 ? '' : 's'}; skipped {done.skipped}. {EXCHANGE_NOTE} See them in the Sync list.
          </p>
        )}
      </Panel>

      <ConfirmDialog
        open={confirming}
        title="Import these events?"
        body={`${accepted} event${accepted === 1 ? '' : 's'} will be saved on this device. Duplicates and rejected lines are skipped.`}
        confirmLabel="Import"
        onConfirm={() => void commit()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
