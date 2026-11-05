/**
 * Saves an AI translation (F04) made with a reader's own key: a document in the source's Space and Collection, in
 * the source's text (`translationGroupId = source.translationGroupId ?? source.id`; the source itself is never
 * written: a reader may only read it), `aiTranslated`, status `draft`, origin `own`, written by the reader, so the read
 * rule (src/access/visibility.ts) shows it to that reader (and admins) only. Translating the same text into the same
 * language again replaces the reader's earlier draft with a new version instead of adding a document; a transaction
 * lock on (text, language, translator) keeps two translations at once from making two drafts. The caller enqueues the
 * id for search sync after it.
 */
import { and, eq, isNull, max, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { chunks, documentVersions, documents } from '../db/schema';
import type { DocumentRow } from './content';

export interface TranslationChunk {
  anchor: string;
  heading: string | null;
  text: string;
}

export interface AiTranslation {
  /** The document translated, already checked readable by the reader. */
  source: DocumentRow;
  authorId: string;
  lang: 'vi' | 'en';
  title: string;
  markdown: string;
  chunks: readonly TranslationChunk[];
}

/** Writes the translation; returns its document id. */
export async function saveAiTranslation(db: Db, input: AiTranslation): Promise<string> {
  return db.transaction(async (tx) => {
    const groupId = input.source.translationGroupId ?? input.source.id;
    // Held until the transaction ends: a second translation of the same text waits, then finds this draft.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai-translation:${groupId}:${input.lang}:${input.authorId}`}))`);
    const [existing] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.translationGroupId, groupId),
          eq(documents.lang, input.lang),
          eq(documents.authorId, input.authorId),
          eq(documents.aiTranslated, true),
          eq(documents.status, 'draft'),
          isNull(documents.deletedAt),
        ),
      );
    let id: string;
    let version = 1;
    if (existing) {
      id = existing.id;
      await tx.update(documents).set({ title: input.title, updatedAt: new Date() }).where(eq(documents.id, id));
      const [latest] = await tx
        .select({ version: max(documentVersions.version) })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, id));
      version = (latest?.version ?? 0) + 1;
      await tx.delete(chunks).where(eq(chunks.documentId, id));
    } else {
      const [row] = await tx
        .insert(documents)
        .values({
          spaceId: input.source.spaceId,
          collectionId: input.source.collectionId,
          title: input.title,
          type: input.source.type,
          lang: input.lang,
          translationGroupId: groupId,
          aiTranslated: true,
          origin: 'own',
          status: 'draft',
          authorId: input.authorId,
          sortOrder: input.source.sortOrder,
        })
        .returning({ id: documents.id });
      if (!row) throw new Error('translation insert returned nothing');
      id = row.id;
    }
    await tx.insert(documentVersions).values({ documentId: id, version, markdown: input.markdown, editorId: input.authorId, via: 'translation', aiMade: true });
    if (input.chunks.length > 0) {
      await tx.insert(chunks).values(input.chunks.map((chunk, position) => ({ documentId: id, position, ...chunk })));
    }
    return id;
  });
}
