/**
 * GET /sitemap.xml: what a search engine may crawl. Reading needs no account (owner's decision, 07/11/2026), so the map
 * lists the landing page, the Universe, every public Space and every text a guest can read (approved, not hidden, not
 * in the trash; journeys open in their own signed-in player and are left out). Built on each call: a few thousand rows
 * at most, and crawlers come rarely.
 */
import express, { type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { listPublicTexts, listSpaces } from '../access/content';
import { GUEST } from '../access/viewer';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';

/** The protocol's limit for one file (sitemaps.org). */
const MAX_URLS = 50_000;

export interface SitemapEntry {
  path: string;
  lastmod?: Date;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function sitemapXml(origin: string, entries: readonly SitemapEntry[]): string {
  const urls = entries.slice(0, MAX_URLS).map(({ path, lastmod }) => {
    const mod = lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : '';
    return `  <url><loc>${escapeXml(`${origin}${path}`)}</loc>${mod}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function sitemapRoutes({ config, db }: { config: ServerConfig; db: Db }): Router {
  const router = express.Router();
  router.get(
    '/sitemap.xml',
    rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: 'Too many requests' }),
    async (_req, res) => {
      const spaces = await listSpaces(db, GUEST);
      const texts = await listPublicTexts(db, MAX_URLS);
      const entries: SitemapEntry[] = [
        { path: '/' },
        { path: '/u' },
        ...spaces.map((space) => ({ path: `/s/${encodeURIComponent(space.slug)}` })),
        ...texts.map((text) => ({ path: `/d/${text.id}`, lastmod: text.updatedAt })),
        { path: '/privacy' },
        { path: '/terms' },
      ];
      res.set('Cache-Control', 'public, max-age=3600').type('application/xml').send(sitemapXml(config.publicOrigin, entries));
    },
  );
  return router;
}
