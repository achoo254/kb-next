/**
 * Writing documents (C02, C17, C08): who may edit, creating a draft, saving (versions, chunks, `[[ ]]` links),
 * restoring an earlier version, the trash and its purge. Every write here is checked against the read rule
 * (src/access/visibility.ts) first: nobody edits, restores or deletes a document they may not read, and only its
 * author (or an admin) ever does. Callers enqueue the returned ids for search sync once the write resolves.
 *
 * A document may be edited by an admin, or by its author while it is theirs to change: a draft, a private text, one
 * sent back (`changes_requested`, `rejected`). A text waiting for review (`pending`) or published (`approved`) is
 * `locked` for its author: changing it goes through review (phase 11).
 */
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import { type BlockDiff, diffBlocks } from '../authoring/block-diff';
import { bodyOf, chunksOf, composeMarkdown, contentHash, foldTitle, linkedTitles } from '../authoring/markdown-text';
import { titleLine } from '../import/hoc-cloud/sections';
import type { Db } from '../db/client';
import { PLANET_COLOURS, chunks, documentVersions, documents, links } from '../db/schema';
import { type DocumentRow, documentColumns } from './content';
import { isUuid } from './ids';
import { documentAccess } from './reading';
import type { Viewer } from './viewer';
import { visibleTo } from './visibility';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Planet = (typeof PLANET_COLOURS)[number];
export type WritableType = 'note' | 'process';
type UserViewer = Extract<Viewer, { kind: 'user' }>;

export function isPlanet(value: string | null): value is Planet {
  return (PLANET_COLOURS as readonly (string | null)[]).includes(value);
}

/** Saves by the same editor within this long of a version's first save update that version (C17's granularity). */
export const MERGE_WINDOW_MS = 2 * 60 * 1000;
/** Days a document stays in the trash before it is deleted for good (C08 "tự xoá sau 30 ngày"). */
export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Titles of `[[ ]]` links resolved per save, and candidates read per title. */
const MAX_LINK_TITLES = 100;
const LINK_CANDIDATES = 20;

const LOCKED_STATUSES: ReadonlySet<DocumentRow['status']> = new Set(['pending', 'approved']);

export type EditRight = 'ok' | 'no-access' | 'locked';

/** Whether `viewer` may change `doc` (see the module comment). Trash and readability are checked by the caller. */
export function editRight(viewer: Viewer, doc: Pick<DocumentRow, 'authorId' | 'status'>): EditRight {
  if (viewer.kind !== 'user') return 'no-access';
  if (viewer.isAdmin) return 'ok';
  if (doc.authorId !== viewer.userId) return 'no-access';
  return LOCKED_STATUSES.has(doc.status) ? 'locked' : 'ok';
}

export interface LatestVersion {
  version: number;
  markdown: string;
  updatedAt: Date;
}

export type EditAccess =
  | { kind: 'ok'; doc: DocumentRow; latest: LatestVersion }
  | { kind: 'not-found' }
  | { kind: 'hidden' }
  | { kind: 'no-access' }
  | { kind: 'locked'; doc: DocumentRow }
  /** A stored file (Office), not Markdown: the editor cannot open it. */
  | { kind: 'not-editable' };

async function latestVersion(db: Db | Tx, documentId: string): Promise<(LatestVersion & { id: string; editorId: string; via: string; restoredFrom: number | null; createdAt: Date; fileId: string | null; markdownOrNull: string | null }) | null> {
  const [row] = await db
    .select({
      id: documentVersions.id,
      version: documentVersions.version,
      markdown: documentVersions.markdown,
      fileId: documentVersions.fileId,
      editorId: documentVersions.editorId,
      via: documentVersions.via,
      restoredFrom: documentVersions.restoredFrom,
      createdAt: documentVersions.createdAt,
      updatedAt: documentVersions.updatedAt,
    })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.version))
    .limit(1);
  return row ? { ...row, markdownOrNull: row.markdown, markdown: row.markdown ?? '' } : null;
}

/** The document of the editor (C02), when `viewer` may open and change it. */
export async function editAccess(db: Db, viewer: Viewer, id: string): Promise<EditAccess> {
  const access = await documentAccess(db, viewer, id);
  if (access.kind !== 'ok') return access;
  const right = editRight(viewer, access.doc);
  if (right === 'no-access') return { kind: 'no-access' };
  if (right === 'locked') return { kind: 'locked', doc: access.doc };
  const latest = await latestVersion(db, id);
  if (access.doc.type === 'office' || (latest !== null && latest.markdownOrNull === null)) return { kind: 'not-editable' };
  return { kind: 'ok', doc: access.doc, latest: latest ?? { version: 0, markdown: '', updatedAt: access.doc.updatedAt } };
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const ORIGIN_RANK: Record<DocumentRow['origin'], number> = { official: 0, community: 1, own: 2 };

/**
 * The documents `[[ ]]` titles point at, among those the writer may read (a link never reaches what its writer
 * cannot open): an exact title first (case and diacritics aside), else a title holding the words as a whole, the
 * official, published, same-language and shortest one first. A title matching nothing gets no link (yet).
 */
async function resolveLinkTargets(tx: Tx, writer: Viewer, titles: readonly string[], self: Pick<DocumentRow, 'id' | 'lang'>): Promise<string[]> {
  const wanted = titles.slice(0, MAX_LINK_TITLES).filter((t) => t.trim().length > 0);
  if (wanted.length === 0) return [];
  const targets = new Set<string>();
  for (const title of wanted) {
    const rows = await tx
      .select({ id: documents.id, title: documents.title, origin: documents.origin, status: documents.status, lang: documents.lang, createdAt: documents.createdAt })
      .from(documents)
      .where(and(visibleTo(writer), ne(documents.id, self.id), ilike(documents.title, `%${escapeLike(title.trim())}%`)))
      .orderBy(asc(documents.createdAt))
      .limit(LINK_CANDIDATES);
    const folded = foldTitle(title);
    const word = new RegExp(`(^|[^\\p{L}\\p{N}])${folded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u');
    const ranked = rows
      .map((row) => ({ row, fold: foldTitle(row.title) }))
      .filter(({ fold }) => fold === folded || word.test(fold))
      .sort(
        (a, b) =>
          Number(b.fold === folded) - Number(a.fold === folded) ||
          ORIGIN_RANK[a.row.origin] - ORIGIN_RANK[b.row.origin] ||
          Number(b.row.status === 'approved') - Number(a.row.status === 'approved') ||
          Number(b.row.lang === self.lang) - Number(a.row.lang === self.lang) ||
          a.row.title.length - b.row.title.length,
      );
    const best = ranked[0];
    if (best) targets.add(best.row.id);
  }
  return [...targets];
}

/** The chunks and `[[ ]]` links of a document, rebuilt from its Markdown. */
async function writeDerived(tx: Tx, writer: Viewer, doc: Pick<DocumentRow, 'id' | 'lang'>, markdown: string): Promise<void> {
  await tx.delete(chunks).where(eq(chunks.documentId, doc.id));
  const parts = chunksOf(markdown, doc.lang);
  if (parts.length > 0) await tx.insert(chunks).values(parts.map((chunk, position) => ({ documentId: doc.id, position, ...chunk })));
  await tx.delete(links).where(and(eq(links.sourceId, doc.id), eq(links.kind, 'wikilink')));
  const targets = await resolveLinkTargets(tx, writer, linkedTitles(markdown), doc);
  if (targets.length > 0) {
    await tx
      .insert(links)
      .values(targets.map((targetId) => ({ sourceId: doc.id, targetId, kind: 'wikilink' as const })))
      .onConflictDoNothing();
  }
}

export interface NewDocument {
  spaceId: string;
  collectionId: string | null;
  title: string;
  body: string;
  type: WritableType;
  lang: 'vi' | 'en';
  planet: Planet | null;
}

/** A new draft of `author` (origin `own`, status `draft`: only its author and admins see it), with its version 1. */
export async function createDocument(db: Db, author: UserViewer, input: NewDocument, now: Date): Promise<{ id: string; rev: Date }> {
  return db.transaction(async (tx) => {
    const markdown = composeMarkdown(input.title, input.body);
    const [row] = await tx
      .insert(documents)
      .values({
        spaceId: input.spaceId,
        collectionId: input.collectionId,
        title: input.title.trim(),
        type: input.type,
        lang: input.lang,
        origin: 'own',
        status: 'draft',
        authorId: author.userId,
        contentHash: contentHash(markdown),
        planet: input.planet,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: documents.id, lang: documents.lang, updatedAt: documents.updatedAt });
    if (!row) throw new Error('document insert returned nothing');
    await tx.insert(documentVersions).values({ documentId: row.id, version: 1, markdown, editorId: author.userId, via: 'editor', createdAt: now, updatedAt: now });
    await writeDerived(tx, author, row, markdown);
    return { id: row.id, rev: row.updatedAt };
  });
}

export interface SaveInput {
  title: string;
  body: string;
  /** Left as it is when undefined. */
  planet?: Planet | null;
  /** The `updatedAt` the writer's copy started from; another save since then makes this one `stale`. */
  baseRev?: Date;
  /** `restore`: copying version `restoredFrom` (never merged into the latest version). */
  restoredFrom?: number;
  summary?: string | null;
}

export type SaveResult =
  | { kind: 'saved'; rev: Date; version: number; changed: boolean }
  | { kind: 'stale'; rev: Date }
  | { kind: 'not-found' }
  | { kind: 'no-access' }
  | { kind: 'locked' }
  | { kind: 'not-editable' };

/**
 * Saves the title and body of a document `writer` may edit, as one transaction holding the document's row: a new
 * version, or the latest one updated when it is the writer's own editor save started less than MERGE_WINDOW_MS ago;
 * then its chunks and `[[ ]]` links. Saving what is already stored changes nothing (only the planet, if given).
 */
export async function saveDocument(db: Db, writer: Viewer, id: string, input: SaveInput, now: Date): Promise<SaveResult> {
  if (writer.kind !== 'user' || !isUuid(id)) return { kind: 'not-found' };
  return db.transaction(async (tx): Promise<SaveResult> => {
    const [doc] = await tx.select(documentColumns).from(documents).where(eq(documents.id, id)).for('update');
    if (!doc || doc.deletedAt !== null) return { kind: 'not-found' };
    const access = await documentAccess(tx, writer, id);
    if (access.kind !== 'ok') return { kind: access.kind === 'hidden' ? 'no-access' : access.kind };
    const right = editRight(writer, doc);
    if (right !== 'ok') return { kind: right };
    if (input.baseRev && input.baseRev.getTime() !== doc.updatedAt.getTime()) return { kind: 'stale', rev: doc.updatedAt };
    const latest = await latestVersion(tx, id);
    if (doc.type === 'office' || (latest !== null && latest.markdownOrNull === null)) return { kind: 'not-editable' };

    const markdown = composeMarkdown(input.title, input.body);
    const planet = input.planet === undefined ? doc.planet : input.planet;
    const sameText = latest !== null && latest.markdown === markdown && doc.title === input.title.trim();
    if (sameText && input.restoredFrom === undefined) {
      if (planet === doc.planet) return { kind: 'saved', rev: doc.updatedAt, version: latest.version, changed: false };
      const [row] = await tx.update(documents).set({ planet, updatedAt: now }).where(eq(documents.id, id)).returning({ updatedAt: documents.updatedAt });
      return { kind: 'saved', rev: row?.updatedAt ?? now, version: latest.version, changed: false };
    }

    const via = input.restoredFrom === undefined ? 'editor' : 'restore';
    const merge =
      via === 'editor' &&
      latest !== null &&
      latest.via === 'editor' &&
      latest.restoredFrom === null &&
      latest.editorId === writer.userId &&
      now.getTime() - latest.createdAt.getTime() < MERGE_WINDOW_MS;
    let version: number;
    if (merge) {
      version = latest.version;
      await tx.update(documentVersions).set({ markdown, updatedAt: now }).where(eq(documentVersions.id, latest.id));
    } else {
      version = (latest?.version ?? 0) + 1;
      await tx.insert(documentVersions).values({
        documentId: id,
        version,
        markdown,
        editorId: writer.userId,
        via,
        restoredFrom: input.restoredFrom ?? null,
        summary: input.summary ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
    const [row] = await tx
      .update(documents)
      .set({ title: input.title.trim(), contentHash: contentHash(markdown), planet, updatedAt: now })
      .where(eq(documents.id, id))
      .returning({ updatedAt: documents.updatedAt });
    await writeDerived(tx, writer, doc, markdown);
    return { kind: 'saved', rev: row?.updatedAt ?? now, version, changed: true };
  });
}

export interface StoredVersion {
  version: number;
  markdown: string | null;
}

/** One version of a document the viewer may read; null when either is missing. */
export async function findVersion(db: Db, viewer: Viewer, documentId: string, version: number): Promise<(StoredVersion & { editorId: string; updatedAt: Date }) | null> {
  if (!isUuid(documentId) || !Number.isInteger(version) || version < 1) return null;
  const [row] = await db
    .select({ version: documentVersions.version, markdown: documentVersions.markdown, editorId: documentVersions.editorId, updatedAt: documentVersions.updatedAt })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.version, version), visibleTo(viewer)));
  return row ?? null;
}

/** The difference between two versions of a readable document (C17); null when either is missing. */
export async function diffVersions(db: Db, viewer: Viewer, documentId: string, from: number, to: number): Promise<BlockDiff | null> {
  const [before, after] = await Promise.all([findVersion(db, viewer, documentId, from), findVersion(db, viewer, documentId, to)]);
  if (!before || !after) return null;
  return diffBlocks(before.markdown ?? '', after.markdown ?? '');
}

/**
 * Restores version `version` as a new version (C17 "Khôi phục"): the current text stays in the history. Same rights
 * as saving; `not-found` also when the version does not exist.
 */
export async function restoreVersion(db: Db, writer: Viewer, id: string, version: number, now: Date): Promise<SaveResult> {
  const source = await findVersion(db, writer, id, version);
  if (!source) return { kind: 'not-found' };
  if (source.markdown === null) return { kind: 'not-editable' };
  // The title of a restored version is its own `#` line (the document had that title then); without one, no title.
  const title = titleLine(source.markdown)?.replace(/^#\s+/, '').trim() ?? '';
  return saveDocument(db, writer, id, { title, body: bodyOf(source.markdown), restoredFrom: version }, now);
}

export type TrashResult = 'ok' | 'not-found' | 'no-access';

/** Moves a document to its author's trash (author or admin). The search sync then drops it from the indexes. */
export async function trashDocument(db: Db, viewer: Viewer, id: string, now: Date): Promise<TrashResult> {
  const access = await documentAccess(db, viewer, id);
  if (access.kind === 'not-found') return 'not-found';
  if (access.kind !== 'ok' || viewer.kind !== 'user' || (!viewer.isAdmin && access.doc.authorId !== viewer.userId)) return 'no-access';
  await db.update(documents).set({ deletedAt: now }).where(and(eq(documents.id, id), isNull(documents.deletedAt)));
  return 'ok';
}

/** Takes a document out of the trash (its author, or an admin); `not-found` when it is not in the trash. */
export async function restoreFromTrash(db: Db, viewer: Viewer, id: string): Promise<TrashResult> {
  if (viewer.kind !== 'user' || !isUuid(id)) return 'not-found';
  const [doc] = await db
    .select({ authorId: documents.authorId })
    .from(documents)
    .where(and(eq(documents.id, id), isNotNull(documents.deletedAt)));
  // Someone else's trash reads as nothing there: it does not reveal that the document exists.
  if (!doc || (!viewer.isAdmin && doc.authorId !== viewer.userId)) return 'not-found';
  await db.update(documents).set({ deletedAt: null }).where(eq(documents.id, id));
  return 'ok';
}

/**
 * Deletes for good the documents in the trash for TRASH_DAYS or more (their versions, chunks, links, favourites go
 * with them); returns their ids, for the search sync to drop. Run by the server's daily housekeeping.
 */
export async function purgeTrash(db: Db, now: Date): Promise<string[]> {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * DAY_MS);
  const rows = await db
    .delete(documents)
    .where(and(isNotNull(documents.deletedAt), lt(documents.deletedAt, cutoff)))
    .returning({ id: documents.id });
  return rows.map((r) => r.id);
}

export interface LinkCandidate {
  id: string;
  title: string;
  type: DocumentRow['type'];
  origin: DocumentRow['origin'];
  status: DocumentRow['status'];
  spaceId: string;
}

/**
 * Documents the viewer may read whose title holds `query` (the editor's `[[` list): the exact title, then official,
 * community and own texts, a title starting with the query first, then the latest changed; `exclude`: itself.
 */
export async function suggestLinkTargets(db: Db, viewer: Viewer, query: string, limit: number, exclude: string | null): Promise<LinkCandidate[]> {
  const term = query.trim();
  const rows = await db
    .select({ id: documents.id, title: documents.title, type: documents.type, origin: documents.origin, status: documents.status, spaceId: documents.spaceId, updatedAt: documents.updatedAt })
    .from(documents)
    .where(and(visibleTo(viewer), exclude && isUuid(exclude) ? ne(documents.id, exclude) : undefined, term ? ilike(documents.title, `%${escapeLike(term)}%`) : undefined))
    .orderBy(desc(documents.updatedAt))
    .limit(limit * 4);
  const folded = foldTitle(term);
  return rows
    .map((row, order) => ({ row, order, fold: foldTitle(row.title) }))
    .sort(
      (a, b) =>
        Number(b.fold === folded) - Number(a.fold === folded) ||
        ORIGIN_RANK[a.row.origin] - ORIGIN_RANK[b.row.origin] ||
        Number(b.fold.startsWith(folded)) - Number(a.fold.startsWith(folded)) ||
        a.order - b.order,
    )
    .slice(0, limit)
    .map(({ row: { updatedAt: _updatedAt, ...candidate } }) => candidate);
}

/** Readable documents linking to `id` and linked from it with `[[ ]]` or a relation (the editor's Liên kết tab). */
export async function linkedDocumentIds(db: Db, viewer: Viewer, id: string): Promise<{ backlinks: string[]; outgoing: string[] }> {
  if (!isUuid(id)) return { backlinks: [], outgoing: [] };
  const readable = db.select({ id: documents.id }).from(documents).where(visibleTo(viewer));
  const rows = await db
    .select({ sourceId: links.sourceId, targetId: links.targetId })
    .from(links)
    .where(and(or(eq(links.sourceId, id), eq(links.targetId, id)), inArray(links.sourceId, readable), inArray(links.targetId, readable)))
    .orderBy(asc(links.createdAt));
  const unique = (ids: string[]): string[] => [...new Set(ids)].filter((other) => other !== id);
  return {
    backlinks: unique(rows.filter((r) => r.targetId === id).map((r) => r.sourceId)),
    outgoing: unique(rows.filter((r) => r.sourceId === id).map((r) => r.targetId)),
  };
}
