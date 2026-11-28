/**
 * The account's AI memory on the web (/memory): GET /api/memory (settings and topics), PUT /api/memory/settings
 * `{paused?, sensitive?}`, POST /api/memory/undo `{token}` (the undo link the Chat panel shows after a write; the page
 * posts it only when the user clicks) and DELETE /api/memory (every topic to the 30-day trash). A topic is a private
 * note: opened, edited and deleted one by one like any text. Every route needs a session (401 `sign-in-required`).
 */
import express, { type Request, type Router } from 'express';
import { z } from 'zod';
import type { Viewer } from '../access/viewer';
import { HttpError } from '../http-error';
import { listMemoryTopics, memorySettings, setMemorySettings } from '../access/memory-store';
import { forgetAll, undoMemory } from '../memory/memory-write';
import type { IndexSync } from '../search/index-sync';
import { perAccountLimit, signedIn } from './account-limit';
import { type RequestContextDeps, readerOf } from './request-context';
import { parseBody } from './validate';

type UserViewer = Extract<Viewer, { kind: 'user' }>;

export interface MemoryResponse {
  paused: boolean;
  sensitive: boolean;
  topics: Array<{ id: string; title: string; summary: string; updatedAt: string; chatId: number | null; sensitive: boolean; url: string }>;
}

const SettingsBody = z.strictObject({ paused: z.boolean().optional(), sensitive: z.boolean().optional() });
const UndoBody = z.strictObject({ token: z.string().min(16).max(200) });

export function memoryRoutes(deps: RequestContextDeps & { sync: IndexSync | null }): Router {
  const { config, db, now } = deps;
  const router = express.Router();
  const auth = signedIn(config, db, now);
  const writeLimit = perAccountLimit(60);

  async function userOf(req: Request): Promise<UserViewer> {
    const { viewer } = await readerOf(req, deps);
    if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
    return viewer;
  }

  router.get('/api/memory', auth, async (req, res) => {
    const viewer = await userOf(req);
    const [settings, topics] = await Promise.all([memorySettings(db, viewer.userId), listMemoryTopics(db, viewer)]);
    const body: MemoryResponse = {
      ...settings,
      topics: topics.map((t) => ({ id: t.id, title: t.title, summary: t.summary, updatedAt: t.updatedAt.toISOString(), chatId: t.chatId, sensitive: t.sensitive, url: `/d/${t.id}` })),
    };
    res.json(body);
  });

  router.put('/api/memory/settings', auth, writeLimit, async (req, res) => {
    const viewer = await userOf(req);
    res.json(await setMemorySettings(db, viewer.userId, parseBody(SettingsBody, req.body)));
  });

  router.post('/api/memory/undo', auth, writeLimit, async (req, res) => {
    const viewer = await userOf(req);
    const result = await undoMemory(deps, viewer, parseBody(UndoBody, req.body).token);
    if (result.kind === 'undone') {
      res.json({ undone: true, action: result.action, documentId: result.documentId });
      return;
    }
    throw new HttpError(result.kind === 'not-found' ? 404 : 400, result.kind);
  });

  router.delete('/api/memory', auth, writeLimit, async (req, res) => {
    const viewer = await userOf(req);
    res.json({ trashed: await forgetAll(deps, viewer) });
  });

  return router;
}
