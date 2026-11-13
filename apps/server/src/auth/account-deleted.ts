/**
 * `POST /api/idp/account-deleted` (auth-next ADR 0018): an account was deleted at auth.hoandat.com/account, the only
 * place an account is deleted, so its data here goes too, at once (src/access/account-data.ts, published community
 * texts kept under the nameless tombstone). The IdP calls it server to server with a signed SET as the body
 * (`Content-Type: application/secevent+jwt`), without an Origin, so app.ts mounts it ahead of the same-origin check.
 *
 * Answers 202 once the data is deleted, or when no account here has that `sub` (never signed in, or already deleted:
 * a retried notice is a no-op); 400 when the body is not a SET; 401 when the SET is not a valid one from our IdP for
 * this URL (alg, signature, iss, aud, exp, event); 503 when the IdP's keys cannot be read or the deletion failed, so
 * the IdP retries. Neither the SET nor the `sub` is logged, only the account's internal id and the outcome.
 */
import express, { type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { eq } from 'drizzle-orm';
import { deleteAccountData } from '../access/account-data';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { removeStoredFiles } from '../files/file-store';
import { safeErrorText } from '../log-error';
import type { IndexSync } from '../search/index-sync';
import { deletedSub, isSecurityEventToken } from './account-deleted-token';
import type { IdpMetadata } from './idp-metadata';
import { decodeJws } from './jws-verify';

export const ACCOUNT_DELETED_PATH = '/api/idp/account-deleted';
const SET_MEDIA_TYPE = 'application/secevent+jwt';

export interface AccountDeletedOptions {
  config: ServerConfig;
  db: Db;
  idp: IdpMetadata | null;
  now: () => Date;
  /** Search sync: the deleted documents leave the indexes. */
  sync?: IndexSync | null;
}

export function accountDeletedRoute({ config, db, idp, now, sync = null }: AccountDeletedOptions): Router {
  const router = express.Router();
  // The IdP calls from one address, like the back-channel logout: the same budget.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.backchannelLimitPer15Min,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).end(),
  });

  router.post(ACCOUNT_DELETED_PATH, limiter, express.text({ type: SET_MEDIA_TYPE, limit: '8kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const body: unknown = req.body;
    const jws = typeof body === 'string' ? decodeJws(body.trim()) : null;
    if (!jws || !isSecurityEventToken(jws)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const { auth } = config;
    if (!auth || !idp) {
      // Sign-in is off here: no IdP to check the signature against. The IdP keeps the notice and retries.
      res.status(503).end();
      return;
    }
    if (jws.header.alg !== 'ES256') {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
    let sub: string | null;
    try {
      const payload = await idp.verifiedPayload(body);
      sub = payload ? deletedSub(payload, { issuer: auth.issuer, audience: `${config.publicOrigin}${ACCOUNT_DELETED_PATH}` }, now().getTime()) : null;
    } catch (error) {
      console.warn('account deletion notice: IdP keys unavailable', safeErrorText(error));
      res.status(503).end();
      return;
    }
    if (!sub) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    const [account] = await db.select({ id: users.id }).from(users).where(eq(users.sub, sub));
    if (!account) {
      console.info('account deletion notice: no account here');
      res.status(202).end();
      return;
    }
    let result: Awaited<ReturnType<typeof deleteAccountData>>;
    try {
      result = await deleteAccountData(db, account.id, now());
    } catch (error) {
      console.error('account deletion notice: deletion failed', account.id, safeErrorText(error));
      res.status(503).end();
      return;
    }
    if (result.kind === 'deleted') {
      // The data is gone: its files leave the disk and its documents the search indexes; failing here never undoes it.
      await removeStoredFiles(config.filesDir, result.storageKeys).catch((error: unknown) => console.error('deleted account files not removed', safeErrorText(error)));
      if (result.documentIds.length > 0) sync?.enqueue(result.documentIds);
    }
    console.info('account deletion notice: account deleted', account.id, result.kind === 'deleted' ? result.documentIds.length : 'already');
    res.status(202).end();
  });

  return router;
}
