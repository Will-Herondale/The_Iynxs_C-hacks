import { useId } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode } from 'react';

export function OnlineIndicator({ online }: { online: boolean }) {
  return (
    <span className={`setu-online setu-online--${online ? 'online' : 'offline'}`} role="status">
      <span aria-hidden="true">{online ? '●' : '⦸'}</span>
      <span>{online ? 'Online' : 'Offline'}</span>
    </span>
  );
}

export interface AppShellProps {
  header?: ReactNode;
  nav?: ReactNode;
  main: ReactNode;
  aside?: ReactNode;
}

export function AppShell({ header, nav, main, aside }: AppShellProps) {
  return (
    <div className="setu-app-shell">
      {header && <header className="setu-app-shell__header">{header}</header>}
      {nav && <nav className="setu-app-shell__nav">{nav}</nav>}
      <main className="setu-app-shell__main">{main}</main>
      {aside && <aside className="setu-app-shell__aside">{aside}</aside>}
    </div>
  );
}

export function Panel({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <section className="setu-panel">
      {title && <h2 className="setu-panel__title">{title}</h2>}
      {children}
    </section>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger';
}

export function Button({ variant = 'default', className, type = 'button', ...rest }: ButtonProps) {
  const cls = ['setu-button', variant !== 'default' && `setu-button--${variant}`, className].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest} />;
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Field({ label, error, id, className, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = `${inputId}-error`;
  return (
    <div className={`setu-field${error ? ' setu-field--error' : ''}`}>
      <label className="setu-field__label" htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className={['setu-field__control', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        {...rest}
      />
      {error && <span id={errId} className="setu-field__error" role="alert">{error}</span>}
    </div>
  );
}

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function Badge({ tone = 'neutral', icon, children }: { tone?: BadgeTone; icon?: string; children?: ReactNode }) {
  return (
    <span className={`setu-badge${tone === 'neutral' ? '' : ` setu-badge--${tone}`}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactElement }) {
  return (
    <div className="setu-empty">
      <p className="setu-empty__title">{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
