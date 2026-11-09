import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadKbBrand, renderIndexHtml } from '../../../web/vite-brand';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { seedDatabase, seedId } from '../db/seed-database';
import { PAGE_CSP, PAGE_PERMISSIONS, escapeHtml, renderSharePage } from './og-page';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const DHCP = seedId('document:dhcp');
/** A title that would break out of an attribute or open a tag if it were not escaped. */
const TRICKY_TITLE = `DHCP "DORA" <script>alert('x')</script> & co`;

/** The real page head: apps/web/index.html with the brand tags of the build. */
const TEMPLATE = renderIndexHtml(readFileSync(new URL('../../../web/index.html', import.meta.url), 'utf8'), loadKbBrand());

const metaContent = (html: string, attr: 'property' | 'name', key: string): string[] =>
  [...html.matchAll(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`, 'g'))].map((m) => m[1] ?? '');

let idp: FakeIdp;
let server: TestServer;
let admin = '';
let owner = '';
let templateFails = false;

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub' });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub' }, { shareOpenLimitPerMinute: 30 }, () => new Date(), null, () => ({
    loadTemplate: async () => {
      if (templateFails) throw new Error('ENOENT: no index.html');
      return TEMPLATE;
    },
  }));
  await seedDatabase(server.database.db, 'owner-sub');
  owner = await signIn(server);
  idp.setSub('admin-sub');
  admin = await signIn(server);
});
afterAll(async () => {
  await server?.close();
  await idp?.close();
});

async function json<T>(res: Response): Promise<T> {
  expect(res.ok).toBe(true);
  return (await res.json()) as T;
}

/** An admin's link to a published text (renamed first when `title` is given). */
async function shared(title?: string): Promise<string> {
  if (title) await json(await api(server, `/api/moderation/documents/${DHCP}`, { method: 'PATCH', cookie: admin, body: JSON.stringify({ title }) }));
  const made = await json<{ token: string }>(await api(server, `/api/documents/${DHCP}/share`, { method: 'POST', cookie: admin, body: JSON.stringify({ expiry: 'none', access: 'view' }) }));
  return made.token;
}

const page = async (token: string, query = ''): Promise<{ status: number; html: string; res: Response }> => {
  const res = await fetch(`${server.origin}/l/${token}${query}`);
  return { status: res.status, html: await res.text(), res };
};

describe('the share link page', () => {
  it("puts the text's title in the preview tags, escaped, with ill-doc-planet as the picture", async () => {
    const token = await shared(TRICKY_TITLE);
    const { status, html, res } = await page(token);
    expect(status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    const title = `${escapeHtml(TRICKY_TITLE)} · Knowledge Base`;
    const url = `${server.origin}/l/${token}`;
    expect(metaContent(html, 'property', 'og:title')).toEqual([title]);
    expect(metaContent(html, 'property', 'og:url')).toEqual([url]);
    expect(metaContent(html, 'property', 'og:image')).toEqual([`${server.origin}/og-share.png`]);
    expect(metaContent(html, 'name', 'twitter:image')).toEqual([`${server.origin}/og-share.png`]);
    expect(metaContent(html, 'name', 'twitter:card')).toEqual(['summary_large_image']);
    expect(metaContent(html, 'name', 'robots')).toEqual(['noindex']);
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${url}" />`);
    expect(html).not.toContain('<script>alert');
    expect(html.split(token).length - 1).toBe(2);
    expect(html).toContain('<div id="root"></div>');
    // English on ?lang=en.
    expect(metaContent((await page(token, '?lang=en')).html, 'property', 'og:description')[0]).toMatch(/^A text shared on the bilingual English – Vietnamese Knowledge Base/);
  });

  it('is no opening: fetching the preview logs nothing', async () => {
    const token = await shared();
    await page(token);
    const view = await json<{ openings7d: number }>(await api(server, `/api/documents/${DHCP}/share`, { cookie: admin }));
    expect(view.openings7d).toBe(0);
  });

  it('answers a wrong, malformed, revoked or hidden link with the same generic page, never the title', async () => {
    const revoked = await shared('Giao thức DHCP bí mật');
    await shared();
    const hiddenToken = await shared();
    await json(await api(server, `/api/moderation/documents/${DHCP}`, { method: 'PATCH', cookie: admin, body: JSON.stringify({ hidden: true }) }));
    try {
      const generic = renderSharePage(TEMPLATE, null);
      for (const token of [revoked, hiddenToken, 'A'.repeat(32), 'short', '%3Cscript%3E']) {
        const { status, html, res } = await page(token);
        expect(status).toBe(200);
        expect(res.headers.getSetCookie()).toEqual([]);
        expect(html).toBe(generic);
        expect(html).not.toContain('bí mật');
      }
      // The author's own session changes nothing: the preview is what anyone with the link sees.
      const res = await fetch(`${server.origin}/l/${hiddenToken}`, { headers: { cookie: owner } });
      expect(await res.text()).toBe(generic);
      expect(metaContent(generic, 'property', 'og:title')).toEqual(['Knowledge Base · song ngữ Anh – Việt']);
    } finally {
      await json(await api(server, `/api/moderation/documents/${DHCP}`, { method: 'PATCH', cookie: admin, body: JSON.stringify({ hidden: false }) }));
    }
  });

  it('is never cached or indexed, and sends the site CSP in production only', async () => {
    const res = (await page(await shared())).res;
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('permissions-policy')).toBe(PAGE_PERMISSIONS);
    expect(res.headers.get('content-security-policy')).toBeNull();
    const nginx = readFileSync(new URL('../../../../infra/nginx/kb.hoandat.com.conf', import.meta.url), 'utf8');
    expect(nginx).toContain(`add_header Content-Security-Policy "${PAGE_CSP}" always;`);
    expect(nginx).toContain(`add_header Permissions-Policy "${PAGE_PERMISSIONS}" always;`);
  });

  it('says so when the page template cannot be read', async () => {
    templateFails = true;
    try {
      const res = await fetch(`${server.origin}/l/${'B'.repeat(32)}`);
      expect(res.status).toBe(503);
      expect(res.headers.get('cache-control')).toBe('no-store');
    } finally {
      templateFails = false;
    }
  });
});

describe('other paths under /l/', () => {
  it('answer the app’s page (its not-found screen) with 404, not the server’s raw error', async () => {
    for (const path of ['/l/', `/l/${'C'.repeat(32)}/more`, '/l/a/b/c']) {
      const res = await fetch(`${server.origin}${path}`);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/^text\/html/);
      const html = await res.text();
      expect(html).toBe(renderSharePage(TEMPLATE, null));
      expect(html).not.toContain('Cannot GET');
    }
  });

  it('are limited per address (twice the share API’s limit a minute)', async () => {
    let limited = false;
    for (let i = 0; i < 61 && !limited; i += 1) limited = (await fetch(`${server.origin}/l/x/y`)).status === 429;
    expect(limited).toBe(true);
  });
});

describe('renderSharePage', () => {
  it('replaces each tag once and adds the missing ones before </head>', () => {
    const html = renderSharePage('<html><head><title>x</title></head><body></body></html>', { title: 'A & B', description: 'd', url: 'https://x/l/t', image: 'https://x/og-share.png' });
    expect(metaContent(html, 'property', 'og:title')).toEqual(['A &amp; B']);
    expect(metaContent(html, 'name', 'twitter:card')).toEqual(['summary_large_image']);
    expect(html.indexOf('og:url')).toBeLessThan(html.indexOf('</head>'));
    expect(html).toContain('<title>A &amp; B</title>');
  });
});
