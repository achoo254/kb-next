/** Serves the app on 127.0.0.1 with an in-memory PGlite for one test file. */
import type { AddressInfo } from 'node:net';
import { type Server, createServer } from 'node:http';
import { type AppDeps, createApp } from '../src/app';
import { type ServerConfig, loadConfig } from '../src/config';
import { type Db, type DbHandle, openPglite } from '../src/db/client';

export interface TestServer {
  origin: string;
  config: ServerConfig;
  database: DbHandle;
  close(): Promise<void>;
}

/**
 * `now`: the app's clock (defaults to the real one), for tests that move past deadlines. `jev`: a stand-in for Jev
 * (default none: no TYPESAFE_API_KEY, the real client is never called from tests).
 */
export async function startTestServer(
  env: Record<string, string> = {},
  overrides: Partial<ServerConfig> = {},
  now: () => Date = () => new Date(),
  jev: AppDeps['jev'] = null,
  /**
   * Search (a test Meilisearch), the imported summaries, the own-keys secret and the AI providers' origins (fakes),
   * when the test needs them (given the test database).
   */
  extra: (db: Db) => Pick<AppDeps, 'search' | 'summaries' | 'userKeysSecret' | 'aiBases'> = () => ({}),
): Promise<TestServer> {
  const database = await openPglite();
  // The app's public origin is the test server itself, known once it listens: listen first, then build the app.
  let handler: ReturnType<typeof createApp> | null = null;
  const server: Server = createServer((req, res) => {
    if (handler) handler(req, res);
    else res.writeHead(503).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const config = { ...loadConfig({ NODE_ENV: 'test', PUBLIC_URL: origin, ...env }), ...overrides };
  handler = createApp({ config, db: database.db, now, jev, ...extra(database.db) });
  return {
    origin,
    config,
    database,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      await database.close();
    },
  };
}
