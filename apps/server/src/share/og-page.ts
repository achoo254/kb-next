/**
 * GET /l/<token>: the web app's index.html with the link preview of the shared text (og:title, og:description,
 * og:url, og:image `ill-doc-planet`, twitter:card), so a link pasted into Zalo or Messenger shows its title. The web
 * app then opens the link through /api/l/<token> as usual (H02).
 *
 * Only a text anyone may read (approved, not hidden) puts its title in the tags, and fetching the page is not an
 * opening (a chat app's crawler fetches every link pasted): nothing is logged. A wrong, revoked or expired link, or
 * one whose text was hidden or sent back since, gets the same page with the app's own tags and the same status, so
 * the page tells nothing about which links exist or what they named. og:url and the canonical link repeat the link
 * that was opened; nothing else carries the token.
 */
import { readFile } from 'node:fs/promises';
import express, { type Request, type Response, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import brandConfig from '../../../../brand.config.json';
import { resolveShareToken } from '../access/share-links';
import { GUEST } from '../access/viewer';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { safeErrorText } from '../log-error';

/** The built web page (apps/web/dist/index.html); two levels below apps/server from src/share and from the bundle. */
export const BUILT_INDEX_HTML = new URL('../../../web/dist/index.html', import.meta.url);

/** The share card's picture (apps/web/public/og-share.png): the `ill-doc-planet` illustration over the Universe. */
export const SHARE_IMAGE = { path: 'og-share.png', width: 1200, height: 630 };

/**
 * The CSP of the pages nginx serves (infra/nginx/kb.hoandat.com.conf, `location /`), sent here too because the
 * share page comes from this server. og-page.test.ts keeps the two identical.
 */
export const PAGE_CSP =
  "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'; frame-src https://kb-office.hoandat.com; frame-ancestors 'none'";

/** The Permissions-Policy of `location /` in the same nginx file, sent here too (og-page.test.ts keeps them equal). */
export const PAGE_PERMISSIONS = 'camera=(), microphone=(), geolocation=()';

type PreviewLocale = 'vi' | 'en';

const PREVIEW_TEXT: Record<PreviewLocale, { title: (doc: string) => string; description: string }> = {
  vi: { title: (doc) => `${doc} · ${brandConfig.appName}`, description: `Một bài được chia sẻ trên ${brandConfig.appName} song ngữ Anh – Việt` },
  en: { title: (doc) => `${doc} · ${brandConfig.appName}`, description: `A text shared on the bilingual English – Vietnamese ${brandConfig.appName}` },
};

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export interface SharePreview {
  title: string;
  description: string;
  /** The link that was opened. */
  url: string;
  /** Absolute URL of the card's picture. */
  image: string;
}

/** `<meta {attr}="{key}" content="…">` replaced in place, or added before </head>. Values are escaped here. */
function setMeta(html: string, attr: 'property' | 'name', key: string, content: string): string {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  const existing = new RegExp(`<meta\\s+${attr}="${key.replace(/[.:]/g, '\\$&')}"\\s+content="[^"]*"\\s*/?>`);
  return existing.test(html) ? html.replace(existing, () => tag) : html.replace('</head>', () => `  ${tag}\n  </head>`);
}

function setCanonical(html: string, url: string): string {
  const tag = `<link rel="canonical" href="${escapeHtml(url)}" />`;
  const existing = /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/;
  return existing.test(html) ? html.replace(existing, () => tag) : html.replace('</head>', () => `  ${tag}\n  </head>`);
}

/** The page with the shared text's preview tags (null: the page's own tags, for a link that opens nothing). */
export function renderSharePage(template: string, preview: SharePreview | null): string {
  let html = setMeta(template, 'name', 'robots', 'noindex');
  if (preview === null) return html;
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(preview.title)}</title>`);
  html = setMeta(html, 'name', 'description', preview.description);
  html = setMeta(html, 'property', 'og:type', 'article');
  html = setMeta(html, 'property', 'og:title', preview.title);
  html = setMeta(html, 'property', 'og:description', preview.description);
  html = setMeta(html, 'property', 'og:url', preview.url);
  html = setMeta(html, 'property', 'og:image', preview.image);
  html = setMeta(html, 'property', 'og:image:width', String(SHARE_IMAGE.width));
  html = setMeta(html, 'property', 'og:image:height', String(SHARE_IMAGE.height));
  html = setMeta(html, 'name', 'twitter:card', 'summary_large_image');
  html = setMeta(html, 'name', 'twitter:title', preview.title);
  html = setMeta(html, 'name', 'twitter:description', preview.description);
  html = setMeta(html, 'name', 'twitter:image', preview.image);
  return setCanonical(html, preview.url);
}

/** Where the page template comes from. */
export type TemplateLoader = () => Promise<string>;

/**
 * Production: the built index.html, read once (a release restarts the server). Elsewhere: the web dev server at
 * PUBLIC_URL (Vite's page with its dev scripts), falling back to a local build.
 */
export function defaultTemplateLoader(config: ServerConfig): TemplateLoader {
  let built: string | null = null;
  const readBuilt = async (): Promise<string> => {
    built ??= await readFile(BUILT_INDEX_HTML, 'utf8');
    return built;
  };
  if (config.nodeEnv === 'production') return readBuilt;
  return async () => {
    try {
      const res = await fetch(`${config.publicOrigin}/`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(5_000) });
      if (res.ok) return await res.text();
    } catch {
      // No web dev server running: try a local build.
    }
    return readBuilt();
  };
}

function previewLocale(req: Request): PreviewLocale {
  return req.query.lang === 'en' ? 'en' : 'vi';
}

export interface OgPageOptions {
  config: ServerConfig;
  db: Db;
  now: () => Date;
  loadTemplate: TemplateLoader;
}

export function ogPageRoutes({ config, db, now, loadTemplate }: OgPageOptions): Router {
  const router = express.Router();
  // Share pages a minute from one address: twice the API's (a chat app's crawler fetches a pasted link a few times).
  router.use(
    '/l',
    rateLimit({ windowMs: 60 * 1000, limit: 2 * config.shareOpenLimitPerMinute, standardHeaders: 'draft-8', legacyHeaders: false, message: 'Too many requests' }),
  );

  /** The page with `preview` (null: the app's own tags); the web app then shows the link or its not-found page. */
  const send = async (res: Response, status: number, preview: (() => Promise<SharePreview | null>) | null): Promise<void> => {
    let template: string;
    try {
      template = await loadTemplate();
    } catch (error) {
      console.error('share page template unavailable', safeErrorText(error));
      res.status(503).set('Cache-Control', 'no-store').type('text/plain').send('Temporarily unavailable');
      return;
    }
    const tags = preview ? await preview() : null;
    // Production gets the site's CSP; the dev page (Vite) runs inline scripts, so it gets none.
    if (config.nodeEnv === 'production') res.set('Content-Security-Policy', PAGE_CSP);
    else res.removeHeader('Content-Security-Policy');
    res
      .status(status)
      .set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': PAGE_PERMISSIONS })
      .type('html')
      .send(renderSharePage(template, tags));
  };

  router.get('/l/:token', async (req, res) => {
    const token = req.params.token;
    const text = PREVIEW_TEXT[previewLocale(req)];
    await send(res, 200, async () => {
      // As a guest: the preview is what anyone with the link may see, whoever's browser fetched it.
      const opened = await resolveShareToken(db, GUEST, token, now());
      return opened.kind === 'ok'
        ? { title: text.title(opened.doc.title), description: text.description, url: `${config.publicOrigin}/l/${token}`, image: `${config.publicOrigin}/${SHARE_IMAGE.path}` }
        : null;
    });
  });

  // Anything else under /l/ (nginx sends all of it here): the app's page, which shows its not-found screen.
  router.get(/^\/l(?:\/.*)?$/, async (_req, res) => {
    await send(res, 404, null);
  });
  return router;
}
