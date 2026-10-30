import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface ContextPanelProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** Side panel showing detail for the selected item. Esc closes it. */
export function ContextPanel({ title, onClose, children }: ContextPanelProps) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      className="setu-context"
      aria-labelledby={id}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="setu-context__head">
        <h2 id={id}>{title}</h2>
        <button type="button" className="setu-context__close" onClick={onClose} aria-label="Close panel">
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <div className="setu-context__body">{children}</div>
    </aside>
  );
}
