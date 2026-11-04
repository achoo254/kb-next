/**
 * One Học Cloud import run: prepare everything (fetch, redact, validate, curate), write it in one transaction
 * through src/access/content-write.ts, then push the changed documents to the search indexes. Re-running with
 * nothing changed writes nothing.
 */
import { type ImportWriteResult, ensureSystemAuthor, writeImport } from '../../access/content-write';
import type { Db } from '../../db/client';
import { IndexSync, ensureIndexes } from '../../search/index-sync';
import type { MeiliClient } from '../../search/meili-client';
import type { ContentDir } from './curation';
import { SYSTEM_NAME, SYSTEM_SUB, type PreparedImport, prepareImport } from './prepare';
import type { HocCloudSource } from './source';

export interface ImportOptions {
  /** Search sync after the write; null when search is not configured (the next `reindex` picks the documents up). */
  meili: MeiliClient | null;
  retryDelaysMs?: readonly number[];
}

export interface ImportReport extends ImportWriteResult {
  counts: PreparedImport['counts'];
  warnings: string[];
  /** False when search sync gave up: run `reindex`. */
  indexed: boolean;
}

export async function runImport(db: Db, source: HocCloudSource, content: ContentDir, options: ImportOptions): Promise<ImportReport> {
  const prepared = await prepareImport(source, content);
  const authorId = await ensureSystemAuthor(db, SYSTEM_SUB, SYSTEM_NAME);
  const written = await writeImport(db, {
    spaces: prepared.spaces.map((s) => ({
      slug: s.slug,
      nameVi: s.name.vi,
      nameEn: s.name.en,
      tint: s.tint,
      glow: s.glow,
      art: s.art,
      unitVi: s.unit.vi,
      unitEn: s.unit.en,
      descriptionVi: s.description.vi,
      descriptionEn: s.description.en,
      sortOrder: s.sortOrder,
    })),
    collections: prepared.collections,
    documents: prepared.documents,
    authorId,
  });
  const changed = [...written.created, ...written.updated];
  let indexed = true;
  if (options.meili && changed.length > 0) {
    await ensureIndexes(options.meili);
    const sync = new IndexSync(db, options.meili, {
      retryDelaysMs: options.retryDelaysMs ?? [1_000, 5_000, 15_000],
      log: (message) => {
        if (message.includes('gave up')) indexed = false;
        console.error(message);
      },
    });
    sync.enqueue(changed);
    await sync.idle();
    sync.close();
  }
  return { ...written, counts: prepared.counts, warnings: prepared.warnings, indexed };
}
