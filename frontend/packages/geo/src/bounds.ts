import { MAJULI_BOUNDS } from './generated.js';

export { MAJULI_BOUNDS };
/** [lon, lat] centre of MAJULI_BOUNDS. */
export const MAJULI_CENTER: [number, number] = [
  Math.round(((MAJULI_BOUNDS[0][0] + MAJULI_BOUNDS[1][0]) / 2) * 1e5) / 1e5,
  Math.round(((MAJULI_BOUNDS[0][1] + MAJULI_BOUNDS[1][1]) / 2) * 1e5) / 1e5,
];
