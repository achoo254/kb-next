import { describe, expect, it } from 'vitest';
import { PLANET_LOOKS, planetFor } from './planet-art';

describe('planetFor', () => {
  it('gives the same planet to the same Collection', () => {
    const id = '25b439a6-cb0c-495b-8b93-dab54b7c5309';
    expect(planetFor(id)).toBe(planetFor(id));
  });

  it('always returns one of the planets, and spreads Collections over several of them', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const arts = ids.map((id) => planetFor(id).art);
    expect(arts.every((art) => PLANET_LOOKS.some((p) => p.art === art))).toBe(true);
    expect(new Set(arts).size).toBeGreaterThanOrEqual(4);
  });
});
