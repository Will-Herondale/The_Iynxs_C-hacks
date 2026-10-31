import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { Button, Field, Panel } from '@setu/ui';
import '../household/household.css';
import { FieldEventSchema, newClientEventId } from '@setu/contract';
import type { AgeBand, FieldEvent, PersonCheckin, ProjectionSnapshot } from '@setu/contract';
import { enqueue } from '../../sync/index.js';
import { getDeviceId, getReporterId } from '../../app/identity.js';
import { DEFAULT_LOCATION, useGeolocation } from '../report/location.js';
import { advanceOnEnter, SearchSelect, useWizard, WizardNav, WizardProgress } from '../wizard/index.js';

const STEPS = ['Person', 'Needs', 'Location'];
/** Which step a validation error belongs to, so a failed submit jumps to the field that needs fixing. */
const stepForField = (k: string) => (['name', 'ageBand', 'sex', 'settlementId', 'householdId'].includes(k) ? 0 : ['lat', 'lng', 'note'].includes(k) ? 2 : 1);

const VULNERABLE = ['elderly', 'children', 'disabled', 'medical'] as const;

const AGE_BANDS: AgeBand[] = ['0-4', '5-12', '13-17', '18-59', '60+'];
const SEXES = [
  { value: 'u', label: 'Not recorded' },
  { value: 'f', label: 'Female' },
  { value: 'm', label: 'Male' },
  { value: 'o', label: 'Other' },
] as const;

export interface PersonValues {
  name: string;
  ageBand: AgeBand;
  sex: 'f' | 'm' | 'o' | 'u';
  settlementId: string;
  householdId: string;
  elderly: boolean;
  children: boolean;
  disabled: boolean;
  medical: boolean;
  needs: string;
  lat: string;
  lng: string;
  note: string;
}

const EMPTY: PersonValues = {
  name: '',
  ageBand: '18-59',
  sex: 'u',
  settlementId: '',
  householdId: '',
  elderly: false,
  children: false,
  disabled: false,
  medical: false,
  needs: '',
  lat: '',
  lng: '',
  note: '',
};

const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

/** Build a person_checkin event for one person at one camp. Pure, so it is unit-testable. */
export function buildPersonCheckinEvent(
  v: PersonValues,
  id: { reporterId: string; deviceId: string },
  clientEventId: string,
  campId: string,
  personId?: string,
) {
  const raw = {
    clientEventId,
    occurredAt: new Date().toISOString(),
    reporterId: id.reporterId,
    deviceId: id.deviceId,
    location: { lat: num(v.lat), lng: num(v.lng) },
    note: v.note.trim() || undefined,
    type: 'person_checkin',
    personId: personId ?? clientEventId,
    name: v.name.trim(),
    ageBand: v.ageBand,
    sex: v.sex,
    campId,
    settlementId: v.settlementId.trim() || undefined,
    householdId: v.householdId.trim() || undefined,
    vulnerable: { elderly: v.elderly, children: v.children, disabled: v.disabled, medical: v.medical },
    needs: v.needs.split(',').map((s) => s.trim()).filter(Boolean),
  };
  const parsed = FieldEventSchema.safeParse(raw);
  if (parsed.success) return { ok: true as const, event: parsed.data };
  return {
    ok: false as const,
    errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}

function valuesFromEvent(e: PersonCheckin): PersonValues {
  return {
    name: e.name,
    ageBand: (e.ageBand ?? '18-59') as AgeBand,
    sex: e.sex ?? 'u',
    settlementId: e.settlementId ?? '',
    householdId: e.householdId ?? '',
    elderly: e.vulnerable?.elderly ?? false,
    children: e.vulnerable?.children ?? false,
    disabled: e.vulnerable?.disabled ?? false,
    medical: e.vulnerable?.medical ?? false,
    needs: (e.needs ?? []).join(', '),
    lat: String(e.location.lat),
    lng: String(e.location.lng),
    note: e.note ?? '',
  };
}

const keyFor = (path: string) =>
  path.startsWith('location.lat') ? 'lat' : path.startsWith('location.lng') ? 'lng' : path.split('.')[0] ?? path;

export interface PersonCheckinScreenProps {
  /** The camp this volunteer is working at. */
  campId: string;
  /** Existing check-in being corrected, if any. */
  editing?: PersonCheckin | null;
  onDone?: () => void;
  title?: string;
  formTestId?: string;
  /** Latest cached projections: source of the origin-village list. */
  snapshot?: ProjectionSnapshot;
}

/**
 * Individual check-in at a camp. A household registration records a family as
 * one declared group; this records one person, so the same person appearing at
 * two camps produces two records the Command app can flag as possible duplicates.
 */
export function PersonCheckinScreen({ campId, editing, onDone, title, formTestId, snapshot }: PersonCheckinScreenProps) {
  const identity = { reporterId: getReporterId(), deviceId: getDeviceId() };
  const idRef = useRef(newClientEventId());
  const personId = editing?.personId;
  const busy = useRef(false);
  const [sent, setSent] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const resolver: Resolver<PersonValues> = async (values) => {
    const r = buildPersonCheckinEvent(values, identity, idRef.current, campId, personId);
    if (r.ok) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const e of r.errors) errors[keyFor(e.path)] ??= { type: 'validate', message: e.message };
    return { values: {}, errors };
  };

  const { register, handleSubmit, setValue, watch, reset, formState } = useForm<PersonValues>({
    defaultValues: editing ? valuesFromEvent(editing) : EMPTY,
    resolver,
  });
  const { errors, isSubmitting } = formState;
  const w = useWizard(STEPS.length);
  const settlements = (snapshot?.settlements.features ?? []).map((f) => ({
    id: f.properties.settlementId,
    name: f.properties.name,
  }));

  const { gps, locate } = useGeolocation((p) => {
    if (!watch('lat') && !watch('lng')) {
      setValue('lat', String(p.lat));
      setValue('lng', String(p.lng));
    }
  }, !editing);

  const onValid = async (values: PersonValues) => {
    setFailure(null);
    try {
      const r = buildPersonCheckinEvent(values, identity, idRef.current, campId, personId);
      if (!r.ok) return;
      await enqueue(r.event);
      idRef.current = newClientEventId();
      w.go(0);
      setSent('Saved locally. It will sync automatically when a connection is available.');
      reset({ ...EMPTY, lat: values.lat, lng: values.lng });
      onDone?.();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not save the check-in');
    }
  };

  const guardedSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    try {
      await handleSubmit(onValid, (errs) => { const k = Object.keys(errs)[0]; if (k) w.go(stepForField(k)); })();
    } finally {
      busy.current = false;
    }
  };

  const err = (k: keyof PersonValues) => errors[k]?.message;
  const firstError = Object.values(errors)[0]?.message ?? failure ?? null;

  return (
    <Panel title={title ?? 'Check in a person'}>
      <p className="household-note">
        One person, one record. Camp: <code data-testid="person-camp-id">{campId}</code>
      </p>
      <form onSubmit={guardedSubmit} onKeyDown={advanceOnEnter(w)} noValidate data-testid={formTestId} aria-label="Person check-in form">
        <WizardProgress steps={STEPS} wizard={w} />
        <div className="wizard-step" hidden={w.step !== 0}>
        <Field label="Full name" data-testid="person-name" error={err('name')} {...register('name')} />
        <div className="setu-field">
          <label className="setu-field__label" htmlFor="p-age">Age band</label>
          <select id="p-age" className="setu-field__control household-control" data-testid="person-ageBand" {...register('ageBand')}>
            {AGE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="setu-field">
          <label className="setu-field__label" htmlFor="p-sex">Sex</label>
          <select id="p-sex" className="setu-field__control household-control" data-testid="person-sex" {...register('sex')}>
            {SEXES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="setu-field">
          <label className="setu-field__label" htmlFor="p-settlement">Origin village</label>
          <SearchSelect
            what="villages" emptyLabel="Unknown" selected={watch('settlementId')}
            options={settlements.map((x) => ({ value: x.id, label: `${x.name} (${x.id})` }))}
            selectProps={{ id: 'p-settlement', className: 'setu-field__control household-control', 'data-testid': 'person-settlementId', ...register('settlementId') }}
          />
        </div>
        <Field label="Household ID (if known, optional)" data-testid="person-householdId" error={err('householdId')} {...register('householdId')} />
        </div>
        <div className="wizard-step" hidden={w.step !== 1}>
        <fieldset>
          <legend>Assistance requirements</legend>
          {VULNERABLE.map((k) => (
            <label key={k} className="household-check">
              <input type="checkbox" data-testid={`person-vulnerable-${k}`} {...register(k)} /> {k}
            </label>
          ))}
        </fieldset>
        <Field label="Other needs (comma separated, e.g. water, medicine)" data-testid="person-needs" {...register('needs')} />
        </div>
        <div className="wizard-step" hidden={w.step !== 2}>
        <fieldset>
          <legend>Location</legend>
          <Field label="Latitude" inputMode="decimal" data-testid="person-lat" error={err('lat')} {...register('lat')} />
          <Field label="Longitude" inputMode="decimal" data-testid="person-lng" error={err('lng')} {...register('lng')} />
          <p role="status">
            {gps === 'locating' && 'Finding GPS.'}
            {gps === 'ok' && 'Location from GPS (editable).'}
            {gps === 'unavailable' && 'GPS unavailable: enter the location manually.'}{' '}
            <Button onClick={locate}>Use GPS</Button>{' '}
            <Button onClick={() => { setValue('lat', String(DEFAULT_LOCATION.lat)); setValue('lng', String(DEFAULT_LOCATION.lng)); }}>Use default area</Button>
          </p>
        </fieldset>
        <div className="setu-field">
          <label className="setu-field__label" htmlFor="p-note">Note</label>
          <textarea id="p-note" className="setu-field__control" rows={2} data-testid="person-note" {...register('note')} />
        </div>
        </div>
        {firstError && <div role="alert" data-testid="person-form-error"><p>{firstError}</p></div>}
        {sent && !firstError && <p role="status">{sent}</p>}
        <WizardNav wizard={w}>
          <Button type="submit" variant="primary" className="household-submit" data-testid="person-submit" hidden={!w.last} disabled={isSubmitting}>
            Check in person
          </Button>
        </WizardNav>
      </form>
    </Panel>
  );
}
