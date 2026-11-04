/**
 * Routes that need a session and are limited per account: `signedIn` answers 401 `sign-in-required` without a
 * session and keeps the account id for the handler (`userIdOf`) and for `perAccountLimit`, which allows `perMinute`
 * requests per minute per account (429 `rate-limited`).
 */
import type { RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireUserId } from '../auth/require-user';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { HttpError } from '../http-error';

export function signedIn(config: ServerConfig, db: Db, now: () => Date): RequestHandler {
  return (req, res, next) => {
    requireUserId(req, config, db, now()).then(
      (userId) => {
        res.locals.userId = userId;
        next();
      },
      (error: unknown) => next(error),
    );
  };
}

/** The account `signedIn` let through. */
export function userIdOf(res: Response): string {
  const userId: unknown = res.locals.userId;
  if (typeof userId !== 'string') throw new HttpError(401, 'sign-in-required');
  return userId;
}

export function perAccountLimit(perMinute: number): RequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: perMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'rate-limited' },
    keyGenerator: (_req, res) => `user:${userIdOf(res)}`,
  });
}
