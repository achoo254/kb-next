/**
 * Share links (src/access/share-links.ts) on the web session, and what opening one shows.
 *
 * The author or an admin (C18; 401 `sign-in-required`, 404 `not-found` / 403 `no-access` like the reader):
 * - GET /api/documents/:id/share → ShareView: the text, whether it may be shared, its link (never the token: its
 *   last four characters), openings in the last 7 days, the access history, who has access, and an unread
 *   "permission changed" notice of it (the banner).
 * - POST /api/documents/:id/share `{expiry, access}` → 201 `{token, path, link}`: a new link, the others revoked. The
 *   token is in this answer only. 409 `not-shareable` unless the text is approved and shown.
 * - PATCH /api/documents/:id/share `{expiry?, access?}` → `{link}`; 404 `no-link` without a live link, 409
 *   `link-expired` for an expired one (it stays off: make a new link).
 * - DELETE /api/documents/:id/share → `{link}` (revoked); 404 `no-link`.
 *
 * Anyone with the link (H02; at most `shareOpenLimitPerMinute`, 60, a minute from one address, 429 `rate-limited`):
 * - GET /api/l/:token → SharedPreview, logged as an opening (the account, or a guest). 404 `not-found` (no such
 *   link), 410 `link-expired` / `link-revoked`, 404 `private` (the text is no longer published and the viewer may not
 *   read it: nothing about it is told).
 * - POST /api/l/:token/remix (signed in, at most 10 a minute per account) → 201 `{id}`: a draft copy in the account's
 *   own Space, crediting the original. 403 `remix-off` (the link only lets read), 409 `not-remixable` (a stored file).
 */
import express, { type Request, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createDocument } from '../access/authoring';
import { type DocumentRow, findLatestVersion, listChunks } from '../access/content';
import { findApproval, listCollectionsOf, spacesById, userNames } from '../access/reading';
import {
  type HistoryLine,
  type ShareLinkRow,
  changeShareLink,
  createShareLink,
  latestLink,
  openShareLink,
  openingsSince,
  resolveShareToken,
  revokeShareLink,
  shareHistory,
  shareManageAccess,
} from '../access/share-links';
import { ensurePersonalSpace } from '../access/spaces-write';
import type { Viewer } from '../access/viewer';
import { isPublic } from '../access/visibility';
import { bodyOf } from '../authoring/markdown-text';
import { SHARE_LINK_ACCESS, shareLinkExpiry } from '../db/schema';
import { HttpError } from '../http-error';
import { unreadPermissionNotice } from '../notifications/notification-store';
import type { Db } from '../db/client';
import type { IndexSync } from '../search/index-sync';
import { perAccountLimit, signedIn } from './account-limit';
import { type CollectionBrief, type SpaceBrief, collectionBrief, readingMinutes, spaceBrief } from './content-views';
import { type RequestContextDeps, readerOf } from './request-context';
import { parseBody } from './validate';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Section names the preview lists (H02's chips). */
const PREVIEW_SECTIONS = 8;
/** Characters of the first section a guest may peek at (H02 "Xem trước 1 bước"). */
const PEEK_CHARS = 280;

const Expiry = z.enum(shareLinkExpiry.enumValues);
const Access = z.enum(SHARE_LINK_ACCESS);
const CreateBody = z.strictObject({ expiry: Expiry, access: Access });
const ChangeBody = z.strictObject({ expiry: Expiry.optional(), access: Access.optional() }).refine((b) => b.expiry !== undefined || b.access !== undefined);

export interface ShareLinkView {
  id: string;
  /** The only part of the token ever shown again. */
  last4: string;
  access: ShareLinkRow['access'];
  expiry: ShareLinkRow['expiry'];
  expiresAt: string | null;
  expired: boolean;
  revokedAt: string | null;
  createdAt: string;
}

export interface ShareHistoryView {
  kind: HistoryLine['kind'];
  at: string;
  by: string | null;
  detail: string | null;
}

export interface ShareView {
  document: {
    id: string;
    title: string;
    origin: 'official' | 'community' | 'own';
    status: string;
    hidden: boolean;
    lang: 'vi' | 'en';
    type: string;
    space: SpaceBrief & { art: string };
    collection: CollectionBrief | null;
    /** Its `##` sections (the left card's chips). */
    sections: string[];
    authorName: string | null;
  };
  /** Approved and shown: a link may be made. */
  shareable: boolean;
  link: ShareLinkView | null;
  openings7d: number;
  history: ShareHistoryView[];
  approverName: string | null;
  /** An admin just hid or showed it (the account's unread notice). */
  permission: { id: string; hidden: boolean; by: string | null; at: string } | null;
}

export interface SharedPreview {
  access: ShareLinkRow['access'];
  signedIn: boolean;
  /** A signed-in account may copy it into their own drafts (the link allows it, and it is not a stored file). */
  canRemix: boolean;
  document: {
    id: string;
    title: string;
    lang: 'vi' | 'en';
    type: string;
    authorName: string | null;
    readingMinutes: number;
    sections: string[];
    /** The start of its first section, for a guest's peek. */
    peek: { heading: string | null; text: string } | null;
    space: SpaceBrief;
  };
}

export function linkView(link: ShareLinkRow, now: Date): ShareLinkView {
  return {
    id: link.id,
    last4: link.last4,
    access: link.access,
    expiry: link.expiry,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    expired: link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime(),
    revokedAt: link.revokedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  };
}

/** The public path of a share link. */
export function sharePath(token: string): string {
  return `/l/${token}`;
}

function tokenParam(req: Request): string {
  const token = req.params.token;
  return typeof token === 'string' ? token : '';
}

function idParam(req: Request): string {
  const id = req.params.id;
  return typeof id === 'string' ? id : '';
}

/** Text set inside Markdown link text: the characters that would end or open link syntax are escaped. */
export function markdownLinkText(text: string): string {
  return text.replace(/[\\[\]()]/g, (c) => `\\${c}`);
}

/** The Markdown a remix copies: the latest version's, when the text is Markdown (null for a stored file). */
async function remixSource(db: Db, viewer: Viewer, doc: DocumentRow): Promise<string | null> {
  if (doc.type === 'office') return null;
  return (await findLatestVersion(db, viewer, doc.id))?.markdown ?? null;
}

/** Plain text of a chunk (the peek): Markdown marks dropped, whitespace folded, cut at PEEK_CHARS. */
function peekText(markdown: string): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/[*_`>|#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > PEEK_CHARS ? `${plain.slice(0, PEEK_CHARS - 1).trimEnd()}…` : plain;
}

export function shareRoutes({ config, db, now, sync }: RequestContextDeps & { sync: IndexSync | null }): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  const manageLimit = perAccountLimit(config.shareManageLimitPerMinute);
  // Each remix writes a document and its version: few per account.
  const remixLimit = perAccountLimit(10);
  // Per address: a guest has no account to count by, and a token is not to be guessed.
  const openLimit = rateLimit({ windowMs: 60 * 1000, limit: config.shareOpenLimitPerMinute, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate-limited' } });

  const viewerOf = async (req: Request): Promise<Viewer> => (await readerOf(req, { config, db, now })).viewer;
  const manage = async (req: Request): Promise<{ viewer: Extract<Viewer, { kind: 'user' }>; doc: DocumentRow }> => {
    const viewer = await viewerOf(req);
    if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
    const access = await shareManageAccess(db, viewer, idParam(req));
    if (access.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (access.kind === 'no-access') throw new HttpError(403, 'no-access');
    return { viewer, doc: access.doc };
  };

  router.get('/api/documents/:id/share', auth, manageLimit, async (req, res) => {
    const { viewer, doc } = await manage(req);
    const at = now();
    const [link, chunks, history, openings, approval, spaceRows, collectionRows, notice] = await Promise.all([
      latestLink(db, doc.id),
      listChunks(db, viewer, doc.id),
      shareHistory(db, viewer, doc),
      openingsSince(db, doc.id, new Date(at.getTime() - 7 * DAY_MS)),
      findApproval(db, viewer, doc.id),
      spacesById(db, [doc.spaceId]),
      listCollectionsOf(db, [doc.spaceId]),
      unreadPermissionNotice(db, viewer.userId, doc.id),
    ]);
    const space = spaceRows[0];
    if (!space) throw new Error('document without its Space');
    const names = await userNames(db, [doc.authorId, ...(approval ? [approval.actorId] : [])]);
    const collection = collectionRows.find((c) => c.id === doc.collectionId);
    const body: ShareView = {
      document: {
        id: doc.id,
        title: doc.title,
        origin: doc.origin,
        status: doc.status,
        hidden: doc.hidden,
        lang: doc.lang,
        type: doc.type,
        space: { ...spaceBrief(space), art: space.art },
        collection: collection ? collectionBrief(collection) : null,
        sections: (chunks ?? []).flatMap((c) => (c.heading ? [c.heading] : [])).slice(0, PREVIEW_SECTIONS),
        authorName: names.get(doc.authorId) ?? null,
      },
      shareable: isPublic(doc),
      link: link ? linkView(link, at) : null,
      openings7d: openings,
      history: history.map((h) => ({ kind: h.kind, at: h.at.toISOString(), by: h.byName, detail: h.detail })),
      approverName: approval ? (names.get(approval.actorId) ?? null) : null,
      permission: notice ? { id: notice.id, hidden: notice.hidden, by: notice.by, at: notice.at.toISOString() } : null,
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/api/documents/:id/share', auth, manageLimit, async (req, res) => {
    const { viewer, doc } = await manage(req);
    const body = parseBody(CreateBody, req.body);
    const at = now();
    const result = await createShareLink(db, viewer.userId, doc, body, at);
    if (result.kind === 'not-shareable') throw new HttpError(409, 'not-shareable');
    res
      .status(201)
      .set('Cache-Control', 'no-store')
      .json({ token: result.token, path: sharePath(result.token), link: linkView(result.link, at) });
  });

  router.patch('/api/documents/:id/share', auth, manageLimit, async (req, res) => {
    const { viewer, doc } = await manage(req);
    const body = parseBody(ChangeBody, req.body);
    const at = now();
    const result = await changeShareLink(db, viewer.userId, doc.id, body, at);
    if (result.kind === 'no-link') throw new HttpError(404, 'no-link');
    if (result.kind === 'expired') throw new HttpError(409, 'link-expired');
    res.json({ link: linkView(result.link, at) });
  });

  router.delete('/api/documents/:id/share', auth, manageLimit, async (req, res) => {
    const { viewer, doc } = await manage(req);
    const at = now();
    const link = await revokeShareLink(db, viewer.userId, doc.id, at);
    if (!link) throw new HttpError(404, 'no-link');
    res.json({ link: linkView(link, at) });
  });

  router.get('/api/l/:token', openLimit, async (req, res) => {
    const viewer = await viewerOf(req);
    const result = await openShareLink(db, viewer, tokenParam(req), now());
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (result.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (result.kind === 'private') throw new HttpError(404, 'private');
    if (result.kind === 'off') throw new HttpError(410, result.reason === 'expired' ? 'link-expired' : 'link-revoked');
    const { doc, link } = result;
    const [chunks, spaceRows, names, source] = await Promise.all([
      listChunks(db, viewer, doc.id),
      spacesById(db, [doc.spaceId]),
      userNames(db, [doc.authorId]),
      viewer.kind === 'user' && link.access === 'remix' ? remixSource(db, viewer, doc) : Promise.resolve(null),
    ]);
    const space = spaceRows[0];
    if (!space) throw new Error('document without its Space');
    const list = chunks ?? [];
    const first = list[0];
    const body: SharedPreview = {
      access: link.access,
      signedIn: viewer.kind === 'user',
      canRemix: source !== null,
      document: {
        id: doc.id,
        title: doc.title,
        lang: doc.lang,
        type: doc.type,
        authorName: names.get(doc.authorId) ?? null,
        readingMinutes: readingMinutes(list.map((c) => c.text)),
        sections: list.flatMap((c) => (c.heading ? [c.heading] : [])).slice(0, PREVIEW_SECTIONS),
        peek: first ? { heading: first.heading, text: peekText(first.text) } : null,
        space: spaceBrief(space),
      },
    };
    res.json(body);
  });

  router.post('/api/l/:token/remix', openLimit, auth, remixLimit, async (req, res) => {
    const viewer = await viewerOf(req);
    if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
    const result = await resolveShareToken(db, viewer, tokenParam(req), now());
    if (result.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (result.kind === 'private') throw new HttpError(404, 'private');
    if (result.kind === 'off') throw new HttpError(410, result.reason === 'expired' ? 'link-expired' : 'link-revoked');
    const { doc, link } = result;
    if (link.access !== 'remix') throw new HttpError(403, 'remix-off');
    const markdown = await remixSource(db, viewer, doc);
    if (markdown === null) throw new HttpError(409, 'not-remixable');
    const author = (await userNames(db, [doc.authorId])).get(doc.authorId) ?? null;
    const credit =
      doc.lang === 'vi'
        ? `Remix từ [${markdownLinkText(doc.title)}](/d/${doc.id})${author ? ` của ${author}` : ''}.`
        : `Remixed from [${markdownLinkText(doc.title)}](/d/${doc.id})${author ? ` by ${author}` : ''}.`;
    const space = (await ensurePersonalSpace(db, viewer)).space;
    const type = doc.type === 'note' || doc.type === 'process' || doc.type === 'lab' ? doc.type : 'note';
    const created = await createDocument(
      db,
      viewer,
      { spaceId: space.id, collectionId: null, title: doc.title, body: `${bodyOf(markdown).trimEnd()}\n\n---\n\n${credit}\n`, type, lang: doc.lang, planet: null },
      now(),
    );
    sync?.enqueue([created.id]);
    res.status(201).json({ id: created.id });
  });

  return router;
}
