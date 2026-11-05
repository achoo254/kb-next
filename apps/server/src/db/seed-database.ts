/**
 * Fills a database with the mock's data (seed-data.ts): the CLI `pnpm seed` (seed.ts) and the server's KB_SEED=mock
 * startup (E2E) use it. Ids are derived from the seed keys, so running it again updates the same rows instead of
 * adding copies. No CLI code here: the production bundle imports this module.
 */
import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './client';
import { HIDE_ACTION, SHOW_ACTION } from '../access/history';
import { auditLog, canvases, chunks, collections, comments, documentVersions, documents, links, readingProgress, reviewEvents, spaces, users } from './schema';
import {
  SEED_CANVAS,
  SEED_COMMENTS,
  SEED_DOCUMENTS,
  SEED_FIRST_CREATED,
  SEED_HISTORY,
  SEED_LATEST_UPDATE,
  SEED_LINKS,
  SEED_PROGRESS,
  SEED_RECENT_FIRST,
  SEED_SPACES,
  SEED_USERS,
  type SeedAuthor,
  type SeedDocument,
  type SeedVersion,
} from './seed-data';

const TEN_MINUTES = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** A document's Markdown from its title and its chunks; the overview has no heading line. */
function documentMarkdown(doc: SeedDocument, chunkList: SeedDocument['chunks'] = doc.chunks): string {
  const sections = chunkList.map(([, heading, text]) => (heading === null ? text : `## ${heading}\n\n${text}`));
  return [`# ${doc.title}`, ...sections].join('\n\n');
}

/** The Markdown of an earlier version: the chunks it had (by anchor), some with the text they had then. */
function versionMarkdown(doc: SeedDocument, version: SeedVersion): string {
  if (version.sections === null) return documentMarkdown(doc);
  const chunkList = version.sections.map((section): SeedDocument['chunks'][number] => {
    const [anchor, text] = typeof section === 'string' ? [section, null] : section;
    const chunk = doc.chunks.find(([a]) => a === anchor);
    if (!chunk) throw new Error(`seed version of ${doc.key}: no chunk ${anchor}`);
    return [chunk[0], chunk[1], text ?? chunk[2]];
  });
  return documentMarkdown(doc, chunkList);
}

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
      descriptionVi: space.description.vi,
      descriptionEn: space.description.en,
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
    const markdown = documentMarkdown(doc);
    const createdAt = doc.at ? new Date(doc.at) : new Date(SEED_FIRST_CREATED.getTime() + order * HOUR);
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
      createdAt,
      updatedAt: doc.at ? createdAt : updatedAt(doc.key),
      deletedAt: null,
      planet: doc.planet ?? null,
    };
    await db.insert(documents).values(values).onConflictDoUpdate({ target: documents.id, set: values });
    // Version 1 by the author when it was written; a document with history (SEED_HISTORY) has its versions as listed.
    const history = SEED_HISTORY.find((h) => h.key === doc.key);
    const editions: Array<{ editorId: string; at: Date; via: 'editor' | 'api'; aiMade: boolean; summary: string | null; markdown: string }> = history
      ? history.versions.map((v) => ({ editorId: userId(v.editor), at: new Date(v.at), via: v.via, aiMade: v.aiMade, summary: v.summary, markdown: versionMarkdown(doc, v) }))
      : [{ editorId: values.authorId, at: createdAt, via: 'editor', aiMade: false, summary: null, markdown }];
    for (const [index, edition] of editions.entries()) {
      const number = index + 1;
      const version = {
        id: seedId(`version:${doc.key}:${number}`),
        documentId: id,
        version: number,
        markdown: edition.markdown,
        editorId: edition.editorId,
        via: edition.via,
        aiMade: edition.aiMade,
        summary: edition.summary,
        restoredFrom: null,
        createdAt: edition.at,
        updatedAt: edition.at,
      };
      await db.insert(documentVersions).values(version).onConflictDoUpdate({ target: documentVersions.id, set: version });
    }
    // The review trail and visibility changes are the listed ones only (an older seed wrote others).
    if (history) {
      await db.delete(reviewEvents).where(eq(reviewEvents.documentId, id));
      await db.delete(auditLog).where(and(eq(auditLog.targetType, 'document'), eq(auditLog.targetId, id)));
    }
    for (const [index, step] of (history?.reviews ?? []).entries()) {
      const review = { id: seedId(`review:${doc.key}:${index}`), documentId: id, actorId: userId(step.by), action: step.action, reason: step.reason, createdAt: new Date(step.at) };
      await db.insert(reviewEvents).values(review).onConflictDoUpdate({ target: reviewEvents.id, set: review });
    }
    for (const [index, change] of (history?.visibility ?? []).entries()) {
      const entry = {
        id: seedId(`audit:${doc.key}:visibility:${index}`),
        actorId: userId(change.by),
        action: change.hidden ? HIDE_ACTION : SHOW_ACTION,
        targetType: 'document',
        targetId: id,
        createdAt: new Date(change.at),
      };
      await db.insert(auditLog).values(entry).onConflictDoUpdate({ target: auditLog.id, set: entry });
    }
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
      SEED_LINKS.map(([source, target, kind, label], order) => ({
        sourceId: seedId(`document:${source}`),
        targetId: seedId(`document:${target}`),
        kind,
        label,
        // A second apart in list order: the order links are listed in (C11's backlinks, C13's neighbours).
        createdAt: new Date(SEED_FIRST_CREATED.getTime() + order * 1000),
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
  const canvas = {
    id: seedId(`canvas:${SEED_CANVAS.key}`),
    ownerId: owner.id,
    title: SEED_CANVAS.title,
    data: {
      spaceId: seedId(`space:${SEED_CANVAS.space}`),
      canvas: {
        rev: 0,
        cards: SEED_CANVAS.cards.map(({ doc, ...card }) => (doc ? { ...card, documentId: seedId(`document:${doc}`) } : card)),
        connections: SEED_CANVAS.connections.map(([from, to]) => ({ id: `${from}-${to}`, from, to })),
      },
    },
    createdAt: SEED_LATEST_UPDATE,
    updatedAt: SEED_LATEST_UPDATE,
  };
  await db.insert(canvases).values(canvas).onConflictDoUpdate({ target: canvases.id, set: canvas });
  // Keep the planner's statistics current after a bulk load (cheap at this size).
  await db.execute(sql`analyze`);
  return { spaces: SEED_SPACES.length, documents: SEED_DOCUMENTS.length, ownerId: owner.id };
}

/** The seed overwrites rows by id: never against production. */
export function assertSeedAllowed(nodeEnv: string): void {
  if (nodeEnv === 'production') throw new Error('seed is dev only: refusing to run with NODE_ENV=production');
}
