import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { Button, Field, Panel } from '@setu/ui';
import type { FieldEvent, ProjectionSnapshot } from '@setu/contract';
import { enqueue, replace } from '../../sync/index.js';
import type { QueueItem } from '../../sync/index.js';
import { getDeviceId, getReporterId } from '../../app/identity.js';
import {
  EMPTY_REPORT, REPORT_KINDS, buildReportEvent, fieldKeyForPath, freshId, valuesFromEvent,
} from './buildEvent.js';
import type { ReportValues } from './buildEvent.js';
import { roadOptions } from './roadOptions.js';
import { DEFAULT_LOCATION, useGeolocation } from './location.js';

const CAUSES = ['submerged', 'debris', 'collapse', 'damage', 'other'];
const SELECT = 'setu-field__control';

export interface ReportScreenProps {
  /** Rejected queue item reopened for editing: the form prefills and resubmits via replace(). */
  editing?: QueueItem | null;
  onDone?: () => void;
  /** Cached projection snapshot: source of the road and bridge list (works offline). */
  snapshot?: ProjectionSnapshot | null;
  /** Test seam: override the queue writer (defaults to the local queue). */
  submit?: (event: FieldEvent, editing?: QueueItem | null) => Promise<unknown>;
}

const defaultSubmit = (event: FieldEvent, editing?: QueueItem | null) =>
  editing ? replace(editing.clientEventId, event) : enqueue(event);

export function ReportScreen({ editing, onDone, snapshot, submit = defaultSubmit }: ReportScreenProps) {
  const identity = { reporterId: getReporterId(), deviceId: getDeviceId() };
  // One id per form "session": a double-submit re-enqueues the same id, which enqueue dedups.
  const idRef = useRef(freshId());
  const busy = useRef(false);
  const [sent, setSent] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const resolver: Resolver<ReportValues> = async (values) => {
    const r = buildReportEvent(values, identity, idRef.current);
    if (r.ok) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const e of r.errors) errors[fieldKeyForPath(e.path)] ??= { type: 'validate', message: e.message };
    return { values: {}, errors };
  };

  const { register, handleSubmit, watch, setValue, reset, formState } = useForm<ReportValues>({
    defaultValues: editing ? valuesFromEvent(editing.event) : EMPTY_REPORT,
    resolver,
  });
  const type = watch('type');
  const roads = roadOptions(snapshot);
  const { errors, isSubmitting } = formState;

  const { gps, locate } = useGeolocation(
    (p) => {
      // Only prefill: never overwrite a location the user already typed or an edited item's.
      if (!watch('lat') && !watch('lng')) {
        setValue('lat', String(p.lat));
        setValue('lng', String(p.lng));
      }
    },
    !editing,
  );

  const onValid = async (values: ReportValues) => {
    setFailure(null);
    try {
      const r = buildReportEvent(values, identity, idRef.current);
      if (!r.ok) return;
      await submit(r.event, editing);
      idRef.current = freshId();
      setSent(`Saved to the queue (${REPORT_KINDS.find((k) => k.type === values.type)?.label}). It syncs automatically.`);
      reset({ ...EMPTY_REPORT, type: values.type, lat: values.lat, lng: values.lng });
      onDone?.();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not save the report');
    }
  };

  // Synchronous guard: a double-click is swallowed before the async validation even starts.
  const guardedSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    try {
      await handleSubmit(onValid)();
    } finally {
      busy.current = false;
    }
  };

  const err = (k: keyof ReportValues) => errors[k]?.message;
  // Server-side validation errors of the rejected item being edited stay visible until it is resubmitted.
  const serverErrors = (!sent && editing?.validationErrors) || [];
  const firstError = Object.values(errors)[0]?.message ?? failure ?? (serverErrors.length ? 'The server rejected this report:' : null);

  return (
    <Panel title={editing ? 'Edit rejected report' : 'New report'}>
      <form onSubmit={guardedSubmit} noValidate aria-label="Report form">
        <Button
          variant="primary" data-testid="quick-blocked"
          onClick={() => { setValue('type', 'road_blockage'); setValue('blockage', 'full'); }}
        >
          Report blocked road or bridge
        </Button>
        <div role="group" aria-label="Report type" className="report-types">
          {REPORT_KINDS.map((k) => (
            <label key={k.type}>
              <input type="radio" value={k.type} data-testid={`report-type-${k.type}`} {...register('type')} /> {k.label}
            </label>
          ))}
        </div>

        {(type === 'road_blockage' || type === 'road_cleared') && (
          <div className="setu-field">
            <label className="setu-field__label" htmlFor="f-roadId">Road or bridge</label>
            <select id="f-roadId" className={SELECT} data-testid="field-roadId" {...register('roadId')}>
              <option value="">{type === 'road_cleared' ? 'Select road…' : 'Unknown (use location)'}</option>
              {roads.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {err('roadId') && <span className="setu-field__error" role="alert">{err('roadId')}</span>}
          </div>
        )}
        {type === 'road_blockage' && (
          <div className="setu-field">
            <label className="setu-field__label" htmlFor="f-blockage">Blockage</label>
            <select id="f-blockage" className={SELECT} data-testid="field-blockage" {...register('blockage')}>
              <option value="full">full</option>
              <option value="partial">partial</option>
            </select>
          </div>
        )}
        {type === 'road_blockage' && (
          <div className="setu-field">
            <label className="setu-field__label" htmlFor="f-cause">Cause</label>
            <select id="f-cause" className={SELECT} data-testid="field-cause" {...register('cause')}>
              <option value="">Not sure</option>
              {CAUSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {type === 'flood_report' && (
          <>
            <Field label="Severity (1-5)" type="number" min={1} max={5} data-testid="field-severity" error={err('severity')} {...register('severity')} />
            <Field label="Depth (cm)" type="number" min={0} data-testid="field-depthCm" error={err('depthCm')} {...register('depthCm')} />
            <Field label="Area ID" data-testid="field-areaId" {...register('areaId')} />
          </>
        )}
        {type === 'water_level' && (
          <>
            <Field label="Level (cm)" type="number" data-testid="field-levelCm" error={err('levelCm')} {...register('levelCm')} />
            <div className="setu-field">
              <label className="setu-field__label" htmlFor="f-trend">Trend</label>
              <select id="f-trend" className={SELECT} data-testid="field-trend" {...register('trend')}>
                <option value="rising">rising</option>
                <option value="steady">steady</option>
                <option value="falling">falling</option>
              </select>
            </div>
            <Field label="Gauge ID" data-testid="field-gaugeId" {...register('gaugeId')} />
          </>
        )}

        <fieldset>
          <legend>Location</legend>
          <Field label="Latitude" inputMode="decimal" data-testid="field-lat" error={err('lat')} {...register('lat')} />
          <Field label="Longitude" inputMode="decimal" data-testid="field-lng" error={err('lng')} {...register('lng')} />
          <p role="status">
            {gps === 'locating' && 'Finding GPS…'}
            {gps === 'ok' && 'Location from GPS (editable).'}
            {gps === 'unavailable' && 'GPS unavailable: enter the location manually.'}{' '}
            <Button onClick={locate}>Use GPS</Button>{' '}
            <Button onClick={() => { setValue('lat', String(DEFAULT_LOCATION.lat)); setValue('lng', String(DEFAULT_LOCATION.lng)); }}>Use default area</Button>
          </p>
        </fieldset>

        <div className="setu-field">
          <label className="setu-field__label" htmlFor="f-note">Note</label>
          <textarea id="f-note" className={SELECT} rows={3} data-testid="field-note" {...register('note')} />
        </div>
        <div className="setu-field">
          <label className="setu-field__label" htmlFor="f-photo">Photo (reference only, not uploaded)</label>
          <input
            id="f-photo" type="file" accept="image/*" capture="environment"
            onChange={(e) => setValue('photoName', e.target.files?.[0]?.name ?? '')}
          />
        </div>

        {firstError && (
          <div role="alert" data-testid="form-error">
            <p>{firstError}</p>
            {!Object.keys(errors).length && !failure && serverErrors.length > 0 && (
              <ul>{serverErrors.map((v, i) => <li key={i}>{v.path ? `${v.path}: ` : ''}{v.message}</li>)}</ul>
            )}
          </div>
        )}
        {sent && !firstError && <p role="status">{sent}</p>}
        <Button type="submit" variant="primary" data-testid="report-submit" disabled={isSubmitting}>
          {editing ? 'Resubmit' : 'Submit report'}
        </Button>
      </form>
    </Panel>
  );
}
