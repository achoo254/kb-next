/**
 * Writing the AI memory: `rememberFact` adds one dated fact (a line `- yyyy-mm-dd: …`) to the topic it belongs to,
 * made when new, with no approval step — the Chat panel shows what was remembered with an undo link instead. Each
 * write leaves an undo token (24 hours, once) that takes exactly that line back out (see `memory_undos`).
 * `forgetAll` moves every topic to the 30-day trash.
 *
 * Writes and undos of one account run one after the other (kb runs one server process): an agent calling remember
 * twice at once on one topic appends both facts, never one over the other, and never makes the topic twice. A save
 * also carries the revision it was computed from, so an edit made on the web in between is never overwritten.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { createDocument, editAccess, restoreVersion, saveDocument, trashDocument } from '../access/authoring';
import type { Viewer } from '../access/viewer';
import { MAX_BODY_CHARS, bodyOf, foldTitle } from '../authoring/markdown-text';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { memoryUndos } from '../db/schema';
import { keepTextPrivate } from '../review/moderation';
import type { IndexSync } from '../search/index-sync';
import { SENSITIVE_TAG, chatTag, findTopic, listMemoryTopics, memoryCollectionId, memorySettings } from '../access/memory-store';

type UserViewer = Extract<Viewer, { kind: 'user' }>;

export const UNDO_TTL_MS = 24 * 60 * 60 * 1000;
const SAVE_ATTEMPTS = 3;

export interface MemoryDeps {
  config: ServerConfig;
  db: Db;
  now: () => Date;
  sync: IndexSync | null;
}

/** Why a fact was not remembered; the caller maps it to its own error shape. */
export class MemoryRefusal extends Error {
  constructor(
    readonly code: 'memory_paused' | 'sensitive_off' | 'too_long' | 'topic_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'MemoryRefusal';
  }
}

export interface Remembered {
  documentId: string;
  topic: string;
  action: 'created' | 'appended';
  undoToken: string;
}

const hashOf = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Today in Vietnam (yyyy-mm-dd): the date a fact is noted under. */
export const dayOf = (now: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);

const queues = new Map<string, Promise<unknown>>();

/** Runs `work` after every earlier memory write or undo of `userId` has finished. */
async function oneAtATime<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const run = (queues.get(userId) ?? Promise.resolve()).then(work, work);
  const tail = run.catch(() => undefined);
  queues.set(userId, tail);
  try {
    return await run;
  } finally {
    if (queues.get(userId) === tail) queues.delete(userId);
  }
}

async function issueUndo(db: Db, row: { userId: string; documentId: string; action: Remembered['action']; previousVersion: number | null; writtenVersion: number; line: string }, now: Date): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await db.insert(memoryUndos).values({ tokenHash: hashOf(token), ...row, expiresAt: new Date(now.getTime() + UNDO_TTL_MS), createdAt: now });
  return token;
}

/** Appends `line` to the topic `id`, retrying when the web saved it in between; the version written and the one before. */
async function appendLine(deps: MemoryDeps, viewer: UserViewer, id: string, line: string): Promise<{ title: string; previous: number; written: number }> {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
    const access = await editAccess(deps.db, viewer, id);
    if (access.kind !== 'ok') break;
    const body = `${bodyOf(access.latest.markdown)}\n${line}`.trim();
    if (body.length > MAX_BODY_CHARS) throw new MemoryRefusal('too_long', 'This topic is full; save the fact under a new topic.');
    const saved = await saveDocument(deps.db, viewer, id, { title: access.doc.title, body, baseRev: access.doc.updatedAt, editor: 'text', fromApi: true, aiMade: true }, deps.now());
    if (saved.kind === 'saved') return { title: access.doc.title, previous: access.latest.version, written: saved.version };
    if (saved.kind !== 'stale') break;
  }
  throw new MemoryRefusal('topic_unavailable', 'This memory topic cannot be written now (it changed, or it is no longer a note); try again or use another topic.');
}

/**
 * Remembers `fact` under `topic` (general memory, or the conversation `chatId`'s). The caller has already refused
 * secrets and numbers memory never keeps; `sensitive` is the agent's own judgement that the fact is a sensitive topic.
 */
export async function rememberFact(deps: MemoryDeps, viewer: UserViewer, input: { topic: string; fact: string; chatId: number | null; sensitive: boolean; lang: 'vi' | 'en' }): Promise<Remembered> {
  const { db } = deps;
  const settings = await memorySettings(db, viewer.userId);
  if (settings.paused) throw new MemoryRefusal('memory_paused', 'The user paused their memory: nothing is saved or read until they turn it back on.');
  if (input.sensitive && !settings.sensitive) throw new MemoryRefusal('sensitive_off', 'The user keeps sensitive topics out of their memory; do not save this.');
  const line = `- ${dayOf(deps.now())}: ${input.fact.replace(/\s+/g, ' ').trim()}`;

  return oneAtATime(viewer.userId, async () => {
    const now = deps.now();
    const existing = await findTopic(db, viewer, input.topic, input.chatId, foldTitle);
    if (existing) {
      const { title, previous, written } = await appendLine(deps, viewer, existing.id, line);
      deps.sync?.enqueue([existing.id]);
      const undoToken = await issueUndo(db, { userId: viewer.userId, documentId: existing.id, action: 'appended', previousVersion: previous, writtenVersion: written, line }, now);
      return { documentId: existing.id, topic: title, action: 'appended', undoToken };
    }
    const where = await memoryCollectionId(db, viewer, true);
    if (!where) throw new Error('memory Collection missing after create');
    const tags = [...(input.chatId === null ? [] : [chatTag(input.chatId)]), ...(input.sensitive ? [SENSITIVE_TAG] : [])];
    const created = await createDocument(db, viewer, { ...where, title: input.topic.trim(), body: line, type: 'note', lang: input.lang, planet: null, tags }, now);
    await keepTextPrivate(deps, viewer, created.id, {});
    const undoToken = await issueUndo(db, { userId: viewer.userId, documentId: created.id, action: 'created', previousVersion: null, writtenVersion: 1, line }, now);
    return { documentId: created.id, topic: input.topic.trim(), action: 'created', undoToken };
  });
}

export type UndoResult = { kind: 'undone'; action: 'trashed' | 'reverted'; documentId: string } | { kind: 'undo-invalid' | 'undo-expired' | 'undo-used' | 'undo-stale' | 'not-found' };

/** Takes `line` out of the topic's current body; null when it is no longer there. */
function withoutLine(markdown: string, line: string): string | null {
  const lines = bodyOf(markdown).split('\n');
  const at = lines.lastIndexOf(line);
  if (at < 0) return null;
  lines.splice(at, 1);
  return lines.join('\n').trim();
}

/** Undoes the memory write of `token`, for the account that made it only; the token is spent only when it worked. */
export async function undoMemory(deps: MemoryDeps, viewer: UserViewer, token: string): Promise<UndoResult> {
  const { db } = deps;
  return oneAtATime(viewer.userId, async (): Promise<UndoResult> => {
    const now = deps.now();
    const [row] = await db.select().from(memoryUndos).where(and(eq(memoryUndos.tokenHash, hashOf(token)), eq(memoryUndos.userId, viewer.userId)));
    if (!row) return { kind: 'undo-invalid' };
    if (row.usedAt) return { kind: 'undo-used' };
    if (row.expiresAt.getTime() <= now.getTime()) return { kind: 'undo-expired' };
    const access = await editAccess(db, viewer, row.documentId);
    if (access.kind !== 'ok') return { kind: 'not-found' };

    let action: 'trashed' | 'reverted';
    const untouched = access.latest.version === row.writtenVersion;
    const rest = untouched ? null : withoutLine(access.latest.markdown, row.line);
    if (!untouched && rest === null) return { kind: 'undo-stale' };
    if (row.action === 'created' && (untouched || rest === '')) {
      if ((await trashDocument(db, viewer, row.documentId, now)) !== 'ok') return { kind: 'not-found' };
      action = 'trashed';
    } else if (untouched && row.previousVersion !== null) {
      if ((await restoreVersion(db, viewer, row.documentId, row.previousVersion, now)).kind !== 'saved') return { kind: 'not-found' };
      action = 'reverted';
    } else {
      const saved = await saveDocument(db, viewer, row.documentId, { title: access.doc.title, body: rest ?? '', baseRev: access.doc.updatedAt, editor: 'text', fromApi: true }, now);
      if (saved.kind !== 'saved') return { kind: saved.kind === 'stale' ? 'undo-stale' : 'not-found' };
      action = 'reverted';
    }
    await db.update(memoryUndos).set({ usedAt: now }).where(eq(memoryUndos.tokenHash, row.tokenHash));
    deps.sync?.enqueue([row.documentId]);
    return { kind: 'undone', action, documentId: row.documentId };
  });
}

/** Moves every memory topic of the account to the trash; how many. */
export async function forgetAll(deps: MemoryDeps, viewer: UserViewer): Promise<number> {
  return oneAtATime(viewer.userId, async () => {
    const topics = await listMemoryTopics(deps.db, viewer);
    const now = deps.now();
    let trashed = 0;
    for (const topic of topics) if ((await trashDocument(deps.db, viewer, topic.id, now)) === 'ok') trashed += 1;
    deps.sync?.enqueue(topics.map((t) => t.id));
    return trashed;
  });
}

/** Drops undo tokens past their 24 hours (the daily cleanup); how many. */
export async function purgeExpiredUndos(db: Db, now: Date): Promise<number> {
  const gone = await db.delete(memoryUndos).where(lt(memoryUndos.expiresAt, now)).returning({ tokenHash: memoryUndos.tokenHash });
  return gone.length;
}
