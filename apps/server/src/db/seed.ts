/**
 * `pnpm --filter @kb/server seed` (or `pnpm seed`): fills the dev database with the mock's data (seed-data.ts),
 * then rebuilds the search indexes when MEILI_URL is set. Ids are derived from the seed keys, so running it again
 * updates the same rows instead of adding copies. Refuses to run with NODE_ENV=production.
 * SEED_OWNER_SUB: IdP sub of the account that should own "Your universe" and the private documents (your own
 * dev sign-in); defaults to the seed admin `seed:dat`.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEFAULT_SEED_OWNER_SUB, loadConfig } from '../config';
import { safeErrorText } from '../log-error';
import { MeiliClient } from '../search/meili-client';
import { rebuildIndexes } from '../search/rebuild-indexes';
import { openConfiguredDatabase } from './client';
import { assertSeedAllowed, seedDatabase } from './seed-database';

export { assertSeedAllowed, seedDatabase, seedId, type SeedResult } from './seed-database';

async function main(): Promise<void> {
  assertSeedAllowed(process.env.NODE_ENV ?? 'development');
  const config = loadConfig();
  const ownerSub = process.env.SEED_OWNER_SUB?.trim() || DEFAULT_SEED_OWNER_SUB;
  const database = await openConfiguredDatabase(config);
  try {
    console.log(`seeding ${database.description}`);
    const result = await seedDatabase(database.db, ownerSub);
    console.log(`seeded ${result.spaces} Spaces and ${result.documents} documents (owner: ${ownerSub})`);
    if (config.meili) {
      const indexed = await rebuildIndexes(database.db, new MeiliClient(config.meili));
      console.log(`search: ${indexed.publicChunks} public and ${indexed.privateChunks} private chunk(s) indexed`);
    } else {
      console.log('search: MEILI_URL unset, indexes not built (run `pnpm meili`, then `pnpm reindex`)');
    }
  } finally {
    await database.close();
  }
}

// Run as a script, not when a test imports it.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error('seed failed:', safeErrorText(error));
    process.exitCode = 1;
  });
}
