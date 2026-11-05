/**
 * Reads and writes behind the knowledge graph (C13): the documents around a Space (its own, then whatever they link
 * to, hop by hop), the links between them, the first passage of each, and the user-made "related" edges. Every
 * document read is filtered by the viewer (src/access/visibility.ts), and a link shows only when the viewer may read
 * both its ends, like the rest of src/access/.
 */
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { chunks, documents, links } from '../db/schema';
import { type DocumentRow, type LinkRow, documentColumns } from './content';
import { isUuid } from './ids';
import type { Viewer } from './viewer';
import { visibleTo } from './visibility';

/** At most this many documents in one graph: the Space's own first, then the nearest linked ones. */
export const MAX_GRAPH_DOCUMENTS = 300;
/** Hops followed from the Space's documents (the board reaches Docker Compose four links away from Networking). */
const MAX_HOPS = 6;
/** Characters of the first passage kept per document (the node panel shows one line of it). */
const PASSAGE_CHARS = 400;

export interface GraphDocuments {
  documents: DocumentRow[];
  links: LinkRow[];
}

/** Links touching any of `ids` whose two ends the viewer may read, oldest first. */
async function readableLinksTouching(db: Db, viewer: Viewer, ids: readonly string[]): Promise<LinkRow[]> {
  if (ids.length === 0) return [];
  const readable = db.select({ id: documents.id }).from(documents).where(visibleTo(viewer));
  return db
    .select({ id: links.id, sourceId: links.sourceId, targetId: links.targetId, kind: links.kind, label: links.label })
    .from(links)
    .where(and(or(inArray(links.sourceId, [...ids]), inArray(links.targetId, [...ids])), inArray(links.sourceId, readable), inArray(links.targetId, readable)))
    .orderBy(asc(links.createdAt), asc(links.id));
}

/**
 * The readable documents of a Space and those linked to them (directly or through other linked documents, nearest
 * first, up to MAX_GRAPH_DOCUMENTS), with every readable link among them. Each document is one language version;
 * the caller picks one per text.
 */
export async function graphDocuments(db: Db, viewer: Viewer, spaceId: string): Promise<GraphDocuments> {
  if (!isUuid(spaceId)) return { documents: [], links: [] };
  const own = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.spaceId, spaceId), visibleTo(viewer)))
    .orderBy(asc(documents.sortOrder), asc(documents.createdAt))
    .limit(MAX_GRAPH_DOCUMENTS);
  const included = new Set(own.map((r) => r.id));
  const found = new Map<string, LinkRow>();
  let frontier = [...included];
  for (let hop = 0; hop < MAX_HOPS && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const link of await readableLinksTouching(db, viewer, frontier)) {
      found.set(link.id, link);
      for (const end of [link.sourceId, link.targetId]) {
        if (included.has(end) || included.size >= MAX_GRAPH_DOCUMENTS) continue;
        included.add(end);
        next.push(end);
      }
    }
    frontier = next;
  }
  const ids = [...included];
  const rows = ids.length === 0 ? [] : await db.select(documentColumns).from(documents).where(and(visibleTo(viewer), inArray(documents.id, ids)));
  const order = new Map(ids.map((id, i) => [id, i]));
  return {
    documents: rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    links: [...found.values()].filter((l) => included.has(l.sourceId) && included.has(l.targetId)),
  };
}

/** The first passage (Markdown, cut to PASSAGE_CHARS) of each readable document, by document id. */
export async function firstPassages(db: Db, viewer: Viewer, documentIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(documentIds.filter(isUuid))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([chunks.documentId], { documentId: chunks.documentId, text: chunks.text })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(and(inArray(chunks.documentId, ids), visibleTo(viewer)))
    .orderBy(chunks.documentId, asc(chunks.position));
  return new Map(rows.map((r) => [r.documentId, r.text.slice(0, PASSAGE_CHARS)]));
}

/**
 * Who may draw or erase a "related" edge between two documents they can read: an admin, or the author of either
 * end. The edge is stored from the viewer's own document, so it only shows to those who may read that document
 * (a link never reveals a document the viewer cannot open).
 */
export function mayLink(viewer: Viewer, a: Pick<DocumentRow, 'authorId'>, b: Pick<DocumentRow, 'authorId'>): boolean {
  if (viewer.kind !== 'user') return false;
  return viewer.isAdmin || a.authorId === viewer.userId || b.authorId === viewer.userId;
}

/** Any link (either kind, either direction) between two documents. */
export async function linkBetween(db: Db, a: string, b: string): Promise<LinkRow | null> {
  if (!isUuid(a) || !isUuid(b)) return null;
  const [row] = await db
    .select({ id: links.id, sourceId: links.sourceId, targetId: links.targetId, kind: links.kind, label: links.label })
    .from(links)
    .where(or(and(eq(links.sourceId, a), eq(links.targetId, b)), and(eq(links.sourceId, b), eq(links.targetId, a))))
    .limit(1);
  return row ?? null;
}

/** A new "related" edge between two documents the caller checked (readable, may link, not yet linked). */
export async function addRelation(db: Db, sourceId: string, targetId: string, label: string | null, at: Date): Promise<LinkRow> {
  const [row] = await db
    .insert(links)
    .values({ sourceId, targetId, kind: 'relation', label, createdAt: at })
    .returning({ id: links.id, sourceId: links.sourceId, targetId: links.targetId, kind: links.kind, label: links.label });
  if (!row) throw new Error('relation insert returned nothing');
  return row;
}

/** A link with its two ends, when the viewer may read both; null otherwise (or for an id that is not one). */
export async function findReadableLink(db: Db, viewer: Viewer, id: string): Promise<{ link: LinkRow; source: DocumentRow; target: DocumentRow } | null> {
  if (!isUuid(id)) return null;
  const [link] = await db
    .select({ id: links.id, sourceId: links.sourceId, targetId: links.targetId, kind: links.kind, label: links.label })
    .from(links)
    .where(eq(links.id, id));
  if (!link) return null;
  const ends = await db
    .select(documentColumns)
    .from(documents)
    .where(and(visibleTo(viewer), inArray(documents.id, [link.sourceId, link.targetId])));
  const source = ends.find((d) => d.id === link.sourceId);
  const target = ends.find((d) => d.id === link.targetId);
  return source && target ? { link, source, target } : null;
}

/** Removes a "related" edge (the caller checked who may); written links (`wikilink`) belong to their text. */
export async function removeRelation(db: Db, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const removed = await db
    .delete(links)
    .where(and(eq(links.id, id), eq(links.kind, 'relation')))
    .returning({ id: links.id });
  return removed.length > 0;
}
