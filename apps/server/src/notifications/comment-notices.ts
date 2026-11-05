/**
 * What a new comment (C11) tells (C20): everyone it names with `@Name` (full or given name) among the text's author and the people in its
 * discussion gets a mention; the author, when not named and not the one writing, gets a comment notice. Nobody is
 * told about their own comment, nor anyone who can no longer read the text (the excerpt stays with its readers). A
 * published text only: comments exist on nothing else.
 */
import { findDocument } from '../access/content';
import { viewerFor } from '../access/viewer';
import type { Db } from '../db/client';
import { type NewNotification, nameOf, notify } from './notification-store';

const EXCERPT_CHARS = 200;

export interface NewComment {
  documentId: string;
  title: string;
  /** The text's author. */
  authorId: string;
  commenterId: string;
  body: string;
  anchor: string | null;
  /** Accounts already in the discussion, with their names (the comments listed before this one). */
  participants: ReadonlyArray<{ userId: string; name: string | null }>;
}

/** Whether `body` names `name` as `@name` (case aside), not as the start of a longer word. */
export function mentions(body: string, name: string): boolean {
  const wanted = `@${name}`.toLocaleLowerCase();
  const text = body.toLocaleLowerCase();
  for (let at = text.indexOf(wanted); at >= 0; at = text.indexOf(wanted, at + 1)) {
    const next = text.charAt(at + wanted.length);
    if (!/[\p{L}\p{N}_]/u.test(next)) return true;
  }
  return false;
}

/** How a comment may name an account: its full name, or its given name (the last word of a Vietnamese name). */
export function callNames(name: string): string[] {
  const full = name.trim().replace(/\s+/g, ' ');
  const given = full.split(' ').at(-1) ?? full;
  return given === full ? [full] : [full, given];
}

/** Of `userIds`, those who may read the document now. */
async function readersOf(db: Db, adminSubs: ReadonlySet<string>, documentId: string, userIds: readonly string[]): Promise<Set<string>> {
  const readable = await Promise.all(userIds.map(async (userId) => ((await findDocument(db, await viewerFor(db, adminSubs, userId), documentId)) ? userId : null)));
  return new Set(readable.filter((id): id is string => id !== null));
}

export async function noticeComment(db: Db, adminSubs: ReadonlySet<string>, comment: NewComment, now: Date): Promise<void> {
  const names = new Map<string, string | null>(comment.participants.map((p) => [p.userId, p.name]));
  if (!names.has(comment.authorId)) names.set(comment.authorId, await nameOf(db, comment.authorId));
  const by = await nameOf(db, comment.commenterId);
  const excerpt = comment.body.slice(0, EXCERPT_CHARS);
  const mentioned = [...names].filter(([userId, name]) => userId !== comment.commenterId && name && callNames(name).some((n) => mentions(comment.body, n))).map(([userId]) => userId);
  const base = { title: comment.title, by, excerpt, anchor: comment.anchor };
  const entries: NewNotification[] = mentioned.map((userId) => ({ userId, documentId: comment.documentId, payload: { kind: 'mention', ...base } }));
  if (comment.authorId !== comment.commenterId && !mentioned.includes(comment.authorId)) {
    entries.push({ userId: comment.authorId, documentId: comment.documentId, payload: { kind: 'comment', ...base } });
  }
  const readers = await readersOf(
    db,
    adminSubs,
    comment.documentId,
    entries.map((e) => e.userId),
  );
  await notify(
    db,
    entries.filter((e) => readers.has(e.userId)),
    now,
  );
}
