/**
 * Internal API for the other hoandat services on the same host (docs/deployment-guide.md, "API nội bộ"). There is no
 * secret: a call is served only when it reached the server directly over loopback, never through nginx. nginx always
 * adds X-Forwarded-For on the way in (and answers 404 for /api/internal/ itself), so a request carrying any
 * forwarding header, or coming from a non-loopback address, is answered 404 as if the route did not exist. The check
 * reads the socket's address, not `req.ip`: `trust proxy` would let a forwarded header decide `req.ip`.
 *
 * - GET /api/internal/jev-usage?from=YYYY-MM-DD&to=YYYY-MM-DD → `{days: JevUsageDay[]}`: Jev's daily totals per
 *   purpose (days in Asia/Saigon, inclusive, oldest first; a day without calls has no row). At most
 *   `MAX_USAGE_DAYS` days a call; 400 `invalid-query` otherwise or for a malformed or impossible date.
 */
import { type IncomingHttpHeaders } from 'node:http';
import { type Request, type RequestHandler, Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client';
import { HttpError } from '../http-error';
import { JevUsageStore } from '../jev/jev-usage';
import { parseQuery } from './validate';

/** The longest range one call may ask for, in days (both ends included). */
export const MAX_USAGE_DAYS = 31;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const FORWARDING_HEADERS = ['x-forwarded-for', 'x-real-ip', 'forwarded'] as const;

/** True only for a request that reached this server straight from this host, not relayed by a proxy. */
export function isDirectLoopback(req: { headers: IncomingHttpHeaders; socket: { remoteAddress?: string } }): boolean {
  if (FORWARDING_HEADERS.some((name) => req.headers[name] !== undefined)) return false;
  return LOOPBACK.has(req.socket.remoteAddress ?? '');
}

const DAY_MS = 86_400_000;

/** A real calendar day `YYYY-MM-DD` (2026-02-30 is refused); its UTC midnight in ms. */
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const at = Date.parse(`${day}T00:00:00Z`);
    return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === day;
  });

const UsageQuery = z
  .object({ from: Day, to: Day })
  .refine(({ from, to }) => {
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
    return span >= 0 && span < MAX_USAGE_DAYS;
  });

const loopbackOnly: RequestHandler = (req: Request, _res, next) => {
  if (!isDirectLoopback(req)) throw new HttpError(404, 'not-found');
  next();
};

export function internalRoutes({ db }: { db: Db }): Router {
  const router = Router();
  const usage = new JevUsageStore(db);
  router.use('/api/internal', loopbackOnly);
  router.get('/api/internal/jev-usage', async (req, res) => {
    const { from, to } = parseQuery(UsageQuery, req.query);
    res.set('Cache-Control', 'no-store').json({ days: await usage.days(from, to) });
  });
  return router;
}
