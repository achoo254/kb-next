// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The page has no inline script, so the CSP of the nginx site can allow scripts from the site only, with no hash to
 * keep in step. The theme is picked from the stylesheet (prefers-color-scheme) before the first paint.
 */
const file = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url).href);

describe('index.html', () => {
  it('has no inline script, only the module entry', () => {
    const html = readFileSync(file('./index.html'), 'utf8');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it('sends no Referer (share links carry their token in the address)', () => {
    expect(readFileSync(file('./index.html'), 'utf8')).toContain('<meta name="referrer" content="no-referrer" />');
  });
});
