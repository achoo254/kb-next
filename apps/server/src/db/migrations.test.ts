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
  if (upToTwo) await rm(upToTwo, { recursive: true, force: true });
  if (upToFive) await rm(upToFive, { recursive: true, force: true });
  if (upToSeven) await rm(upToSeven, { recursive: true, force: true });
  if (upToNine) await rm(upToNine, { recursive: true, force: true });
});

/** A copy of the migrations folder with only the first `count` journal entries, as production had it then. */
async function migrationsUpTo(count: number): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'kb-migrations-'));
  await cp(MIGRATIONS, dir, { recursive: true });
  const journalFile = path.join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalFile, 'utf8')) as { entries: unknown[] };
  await writeFile(journalFile, JSON.stringify({ ...journal, entries: journal.entries.slice(0, count) }));
  return dir;
}
let upToTwo: string | null = null;
let upToFive: string | null = null;
let upToSeven: string | null = null;
let upToNine: string | null = null;

describe('migrations', () => {
  it('keep the users and sessions of the first schema, with defaults for the new settings', async () => {
    // The migrations folder as production first had it: only the first entry of the journal.
    firstOnly = await migrationsUpTo(1);

    const client = new PGlite();
    const db = drizzle(client, { schema });
    try {
      await migrate(db, { migrationsFolder: firstOnly });
      await db.execute(sql`insert into users (sub, name, created_at) values ('existing-sub', 'Đạt', now())`);
      await db.execute(sql`insert into sessions (id, user_id, created_at, last_seen_at, expires_at)
        select 'hash', id, now(), now(), now() + interval '1 day' from users`);

      await migrate(db, { migrationsFolder: MIGRATIONS });
      const [user] = await db.select().from(schema.users);
      // Accounts from before onboarding existed see it once, with nothing picked yet.
      expect(user).toMatchObject({ sub: 'existing-sub', name: 'Đạt', lang: 'vi', theme: 'system', role: 'member', onboardedAt: null, interests: [] });
      expect(await db.select({ id: schema.sessions.id }).from(schema.sessions)).toEqual([{ id: 'hash' }]);
    } finally {
      await client.close();
    }
  });

  it('turn official documents made by AI into plain official ones when that origin goes away', async () => {
    // Up to 0002, which still had both official origins.
    upToTwo = await migrationsUpTo(3);
    const client = new PGlite();
    const db = drizzle(client, { schema });
    try {
      await migrate(db, { migrationsFolder: upToTwo });
      await db.execute(sql`insert into users (sub, created_at) values ('author-sub', now())`);
      await db.execute(sql`insert into spaces (slug, name_vi, name_en, tint, glow, art, unit_vi, unit_en)
        values ('net', 'Mạng', 'Networking', '#c4b5fd', '#8b5cf6', '/art/crystal-networking.webp', 'bài', 'docs')`);
      await db.execute(sql`insert into documents (space_id, title, type, lang, origin, author_id)
        select s.id, t.title, 'lab', 'vi', t.origin::document_origin, u.id
        from spaces s, users u, (values ('A', 'official_ai'), ('B', 'official'), ('C', 'community')) as t(title, origin)`);

      await migrate(db, { migrationsFolder: MIGRATIONS });
      const rows = await db.select({ title: schema.documents.title, origin: schema.documents.origin }).from(schema.documents);
      expect(rows.sort((a, b) => a.title.localeCompare(b.title))).toEqual([
        { title: 'A', origin: 'official' },
        { title: 'B', origin: 'official' },
        { title: 'C', origin: 'community' },
      ]);
    } finally {
      await client.close();
    }
  });

  it('keep existing Spaces when they gain a description, with none written yet', async () => {
    // Up to 0005, before Spaces had descriptions.
    upToFive = await migrationsUpTo(6);
    const client = new PGlite();
    const db = drizzle(client, { schema });
    try {
      await migrate(db, { migrationsFolder: upToFive });
      await db.execute(sql`insert into spaces (slug, name_vi, name_en, tint, glow, art, unit_vi, unit_en)
        values ('net', 'Mạng', 'Networking', '#c4b5fd', '#8b5cf6', '/art/crystal-networking.webp', 'bài', 'docs')`);

      await migrate(db, { migrationsFolder: MIGRATIONS });
      const rows = await db.select({ slug: schema.spaces.slug, nameEn: schema.spaces.nameEn, descriptionVi: schema.spaces.descriptionVi, descriptionEn: schema.spaces.descriptionEn }).from(schema.spaces);
      expect(rows).toEqual([{ slug: 'net', nameEn: 'Networking', descriptionVi: null, descriptionEn: null }]);
    } finally {
      await client.close();
    }
  });

  it('clear the never-written old own-key rows and keep the accounts when keys gain a nonce and a status', async () => {
    // Up to 0007, when user_keys still had iv/auth_tag columns (no release ever wrote to it).
    upToSeven = await migrationsUpTo(8);
    const client = new PGlite();
    const db = drizzle(client, { schema });
    try {
      await migrate(db, { migrationsFolder: upToSeven });
      await db.execute(sql`insert into users (sub, created_at) values ('key-owner', now())`);
      await db.execute(sql`insert into user_keys (user_id, provider, ciphertext, iv, auth_tag, last4)
        select id, 'openai', 'x', 'y', 'z', 'abcd' from users`);

      await migrate(db, { migrationsFolder: MIGRATIONS });
      expect(await db.select().from(schema.userKeys)).toEqual([]);
      expect(await db.select({ sub: schema.users.sub }).from(schema.users)).toEqual([{ sub: 'key-owner' }]);
    } finally {
      await client.close();
    }
  });

  it('keep every version when versions learn how they were made, and the documents without a planet', async () => {
    // Up to 0009, before versions had a last save, a way they were made, and documents a planet colour.
    upToNine = await migrationsUpTo(10);
    const client = new PGlite();
    const db = drizzle(client, { schema });
    try {
      await migrate(db, { migrationsFolder: upToNine });
      await db.execute(sql`insert into users (sub, created_at) values ('system:hoc-cloud', now()), ('writer', now())`);
      await db.execute(sql`insert into spaces (slug, name_vi, name_en, tint, glow, art, unit_vi, unit_en)
        values ('net', 'Mạng', 'Networking', '#c4b5fd', '#8b5cf6', '/art/crystal-networking.webp', 'bài', 'docs')`);
      await db.execute(sql`insert into documents (space_id, title, type, lang, origin, author_id, ai_translated)
        select s.id, t.title, 'lab', 'vi', 'official', u.id, t.ai
        from spaces s, (values ('Imported', 'system:hoc-cloud', false), ('Translated', 'writer', true), ('Written', 'writer', false)) as t(title, sub, ai)
        join users u on u.sub = t.sub`);
      await db.execute(sql`insert into document_versions (document_id, version, markdown, editor_id, created_at)
        select d.id, 1, '# ' || d.title, d.author_id, timestamptz '2026-10-01 02:00:00+00' from documents d`);

      await migrate(db, { migrationsFolder: MIGRATIONS });
      const rows = await db
        .select({ title: schema.documents.title, planet: schema.documents.planet, deletedBy: schema.documents.deletedBy, via: schema.documentVersions.via, aiMade: schema.documentVersions.aiMade, updatedAt: schema.documentVersions.updatedAt })
        .from(schema.documentVersions)
        .innerJoin(schema.documents, sql`${schema.documents.id} = ${schema.documentVersions.documentId}`);
      const at = new Date('2026-10-01T02:00:00Z');
      expect(rows.sort((a, b) => a.title.localeCompare(b.title))).toEqual([
        { title: 'Imported', planet: null, deletedBy: null, via: 'import', aiMade: false, updatedAt: at },
        { title: 'Translated', planet: null, deletedBy: null, via: 'translation', aiMade: true, updatedAt: at },
        { title: 'Written', planet: null, deletedBy: null, via: 'editor', aiMade: false, updatedAt: at },
      ]);
    } finally {
      await client.close();
    }
  });
});
