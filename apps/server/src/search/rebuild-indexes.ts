/**
 * Rebuilds both search indexes from Postgres (`pnpm reindex`): fills fresh `*_rebuild` indexes, swaps them with
 * the live ones in one step (search keeps answering from the old contents meanwhile), then drops the old.
 * Edits synced while it runs land in the index being replaced: run it when quiet, or run it again.
 */
import { liveDocumentIdPages, loadIndexEntries } from '../access/index-source';
import type { Db } from '../db/client';
import type { MeiliClient } from './meili-client';
import { INDEX_SETTINGS, PRIVATE_INDEX, PUBLIC_INDEX } from './search-indexes';

const PAGE_SIZE = 200;

export interface RebuildResult {
  documents: number;
  publicChunks: number;
  privateChunks: number;
}

export async function rebuildIndexes(db: Db, meili: MeiliClient): Promise<RebuildResult> {
  const publicPair = [meili.uid(PUBLIC_INDEX), meili.uid(`${PUBLIC_INDEX}_rebuild`)] as const;
  const privatePair = [meili.uid(PRIVATE_INDEX), meili.uid(`${PRIVATE_INDEX}_rebuild`)] as const;
  const pairs = [publicPair, privatePair];
  for (const [live, fresh] of pairs) {
    await meili.deleteIndex(fresh);
    await meili.ensureIndex(fresh, INDEX_SETTINGS);
    // A swap needs both sides: a missing live index (first run, or deleted) is created empty.
    await meili.ensureIndex(live, INDEX_SETTINGS);
  }

  const result: RebuildResult = { documents: 0, publicChunks: 0, privateChunks: 0 };
  for await (const ids of liveDocumentIdPages(db, PAGE_SIZE)) {
    const split = await loadIndexEntries(db, ids);
    await meili.addDocuments(publicPair[1], split.public);
    await meili.addDocuments(privatePair[1], split.private);
    result.documents += ids.length;
    result.publicChunks += split.public.length;
    result.privateChunks += split.private.length;
  }

  await meili.swapIndexes(pairs);
  for (const [, old] of pairs) await meili.deleteIndex(old);
  return result;
}
