export type Origin = 'local' | 'remote';

/** Shape per origin so it is never carried by colour alone (state shapes on markers are separate). */
export const ORIGIN_SHAPE: Record<Origin, { glyph: string; shape: string }> = {
  local: { glyph: '●', shape: 'circle' },
  remote: { glyph: '⬢', shape: 'hexagon' },
};

/** "Local", "Local · Accepted" once the server confirmed it, or "Remote". */
export function originLabel(origin: Origin, accepted = false): string {
  if (origin === 'remote') return 'Remote';
  return accepted ? 'Local · Accepted' : 'Local';
}
