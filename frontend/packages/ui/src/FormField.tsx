import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

export interface FormFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** A single input/select/textarea; it receives id, aria-describedby and aria-invalid. */
  children: ReactNode;
}

/** Label + control + hint + error, wired together for assistive tech. */
export function FormField({ label, hint, error, children }: FormFieldProps) {
  const uid = useId();
  const hintId = `${uid}-hint`;
  const errId = `${uid}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  const only = Children.count(children) === 1 && isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null;
  const controlId = (only?.props.id as string | undefined) ?? uid;
  const control = only
    ? cloneElement(only, { id: controlId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children;
  return (
    <div className={`setu-formfield${error ? ' setu-formfield--error' : ''}`}>
      <label htmlFor={controlId}>{label}</label>
      {hint ? (
        <p id={hintId} className="setu-formfield__hint">
          {hint}
        </p>
      ) : null}
      {control}
      {error ? (
        <p id={errId} className="setu-formfield__error" role="alert">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
