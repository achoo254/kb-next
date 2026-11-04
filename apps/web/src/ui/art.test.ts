import { describe, expect, it } from 'vitest';
import { stateArtSrc } from './art';

describe('stateArtSrc', () => {
  it('maps illustrations and Space crystals to their files in public/art', () => {
    expect(stateArtSrc('vault-lock')).toBe('/art/ill-vault-lock.webp');
    expect(stateArtSrc('crystal-docker')).toBe('/art/crystal-docker.webp');
  });
});
