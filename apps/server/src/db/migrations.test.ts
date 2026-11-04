/** Migrations run on a live database: rows written under an earlier schema must survive every later migration. */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, describe, expect, it } from 'vitest';
import * as schema from './schema';

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');
let firstOnly: string | null = null;

afterAll(async () => {
  if (firstOnly) await rm(firstOnly, { recursive: true, force: true });
});

describe('migrations', () => {
  it('keep the users and sessions of the first schema, with defaults for the new settings', async () => {
    // The migrations folder as production first had it: only the first entry of the journal.
    firstOnly = await mkdtemp(path.join(tmpdir(), 'kb-migrations-'));
    await cp(MIGRATIONS, firstOnly, { recursive: true });
    const journalFile = path.join(firstOnly, 'meta', '_journal.json');
    const journal = JSON.parse(await readFile(journalFile, 'utf8')) as { entries: unknown[] };
    await writeFile(journalFile, JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));

    const client = new PGlite();
    const db = drizzle(client, { schema });
    try {
      await migrate(db, { migrationsFolder: firstOnly });
      await db.execute(sql`insert into users (sub, name, created_at) values ('existing-sub', 'Đạt', now())`);
      await db.execute(sql`insert into sessions (id, user_id, created_at, last_seen_at, expires_at)
        select 'hash', id, now(), now(), now() + interval '1 day' from users`);

      await migrate(db, { migrationsFolder: MIGRATIONS });
      const [user] = await db.select().from(schema.users);
      expect(user).toMatchObject({ sub: 'existing-sub', name: 'Đạt', lang: 'vi', theme: 'system', role: 'member' });
      expect(await db.select({ id: schema.sessions.id }).from(schema.sessions)).toEqual([{ id: 'hash' }]);
    } finally {
      await client.close();
    }
  });
});
