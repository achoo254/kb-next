/**
 * Where an account's AI memory lives and how it is read: the Collection of its personal Space whose `purpose` is
 * `memory` (made on first use, named "Trí nhớ" / "Memory"), one private note per topic. A topic tied to one Chat
 * conversation carries the tag `chat:<id>`; without it a topic is the account's general memory, read in every chat.
 * The account's two settings (paused, sensitive topics) are columns of `users`.
 */
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { DocumentRow } from '../access/content';
import { ensurePersonalSpace, findPersonalSpace } from '../access/spaces-write';
import type { Viewer } from '../access/viewer';
import { bodyOf } from '../authoring/markdown-text';
import type { Db } from '../db/client';
import { collections, documents, documentVersions, users } from '../db/schema';

type UserViewer = Extract<Viewer, { kind: 'user' }>;

export const MEMORY_PURPOSE = 'memory';
const MEMORY_LOOK = { nameVi: 'Trí nhớ', nameEn: 'Memory', tint: '#7c5cff', glow: '#b7a6ff' } as const;
const CHAT_TAG = /^chat:(\d{1,18})$/;
const SUMMARY_CHARS = 160;

export const chatTag = (chatId: number): string => `chat:${chatId}`;
/** A topic the agent judged sensitive (health, religion, politics…): left out of the index while the user keeps those off. */
export const SENSITIVE_TAG = 'sensitive';

/** The Chat conversation a topic is tied to, from its tags; null for general memory. */
export function chatIdOf(tags: readonly string[]): number | null {
  for (const tag of tags) {
    const match = CHAT_TAG.exec(tag);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

export interface MemorySettings {
  paused: boolean;
  sensitive: boolean;
}

export async function memorySettings(db: Db, userId: string): Promise<MemorySettings> {
  const [row] = await db.select({ paused: users.memoryPaused, sensitive: users.memorySensitive }).from(users).where(eq(users.id, userId));
  return row ?? { paused: false, sensitive: false };
}

export async function setMemorySettings(db: Db, userId: string, change: Partial<MemorySettings>): Promise<MemorySettings> {
  const set = { ...(change.paused === undefined ? {} : { memoryPaused: change.paused }), ...(change.sensitive === undefined ? {} : { memorySensitive: change.sensitive }) };
  if (Object.keys(set).length > 0) await db.update(users).set(set).where(eq(users.id, userId));
  return memorySettings(db, userId);
}

/** The memory Collection's id; made (with the personal Space) when `create`, else null when there is none yet. */
export async function memoryCollectionId(db: Db, viewer: UserViewer, create: boolean): Promise<{ spaceId: string; collectionId: string } | null> {
  const space = create ? (await ensurePersonalSpace(db, viewer)).space : await findPersonalSpace(db, viewer.userId);
  if (!space) return null;
  const find = async () =>
    (await db.select({ id: collections.id }).from(collections).where(and(eq(collections.spaceId, space.id), eq(collections.purpose, MEMORY_PURPOSE))))[0];
  const found = await find();
  if (found) return { spaceId: space.id, collectionId: found.id };
  if (!create) return null;
  // Two first memories at once: the unique (space, purpose) index lets one insert win; the other reads it.
  await db.insert(collections).values({ spaceId: space.id, purpose: MEMORY_PURPOSE, sortOrder: -1, ...MEMORY_LOOK }).onConflictDoNothing();
  const made = await find();
  if (!made) throw new Error('memory Collection neither inserted nor found');
  return { spaceId: space.id, collectionId: made.id };
}

export interface MemoryTopic {
  id: string;
  title: string;
  summary: string;
  updatedAt: Date;
  chatId: number | null;
  sensitive: boolean;
  doc: DocumentRow;
}

/** The latest Markdown of each document, by id. */
async function latestMarkdown(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([documentVersions.documentId], { documentId: documentVersions.documentId, markdown: documentVersions.markdown })
    .from(documentVersions)
    .where(inArray(documentVersions.documentId, [...ids]))
    .orderBy(documentVersions.documentId, desc(documentVersions.version));
  return new Map(rows.map((r) => [r.documentId, r.markdown ?? '']));
}

/** The last lines of a topic's body (its newest facts), on one line, cut to SUMMARY_CHARS. */
export function summaryOf(markdown: string): string {
  const lines = bodyOf(markdown)
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);
  const text = lines.slice(-2).join(' · ');
  return text.length > SUMMARY_CHARS ? `${text.slice(0, SUMMARY_CHARS - 1)}…` : text;
}

/**
 * The account's memory topics (its own notes in the memory Collection, not in the trash), most recently changed first:
 * every one when `chatId` is undefined; the general ones only when null; the general ones and those of that
 * conversation when a number.
 */
export async function listMemoryTopics(db: Db, viewer: UserViewer, chatId?: number | null): Promise<MemoryTopic[]> {
  const where = await memoryCollectionId(db, viewer, false);
  if (!where) return [];
  const rows = (await db
    .select()
    .from(documents)
    .where(and(eq(documents.collectionId, where.collectionId), eq(documents.authorId, viewer.userId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.updatedAt))) as DocumentRow[];
  const inScope = rows.filter((doc) => {
    const tied = chatIdOf(doc.tags);
    return chatId === undefined || tied === null || tied === chatId;
  });
  const markdown = await latestMarkdown(
    db,
    inScope.map((d) => d.id),
  );
  return inScope.map((doc) => ({ id: doc.id, title: doc.title, summary: summaryOf(markdown.get(doc.id) ?? ''), updatedAt: doc.updatedAt, chatId: chatIdOf(doc.tags), sensitive: doc.tags.includes(SENSITIVE_TAG), doc }));
}

/** The topic of `title` in the given scope, matched on the folded title; null when there is none. */
export async function findTopic(db: Db, viewer: UserViewer, title: string, chatId: number | null, fold: (t: string) => string): Promise<MemoryTopic | null> {
  const wanted = fold(title);
  const topics = await listMemoryTopics(db, viewer, chatId);
  return topics.find((t) => t.chatId === chatId && fold(t.title) === wanted) ?? null;
}
