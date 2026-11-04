/**
 * The C09 board's crystal captions as seed data (KB_SEED=mock, dev/E2E): stored for the counts a guest, another
 * member and the seed's owner see, so the Universe shows the board's text without a TypeSafe key. Jev's own choice
 * is untouched by this (src/captions/space-captions.ts) and only used where no stored caption matches.
 */
import { listSpaces } from '../access/content';
import { GUEST, viewerFor } from '../access/viewer';
import type { Db } from '../db/client';
import { seedId } from '../db/seed-database';
import { SEED_SPACES } from '../db/seed-data';
import { type Caption, type CaptionInput, captionInputsFor, storeSeedCaptions } from './space-captions';

/** Stores the board's captions; how many (Space, counts) pairs got one. */
export async function seedMockCaptions(db: Db, adminSubs: ReadonlySet<string>, ownerId: string, at: Date = new Date()): Promise<number> {
  const captions = new Map<string, Caption>(SEED_SPACES.map((space) => [seedId(`space:${space.key}`), space.caption]));
  const perViewer: CaptionInput[][] = [];
  // A guest and any other member see the same published documents; the owner also sees their own.
  for (const viewer of [GUEST, await viewerFor(db, adminSubs, ownerId)]) {
    perViewer.push(await captionInputsFor(db, viewer, await listSpaces(db, viewer)));
  }
  return storeSeedCaptions(db, perViewer, captions, at);
}
