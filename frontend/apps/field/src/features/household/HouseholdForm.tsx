import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { Button, Field, Panel } from '@setu/ui';
import './household.css';
import { FieldEventSchema, newClientEventId } from '@setu/contract';
import type { FieldEvent, HouseholdRegistration, ProjectionSnapshot } from '@setu/contract';
import { enqueue, replace } from '../../sync/index.js';
import type { QueueItem } from '../../sync/index.js';
import { getDeviceId, getReporterId } from '../../app/identity.js';
import { DEFAULT_LOCATION, useGeolocation } from '../report/location.js';
import { advanceOnEnter, SearchSelect, useWizard, WizardNav, WizardProgress } from '../wizard/index.js';

const VULNERABLE = ['elderly', 'children', 'disabled', 'medical'] as const;
const STEPS = ['Household', 'Needs', 'Location'];
/** Which step a validation error belongs to, so a failed submit jumps to the field that needs fixing. */
const stepForField = (k: string) => (['headName', 'members', 'settlementId', 'shelterId'].includes(k) ? 0 : ['lat', 'lng', 'note'].includes(k) ? 2 : 1);

export interface HouseholdValues {
  headName: string;
  members: string;
  settlementId: string;
  shelterId: string;
  elderly: boolean;
  children: boolean;
  disabled: boolean;
  medical: boolean;
  needs: string;
  lat: string;
  lng: string;
  note: string;
}

const EMPTY: HouseholdValues = {
  headName: '', members: '1', settlementId: '', shelterId: '', elderly: false, children: false, disabled: false, medical: false,
  needs: '', lat: '', lng: '', note: '',
};

const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

export function buildHouseholdEvent(
  v: HouseholdValues,
  id: { reporterId: string; deviceId: string },
  clientEventId: string,
  householdId: string,
  fixedShelterId?: string,
) {
  const shelterId = fixedShelterId || v.shelterId.trim() || undefined;
  const raw = {
    clientEventId,
    occurredAt: new Date().toISOString(),
    reporterId: id.reporterId,
    deviceId: id.deviceId,
    location: { lat: num(v.lat), lng: num(v.lng) },
    note: v.note.trim() || undefined,
    type: 'household_registration',
    householdId,
    ...(shelterId ? { shelterId } : {}),
    headName: v.headName.trim(),
    members: num(v.members),
    vulnerable: { elderly: v.elderly, children: v.children, disabled: v.disabled, medical: v.medical },
    settlementId: v.settlementId.trim() || undefined,
    needs: v.needs.split(',').map((s) => s.trim()).filter(Boolean),
  };
  const parsed = FieldEventSchema.safeParse(raw);
  if (parsed.success) return { ok: true as const, event: parsed.data };
  return { ok: false as const, errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
}

function valuesFromEvent(e: HouseholdRegistration): HouseholdValues {
  return {
    headName: e.headName, members: String(e.members), settlementId: e.settlementId ?? '', shelterId: e.shelterId ?? '', ...e.vulnerable,
    needs: e.needs.join(', '), lat: String(e.location.lat), lng: String(e.location.lng), note: e.note ?? '',
  };
}

const keyFor = (path: string) => (path.startsWith('location.lat') ? 'lat' : path.startsWith('location.lng') ? 'lng' : path.split('.')[0] ?? path);

export interface HouseholdScreenProps {
  editing?: QueueItem | null;
  onDone?: () => void;
  submit?: (event: FieldEvent, editing?: QueueItem | null) => Promise<unknown>;
  /** Camp mode: registers the household at this shelter. */
  shelterId?: string;
  /** One person who is not in a camp: saved as a household of one (the contract records individuals only at a camp). */
  individual?: boolean;
  /** Camp mode: replaces the panel title and form test id. */
  title?: string;
  formTestId?: string;
  /** Latest cached projections: source of the origin-village and camp lists. */
  snapshot?: ProjectionSnapshot;
}

const defaultSubmit = (event: FieldEvent, editing?: QueueItem | null) =>
  editing ? replace(editing.clientEventId, event) : enqueue(event);

export function HouseholdScreen({ editing, onDone, submit = defaultSubmit, shelterId, individual, title, formTestId, snapshot }: HouseholdScreenProps) {
  const identity = { reporterId: getReporterId(), deviceId: getDeviceId() };
  const editEvent = editing?.event.type === 'household_registration' ? editing.event : undefined;
  const idRef = useRef(newClientEventId());
  const householdRef = useRef(editEvent?.householdId ?? newClientEventId());
  const busy = useRef(false);
  const [sent, setSent] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const resolver: Resolver<HouseholdValues> = async (values) => {
    const r = buildHouseholdEvent(values, identity, idRef.current, householdRef.current, shelterId ?? editEvent?.shelterId);
    if (r.ok) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const e of r.errors) errors[keyFor(e.path)] ??= { type: 'validate', message: e.message };
    return { values: {}, errors };
  };

  const { register, handleSubmit, setValue, watch, reset, formState } = useForm<HouseholdValues>({
    defaultValues: editEvent ? valuesFromEvent(editEvent) : EMPTY,
    resolver,
  });
  const { errors, isSubmitting } = formState;
  const w = useWizard(STEPS.length);
  const settlements = (snapshot?.settlements.features ?? []).map((f) => ({ id: f.properties.settlementId, name: f.properties.name }));
  const shelters = (snapshot?.shelters.features ?? []).map((f) => ({ id: f.properties.shelterId, name: f.properties.name }));

  const { gps, locate } = useGeolocation((p) => {
    if (!watch('lat') && !watch('lng')) {
      setValue('lat', String(p.lat));
      setValue('lng', String(p.lng));
    }
  }, !editing);

  const onValid = async (values: HouseholdValues) => {
    setFailure(null);
    try {
      const r = buildHouseholdEvent(values, identity, idRef.current, householdRef.current, shelterId ?? editEvent?.shelterId);
      if (!r.ok) return;
      await submit(r.event, editing);
      idRef.current = newClientEventId();
      householdRef.current = newClientEventId();
      w.go(0);
      setSent('Saved locally. It will sync automatically when a connection is available.');
      reset({ ...EMPTY, lat: values.lat, lng: values.lng });
      onDone?.();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not save the household');
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

  const err = (k: keyof HouseholdValues) => errors[k]?.message;
  // Server-side validation errors of the rejected item being edited stay visible until it is resubmitted.
  const serverErrors = (!sent && editing?.validationErrors) || [];
  const firstError = Object.values(errors)[0]?.message ?? failure ?? (serverErrors.length ? 'The server rejected this report:' : null);

  return (
    <Panel title={title ?? (editing ? 'Edit rejected household' : individual ? 'Register an individual' : 'Register household')}>
      <p className="household-note">Household ID (generated on this device): <code data-testid="household-id">{householdRef.current}</code></p>
      <form onSubmit={guardedSubmit} onKeyDown={advanceOnEnter(w)} noValidate data-testid={formTestId} aria-label="Household registration form">
        <WizardProgress steps={STEPS} wizard={w} />
        <div className="wizard-step" hidden={w.step !== 0}>
        <Field label={individual ? 'Full name' : 'Head of household'} data-testid="household-headName" error={err('headName')} {...register('headName')} />
        <div hidden={individual}>
          <Field label="Members" type="number" min={1} data-testid="household-members" error={err('members')} {...register('members')} />
          <p className="household-note" data-testid="household-member-names-blocked" aria-disabled="true">
            Member names: Blocked: #15 (not in the contract; only the member count is recorded).
          </p>
        </div>
        {individual && (
          <p className="household-note" role="note" data-testid="individual-note">
            This person is not in a camp. The district system records individuals only at a camp, so this is saved as a household of one.
          </p>
        )}
        <div className="setu-field">
          <label className="setu-field__label" htmlFor="h-settlement">Origin village</label>
          <SearchSelect
            what="villages" emptyLabel="Unknown" selected={watch('settlementId')}
            options={[
              ...(editEvent?.settlementId && !settlements.some((x) => x.id === editEvent.settlementId) ? [{ value: editEvent.settlementId, label: editEvent.settlementId }] : []),
              ...settlements.map((x) => ({ value: x.id, label: `${x.name} (${x.id})` })),
            ]}
            selectProps={{ id: 'h-settlement', className: 'setu-field__control household-control', 'data-testid': 'household-settlementId', ...register('settlementId') }}
          />
          {settlements.length === 0 && <p className="household-note" data-testid="household-places-missing">No village list on this device yet; origin village stays Unknown until places are cached.</p>}
        </div>
        {!shelterId && !individual && (
          <div className="setu-field">
            <label className="setu-field__label" htmlFor="h-shelter">Current camp</label>
            <SearchSelect
              what="camps" emptyLabel="Not in a camp" selected={watch('shelterId')}
              options={[
                ...(editEvent?.shelterId && !shelters.some((x) => x.id === editEvent.shelterId) ? [{ value: editEvent.shelterId, label: editEvent.shelterId }] : []),
                ...shelters.map((x) => ({ value: x.id, label: `${x.name} (${x.id})` })),
              ]}
              selectProps={{ id: 'h-shelter', className: 'setu-field__control household-control', 'data-testid': 'household-shelterId', ...register('shelterId') }}
            />
          </div>
        )}
        </div>
        <div className="wizard-step" hidden={w.step !== 1}>
        <fieldset>
          <legend>Assistance requirements: vulnerable members</legend>
          {VULNERABLE.map((k) => (
            <label key={k} className="household-check">
              <input type="checkbox" data-testid={`household-vulnerable-${k}`} {...register(k)} /> {k}
            </label>
          ))}
        </fieldset>
        <Field label="Other needs (comma separated, e.g. water, medicine)" data-testid="household-needs" {...register('needs')} />
        </div>
        <div className="wizard-step" hidden={w.step !== 2}>
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
          <label className="setu-field__label" htmlFor="h-note">Note</label>
          <textarea id="h-note" className="setu-field__control" rows={2} data-testid="field-note" {...register('note')} />
        </div>
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
        <WizardNav wizard={w}>
          <Button type="submit" variant="primary" className="household-submit" data-testid="household-submit" hidden={!w.last} disabled={isSubmitting}>
            {editing ? 'Resubmit' : individual ? 'Register person' : 'Register household'}
          </Button>
        </WizardNav>
      </form>
    </Panel>
  );
}
