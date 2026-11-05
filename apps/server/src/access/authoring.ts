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
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, max, ne, or } from 'drizzle-orm';
import { type BlockDiff, diffBlocks } from '../authoring/block-diff';
import { ORIGIN_RANK, bestLinkTarget } from '../authoring/link-targets';
import { bodyOf, chunksOf, composeMarkdown, contentHash, foldTitle, linkedTitles } from '../authoring/markdown-text';
import { titleLine } from '../import/hoc-cloud/sections';
import type { Db } from '../db/client';
import { PLANET_COLOURS, chunks, documentVersions, documents, files, links } from '../db/schema';
import { type DocumentRow, documentColumns } from './content';
import { isUuid } from './ids';
import { historyScope } from './history';
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

/** Who `[[ ]]` links of a document are resolved for: its author, never more (an admin's edit links what the author sees). */
function authorViewer(authorId: string): Viewer {
  return { kind: 'user', userId: authorId, isAdmin: false };
}

/**
 * The documents `[[ ]]` titles point at, among those the document's author may read (a link never reaches what its
 * author cannot open): an exact title first (case and diacritics aside), else a title holding the words as a whole,
 * the official, published, same-language and shortest one first. One query for every title, run before the save
 * holds the document's row. A title matching nothing gets no link (yet).
 */
async function resolveLinkTargets(db: Db, authorId: string, titles: readonly string[], self: { id: string | null; lang: DocumentRow['lang'] }): Promise<string[]> {
  const wanted = [...new Set(titles.slice(0, MAX_LINK_TITLES).map((t) => t.trim()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const rows = await db
    .select({ id: documents.id, title: documents.title, origin: documents.origin, status: documents.status, lang: documents.lang })
    .from(documents)
    .where(
      and(
        visibleTo(authorViewer(authorId)),
        self.id ? ne(documents.id, self.id) : undefined,
        or(...wanted.map((title) => ilike(documents.title, `%${escapeLike(title)}%`))),
      ),
    )
    .orderBy(asc(documents.createdAt))
    .limit(LINK_CANDIDATES * wanted.length);
  const targets = new Set<string>();
  for (const title of wanted) {
    const best = bestLinkTarget(title, rows, self.lang);
    if (best) targets.add(best.id);
  }
  return [...targets];
}

/** Rows per insert of chunks (Postgres takes at most 65 535 parameters a statement). */
const CHUNK_BATCH = 1_000;

/** The chunks and `[[ ]]` links of a document, rebuilt from its Markdown; `targets` from resolveLinkTargets. */
async function writeDerived(tx: Tx, doc: Pick<DocumentRow, 'id' | 'lang'>, markdown: string, targets: readonly string[]): Promise<void> {
  await tx.delete(chunks).where(eq(chunks.documentId, doc.id));
  const parts = chunksOf(markdown, doc.lang).map((chunk, position) => ({ documentId: doc.id, position, ...chunk }));
  for (let start = 0; start < parts.length; start += CHUNK_BATCH) await tx.insert(chunks).values(parts.slice(start, start + CHUNK_BATCH));
  await tx.delete(links).where(and(eq(links.sourceId, doc.id), eq(links.kind, 'wikilink')));
  const live = targets.filter((target) => target !== doc.id);
  if (live.length > 0) {
    await tx
      .insert(links)
      .values(live.map((targetId) => ({ sourceId: doc.id, targetId, kind: 'wikilink' as const })))
      .onConflictDoNothing();
  }
}

export interface NewDocument {
  spaceId: string;
  collectionId: string | null;
  title: string;
  body: string;
  type: WritableType | 'lab';
  lang: 'vi' | 'en';
  planet: Planet | null;
}

/**
 * An official text published at once through the admin API: approved (hidden when asked), its version 1 marked as
 * sent through the API and, when `aiMade`, written by AI.
 */
export interface Publication {
  hidden: boolean;
  tags: readonly string[];
  aiMade: boolean;
}

/**
 * A new document of `author` with its version 1: a draft (origin `own`, status `draft`: only its author and admins
 * see it), or, given a `publication` (admins only; the caller checks), an approved official text.
 */
export async function createDocument(db: Db, author: UserViewer, input: NewDocument, now: Date, publication: Publication | null = null): Promise<{ id: string; rev: Date }> {
  const markdown = composeMarkdown(input.title, input.body);
  const targets = await resolveLinkTargets(db, author.userId, linkedTitles(markdown), { id: null, lang: input.lang });
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(documents)
      .values({
        spaceId: input.spaceId,
        collectionId: input.collectionId,
        title: input.title.trim(),
        type: input.type,
        lang: input.lang,
        origin: publication ? 'official' : 'own',
        status: publication ? 'approved' : 'draft',
        hidden: publication?.hidden ?? false,
        tags: publication ? [...publication.tags] : [],
        authorId: author.userId,
        contentHash: contentHash(markdown),
        planet: input.planet,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: documents.id, lang: documents.lang, updatedAt: documents.updatedAt });
    if (!row) throw new Error('document insert returned nothing');
    await tx.insert(documentVersions).values({
      documentId: row.id,
      version: 1,
      markdown,
      editorId: author.userId,
      via: publication ? 'api' : 'editor',
      aiMade: publication?.aiMade ?? false,
      createdAt: now,
      updatedAt: now,
    });
    await writeDerived(tx, row, markdown, targets);
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
  const markdown = composeMarkdown(input.title, input.body);
  // The author and language never change: the links are found before the save takes the document's row.
  const [owner] = await db.select({ authorId: documents.authorId, lang: documents.lang }).from(documents).where(eq(documents.id, id));
  if (!owner) return { kind: 'not-found' };
  const targets = await resolveLinkTargets(db, owner.authorId, linkedTitles(markdown), { id, lang: owner.lang });
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
    await writeDerived(tx, doc, markdown, targets);
    return { kind: 'saved', rev: row?.updatedAt ?? now, version, changed: true };
  });
}

export interface StoredVersion {
  version: number;
  markdown: string | null;
}

/**
 * One version of a document the viewer may read; null when either is missing. A reader who is neither the author
 * nor an admin reads only the current version (history.ts, `historyScope`): earlier drafts stay with their author.
 */
export async function findVersion(db: Db, viewer: Viewer, documentId: string, version: number): Promise<(StoredVersion & { editorId: string; updatedAt: Date }) | null> {
  if (!isUuid(documentId) || !Number.isInteger(version) || version < 1) return null;
  const [doc] = await db
    .select({ authorId: documents.authorId })
    .from(documents)
    .where(and(eq(documents.id, documentId), visibleTo(viewer)));
  if (!doc) return null;
  if (historyScope(viewer, doc) === 'public') {
    const [latest] = await db.select({ version: max(documentVersions.version) }).from(documentVersions).where(eq(documentVersions.documentId, documentId));
    if (latest?.version !== version) return null;
  }
  const [row] = await db
    .select({ version: documentVersions.version, markdown: documentVersions.markdown, editorId: documentVersions.editorId, updatedAt: documentVersions.updatedAt })
    .from(documentVersions)
    .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.version, version)));
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

/**
 * Moves a document to the trash, recording who did. An admin may delete any document; its author any of theirs that
 * is not published (a published text leaves the Universe through an admin). The search sync then drops it.
 */
export async function trashDocument(db: Db, viewer: Viewer, id: string, now: Date): Promise<TrashResult> {
  const access = await documentAccess(db, viewer, id);
  if (access.kind === 'not-found') return 'not-found';
  if (access.kind !== 'ok' || viewer.kind !== 'user') return 'no-access';
  const own = access.doc.authorId === viewer.userId && access.doc.status !== 'approved';
  if (!viewer.isAdmin && !own) return 'no-access';
  await db.update(documents).set({ deletedAt: now, deletedBy: viewer.userId }).where(and(eq(documents.id, id), isNull(documents.deletedAt)));
  return 'ok';
}

/**
 * Takes a document out of the trash: whoever deleted it (its author for their own deletions), or an admin. What an
 * admin deleted, its author cannot bring back. `not-found` when it is not in the viewer's reach.
 */
export async function restoreFromTrash(db: Db, viewer: Viewer, id: string): Promise<TrashResult> {
  if (viewer.kind !== 'user' || !isUuid(id)) return 'not-found';
  const [doc] = await db
    .select({ deletedBy: documents.deletedBy })
    .from(documents)
    .where(and(eq(documents.id, id), isNotNull(documents.deletedAt)));
  // Someone else's trash reads as nothing there: it does not reveal that the document exists.
  if (!doc || (!viewer.isAdmin && doc.deletedBy !== viewer.userId)) return 'not-found';
  await db.update(documents).set({ deletedAt: null, deletedBy: null }).where(eq(documents.id, id));
  return 'ok';
}

export interface PurgeResult {
  /** Documents deleted for good, for the search sync to drop. */
  documentIds: string[];
  /** Disk names of their stored files (Office), whose rows went with them: the caller removes the files. */
  storageKeys: string[];
}

/**
 * Deletes for good the documents in the trash for TRASH_DAYS or more: their versions, chunks, links and favourites
 * go with them (cascade), and so do the rows of their stored files, whose disk names come back for the caller to
 * unlink. Run by the server's daily housekeeping.
 */
export async function purgeTrash(db: Db, now: Date): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * DAY_MS);
  return purgeWhere(db, and(isNotNull(documents.deletedAt), lt(documents.deletedAt, cutoff)));
}

/**
 * Deletes for good, before the 30 days are up, what the account itself put in the trash (C08 "Xoá vĩnh viễn" of one
 * document, or "Dọn thùng rác" with `id` null): the same rows as the trash list (src/access/my-content.ts), never
 * anyone else's. An unknown id, or one not in this account's trash, deletes nothing.
 */
export async function purgeOwnTrash(db: Db, viewer: UserViewer, id: string | null): Promise<PurgeResult> {
  if (id !== null && !isUuid(id)) return { documentIds: [], storageKeys: [] };
  return purgeWhere(db, and(isNotNull(documents.deletedAt), eq(documents.deletedBy, viewer.userId), id === null ? undefined : eq(documents.id, id)));
}

async function purgeWhere(db: Db, condition: ReturnType<typeof and>): Promise<PurgeResult> {
  return db.transaction(async (tx) => {
    const doomed = tx.select({ id: documents.id }).from(documents).where(condition);
    const fileRows = await tx.select({ id: files.id, storageKey: files.storageKey }).from(files).where(inArray(files.documentId, doomed));
    const rows = await tx.delete(documents).where(condition).returning({ id: documents.id });
    // After the documents: their versions (which may point at these files) are gone by then.
    if (fileRows.length > 0)
      await tx.delete(files).where(
        inArray(
          files.id,
          fileRows.map((f) => f.id),
        ),
      );
    return { documentIds: rows.map((r) => r.id), storageKeys: fileRows.map((f) => f.storageKey) };
  });
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
