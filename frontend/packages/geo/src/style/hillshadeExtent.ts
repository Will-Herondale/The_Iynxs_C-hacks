/**
 * Geographic corners of data/hillshade.png as written by scripts/dem.mjs (data/hillshade.json `coordinates`):
 * top-left, top-right, bottom-right, bottom-left, [lng, lat]. The image covers Karthik's whole AOI, which is
 * larger than the island's bounding box (MAJULI_BOUNDS). hillshadeExtent.test.ts keeps this in sync with the JSON.
 */
export const HILLSHADE_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [93.59986111111111, 27.220138888888886],
  [94.70013888888889, 27.220138888888886],
  [94.70013888888889, 26.77986111111111],
  [93.59986111111111, 26.77986111111111],
];
