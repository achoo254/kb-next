/**
 * Writes of imported content (the Học Cloud importer, src/import/hoc-cloud/): Spaces and Collections by their
 * stable keys, and documents compared by content hash, all in one transaction. An unchanged document is not
 * touched; a changed one gets its row updated, a new `document_versions` row and fresh chunks and wikilinks. The
 * review state an admin may have set (status, hidden, trash) is never overwritten. Callers enqueue the returned ids
 * for search sync once this resolves (the transaction has committed).
 */
import { and, eq, inArray, max } from 'drizzle-orm';
import type { Db } from '../db/client';
import { chunks, collections, documentVersions, documents, links, spaces, users } from '../db/schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface ImportedSpace {
  slug: string;
  nameVi: string;
  nameEn: string;
  tint: string;
  glow: string;
  art: string;
  unitVi: string;
  unitEn: string;
  sortOrder: number;
}

export interface ImportedCollection {
  id: string;
  spaceSlug: string;
  nameVi: string;
  nameEn: string;
  tint: string;
  glow: string;
  art: string | null;
  sortOrder: number;
}

export interface ImportedChunk {
  anchor: string;
  heading: string | null;
  text: string;
}

export interface ImportedDocument {
  id: string;
  lang: 'vi' | 'en';
  translationGroupId: string;
  aiTranslated: boolean;
  spaceSlug: string;
  collectionId: string;
  sortOrder: number;
  title: string;
  type: 'lab' | 'note';
  sourceUrl: string | null;
  markdown: string;
  chunks: readonly ImportedChunk[];
  wikilinks: readonly string[];
  contentHash: string;
}

export interface ImportWriteResult {
  created: string[];
  updated: string[];
  unchanged: number;
  spacesCreated: number;
  collectionsCreated: number;
}

/** The account imported documents are written by: a fixed sub no identity provider issues, so nobody signs in as it. */
export async function ensureSystemAuthor(db: Db, sub: string, name: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ sub, name, createdAt: new Date() })
    .onConflictDoUpdate({ target: users.sub, set: { name } })
    .returning({ id: users.id });
  if (!row) throw new Error('system author upsert returned nothing');
  return row.id;
}

function differs<T extends object>(row: T, wanted: Partial<T>): boolean {
  return Object.entries(wanted).some(([key, value]) => row[key as keyof T] !== value);
}

async function writeSpaces(tx: Tx, wanted: readonly ImportedSpace[]): Promise<{ ids: Map<string, string>; created: number }> {
  const ids = new Map<string, string>();
  let created = 0;
  for (const space of wanted) {
    const values = { ...space, kind: 'public' as const };
    const [existing] = await tx.select().from(spaces).where(eq(spaces.slug, space.slug));
    if (!existing) {
      const [row] = await tx.insert(spaces).values(values).returning({ id: spaces.id });
      if (!row) throw new Error(`space ${space.slug}: insert returned nothing`);
      ids.set(space.slug, row.id);
      created += 1;
      continue;
    }
    if (existing.kind !== 'public') throw new Error(`space ${space.slug} exists and is personal: refusing to import into it`);
    if (differs(existing, values)) await tx.update(spaces).set(values).where(eq(spaces.id, existing.id));
    ids.set(space.slug, existing.id);
  }
  return { ids, created };
}

async function writeCollections(tx: Tx, wanted: readonly ImportedCollection[], spaceIds: ReadonlyMap<string, string>): Promise<number> {
  let created = 0;
  const existing = new Map(
    wanted.length === 0
      ? []
      : (
          await tx
            .select()
            .from(collections)
            .where(
              inArray(
                collections.id,
                wanted.map((c) => c.id),
              ),
            )
        ).map((row) => [row.id, row]),
  );
  for (const { spaceSlug, ...collection } of wanted) {
    const spaceId = spaceIds.get(spaceSlug);
    if (!spaceId) throw new Error(`collection ${collection.id}: unknown space ${spaceSlug}`);
    const values = { ...collection, spaceId };
    const row = existing.get(collection.id);
    if (!row) {
      await tx.insert(collections).values(values);
      created += 1;
    } else if (differs(row, values)) {
      await tx.update(collections).set(values).where(eq(collections.id, collection.id));
    }
  }
  return created;
}

async function replaceChunksAndLinks(tx: Tx, doc: ImportedDocument, existingTargets: ReadonlySet<string>): Promise<void> {
  await tx.delete(chunks).where(eq(chunks.documentId, doc.id));
  if (doc.chunks.length > 0) {
    await tx.insert(chunks).values(doc.chunks.map((chunk, position) => ({ documentId: doc.id, position, ...chunk })));
  }
  await tx.delete(links).where(and(eq(links.sourceId, doc.id), eq(links.kind, 'wikilink')));
  // A target missing from the database (its source vanished before it was ever imported) gets no link yet.
  const targets = doc.wikilinks.filter((id) => existingTargets.has(id));
  if (targets.length > 0) {
    await tx
      .insert(links)
      .values(targets.map((targetId) => ({ sourceId: doc.id, targetId, kind: 'wikilink' as const })))
      .onConflictDoNothing();
  }
}

export async function writeImport(
  db: Db,
  input: { spaces: readonly ImportedSpace[]; collections: readonly ImportedCollection[]; documents: readonly ImportedDocument[]; authorId: string },
): Promise<ImportWriteResult> {
  return db.transaction(async (tx) => {
    const { ids: spaceIds, created: spacesCreated } = await writeSpaces(tx, input.spaces);
    const collectionsCreated = await writeCollections(tx, input.collections, spaceIds);
    const ids = input.documents.map((d) => d.id);
    const stored = new Map(
      ids.length === 0
        ? []
        : (await tx.select({ id: documents.id, contentHash: documents.contentHash }).from(documents).where(inArray(documents.id, ids))).map((r) => [r.id, r.contentHash]),
    );
    const result: ImportWriteResult = { created: [], updated: [], unchanged: 0, spacesCreated, collectionsCreated };
    const changed: ImportedDocument[] = [];
    for (const doc of input.documents) {
      const spaceId = spaceIds.get(doc.spaceSlug);
      if (!spaceId) throw new Error(`document ${doc.id}: unknown space ${doc.spaceSlug}`);
      const fields = {
        spaceId,
        collectionId: doc.collectionId,
        title: doc.title,
        type: doc.type,
        lang: doc.lang,
        translationGroupId: doc.translationGroupId,
        aiTranslated: doc.aiTranslated,
        sourceUrl: doc.sourceUrl,
        contentHash: doc.contentHash,
        sortOrder: doc.sortOrder,
        updatedAt: new Date(),
      };
      if (!stored.has(doc.id)) {
        await tx.insert(documents).values({ id: doc.id, ...fields, origin: 'official', status: 'approved', hidden: false, authorId: input.authorId });
        await tx.insert(documentVersions).values({ documentId: doc.id, version: 1, markdown: doc.markdown, editorId: input.authorId });
        result.created.push(doc.id);
        changed.push(doc);
      } else if (stored.get(doc.id) !== doc.contentHash) {
        await tx.update(documents).set(fields).where(eq(documents.id, doc.id));
        const [latest] = await tx
          .select({ version: max(documentVersions.version) })
          .from(documentVersions)
          .where(eq(documentVersions.documentId, doc.id));
        await tx.insert(documentVersions).values({ documentId: doc.id, version: (latest?.version ?? 0) + 1, markdown: doc.markdown, editorId: input.authorId });
        result.updated.push(doc.id);
        changed.push(doc);
      } else {
        result.unchanged += 1;
      }
    }
    // After every document row exists, so a wikilink may point at a document created later in this run.
    const wanted = [...new Set(changed.flatMap((doc) => doc.wikilinks))];
    const existingTargets = new Set(
      wanted.length === 0 ? [] : (await tx.select({ id: documents.id }).from(documents).where(inArray(documents.id, wanted))).map((r) => r.id),
    );
    for (const doc of changed) await replaceChunksAndLinks(tx, doc, existingTargets);
    return result;
  });
}
