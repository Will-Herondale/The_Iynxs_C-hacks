import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { Button, Field, Panel } from '@setu/ui';
import { FieldEventSchema, newClientEventId } from '@setu/contract';
import type { FieldEvent, HouseholdRegistration } from '@setu/contract';
import { enqueue, replace } from '../../sync/index.js';
import type { QueueItem } from '../../sync/index.js';
import { getDeviceId, getReporterId } from '../../app/identity.js';
import { DEFAULT_LOCATION, useGeolocation } from '../report/location.js';

const VULNERABLE = ['elderly', 'children', 'disabled', 'medical'] as const;
const SETTLEMENTS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

export interface HouseholdValues {
  headName: string;
  members: string;
  settlementId: string;
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
  headName: '', members: '1', settlementId: '', elderly: false, children: false, disabled: false, medical: false,
  needs: '', lat: '', lng: '', note: '',
};

const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

export function buildHouseholdEvent(
  v: HouseholdValues,
  id: { reporterId: string; deviceId: string },
  clientEventId: string,
  householdId: string,
  shelterId?: string,
) {
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
    headName: e.headName, members: String(e.members), settlementId: e.settlementId ?? '', ...e.vulnerable,
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
  /** Camp mode: replaces the panel title and form test id. */
  title?: string;
  formTestId?: string;
}

const defaultSubmit = (event: FieldEvent, editing?: QueueItem | null) =>
  editing ? replace(editing.clientEventId, event) : enqueue(event);

export function HouseholdScreen({ editing, onDone, submit = defaultSubmit, shelterId, title, formTestId }: HouseholdScreenProps) {
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
      setSent('Household saved to the queue. It syncs automatically.');
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
      await handleSubmit(onValid)();
    } finally {
      busy.current = false;
    }
  };

  const err = (k: keyof HouseholdValues) => errors[k]?.message;
  // Server-side validation errors of the rejected item being edited stay visible until it is resubmitted.
  const serverErrors = (!sent && editing?.validationErrors) || [];
  const firstError = Object.values(errors)[0]?.message ?? failure ?? (serverErrors.length ? 'The server rejected this report:' : null);

  return (
    <Panel title={title ?? (editing ? 'Edit rejected household' : 'Register household')}>
      <form onSubmit={guardedSubmit} noValidate data-testid={formTestId} aria-label="Household registration form">
        <Field label="Head of household" data-testid="household-headName" error={err('headName')} {...register('headName')} />
        <Field label="Members" type="number" min={1} data-testid="household-members" error={err('members')} {...register('members')} />
        <div className="setu-field">
          <label className="setu-field__label" htmlFor="h-settlement">Settlement</label>
          <select id="h-settlement" className="setu-field__control" data-testid="household-settlementId" {...register('settlementId')}>
            <option value="">Unknown</option>
            {SETTLEMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <fieldset>
          <legend>Vulnerable members</legend>
          {VULNERABLE.map((k) => (
            <label key={k}>
              <input type="checkbox" data-testid={`household-vulnerable-${k}`} {...register(k)} /> {k}
            </label>
          ))}
        </fieldset>
        <Field label="Needs (comma separated)" data-testid="household-needs" {...register('needs')} />
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
        {firstError && (
          <div role="alert" data-testid="form-error">
            <p>{firstError}</p>
            {!Object.keys(errors).length && !failure && serverErrors.length > 0 && (
              <ul>{serverErrors.map((v, i) => <li key={i}>{v.path ? `${v.path}: ` : ''}{v.message}</li>)}</ul>
            )}
          </div>
        )}
        {sent && !firstError && <p role="status">{sent}</p>}
        <Button type="submit" variant="primary" data-testid="household-submit" disabled={isSubmitting}>
          {editing ? 'Resubmit' : 'Register household'}
        </Button>
      </form>
    </Panel>
  );
}
