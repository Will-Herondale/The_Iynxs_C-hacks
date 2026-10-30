// Base-map palette. Water is blue (permanent water, NOT flood); flood/passability colours live in the apps.
export const BASE_COLORS = {
  background: '#e9edf0',
  land: '#f4f1e8',
  landOutline: '#9aa59b',
  water: '#bcd8ee',
  waterOutline: '#7fb0d6',
  waterway: '#7fb0d6',
  roadCasing: '#ffffff',
  road: {
    trunk: '#8a8f98',
    primary: '#8a8f98',
    secondary: '#9aa0a8',
    tertiary: '#aab0b7',
    unclassified: '#b8bdc3',
    minor: '#c6cacf',
  },
  ferry: '#3a6ea5',
} as const;
