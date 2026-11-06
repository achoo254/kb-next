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

describe('nginx site', () => {
  const conf = (): string => readFileSync(file('../../infra/nginx/kb.hoandat.com.conf'), 'utf8');

  it('sends one CSP where it serves the page, with scripts from the site and Cloudflare Web Analytics only', () => {
    // The share-link page comes from the server, which sends the same CSP (apps/server/src/share/og-page.test.ts).
    const policies = conf().match(/add_header Content-Security-Policy "[^"]*"/g) ?? [];
    expect(policies.length).toBe(1);
    expect(policies[0]).toContain("script-src 'self' https://static.cloudflareinsights.com;");
  });

  it('keeps share links (the page and the API that opens one) out of the access log and logs no Referer or query string', () => {
    const block = /location ~ \^\/\(api\/\)\?l\/ \{([^}]*)\}/.exec(conf())?.[1] ?? '';
    expect(block).toContain('access_log off;');
    expect(block).toMatch(/error_log \S+ crit;/);
    expect(block).toContain('proxy_pass http://127.0.0.1:5320;');
    // Ahead of the /api/ block, which logs: nginx takes the first regex location that matches.
    expect(conf().indexOf('location ~ ^/(api/)?l/')).toBeLessThan(conf().indexOf('location ~ ^/(api|auth)/'));
    const format = /log_format kb_notoken ([^;]*);/.exec(conf())?.[1] ?? '';
    for (const leak of ['$http_referer', '$request ', '$request_uri', '$args', '$query_string']) expect(format).not.toContain(leak);
    for (const line of conf().match(/access_log [^;]*;/g) ?? []) expect(line).toMatch(/^access_log (off|\S+ kb_notoken);$/);
  });

  it('lets the routes that take long texts through up to the server limit (1 MB)', () => {
    const block = /location ~ \^\/api\/\(documents\|admin\|journeys\|canvases\|write\)\(\/\|\$\) \{([^}]*)\}/.exec(conf())?.[1] ?? '';
    const size = /client_max_body_size (\d+)k;/.exec(block)?.[1];
    expect(Number(size)).toBeGreaterThanOrEqual(1024);
    expect(block).toContain('proxy_pass http://127.0.0.1:5320;');
    expect(conf()).toMatch(/^ {4}client_max_body_size 48k;$/m);
  });

  it('never lets the internal API through (services on the host call the server directly)', () => {
    // ^~ beats every regex location, so no /api/ block can reach it first.
    const block = /location \^~ \/api\/internal\/ \{([^}]*)\}/.exec(conf())?.[1] ?? '';
    expect(block).toContain('return 404;');
    expect(block).not.toContain('proxy_pass');
  });
});
