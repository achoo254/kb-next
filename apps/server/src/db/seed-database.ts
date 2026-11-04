/**
 * Fills a database with the mock's data (seed-data.ts): the CLI `pnpm seed` (seed.ts) and the server's KB_SEED=mock
 * startup (E2E) use it. Ids are derived from the seed keys, so running it again updates the same rows instead of
 * adding copies. No CLI code here: the production bundle imports this module.
 */
import { createHash } from 'node:crypto';
import { inArray, sql } from 'drizzle-orm';
import type { Db } from './client';
import { chunks, collections, comments, documentVersions, documents, links, readingProgress, spaces, users } from './schema';
import {
  SEED_COMMENTS,
  SEED_DOCUMENTS,
  SEED_LATEST_UPDATE,
  SEED_LINKS,
  SEED_PROGRESS,
  SEED_RECENT_FIRST,
  SEED_SPACES,
  SEED_USERS,
  type SeedAuthor,
} from './seed-data';

const TEN_MINUTES = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** The seed documents' keys, most recently updated first (see SEED_RECENT_FIRST). */
function recencyOrder(): string[] {
  return [...SEED_RECENT_FIRST, ...SEED_DOCUMENTS.map((d) => d.key).filter((key) => !SEED_RECENT_FIRST.includes(key))];
}

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
  const recency = recencyOrder();
  const updatedAt = (key: string): Date => new Date(SEED_LATEST_UPDATE.getTime() - recency.indexOf(key) * TEN_MINUTES);
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
      updatedAt: updatedAt(doc.key),
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
  for (const [key, progress, anchor] of SEED_PROGRESS) {
    const row = { userId: owner.id, documentId: seedId(`document:${key}`), progress, anchor, updatedAt: SEED_LATEST_UPDATE };
    await db.insert(readingProgress).values(row).onConflictDoUpdate({ target: [readingProgress.userId, readingProgress.documentId], set: row });
  }
  for (const [key, documentKey, author, hoursBefore, body] of SEED_COMMENTS) {
    const at = new Date(SEED_LATEST_UPDATE.getTime() - hoursBefore * HOUR);
    const row = { id: seedId(`comment:${key}`), documentId: seedId(`document:${documentKey}`), authorId: userId(author), body, createdAt: at, updatedAt: at, deletedAt: null };
    await db.insert(comments).values(row).onConflictDoUpdate({ target: comments.id, set: row });
  }
  // Keep the planner's statistics current after a bulk load (cheap at this size).
  await db.execute(sql`analyze`);
  return { spaces: SEED_SPACES.length, documents: SEED_DOCUMENTS.length, ownerId: owner.id };
}

/** The seed overwrites rows by id: never against production. */
export function assertSeedAllowed(nodeEnv: string): void {
  if (nodeEnv === 'production') throw new Error('seed is dev only: refusing to run with NODE_ENV=production');
}
