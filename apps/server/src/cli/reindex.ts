/**
 * `pnpm reindex`: rebuilds both search indexes from Postgres (src/search/rebuild-indexes.ts). Reads the same env
 * as the server (DATABASE_URL or the dev PGlite, MEILI_URL, MEILI_MASTER_KEY). Production runs the bundled
 * `apps/server/dist/server/reindex.mjs` with the server's env file (docs/deployment-guide.md).
 */
import { loadConfig } from '../config';
import { openConfiguredDatabase } from '../db/client';
import { safeErrorText } from '../log-error';
import { MeiliClient } from '../search/meili-client';
import { rebuildIndexes } from '../search/rebuild-indexes';

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.meili) throw new Error('MEILI_URL and MEILI_MASTER_KEY are not set: nothing to rebuild');
  const database = await openConfiguredDatabase(config);
  try {
    const result = await rebuildIndexes(database.db, new MeiliClient(config.meili));
    console.log(`reindexed ${result.documents} document(s): ${result.publicChunks} public chunk(s), ${result.privateChunks} private chunk(s)`);
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error('reindex failed:', safeErrorText(error));
  process.exitCode = 1;
});
