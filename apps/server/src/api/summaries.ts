/** Document summaries for lists (C10 rows, links, recent cards, C02 links, C08): authors, Spaces and reading progress. */
import type { DocumentRow } from '../access/content';
import { progressOf } from '../access/participation';
import { spacesById, userNames } from '../access/reading';
import type { Viewer } from '../access/viewer';
import type { Db } from '../db/client';
import { type DocumentSummary, type Lang, documentSummary } from './content-views';

/** Summaries of documents, in order; a document whose Space is gone is left out. */
export async function summarize(db: Db, viewer: Viewer, picked: ReadonlyArray<{ doc: DocumentRow; langs: Lang[] }>): Promise<DocumentSummary[]> {
  const ids = picked.map((p) => p.doc.id);
  const authors = await userNames(
    db,
    picked.map((p) => p.doc.authorId),
  );
  const spaces = new Map((await spacesById(db, [...new Set(picked.map((p) => p.doc.spaceId))])).map((s) => [s.id, s]));
  const progress = viewer.kind === 'user' ? await progressOf(db, viewer.userId, ids) : null;
  return picked.flatMap(({ doc, langs }) => {
    const space = spaces.get(doc.spaceId);
    const read = progress ? (progress.get(doc.id)?.progress ?? 0) : null;
    return space ? [documentSummary(doc, langs, space, authors.get(doc.authorId) ?? null, read)] : [];
  });
}

/** Summaries of single documents (each in its own language). */
export function summarizeEach(db: Db, viewer: Viewer, docs: readonly DocumentRow[]): Promise<DocumentSummary[]> {
  return summarize(
    db,
    viewer,
    docs.map((doc) => ({ doc, langs: [doc.lang] })),
  );
}
