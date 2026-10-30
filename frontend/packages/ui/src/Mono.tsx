import type { HTMLAttributes } from 'react';

/** Monospace rendering for identifiers (road ids, shelter ids, event ids). */
export function Mono({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...rest} className={['setu-mono', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
