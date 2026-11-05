/**
 * "Key riêng" (F03): the account's own AI keys, write-only. Every route needs a session.
 * - GET /api/me/keys → KeysResponse.
 * - PUT /api/me/keys/:provider `{key}` → a KeyEntry, after one free call to the provider accepted it. 400
 *   `KEY_FORMAT`, `KEY_REJECTED`, `KEY_NO_CREDIT`; 503 `KEY_CHECK_FAILED` (the provider could not be reached; nothing
 *   saved), `USER_KEYS_DISABLED`; 429 past 5 saves a minute.
 * - DELETE /api/me/keys/:provider → `{deleted: true}` (also when own keys are off: removing a key is always allowed).
 * - PUT /api/me/key-prefs `{provider, model}` → KeysResponse; 400 `invalid-body` for a model not in that provider's list.
 * No answer ever carries a key: only its provider, last 4 characters, status and times.
 */
import express, { type Router } from 'express';
import { z } from 'zod';
import { perAccountLimit, signedIn, userIdOf } from '../api/account-limit';
import { parseBody } from '../api/validate';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { HttpError } from '../http-error';
import { AI_PROVIDERS, type AiProvider, MODELS, type ModelInfo, type ProviderBases, modelsFor } from '../llm/providers';
import { checkKey, keyFormatOk } from './key-check';
import { type ActiveChoice, type KeyEntry, type KeyPrefs, type OpenedKey, type UserKeyStore, pickActive } from './key-store';

export interface KeysResponse {
  /** Own keys work on this server (its secret file is readable). */
  available: boolean;
  keys: KeyEntry[];
  prefs: KeyPrefs | null;
  /** What the Copilot would use now; null without an `ok` key. */
  active: ActiveChoice | null;
  /** Per provider, the models its saved key may call (the app's whole list for a provider without a key). */
  models: Record<AiProvider, readonly ModelInfo[]>;
}

/** The model list of each provider for this account: narrowed to what its saved key may call. */
function modelsOf(list: readonly KeyEntry[]): Record<AiProvider, readonly ModelInfo[]> {
  const of = (provider: AiProvider): readonly ModelInfo[] => {
    const entry = list.find((k) => k.provider === provider);
    return entry ? modelsFor(provider, entry.models) : MODELS[provider];
  };
  return { openai: of('openai'), gemini: of('gemini'), anthropic: of('anthropic') };
}

const Provider = z.enum(AI_PROVIDERS);
const KeyBody = z.strictObject({ key: z.string().trim().min(1).max(1_000) });
const PrefsBody = z.strictObject({ provider: Provider, model: z.string().min(1).max(100) });

export interface KeyRoutesOptions {
  config: ServerConfig;
  db: Db;
  now: () => Date;
  keys: UserKeyStore;
  bases: ProviderBases;
}

/** 503 `USER_KEYS_DISABLED` while own keys are off (no readable secret file). */
export function ownKeysOn(keys: UserKeyStore): express.RequestHandler {
  return (_req, _res, next) => next(keys.available ? undefined : new HttpError(503, 'USER_KEYS_DISABLED'));
}

/**
 * The key this turn runs on; 403 `NO_USER_KEY` without one, 403 `USER_KEY_UNREADABLE` when the active key no longer
 * decrypts (the user saves it again; the turn does not move to another key).
 */
export async function keyForTurn(keys: UserKeyStore, userId: string): Promise<OpenedKey> {
  const opening = await keys.open(userId);
  if (opening.kind === 'unreadable') throw new HttpError(403, 'USER_KEY_UNREADABLE');
  if (opening.kind === 'none') throw new HttpError(403, 'NO_USER_KEY');
  return opening.key;
}

function providerOf(value: unknown): AiProvider {
  const parsed = Provider.safeParse(value);
  if (!parsed.success) throw new HttpError(404, 'not-found');
  return parsed.data;
}

export function keyRoutes({ config, db, now, keys, bases }: KeyRoutesOptions): Router {
  const router = express.Router();
  const session = signedIn(config, db, now);

  async function overview(userId: string): Promise<KeysResponse> {
    const [list, prefs] = await Promise.all([keys.list(userId), keys.prefs(userId)]);
    return { available: keys.available, keys: list, prefs, active: keys.available ? pickActive(list, prefs) : null, models: modelsOf(list) };
  }

  router.get('/api/me/keys', session, async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await overview(userIdOf(res)));
  });

  router.put('/api/me/keys/:provider', session, ownKeysOn(keys), perAccountLimit(config.keySaveLimitPerMinute), async (req, res) => {
    const userId = userIdOf(res);
    const provider = providerOf(req.params.provider);
    const { key } = parseBody(KeyBody, req.body);
    if (!keyFormatOk(provider, key)) throw new HttpError(400, 'KEY_FORMAT');
    const { verdict, models } = await checkKey(bases, provider, key);
    if (verdict === 'rejected') throw new HttpError(400, 'KEY_REJECTED');
    if (verdict === 'no-credit') throw new HttpError(400, 'KEY_NO_CREDIT');
    if (verdict === 'unreachable') throw new HttpError(503, 'KEY_CHECK_FAILED');
    // The key works but its project may call none of the models the app offers for that provider.
    if (models !== null && models.length === 0) throw new HttpError(400, 'KEY_NO_MODEL');
    res.set('Cache-Control', 'no-store').json(await keys.save(userId, provider, key, models));
  });

  router.delete('/api/me/keys/:provider', session, async (req, res) => {
    await keys.remove(userIdOf(res), providerOf(req.params.provider));
    res.set('Cache-Control', 'no-store').json({ deleted: true });
  });

  router.put('/api/me/key-prefs', session, async (req, res) => {
    const userId = userIdOf(res);
    const prefs = parseBody(PrefsBody, req.body);
    const offered = modelsOf(await keys.list(userId))[prefs.provider];
    if (!offered.some((m) => m.id === prefs.model)) throw new HttpError(400, 'invalid-body');
    await keys.setPrefs(userId, prefs);
    res.set('Cache-Control', 'no-store').json(await overview(userId));
  });

  return router;
}
