/**
 * The signed-in account: GET /api/me (profile, settings, role, onboarding), PATCH /api/me (language, theme, reduced
 * motion: H03), POST /api/me/onboarding (S03: reading language and the Spaces picked as interests; marks onboarding
 * done) and POST /api/me/delete-data (H03 "Xoá dữ liệu của tôi", src/access/account-data.ts):
 * `{confirm: 'XOÁ' | 'DELETE' (as typed), removePublished}` → `{deletedDocuments, keptPublished}`; the session ends with it (the cookie
 * is cleared). Every route needs a session (401 `sign-in-required`).
 */
import express, { type Request, type Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { deleteAccountData } from '../access/account-data';
import { listSpaces } from '../access/content';
import { type WorkspaceRole, effectiveRole, isBootstrapAdmin } from '../access/roles';
import { viewerFor } from '../access/viewer';
import { requireUserId } from '../auth/require-user';
import { clearSessionCookie } from '../auth/session-cookie';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { uiLang, uiTheme, users } from '../db/schema';
import { removeStoredFiles } from '../files/file-store';
import { HttpError } from '../http-error';
import { safeErrorText } from '../log-error';
import type { IndexSync } from '../search/index-sync';
import { perAccountLimit, signedIn as signedInHandler, userIdOf } from './account-limit';
import { parseBody } from './validate';

export interface MeResponse {
  name: string | null;
  email: string | null;
  picture: string | null;
  lang: 'vi' | 'en';
  theme: 'dark' | 'light' | 'system';
  /** App-level reduced motion (H03), on top of the system's setting. */
  reducedMotion: boolean;
  /** The reader's body text size in px (READER_TEXT_SIZES). */
  readerTextSize: ReaderTextSize;
  /** The workspace role it acts with (src/access/roles.ts). */
  role: WorkspaceRole;
  isAdmin: boolean;
  /** A bootstrap admin (ADMIN_SUBS): its role is not changed from the app. */
  roleLocked: boolean;
  /** ISO time the account finished or skipped onboarding (S03); null: show it. */
  onboardedAt: string | null;
  /** Slugs of the Spaces picked during onboarding. */
  interests: string[];
}

const MAX_INTERESTS = 20;
const SpaceSlug = z.string().min(1).max(120);

/** The reader's text sizes (A−/A+ in the reader, H03), in px; 17 by default. */
export const READER_TEXT_SIZES = [16, 17, 18, 20] as const;
export type ReaderTextSize = (typeof READER_TEXT_SIZES)[number];
export const DEFAULT_READER_TEXT_SIZE: ReaderTextSize = 17;

/** A stored size as one of the sizes (a row from before a size was dropped reads as the default). */
export function readerTextSizeOf(value: number): ReaderTextSize {
  return READER_TEXT_SIZES.find((size) => size === value) ?? DEFAULT_READER_TEXT_SIZE;
}

const SettingsBody = z
  .strictObject({
    lang: z.enum(uiLang.enumValues).optional(),
    theme: z.enum(uiTheme.enumValues).optional(),
    reducedMotion: z.boolean().optional(),
    readerTextSize: z.literal([...READER_TEXT_SIZES]).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined));

/**
 * The word the person typed to confirm (H03): `XOÁ` in Vietnamese, `DELETE` in English, any case. The server checks it
 * too, so a request without it deletes nothing.
 */
export const DELETE_CONFIRMATIONS = ['XOÁ', 'DELETE'] as const;
const DeleteDataBody = z.strictObject({
  confirm: z
    .string()
    .max(20)
    .transform((typed) => typed.normalize('NFC').trim().toLocaleUpperCase('vi'))
    .pipe(z.enum(DELETE_CONFIRMATIONS)),
  removePublished: z.boolean(),
});

const OnboardingBody = z.strictObject({
  lang: z.enum(uiLang.enumValues),
  interests: z.array(SpaceSlug).max(MAX_INTERESTS),
});

export interface MeRoutesOptions {
  config: ServerConfig;
  db: Db;
  now: () => Date;
  /** Search sync: the deleted documents leave the indexes. */
  sync?: IndexSync | null;
}

export function meRoutes({ config, db, now, sync = null }: MeRoutesOptions): Router {
  const router = express.Router();
  const signedIn = (req: Request): Promise<string> => requireUserId(req, config, db, now());
  const signedInOnly = signedInHandler(config, db, now);

  async function me(userId: string): Promise<MeResponse> {
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    // The session's account is gone (deleted between two queries): the session no longer means anything.
    if (!row || row.removedAt !== null || row.deletedAt !== null) throw new HttpError(401, 'sign-in-required');
    const role = effectiveRole(config.adminSubs, row);
    return {
      name: row.name,
      email: row.email,
      picture: row.picture,
      lang: row.lang,
      theme: row.theme,
      reducedMotion: row.reducedMotion,
      readerTextSize: readerTextSizeOf(row.readerTextSize),
      role,
      isAdmin: role === 'admin',
      roleLocked: isBootstrapAdmin(config.adminSubs, row.sub),
      onboardedAt: row.onboardedAt?.toISOString() ?? null,
      interests: row.interests,
    };
  }

  router.get('/api/me', async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await me(await signedIn(req)));
  });

  router.patch('/api/me', async (req, res) => {
    const userId = await signedIn(req);
    const body = parseBody(SettingsBody, req.body);
    await db.update(users).set(body).where(eq(users.id, userId));
    res.set('Cache-Control', 'no-store').json(await me(userId));
  });

  router.post('/api/me/onboarding', async (req, res) => {
    const userId = await signedIn(req);
    const body = parseBody(OnboardingBody, req.body);
    // Only Spaces this account can see on its Universe can be picked.
    const visible = new Set((await listSpaces(db, await viewerFor(db, config.adminSubs, userId))).map((space) => space.slug));
    const interests = [...new Set(body.interests)];
    if (!interests.every((slug) => visible.has(slug))) throw new HttpError(400, 'unknown-space');
    const [current] = await db.select({ onboardedAt: users.onboardedAt }).from(users).where(eq(users.id, userId));
    // Onboarding again keeps the first completion time.
    await db
      .update(users)
      .set({ lang: body.lang, interests, onboardedAt: current?.onboardedAt ?? now() })
      .where(eq(users.id, userId));
    res.set('Cache-Control', 'no-store').json(await me(userId));
  });

  // Deleting is rare and heavy (many tables in one transaction): a few tries per account per minute.
  router.post('/api/me/delete-data', signedInOnly, perAccountLimit(5), async (req, res) => {
    const userId = userIdOf(res);
    const body = parseBody(DeleteDataBody, req.body);
    const result = await deleteAccountData(db, userId, { removePublished: body.removePublished }, now());
    if (result.kind === 'not-found') {
      clearSessionCookie(res, config);
      throw new HttpError(401, 'sign-in-required');
    }
    // The data is gone: its files leave the disk and its documents the search indexes; failing here never undoes it.
    await removeStoredFiles(config.filesDir, result.storageKeys).catch((error: unknown) => console.error('deleted account files not removed', safeErrorText(error)));
    if (result.documentIds.length > 0) sync?.enqueue(result.documentIds);
    clearSessionCookie(res, config);
    res.set('Cache-Control', 'no-store').json({ deletedDocuments: result.documentIds.length, keptPublished: result.keptPublished });
  });

  return router;
}
