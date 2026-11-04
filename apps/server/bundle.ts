// Production bundle: one ESM file with every dependency inlined, so the server needs only Node and the
// migrations (apps/server/drizzle), no workspace install and no tsx.
import { build } from 'esbuild';

await build({
  // index.mjs: the API; reindex.mjs and import-hoc-cloud.mjs: `pnpm reindex` and `pnpm import:hoc-cloud` on the
  // server (same env file; the importer reads content/ shipped in the release).
  entryPoints: { index: 'src/server.ts', reindex: 'src/cli/reindex.ts', 'import-hoc-cloud': 'src/cli/import-hoc-cloud.ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Two levels below apps/server like src/db, so the migrations folder resolves the same from the bundle.
  outdir: 'dist/server',
  outExtension: { '.js': '.mjs' },
  // PGlite is dev/test only and loaded on demand; pg-native is an optional driver pg never needs here.
  external: ['@electric-sql/pglite', 'drizzle-orm/pglite', 'drizzle-orm/pglite/migrator', 'pg-native'],
  // Inlined CommonJS packages (express, pg) still call require().
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  sourcemap: true,
  logLevel: 'info',
});
