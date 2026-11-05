import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import { sql } from 'drizzle-orm';
import { AccountBudget } from './api/account-limit';
import { activityRoutes } from './api/activity-routes';
import { adminApiRoutes, adminTokenRoutes } from './api/admin-api-routes';
import { DOCUMENT_BODY_LIMIT, authoringRoutes } from './api/authoring-routes';
import { CANVAS_BODY_LIMIT, canvasRoutes } from './api/canvas-routes';
import { contentRoutes } from './api/content-routes';
import { fileRoutes } from './api/file-routes';
import { graphRoutes } from './api/graph-routes';
import { historyRoutes } from './api/history-routes';
import { meRoutes } from './api/me-routes';
import { myContentRoutes } from './api/my-content-routes';
import { notificationRoutes } from './api/notification-routes';
import { reviewRoutes } from './api/review-routes';
import { authRoutes } from './auth/auth-routes';
import { backchannelLogoutRoute } from './auth/backchannel-logout';
import { type IdpMetadata, idpMetadata } from './auth/idp-metadata';
import { requireSameOrigin } from './auth/origin-check';
import type { ServerConfig } from './config';
import type { Db } from './db/client';
import { SpaceCaptions } from './captions/space-captions';
import { askRoutes } from './copilot/ask-routes';
import type { ExtractionService } from './extract';
import { translateRoutes } from './copilot/translate-routes';
import { WRITE_BODY_LIMIT, writeRoutes } from './copilot/write-routes';
import { HttpError } from './http-error';
import { JevClient, type JevJudge, type JevUsageLog } from './jev/jev-client';
import { JevUsageStore } from './jev/jev-usage';
import { LIVE_BASES, type ProviderBases } from './llm/providers';
import { safeErrorText } from './log-error';
import { searchRoutes } from './api/search-routes';
import { type BilingualSummary, loadImportedSummaries } from './search/document-summaries';
import type { SearchService } from './search/search-service';
import { readUserKeysSecret } from './user-keys/crypto';
import { keyRoutes } from './user-keys/key-routes';
import { UserKeyStore } from './user-keys/key-store';

export interface AppDeps {
  config: ServerConfig;
  db: Db;
  now?: () => Date;
  /** The IdP's discovery and keys (default: read from config.auth.issuer; null when sign-in is off). */
  idp?: IdpMetadata | null;
  /** Search index and its sync queue; null when MEILI_URL is unset. Writers enqueue changed documents on it. */
  search?: SearchService | null;
  /**
   * Jev, for server-side judgments (default: from TYPESAFE_API_KEY, its calls counted per day in Postgres; null
   * without a key).
   */
  jev?: JevJudge | null;
  /** Bilingual summaries of the imported texts (default: content/summaries.json, bundled). */
  summaries?: ReadonlyMap<string, BilingualSummary>;
  /** Secret of the users' own AI keys (default: read from USER_KEYS_SECRET_PATH; null: own keys and the Copilot off). */
  userKeysSecret?: Buffer | null;
  /** API origins of the AI providers (default: the real ones; tests use local fakes). */
  aiBases?: ProviderBases;
  /** Text extraction of uploaded files (server.ts starts it; null: uploads are stored without processing). */
  extraction?: ExtractionService | null;
}

/** The real Jev client, each call logged and added to the day's totals. */
export function jevWithUsage(apiKey: string, db: Db, now: () => Date): JevClient {
  const usage = new JevUsageStore(db, now);
  return new JevClient(apiKey, undefined, (line: JevUsageLog) => {
    console.log(JSON.stringify(line));
    void usage.record(line);
  });
}

/**
 * The API: health check, sign-in with the hoandat.com account and the IdP's back-channel logout, the account
 * (/api/me), the reading API (Spaces, documents, recent), writing (documents, versions, trash, favourites, Spaces and
 * Collections), stored files (upload, download, Office editor saves, the Import Center), the Graph and Canvas, search,
 * the account's own AI keys, the Copilot, AI translation and AI writing
 * (all three on those keys), review (sending for review, the admins' queue and published texts), the inbox, and the
 * admin API (token, docs/admin-api.md). The web app is static (nginx in production, Vite in dev).
 */
export function createApp({
  config,
  db,
  now = () => new Date(),
  idp = config.auth ? idpMetadata(config.auth.issuer) : null,
  search = null,
  jev = config.typesafeApiKey ? jevWithUsage(config.typesafeApiKey, db, now) : null,
  summaries = loadImportedSummaries(),
  userKeysSecret = readUserKeysSecret(config.userKeysSecretPath).secret,
  aiBases = LIVE_BASES,
  extraction = null,
}: AppDeps): Express {
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

  // The admin API authenticates by token, not by the session cookie: called from other servers, without an Origin.
  app.use(adminApiRoutes({ config, db, now, sync: search?.sync ?? null, jev, meili: search?.meili ?? null }));

  app.use(requireSameOrigin(config.publicOrigin));
  // A canvas (its cards and connections) is saved whole: a larger body than the rest of the API takes.
  app.use('/api/canvases', express.json({ limit: CANVAS_BODY_LIMIT }));
  // A document (the editor's save) and the draft AI writing reads are larger too.
  app.use('/api/documents', express.json({ limit: DOCUMENT_BODY_LIMIT }));
  app.use('/api/write', express.json({ limit: WRITE_BODY_LIMIT }));
  app.use(express.json({ limit: '32kb' }));
  app.use(authRoutes({ config, db, idp, now }));
  app.use(meRoutes({ config, db, now }));
  app.use(contentRoutes({ config, db, now, captions: new SpaceCaptions(db, jev, now) }));
  app.use(activityRoutes({ config, db, now }));
  app.use(authoringRoutes({ config, db, now, sync: search?.sync ?? null }));
  app.use(historyRoutes({ config, db, now, sync: search?.sync ?? null }));
  app.use(myContentRoutes({ config, db, now, sync: search?.sync ?? null }));
  // Review (submit, withdraw, the admins' queue and published texts), the inbox, admin tokens.
  app.use(reviewRoutes({ config, db, now, sync: search?.sync ?? null, jev, meili: search?.meili ?? null }));
  app.use(notificationRoutes({ config, db, now }));
  app.use(adminTokenRoutes({ config, db, now }));
  // Stored files: uploads (multipart, streamed to disk, never parsed as JSON), downloads, editor saves.
  app.use(fileRoutes({ config, db, now, extraction, sync: search?.sync ?? null }));
  app.use(graphRoutes({ config, db, now, jev, summaries }));
  app.use(canvasRoutes({ config, db, now, jev }));
  app.use(searchRoutes({ config, db, now, meili: search?.meili ?? null, jev, summaries }));
  // Own AI keys and what runs on them; nothing here has a server AI key (Jev aside).
  const keys = new UserKeyStore(db, userKeysSecret, now);
  const aiBudget = new AccountBudget(config.askLimitPerMinute, () => now().getTime());
  app.use(keyRoutes({ config, db, now, keys, bases: aiBases }));
  app.use(askRoutes({ config, db, now, meili: search?.meili ?? null, jev, summaries, keys, bases: aiBases, aiBudget }));
  app.use(translateRoutes({ config, db, now, keys, bases: aiBases, sync: search?.sync ?? null, aiBudget }));
  app.use(writeRoutes({ config, db, now, keys, bases: aiBases, aiBudget }));

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
