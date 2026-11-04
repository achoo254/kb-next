/**
 * `pnpm --filter @kb/server seed` (or `pnpm seed`): fills the dev database with the mock's data (seed-data.ts),
 * then rebuilds the search indexes when MEILI_URL is set. Ids are derived from the seed keys, so running it again
 * updates the same rows instead of adding copies. Refuses to run with NODE_ENV=production.
 * SEED_OWNER_SUB: IdP sub of the account that should own "Your universe" and the private documents (your own
 * dev sign-in); defaults to the seed admin `seed:dat`.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inArray, sql } from 'drizzle-orm';
import { loadConfig } from '../config';
import { safeErrorText } from '../log-error';
import { MeiliClient } from '../search/meili-client';
import { rebuildIndexes } from '../search/rebuild-indexes';
import { type Db, openConfiguredDatabase } from './client';
import { chunks, collections, documentVersions, documents, links, spaces, users } from './schema';
import { SEED_DOCUMENTS, SEED_LINKS, SEED_SPACES, SEED_USERS, type SeedAuthor } from './seed-data';

/** A stable uuid-shaped id for a seed key. */
export function seedId(key: string): string {
  const hex = createHash('sha256').update(`kb-seed:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface SeedResult {
  spaces: number;
  documents: number;
  ownerId: string;
}

export async function seedDatabase(db: Db, ownerSub: string, now: Date = new Date()): Promise<SeedResult> {
  const userIds = new Map<SeedAuthor, string>();
  for (const user of SEED_USERS) {
    const [row] = await db
      .insert(users)
      .values({ sub: user.sub, name: user.name, role: user.role, createdAt: now })
      .onConflictDoUpdate({ target: users.sub, set: { name: user.name, role: user.role } })
      .returning({ id: users.id });
    if (!row) throw new Error('seed user upsert returned nothing');
    userIds.set(user.key, row.id);
  }
  const [owner] = await db
    .insert(users)
    .values({ sub: ownerSub, createdAt: now })
    .onConflictDoUpdate({ target: users.sub, set: { sub: ownerSub } })
    .returning({ id: users.id });
  if (!owner) throw new Error('seed owner upsert returned nothing');
  userIds.set('owner', owner.id);
  const userId = (author: SeedAuthor): string => {
    const id = userIds.get(author);
    if (!id) throw new Error(`seed author ${author} missing`);
    return id;
  };

  const collectionIds = new Map<string, string[]>();
  for (const [order, space] of SEED_SPACES.entries()) {
    const personal = space.kind === 'personal';
    const values = {
      id: seedId(`space:${space.key}`),
      slug: space.slug ?? `personal-${owner.id}`,
      nameVi: space.vi,
      nameEn: space.en,
      tint: space.tint,
      glow: space.glow,
      art: space.art,
      kind: space.kind,
      ownerId: personal ? owner.id : null,
      unitVi: space.unitVi,
      unitEn: space.unitEn,
      sortOrder: order,
    };
    await db.insert(spaces).values(values).onConflictDoUpdate({ target: spaces.id, set: values });
    const ids: string[] = [];
    for (const [i, c] of space.collections.entries()) {
      const collection = {
        id: seedId(`collection:${space.key}:${i}`),
        spaceId: values.id,
        nameVi: c.vi,
        nameEn: c.en,
        tint: c.tint ?? space.tint,
        glow: c.glow ?? space.glow,
        art: c.art ?? null,
        sortOrder: i,
      };
      await db.insert(collections).values(collection).onConflictDoUpdate({ target: collections.id, set: collection });
      ids.push(collection.id);
    }
    collectionIds.set(space.key, ids);
  }

  const documentIds = SEED_DOCUMENTS.map((doc) => seedId(`document:${doc.key}`));
  for (const [order, doc] of SEED_DOCUMENTS.entries()) {
    const id = seedId(`document:${doc.key}`);
    const markdown = [`# ${doc.title}`, ...doc.chunks.map(([, heading, text]) => `## ${heading}\n\n${text}`)].join('\n\n');
    const collectionId = doc.collection === null ? null : collectionIds.get(doc.space)?.[doc.collection];
    if (collectionId === undefined) throw new Error(`seed document ${doc.key}: no collection ${doc.collection}`);
    const values = {
      id,
      spaceId: seedId(`space:${doc.space}`),
      collectionId,
      title: doc.title,
      type: doc.type,
      lang: 'vi' as const,
      origin: doc.origin,
      status: doc.status,
      hidden: false,
      authorId: userId(doc.author),
      contentHash: createHash('sha256').update(markdown).digest('hex'),
      sortOrder: order,
      updatedAt: now,
      deletedAt: null,
    };
    await db.insert(documents).values(values).onConflictDoUpdate({ target: documents.id, set: values });
    const version = { id: seedId(`version:${doc.key}:1`), documentId: id, version: 1, markdown, editorId: values.authorId };
    await db.insert(documentVersions).values(version).onConflictDoUpdate({ target: documentVersions.id, set: version });
  }
  await db.delete(chunks).where(inArray(chunks.documentId, documentIds));
  await db.insert(chunks).values(
    SEED_DOCUMENTS.flatMap((doc) =>
      doc.chunks.map(([anchor, heading, text], position) => ({
        id: seedId(`chunk:${doc.key}:${anchor}`),
        documentId: seedId(`document:${doc.key}`),
        anchor,
        position,
        heading,
        text,
      })),
    ),
  );
  await db
    .insert(links)
    .values(
      SEED_LINKS.map(([source, target, kind, label]) => ({
        sourceId: seedId(`document:${source}`),
        targetId: seedId(`document:${target}`),
        kind,
        label,
      })),
    )
    .onConflictDoNothing();
  // Keep the planner's statistics current after a bulk load (cheap at this size).
  await db.execute(sql`analyze`);
  return { spaces: SEED_SPACES.length, documents: SEED_DOCUMENTS.length, ownerId: owner.id };
}

/** The seed overwrites rows by id: never against production. */
export function assertSeedAllowed(nodeEnv: string): void {
  if (nodeEnv === 'production') throw new Error('seed is dev only: refusing to run with NODE_ENV=production');
}

async function main(): Promise<void> {
  assertSeedAllowed(process.env.NODE_ENV ?? 'development');
  const config = loadConfig();
  const ownerSub = process.env.SEED_OWNER_SUB?.trim() || 'seed:dat';
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
