import { readFileSync } from 'node:fs';
import { iconSourceHashes } from '@achoo254/brand/build';
import { describe, expect, it } from 'vitest';
import { BRAND_GENERATED_DIR, BRAND_ROOT, loadKbBrand } from '../apps/web/vite-brand';

describe('generated brand files', () => {
  it('were drawn from the current brand icons (run pnpm brand:gen after changing them)', () => {
    const recorded: unknown = JSON.parse(readFileSync(new URL('icons/icons-source.json', BRAND_GENERATED_DIR), 'utf8'));
    expect(recorded).toEqual(iconSourceHashes(loadKbBrand(), BRAND_ROOT));
  });

  it('are vector icons of the mock mark with their ownership line', () => {
    for (const file of ['brand/app-icon.svg', 'brand/app-icon-maskable.svg']) {
      const svg = readFileSync(new URL(file, BRAND_ROOT), 'utf8');
      expect(svg).toContain('owned by hoandat, all rights reserved');
      expect(svg).toContain('M3 21L12 5l8 13 8-13 9 16');
    }
  });
});
