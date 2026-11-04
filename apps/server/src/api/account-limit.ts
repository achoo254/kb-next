/**
 * Routes that need a session and are limited per account: `signedIn` answers 401 `sign-in-required` without a
 * session and keeps the account id for the handler (`userIdOf`) and for `perAccountLimit`, which allows `perMinute`
 * requests per minute per account (429 `rate-limited`). `AccountBudget` counts provider calls billed to a user's own
 * key instead of requests: a question costs 1, a translation as many as the calls it makes.
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

const WINDOW_MS = 60 * 1000;

/** Calls per account per fixed one-minute window, in memory (one server process). */
export class AccountBudget {
  private readonly windows = new Map<string, { start: number; used: number }>();

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Spends `cost` calls of `account`'s minute; false (nothing spent) when they do not fit. */
  take(account: string, cost: number): boolean {
    const at = this.now();
    const current = this.windows.get(account);
    const window = current && at - current.start < WINDOW_MS ? current : { start: at, used: 0 };
    this.windows.set(account, window);
    if (window.used + cost > this.perMinute) return false;
    window.used += cost;
    if (this.windows.size > 1_000) {
      for (const [key, w] of this.windows) if (at - w.start >= WINDOW_MS) this.windows.delete(key);
    }
    return true;
  }
}

/** 429 `rate-limited` unless the signed-in account's budget has `cost` calls left this minute. */
export function spendBudget(budget: AccountBudget, account: string, cost: number): void {
  if (!budget.take(account, cost)) throw new HttpError(429, 'rate-limited');
}
