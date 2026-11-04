import { createApp } from './app';
import { loadConfig } from './config';
import { purgeExpiredSessions } from './auth/session-store';
import { openConfiguredDatabase } from './db/client';
import { seedMockCaptions } from './captions/seed-captions';
import { seedDatabase } from './db/seed-database';
import { safeErrorText } from './log-error';
import { startSearch } from './search/search-service';

const config = loadConfig();
const database = await openConfiguredDatabase(config);
console.log(`database: ${database.description}`);
console.log(`sign-in: ${config.auth ? `on (${config.auth.clientId} at ${config.auth.issuer})` : 'off (AUTH_CLIENT_SECRET unset)'}`);
console.log(`admins: ${config.adminSubs.size}`);
console.log(`jev: ${config.typesafeApiKey ? 'on (TYPESAFE_API_KEY)' : 'off (TYPESAFE_API_KEY unset, plain captions)'}`);
if (config.startupSeed) {
  // KB_SEED=mock (dev/E2E only, refused in production by loadConfig): the mock's Spaces and documents.
  const seeded = await seedDatabase(database.db, config.startupSeed.ownerSub);
  const captions = await seedMockCaptions(database.db, config.adminSubs, seeded.ownerId);
  console.log(`seeded ${seeded.spaces} Spaces, ${seeded.documents} documents and ${captions} board captions (KB_SEED=mock)`);
}
const search = config.meili ? startSearch(database.db, config.meili) : null;
console.log(`search: ${search ? 'Meilisearch (MEILI_URL)' : 'off (MEILI_URL unset)'}`);

/** Expired sessions are deleted at start and every hour (a session is otherwise only deleted when used again). */
const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000;
async function housekeeping(): Promise<void> {
  try {
    const removed = await purgeExpiredSessions(database.db, new Date());
    if (removed > 0) console.log(`purged ${removed} expired session(s)`);
  } catch (error) {
    console.error('session purge failed', safeErrorText(error));
  }
}
await housekeeping();
// unref: the timer never keeps the process alive on its own (shutdown clears it too).
const housekeepingTimer = setInterval(() => void housekeeping(), HOUSEKEEPING_INTERVAL_MS);
housekeepingTimer.unref();

// Loopback only: nginx (production) and the web dev server proxy to it.
const server = createApp({ config, db: database.db, search }).listen(config.port, '127.0.0.1', () => {
  console.log(`kb server listening on 127.0.0.1:${config.port} (${config.nodeEnv})`);
});
// A taken port must stop the process (systemd restarts it), not leave it running without a listener.
server.on('error', (error) => {
  console.error('listen failed', safeErrorText(error));
  process.exit(1);
});

let stopping = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) process.exit(1);
  stopping = true;
  console.log(`${signal}: closing`);
  clearInterval(housekeepingTimer);
  search?.close();
  server.close();
  try {
    await database.close();
    process.exit(0);
  } catch (error) {
    console.error('shutdown failed', safeErrorText(error));
    process.exit(1);
  }
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => void shutdown(signal));
