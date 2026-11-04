import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRYSTAL_ART, crystalSrcSet, stateArtSrc } from './art';

describe('stateArtSrc', () => {
  it('maps illustrations and Space crystals to their files in public/art', () => {
    expect(stateArtSrc('vault-lock')).toBe('/art/ill-vault-lock.webp');
    expect(stateArtSrc('crystal-docker')).toBe('/art/crystal-docker.webp');
  });
});

describe('crystalSrcSet', () => {
  it('offers the 336px copy next to the full art, for the crystals and the orb standing in for Cloud', () => {
    expect(crystalSrcSet('/art/crystal-docker.webp')).toBe('/art/crystal-docker-336.webp 336w, /art/crystal-docker.webp 480w');
    expect(crystalSrcSet(CRYSTAL_ART.cloud)).toBe('/art/orb-universe-336.webp 336w, /art/orb-universe.webp 768w');
  });

  it('keeps a single src for art without a smaller copy', () => {
    expect(crystalSrcSet('/art/uploaded-space.webp')).toBeUndefined();
  });

  it('has every smaller copy it offers in public/art', () => {
    const publicDir = path.resolve(import.meta.dirname, '../../public');
    for (const src of Object.values(CRYSTAL_ART)) {
      const small = crystalSrcSet(src)?.split(' ')[0] ?? '';
      expect(existsSync(path.join(publicDir, small)), small).toBe(true);
    }
  });
});
