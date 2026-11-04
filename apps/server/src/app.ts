import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import { sql } from 'drizzle-orm';
import { authRoutes } from './auth/auth-routes';
import { backchannelLogoutRoute } from './auth/backchannel-logout';
import { type IdpMetadata, idpMetadata } from './auth/idp-metadata';
import { requireSameOrigin } from './auth/origin-check';
import type { ServerConfig } from './config';
import type { Db } from './db/client';
import { HttpError } from './http-error';
import { safeErrorText } from './log-error';

export interface AppDeps {
  config: ServerConfig;
  db: Db;
  now?: () => Date;
  /** The IdP's discovery and keys (default: read from config.auth.issuer; null when sign-in is off). */
  idp?: IdpMetadata | null;
}

/**
 * The API: health check, sign-in with the hoandat.com account and the IdP's back-channel logout. The web app is
 * static (nginx in production, Vite in dev).
 */
export function createApp({ config, db, now = () => new Date(), idp = config.auth ? idpMetadata(config.auth.issuer) : null }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  // nginx on the same host sets X-Forwarded-For; trust it from loopback only (rate limits use the client IP).
  app.set('trust proxy', 'loopback');
  app.use(helmet());

  app.get('/healthz', async (_req, res) => {
    await db.execute(sql`select 1`);
    res.set('Cache-Control', 'no-store').type('text/plain').send('ok');
  });

  // The IdP calls this server to server, without an Origin: ahead of the same-origin check, proven by its signature.
  app.use(backchannelLogoutRoute({ config, db, idp, now }));

  app.use(requireSameOrigin(config.publicOrigin));
  app.use(express.json({ limit: '32kb' }));
  app.use(authRoutes({ config, db, idp, now }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not-found')));

  const onError: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code });
      return;
    }
    // Malformed JSON and oversized bodies from express.json().
    if (typeof err === 'object' && err !== null && 'type' in err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
      res.status(400).json({ error: 'invalid-body' });
      return;
    }
    // A path the router cannot decode (bad percent-encoding): the client's mistake. Not logged: its message quotes
    // the path, which may carry a share-link token.
    if (err instanceof URIError || (typeof err === 'object' && err !== null && 'status' in err && err.status === 400)) {
      res.status(400).json({ error: 'bad-request' });
      return;
    }
    // Never the raw error: a failed query's message carries its bound values.
    console.error('request failed', safeErrorText(err));
    res.status(500).json({ error: 'internal' });
  };
  app.use(onError);
  return app;
}
