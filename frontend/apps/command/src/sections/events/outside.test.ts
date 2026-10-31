import { describe, expect, it } from 'vitest';
import { isOutsideMajuli } from './EventsSection';

describe('isOutsideMajuli', () => {
  it('flags reports far from the island and accepts ones on it', () => {
    expect(isOutsideMajuli({ lat: 17.4631, lng: 78.3517 })).toBe(true); // Hyderabad
    expect(isOutsideMajuli({ lat: 26.95, lng: 94.17 })).toBe(false); // Kamalabari area
  });
});
