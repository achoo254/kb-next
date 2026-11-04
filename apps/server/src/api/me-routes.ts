/**
 * The signed-in account: GET /api/me (profile, settings, role, onboarding), PATCH /api/me (language, theme) and
 * POST /api/me/onboarding (S03: reading language and the Spaces picked as interests; marks onboarding done).
 * Every route needs a session (401 `sign-in-required`).
 */
import express, { type Request, type Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { listSpaces } from '../access/content';
import { viewerFor } from '../access/viewer';
import { requireUserId } from '../auth/require-user';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { uiLang, uiTheme, users } from '../db/schema';
import { HttpError } from '../http-error';
import { parseBody } from './validate';

export interface MeResponse {
  name: string | null;
  email: string | null;
  picture: string | null;
  lang: 'vi' | 'en';
  theme: 'dark' | 'light' | 'system';
  role: 'member' | 'reviewer';
  isAdmin: boolean;
  /** ISO time the account finished or skipped onboarding (S03); null: show it. */
  onboardedAt: string | null;
  /** Slugs of the Spaces picked during onboarding. */
  interests: string[];
}

const MAX_INTERESTS = 20;
const SpaceSlug = z.string().min(1).max(120);

const SettingsBody = z
  .strictObject({ lang: z.enum(uiLang.enumValues).optional(), theme: z.enum(uiTheme.enumValues).optional() })
  .refine((body) => body.lang !== undefined || body.theme !== undefined);

const OnboardingBody = z.strictObject({
  lang: z.enum(uiLang.enumValues),
  interests: z.array(SpaceSlug).max(MAX_INTERESTS),
});

export interface MeRoutesOptions {
  config: ServerConfig;
  db: Db;
  now: () => Date;
}

export function meRoutes({ config, db, now }: MeRoutesOptions): Router {
  const router = express.Router();
  const signedIn = (req: Request): Promise<string> => requireUserId(req, config, db, now());

  async function me(userId: string): Promise<MeResponse> {
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    // The session's account is gone (deleted between two queries): the session no longer means anything.
    if (!row) throw new HttpError(401, 'sign-in-required');
    return {
      name: row.name,
      email: row.email,
      picture: row.picture,
      lang: row.lang,
      theme: row.theme,
      role: row.role,
      isAdmin: config.adminSubs.has(row.sub),
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

  return router;
}
