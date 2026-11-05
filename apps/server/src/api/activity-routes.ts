/**
 * What a reader does on a document (C11): PUT /api/documents/:id/progress records how far they read (C10 "72%"),
 * GET /api/documents/:id/comments lists the discussion of a published document, POST adds to it. Every route first
 * checks the viewer may read the document (404 / 403 `hidden` / 403 `no-access`, like the reader itself).
 */
import express, { type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { addComment, anchorsOf, discussionParticipants, isOpenForComments, listComments, saveProgress } from '../access/participation';
import type { Viewer } from '../access/viewer';
import { HttpError } from '../http-error';
import { safeErrorText } from '../log-error';
import { noticeComment } from '../notifications/comment-notices';
import { type RequestContextDeps, openDocument, readerOf } from './request-context';
import type { MemberRole } from './space-members';
import { parseBody } from './validate';

export const MAX_COMMENT_CHARS = 2000;
const MAX_ANCHOR_CHARS = 120;

const ProgressBody = z.strictObject({
  progress: z.number().int().min(0).max(100),
  anchor: z.string().min(1).max(MAX_ANCHOR_CHARS).nullable().optional(),
});

const CommentBody = z.strictObject({
  body: z.string().trim().min(1).max(MAX_COMMENT_CHARS),
  anchor: z.string().min(1).max(MAX_ANCHOR_CHARS).nullable().optional(),
});

export interface ProgressResponse {
  /** The furthest the account has read, 0–100 (never goes down). */
  progress: number;
  anchor: string | null;
}

export interface CommentView {
  id: string;
  /** The passage it is about; null for the whole document. */
  anchor: string | null;
  /** Plain text, as typed (render as text, never as HTML). */
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { name: string | null; picture: string | null; role: Exclude<MemberRole, 'owner'> };
  /** Written by the viewer. */
  mine: boolean;
}

export interface CommentsResponse {
  /** Whether the document takes comments (published and visible to everyone); false: no composer. */
  open: boolean;
  comments: CommentView[];
}

function signedIn(viewer: Viewer): Extract<Viewer, { kind: 'user' }> {
  if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
  return viewer;
}

export function activityRoutes(deps: RequestContextDeps): Router {
  const { config, db, now } = deps;
  const router = express.Router();
  // Writing comments is the only public write here: a generous limit per address against floods.
  const commentLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate-limited' } });

  async function checkedAnchor(viewer: Viewer, documentId: string, anchor: string | null | undefined): Promise<string | null> {
    if (anchor === undefined || anchor === null) return null;
    if (!(await anchorsOf(db, viewer, documentId)).has(anchor)) throw new HttpError(400, 'unknown-anchor');
    return anchor;
  }

  async function comments(viewer: Viewer, documentId: string): Promise<CommentsResponse> {
    const rows = await listComments(db, documentId);
    return {
      open: await isOpenForComments(db, documentId),
      comments: rows.map((c) => ({
        id: c.id,
        anchor: c.anchor,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        author: { name: c.authorName, picture: c.authorPicture, role: config.adminSubs.has(c.authorSub) ? 'admin' : c.authorRole },
        mine: viewer.kind === 'user' && viewer.userId === c.authorId,
      })),
    };
  }

  router.put('/api/documents/:id/progress', async (req, res) => {
    const { viewer } = await readerOf(req, deps);
    const user = signedIn(viewer);
    const doc = await openDocument(db, viewer, req.params.id);
    const body = parseBody(ProgressBody, req.body);
    const anchor = await checkedAnchor(viewer, doc.id, body.anchor);
    const saved: ProgressResponse = await saveProgress(db, user.userId, doc.id, body.progress, anchor, now());
    res.set('Cache-Control', 'no-store').json(saved);
  });

  router.get('/api/documents/:id/comments', async (req, res) => {
    const { viewer } = await readerOf(req, deps);
    const doc = await openDocument(db, viewer, req.params.id);
    res.set('Cache-Control', 'no-store').json(await comments(viewer, doc.id));
  });

  router.post('/api/documents/:id/comments', commentLimit, async (req, res) => {
    const { viewer } = await readerOf(req, deps);
    const user = signedIn(viewer);
    const doc = await openDocument(db, viewer, req.params.id);
    const body = parseBody(CommentBody, req.body);
    if (!(await isOpenForComments(db, doc.id))) throw new HttpError(403, 'comments-closed');
    const anchor = await checkedAnchor(viewer, doc.id, body.anchor);
    const before = await discussionParticipants(db, doc.id);
    const id = await addComment(db, user.userId, doc.id, body.body, anchor, now());
    const created = (await comments(viewer, doc.id)).comments.find((c) => c.id === id);
    if (!created) throw new Error('new comment not found');
    // Telling the author and those named never fails the comment itself.
    await noticeComment(
      db,
      config.adminSubs,
      { documentId: doc.id, title: doc.title, authorId: doc.authorId, commenterId: user.userId, body: body.body, anchor, participants: before },
      now(),
    ).catch((error: unknown) => console.error('comment notice failed', safeErrorText(error)));
    res.status(201).set('Cache-Control', 'no-store').json(created);
  });

  return router;
}
