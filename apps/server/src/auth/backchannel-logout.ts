/**
 * `POST /auth/backchannel-logout` (OpenID Connect Back-Channel Logout 1.0): the IdP says one of its sessions ended
 * (the person signed out at auth.hoandat.com or from another app), so the sessions signed in through it end here too.
 * The IdP calls it server to server without an Origin, so app.ts mounts it ahead of the same-origin check; the signed
 * logout token is the proof. Answers 200 when the token is valid (even if no session matched), 400 when it is not,
 * 503 when the IdP's keys cannot be read, so the IdP retries.
 */
import express, { type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { safeErrorText } from '../log-error';
import type { IdpMetadata } from './idp-metadata';
import { type LogoutClaims, logoutClaims } from './logout-token';
import { deleteSessionsByIdpSid, deleteSessionsOfSub } from './session-store';

export const BACKCHANNEL_LOGOUT_PATH = '/auth/backchannel-logout';

export interface BackchannelOptions {
  config: ServerConfig;
  db: Db;
  idp: IdpMetadata | null;
  now: () => Date;
}

export function backchannelLogoutRoute({ config, db, idp, now }: BackchannelOptions): Router {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.backchannelLimitPer15Min,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).end(),
  });

  router.post(BACKCHANNEL_LOGOUT_PATH, limiter, express.urlencoded({ extended: false, limit: '8kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { auth } = config;
    const body: unknown = req.body;
    const token = typeof body === 'object' && body !== null && 'logout_token' in body ? body.logout_token : undefined;
    if (!auth || !idp) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    let claims: LogoutClaims | null;
    try {
      const payload = await idp.verifiedPayload(token);
      claims = payload ? logoutClaims(payload, { issuer: auth.issuer, clientId: auth.clientId }, now().getTime()) : null;
    } catch (error) {
      console.warn('back-channel logout check failed', safeErrorText(error));
      res.status(503).end();
      return;
    }
    if (!claims) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const ended = claims.sid ? await deleteSessionsByIdpSid(db, claims.sid) : claims.sub ? await deleteSessionsOfSub(db, claims.sub) : 0;
    console.info('back-channel logout: sessions ended', ended);
    res.status(200).end();
  });

  return router;
}
