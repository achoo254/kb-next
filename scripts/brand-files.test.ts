import { readFileSync } from 'node:fs';
import { iconSourceHashes } from '@achoo254/brand/build';
import { describe, expect, it } from 'vitest';
import { BRAND_GENERATED_DIR, BRAND_ROOT, loadKbBrand } from '../apps/web/vite-brand';

describe('generated brand files', () => {
  it('were drawn from the current brand icons (run pnpm brand:gen after changing them)', () => {
    const recorded: unknown = JSON.parse(readFileSync(new URL('icons/icons-source.json', BRAND_GENERATED_DIR), 'utf8'));
    expect(recorded).toEqual(iconSourceHashes(loadKbBrand(), BRAND_ROOT));
  });

  it('embed the AI-drawn master icon with their ownership line', () => {
    for (const file of ['brand/app-icon.svg', 'brand/app-icon-maskable.svg']) {
      const svg = readFileSync(new URL(file, BRAND_ROOT), 'utf8');
      expect(svg).toContain('owned by hoandat, all rights reserved');
      expect(svg).toContain('AI-generated');
      expect(svg).toContain('href="data:image/webp;base64,');
    }
  });
});
