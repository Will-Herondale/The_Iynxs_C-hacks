/** Honest placeholder for data the spec wants but the contract does not carry (blocked: issue #15). */
export const NOT_PROVIDED = 'Not provided by backend';

export function NotProvided({ field, short }: { field: string; short?: boolean }) {
  return (
    <span data-testid={`not-provided-${field}`} title="The backend does not provide this; the frontend does not estimate it." style={{ opacity: 0.75, fontStyle: 'italic' }}>
      {short ? 'Not provided' : NOT_PROVIDED}
    </span>
  );
}

/** Mono-spaced identifier. */
export function MonoId({ children }: { children: string }) {
  return <code className="cmd-mono" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{children}</code>;
}

/**
 * Caveats shown on every flood area. The synthetic note mirrors @setu/geo GEO_PROVENANCE
 * (swap to the package export once it is merged).
 */
export const FLOOD_CAVEAT = 'DEM-threshold approximation — not a validated hydraulic simulation';
export const FLOOD_SYNTHETIC_NOTE = 'Scenario-derived flood extent is SYNTHETIC (generated from a DEM threshold for the demo), not a measurement.';
