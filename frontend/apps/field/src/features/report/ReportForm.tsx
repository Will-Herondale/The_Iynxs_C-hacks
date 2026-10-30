import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { Button, Field, Panel } from '@setu/ui';
import type { FieldEvent, ProjectionSnapshot } from '@setu/contract';
import type { StyleSpecification, Map as MlMap } from 'maplibre-gl';
import { enqueue, replace } from '../../sync/index.js';
import type { QueueItem } from '../../sync/index.js';
import { getDeviceId, getReporterId } from '../../app/identity.js';
import {
  EMPTY_REPORT, buildReportEvent, fieldKeyForPath, freshId, toLocalInput, valuesFromEvent,
} from './buildEvent.js';
import type { ReportValues } from './buildEvent.js';
import { BLOCKED_15, CATEGORIES, categoryDef } from './categories.js';
import type { ReportCategory } from './categories.js';
import { loadGeoLayer } from '@setu/geo';
import { filterRoadOptions, geoBridgeOptions, roadOptions, withGeoBridges } from './roadOptions.js';
import type { RoadOption } from './roadOptions.js';
import { describeLocation, useGeolocation } from './location.js';
import { MapPicker } from './MapPicker.js';
import './report.css';

const CAUSES = ['debris', 'collapse', 'damage', 'other'];
const SELECT = 'setu-field__control';

export interface ReportScreenProps {
  /** Rejected queue item reopened for editing: the form prefills and resubmits via replace(). */
  editing?: QueueItem | null;
  /** Fired when the volunteer leaves the "Saved locally" confirmation. */
  onDone?: () => void;
  /** Fired right after the report is persisted locally, with its clientEventId. */
  onSaved?: (clientEventId: string) => void;
  /** Opens the report detail screen for a saved report. */
  onOpenDetail?: (clientEventId: string) => void;
  /** Preselects a category (e.g. from a Home shortcut). */
  initialCategory?: ReportCategory;
  /** Cached projection snapshot: source of the road and bridge list (works offline). */
  snapshot?: ProjectionSnapshot | null;
  /** Offline style for the compact map picker (`createOfflineStyle` from `@setu/geo`). */
  createMapStyle?: () => StyleSpecification;
  onMapReady?: (map: MlMap) => void;
  /** Test seam: override the queue writer (defaults to the local queue). */
  submit?: (event: FieldEvent, editing?: QueueItem | null) => Promise<unknown>;
}

const defaultSubmit = (event: FieldEvent, editing?: QueueItem | null) =>
  editing ? replace(editing.clientEventId, event) : enqueue(event);

const TYPE_OF: Record<ReportCategory, ReportValues['type']> = {
  water_level: 'water_level', flooded_road: 'flood_report', blocked_road: 'road_blockage',
  submerged_bridge: 'road_blockage', road_cleared: 'road_cleared', damaged_infrastructure: 'flood_report', other: 'flood_report',
};

export function ReportScreen({
  editing, onDone, onSaved, onOpenDetail, initialCategory, snapshot, createMapStyle, onMapReady, submit = defaultSubmit,
}: ReportScreenProps) {
  const identity = { reporterId: getReporterId(), deviceId: getDeviceId() };
  // One id per form "session": a double-submit re-enqueues the same id, which enqueue dedups.
  const idRef = useRef(freshId());
  const busy = useRef(false);
  const [saved, setSaved] = useState<{ id: string; label: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  const resolver: Resolver<ReportValues> = async (values) => {
    const r = buildReportEvent(values, identity, idRef.current);
    if (r.ok) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const e of r.errors) errors[fieldKeyForPath(e.path)] ??= { type: 'validate', message: e.message };
    return { values: {}, errors };
  };

  const initial: ReportValues = editing
    ? valuesFromEvent(editing.event)
    : initialCategory
      ? { ...EMPTY_REPORT, category: initialCategory, type: TYPE_OF[initialCategory], observedAt: toLocalInput(new Date()) }
      : { ...EMPTY_REPORT, observedAt: toLocalInput(new Date()) };
  const { register, handleSubmit, watch, setValue, reset, formState } = useForm<ReportValues>({ defaultValues: initial, resolver });
  const category = watch('category');
  const def = categoryDef(category);
  const lat = watch('lat');
  const lng = watch('lng');
  const source = watch('locationSource');
  const accuracy = watch('accuracyM');
  const hasLocation = lat.trim() !== '' && lng.trim() !== '' && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));
  const [geoBridges, setGeoBridges] = useState<RoadOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadGeoLayer('bridges').then((fc) => !cancelled && setGeoBridges(geoBridgeOptions(fc)), () => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const roads = filterRoadOptions(withGeoBridges(roadOptions(snapshot), geoBridges), def.roadKind);
  const { errors, isSubmitting } = formState;

  const setLocation = (p: { lat: number; lng: number; accuracyM?: number }, src: ReportValues['locationSource']) => {
    setValue('lat', String(p.lat));
    setValue('lng', String(p.lng));
    setValue('accuracyM', p.accuracyM === undefined ? '' : String(p.accuracyM));
    setValue('locationSource', src);
  };

  const { gps, locate } = useGeolocation(
    (p) => {
      // Only prefill: never overwrite a location the user already typed or an edited item's.
      if (!watch('lat') && !watch('lng')) setLocation(p, 'gps');
    },
    !editing,
  );

  const pickCategory = (c: ReportCategory) => {
    const d = categoryDef(c);
    if (d.blocked) return;
    setValue('category', c);
    setValue('type', TYPE_OF[c]);
    setValue('roadId', '');
    if (c === 'submerged_bridge') { setValue('blockage', 'full'); setValue('cause', 'submerged'); }
    else if (c === 'blocked_road') setValue('cause', '');
  };

  const onValid = async (values: ReportValues) => {
    setFailure(null);
    try {
      const r = buildReportEvent(values, identity, idRef.current);
      if (!r.ok) return;
      const id = r.event.clientEventId;
      // enqueue() persists to IndexedDB before any network call; only then do we confirm.
      await submit(r.event, editing);
      idRef.current = freshId();
      setSaved({ id, label: categoryDef(values.category).label });
      reset({ ...EMPTY_REPORT, observedAt: toLocalInput(new Date()), category: values.category, type: values.type });
      onSaved?.(id);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not save the report. Nothing was lost: try again.');
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
  const serverErrors = (!saved && editing?.validationErrors) || [];
  const firstError = Object.values(errors)[0]?.message ?? failure ?? (serverErrors.length ? 'The server rejected this report:' : null);

  if (saved) {
    return (
      <Panel title="Report saved">
        <div className="report-saved" role="status" data-testid="report-saved" data-client-event-id={saved.id}>
          <p><strong data-testid="report-saved-label">Saved locally</strong>: {saved.label}. It is stored on this device and will sync automatically.</p>
          <div className="report-saved__actions">
            {onOpenDetail && <Button variant="primary" data-testid="report-view-detail" onClick={() => onOpenDetail(saved.id)}>View report</Button>}
            <Button data-testid="report-new-another" onClick={() => setSaved(null)}>New report</Button>
            {onDone && <Button data-testid="report-done" onClick={onDone}>Done</Button>}
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={editing ? 'Edit rejected report' : 'New report'}>
      <form onSubmit={guardedSubmit} noValidate aria-label="Report form" className="report-form">
        <Button
          variant="primary" data-testid="quick-blocked"
          onClick={() => pickCategory('blocked_road')}
        >
          Report blocked road
        </Button>
        <div role="radiogroup" aria-label="What are you reporting?" className="report-cats" data-testid="report-categories">
          {CATEGORIES.map((c) => {
            const checked = c.category === category;
            const ids = c.eventType && !c.blocked
              ? { 'data-testid': c.category === 'submerged_bridge' ? 'report-type-submerged_bridge' : `report-type-${c.eventType}` }
              : { 'data-testid': `report-category-${c.category}` };
            return (
              <button
                key={c.category} type="button" role="radio" className="report-cat"
                aria-checked={checked} aria-disabled={c.blocked ? true : undefined}
                data-category={c.category} {...ids}
                onClick={() => pickCategory(c.category)}
              >
                <span className="report-cat__label">{checked ? '● ' : ''}{c.label}</span>
                <span className="report-cat__hint">{c.hint}</span>
                {c.blocked && <span className="report-cat__blocked">{c.blocked}</span>}
              </button>
            );
          })}
        </div>

        {(category === 'blocked_road' || category === 'submerged_bridge' || category === 'road_cleared') && (
          <div className="setu-field">
            <label className="setu-field__label" htmlFor="f-roadId">{category === 'blocked_road' ? 'Road' : category === 'submerged_bridge' ? 'Bridge or crossing' : 'Road or bridge'}</label>
            <select id="f-roadId" className={SELECT} data-testid="field-roadId" {...register('roadId')}>
              <option value="">{category === 'road_cleared' ? 'Select road…' : 'Unknown (use location)'}</option>
              {roads.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {err('roadId') && <span className="setu-field__error" role="alert">{err('roadId')}</span>}
            {!snapshot && <span className="report-hint-disabled"> Demo list: no cached district data on this device yet.</span>}
          </div>
        )}
        {(category === 'blocked_road' || category === 'submerged_bridge') && (
          <div className="setu-field">
            <label className="setu-field__label" htmlFor="f-blockage">How blocked</label>
            <select id="f-blockage" className={SELECT} data-testid="field-blockage" {...register('blockage')}>
              <option value="full">Fully blocked (full)</option>
              <option value="partial">Partly passable (partial)</option>
            </select>
          </div>
        )}
        {category === 'blocked_road' && (
          <div className="setu-field">
            <label className="setu-field__label" htmlFor="f-cause">Obstruction type</label>
            <select id="f-cause" className={SELECT} data-testid="field-cause" {...register('cause')}>
              <option value="">Not sure</option>
              {CAUSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {category === 'submerged_bridge' && <p data-testid="cause-fixed">Cause: <strong>submerged</strong></p>}
        {category === 'flooded_road' && (
          <>
            <Field label="Severity (1 = minor, 5 = severe)" type="number" inputMode="numeric" min={1} max={5} data-testid="field-severity" error={err('severity')} {...register('severity')} />
            <Field label="Water depth, cm (optional)" type="number" inputMode="decimal" min={0} data-testid="field-depthCm" error={err('depthCm')} {...register('depthCm')} />
            <Field label="Area ID (optional)" data-testid="field-areaId" {...register('areaId')} />
          </>
        )}
        {category === 'water_level' && (
          <>
            <div className="report-unit">
              <Field label="Water level (unit: cm)" type="number" inputMode="decimal" data-testid="field-levelCm" error={err('levelCm')} {...register('levelCm')} />
              <span aria-hidden="true">cm</span>
            </div>
            <p className="report-hint-disabled" data-testid="estimate-hint">Estimated vs measured: not recorded yet. {BLOCKED_15}</p>
            <div className="setu-field">
              <label className="setu-field__label" htmlFor="f-trend">Trend</label>
              <select id="f-trend" className={SELECT} data-testid="field-trend" {...register('trend')}>
                <option value="rising">rising</option>
                <option value="steady">steady</option>
                <option value="falling">falling</option>
              </select>
            </div>
            <Field label="Gauge ID (optional)" data-testid="field-gaugeId" {...register('gaugeId')} />
          </>
        )}

        <Field
          label="When did you observe this?" type="datetime-local" data-testid="field-observedAt"
          error={err('observedAt')} {...register('observedAt')}
        />
        <p className="report-hint-disabled">Defaults to now; change it if you saw this earlier.</p>

        <fieldset className="report-location">
          <legend>Location</legend>
          <p data-testid="location-summary" role="status">
            {hasLocation ? describeLocation(source, accuracy === '' ? undefined : Number(accuracy)) : describeLocation('unknown')}
            {gps === 'locating' && ' (finding GPS…)'}
            {gps === 'unavailable' && !hasLocation && ' (GPS unavailable)'}
          </p>
          <div className="report-location__actions">
            <Button data-testid="location-gps" onClick={locate}>Use GPS (optional)</Button>
            <Button data-testid="location-map-toggle" onClick={() => setShowMap((s) => !s)} aria-expanded={showMap}>
              {showMap ? 'Hide map' : 'Pick on map'}
            </Button>
          </div>
          {showMap && (
            <MapPicker
              value={hasLocation ? { lat: Number(lat), lng: Number(lng) } : null}
              onPick={(p) => setLocation(p, 'map')}
              createStyle={createMapStyle}
              onMapReady={onMapReady}
            />
          )}
          <Field
            label="Latitude" inputMode="decimal" data-testid="field-lat" error={err('lat')}
            {...register('lat', { onChange: () => { setValue('locationSource', 'manual'); setValue('accuracyM', ''); } })}
          />
          <Field
            label="Longitude" inputMode="decimal" data-testid="field-lng" error={err('lng')}
            {...register('lng', { onChange: () => { setValue('locationSource', 'manual'); setValue('accuracyM', ''); } })}
          />
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
        <Button type="submit" variant="primary" data-testid="report-submit" disabled={isSubmitting}>
          {editing ? 'Resubmit' : 'Save report'}
        </Button>
      </form>
    </Panel>
  );
}
