/** Who reads, in which language, and the document a request names: shared by the reading routes. */
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DocumentRow } from '../access/content';
import { isUuid } from '../access/ids';
import { documentAccess } from '../access/reading';
import { type Viewer, viewerFor } from '../access/viewer';
import { findUserId } from '../auth/require-user';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { uiLang, users } from '../db/schema';
import { HttpError } from '../http-error';
import type { Lang } from './content-views';
import { parseQuery } from './validate';

const LangQuery = z.object({ lang: z.enum(uiLang.enumValues).optional() });

export interface RequestContextDeps {
  config: ServerConfig;
  db: Db;
  now: () => Date;
}

/** The viewer of the session (a guest without one) and the language to read in: `?lang=`, the account's, else vi. */
export async function readerOf(req: Request, { config, db, now }: RequestContextDeps): Promise<{ viewer: Viewer; lang: Lang }> {
  const viewer = await viewerFor(db, config.adminSubs, await findUserId(req, config, db, now()));
  const { lang } = parseQuery(LangQuery, req.query);
  if (lang) return { viewer, lang };
  if (viewer.kind === 'guest') return { viewer, lang: 'vi' };
  const [row] = await db.select({ lang: users.lang }).from(users).where(eq(users.id, viewer.userId));
  return { viewer, lang: row?.lang ?? 'vi' };
}

/** The document of `:id` when the viewer may read it; else 404 `not-found`, 403 `hidden` or 403 `no-access`. */
export async function openDocument(db: Db, viewer: Viewer, id: unknown): Promise<DocumentRow> {
  if (typeof id !== 'string' || !isUuid(id)) throw new HttpError(404, 'not-found');
  const access = await documentAccess(db, viewer, id);
  if (access.kind === 'not-found') throw new HttpError(404, 'not-found');
  if (access.kind === 'hidden') throw new HttpError(403, 'hidden');
  if (access.kind === 'no-access') throw new HttpError(403, 'no-access');
  return access.doc;
}
