/**
 * Proves that src/access/ is the only read path to documents, their versions, chunks, links, journey steps and search: no other
 * module of the server (tests aside) imports those tables, reaches them through `db.query.*` or raw SQL, or calls
 * the index's search. src/db/ (schema, migrations, seed) is the only other place allowed to name them.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARDED = ['documents', 'documentVersions', 'chunks', 'links', 'journeySteps'];
const GUARDED_SQL = ['documents', 'document_versions', 'chunks', 'links', 'journey_steps'];
const ALLOWED_DIRS = ['access', 'db'];
/** The client defines the call; only src/access/ may make it. */
const SEARCH_CALL = /\bfederatedSearch\b/;
const SEARCH_DEFINED_IN = 'search/meili-client.ts';

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
    }),
  );
  return nested.flat();
}

/** Ways `source` reads a guarded table or the search index directly. */
export function bypasses(source: string, file: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)) {
    const [, names = '', from = ''] = m;
    if (!/(^|\/)db\/schema$|^\.\/schema$/.test(from)) continue;
    for (const name of names.split(',').map((n) => n.trim().split(/\s+as\s+/)[0]?.replace(/^type\s+/, '') ?? '')) {
      if (GUARDED.includes(name)) found.push(`imports ${name} from ${from}`);
    }
  }
  if (/import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]*db\/schema['"]/.test(source)) found.push('imports the whole schema');
  for (const m of source.matchAll(/\.query\.(\w+)/g)) if (m[1] && GUARDED.includes(m[1])) found.push(`db.query.${m[1]}`);
  for (const m of source.matchAll(/\b(?:from|join|update|into)\s+"?(\w+)"?/gi)) {
    if (m[1] && GUARDED_SQL.includes(m[1]) && /sql`|\.execute\(/.test(source)) found.push(`raw SQL on ${m[1]}`);
  }
  if (SEARCH_CALL.test(source) && file !== SEARCH_DEFINED_IN) found.push('calls federatedSearch');
  return found;
}

describe('access/ is the only read path', () => {
  it('no server module outside access/ and db/ reads documents, versions, chunks, links, journey steps or search', async () => {
    const files = await sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(10);
    const violations: string[] = [];
    for (const full of files) {
      const rel = path.relative(SRC, full).split(path.sep).join('/');
      if (ALLOWED_DIRS.some((dir) => rel.startsWith(`${dir}/`))) continue;
      for (const v of bypasses(await readFile(full, 'utf8'), rel)) violations.push(`${rel}: ${v}`);
    }
    expect(violations).toEqual([]);
  });

  it('catches each kind of bypass', () => {
    expect(bypasses(`import { users, documents } from '../db/schema';`, 'x.ts')).toEqual(['imports documents from ../db/schema']);
    expect(bypasses(`import { chunks as c } from '../db/schema';`, 'x.ts')).toEqual(['imports chunks from ../db/schema']);
    expect(bypasses(`import * as schema from '../db/schema';`, 'x.ts')).toEqual(['imports the whole schema']);
    expect(bypasses(`await db.query.links.findMany()`, 'x.ts')).toEqual(['db.query.links']);
    expect(bypasses('await db.execute(sql`select * from documents`)', 'x.ts')).toEqual(['raw SQL on documents']);
    expect(bypasses(`await meili.federatedSearch(q, 5)`, 'search/x.ts')).toEqual(['calls federatedSearch']);
    expect(bypasses(`import { users, sessions } from '../db/schema';`, 'x.ts')).toEqual([]);
  });
});
