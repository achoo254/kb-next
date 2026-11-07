/**
 * "Xoá dữ liệu của tôi" (H03): an account deletes what it owns, in one transaction.
 *
 * Deleted for good:
 * - its non-official texts that are not published (drafts, private, and those left from the review gate) or are in
 *   the trash (published or not), every text of its personal Spaces, and those Spaces; with `removePublished`, its
 *   published community texts too;
 * - its stored files no remaining text uses (their disk names come back for the caller to unlink);
 * - its own AI keys and the choice of key, Copilot history, reading and journey progress, favourites, notifications,
 *   canvases, comments, and the record of which share links it opened;
 * - every session (it is signed out everywhere).
 * Revoked: the share links, admin tokens and invite links it made (they act as it).
 * Kept: official texts outside its personal Spaces, whatever their step (they belong to the workspace), its published community texts unless it asked otherwise, the
 * review decisions and versions it wrote on texts that remain, and the audit trail. The account row stays as a
 * nameless tombstone (`deletedAt`, its IdP sub replaced, no name, email or picture) so those keep an author; the same
 * hoandat account signing in later starts a fresh, empty account.
 */
import { and, count, eq, inArray, isNotNull, isNull, ne, notExists, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  adminTokens,
  canvases,
  comments,
  copilotQuestions,
  documentVersions,
  documents,
  favorites,
  files,
  inviteLinks,
  journeyProgress,
  notifications,
  readingProgress,
  sessions,
  shareLinkVisits,
  shareLinks,
  spaces,
  userKeyPrefs,
  userKeys,
  users,
} from '../db/schema';
import { AUDIT_ACTIONS, recordAudit } from '../workspace/audit';
import { deleteDocumentsWhere } from './authoring';

export interface DeleteDataOptions {
  /** Delete its published community texts as well (default: keep them, by a deleted account). */
  removePublished: boolean;
}

export type DeleteDataResult =
  | {
      kind: 'deleted';
      /** Documents deleted, for the search sync to drop. */
      documentIds: string[];
      /** Disk names of the stored files deleted: the caller unlinks them. */
      storageKeys: string[];
      /** Published texts left under the deleted account. */
      keptPublished: number;
    }
  | { kind: 'not-found' };

/** The IdP sub a deleted account's row takes: never a real sub, so the IdP account signs in afresh. */
export function tombstoneSub(userId: string): string {
  return `deleted:${userId}`;
}

export async function deleteAccountData(db: Db, userId: string, options: DeleteDataOptions, now: Date): Promise<DeleteDataResult> {
  return db.transaction(async (tx): Promise<DeleteDataResult> => {
    const [account] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .for('update');
    if (!account) return { kind: 'not-found' };

    const personalSpaces = tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.ownerId, userId));
    // Official texts belong to the workspace whatever their step; of the others go the unpublished ones, every one in
    // the trash (published or not), and the published ones when asked.
    const own = and(
      eq(documents.authorId, userId),
      ne(documents.origin, 'official'),
      or(ne(documents.status, 'approved'), isNotNull(documents.deletedAt), options.removePublished ? eq(documents.status, 'approved') : undefined),
    );
    const purged = await deleteDocumentsWhere(tx, or(own, inArray(documents.spaceId, personalSpaces)));

    // Its files no remaining text or version uses (an upload never attached, or one whose text just went).
    const unused = await tx
      .delete(files)
      .where(
        and(
          eq(files.ownerId, userId),
          isNull(files.documentId),
          notExists(tx.select({ id: documentVersions.id }).from(documentVersions).where(eq(documentVersions.fileId, files.id))),
        ),
      )
      .returning({ storageKey: files.storageKey });
    await tx.delete(spaces).where(eq(spaces.ownerId, userId));

    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(userKeys).where(eq(userKeys.userId, userId));
    await tx.delete(userKeyPrefs).where(eq(userKeyPrefs.userId, userId));
    await tx.delete(copilotQuestions).where(eq(copilotQuestions.userId, userId));
    await tx.delete(readingProgress).where(eq(readingProgress.userId, userId));
    await tx.delete(journeyProgress).where(eq(journeyProgress.userId, userId));
    await tx.delete(favorites).where(eq(favorites.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx.delete(canvases).where(eq(canvases.ownerId, userId));
    await tx.delete(comments).where(eq(comments.authorId, userId));
    await tx.update(shareLinkVisits).set({ userId: null }).where(eq(shareLinkVisits.userId, userId));

    await tx
      .update(shareLinks)
      .set({ revokedAt: now })
      .where(and(eq(shareLinks.createdBy, userId), isNull(shareLinks.revokedAt)));
    await tx
      .update(adminTokens)
      .set({ revokedAt: now })
      .where(and(eq(adminTokens.createdBy, userId), isNull(adminTokens.revokedAt)));
    await tx
      .update(inviteLinks)
      .set({ revokedAt: now })
      .where(and(eq(inviteLinks.createdBy, userId), isNull(inviteLinks.revokedAt)));

    const [kept] = await tx
      .select({ n: count() })
      .from(documents)
      .where(and(eq(documents.authorId, userId), eq(documents.status, 'approved'), isNull(documents.deletedAt)));
    const keptPublished = kept?.n ?? 0;

    await tx
      .update(users)
      .set({
        sub: tombstoneSub(userId),
        name: null,
        email: null,
        picture: null,
        lang: 'vi',
        theme: 'system',
        reducedMotion: false,
        readerTextSize: 17,
        role: 'member',
        onboardedAt: null,
        interests: [],
        deletedAt: now,
      })
      .where(eq(users.id, userId));
    await recordAudit(
      tx,
      {
        actorId: userId,
        action: AUDIT_ACTIONS.dataDeleted,
        targetType: 'user',
        targetId: userId,
        detail: { documents: purged.documentIds.length, keptPublished, removePublished: options.removePublished },
      },
      now,
    );
    return { kind: 'deleted', documentIds: purged.documentIds, storageKeys: [...purged.storageKeys, ...unused.map((f) => f.storageKey)], keptPublished };
  });
}
