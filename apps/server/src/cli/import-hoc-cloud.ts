/**
 * `pnpm import:hoc-cloud`: copies Học Cloud's labs, exercises and weekly pages into kb as official, approved
 * documents, arranged by content/hoc-cloud/curation.json, then syncs search. Safe to run again: unchanged documents
 * are not written, changed ones get a new version. Reads the server's env (DATABASE_URL or the dev PGlite,
 * MEILI_URL, MEILI_MASTER_KEY) plus HOC_CLOUD_URL (default: the public Học Cloud). Production runs the bundled
 * `apps/server/dist/server/import-hoc-cloud.mjs` with the server's env file (docs/deployment-guide.md).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config';
import { openConfiguredDatabase } from '../db/client';
import { loadContentDir } from '../import/hoc-cloud/curation';
import { runImport } from '../import/hoc-cloud/run-import';
import { hocCloudBaseUrl, httpSource } from '../import/hoc-cloud/source';
import { safeErrorText } from '../log-error';
import { MeiliClient } from '../search/meili-client';

/** content/ of the repository or release: four levels up from src/cli/ and from the bundle's dist/server/ alike. */
const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../content');

async function main(): Promise<void> {
  const config = loadConfig();
  const source = httpSource(hocCloudBaseUrl(process.env.HOC_CLOUD_URL));
  const content = await loadContentDir(process.env.KB_CONTENT_DIR?.trim() || CONTENT_DIR);
  const database = await openConfiguredDatabase(config);
  try {
    console.log(`importing ${source.baseUrl} into ${database.description}`);
    const report = await runImport(database.db, source, content, { meili: config.meili ? new MeiliClient(config.meili) : null });
    const { counts } = report;
    console.log(
      `read ${counts.labs} lab(s), ${counts.exercises} exercise(s), ${counts.weekly} weekly page(s), ${counts.translations} translation(s); ` +
        `${counts.redactedAddresses} server address(es) redacted`,
    );
    console.log(
      `documents: ${report.created.length} created, ${report.updated.length} updated, ${report.unchanged} unchanged; ` +
        `${report.spacesCreated} Space(s) and ${report.collectionsCreated} collection(s) created`,
    );
    for (const warning of report.warnings) console.warn(`warning: ${warning}`);
    if (!config.meili) console.log('search: MEILI_URL unset, run `pnpm reindex` once search is configured');
    else if (!report.indexed) {
      console.error('search sync gave up: run `pnpm reindex`');
      process.exitCode = 1;
    }
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error('import failed:', safeErrorText(error));
  process.exitCode = 1;
});
