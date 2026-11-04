/**
 * "Key riêng" (F03, apps/server/src/user-keys/key-routes.ts) as typed calls: the account's own AI keys (write-only:
 * only the provider, the last 4 characters, the status and times ever come back) and the provider and model the
 * Copilot uses.
 *
 * Errors (ApiError.code): `sign-in-required` (401); saving: `KEY_FORMAT`, `KEY_REJECTED`, `KEY_NO_CREDIT` (400),
 * `KEY_CHECK_FAILED` (503: the provider could not be reached, nothing saved), `USER_KEYS_DISABLED` (503: own keys
 * are off on this server), `rate-limited` (429: 5 saves a minute); `invalid-body` (400) for a model not in the
 * provider's list; `not-found` (404) for an unknown provider; `network` when the request got no answer.
 */
import * as z from 'zod/mini';
import { getJson } from './api-client';

export const AI_PROVIDERS = ['openai', 'gemini', 'anthropic'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
/** `ok`; `invalid`: the provider refused it; `quota`: out of credit; `unreadable`: the server can no longer decrypt it. */
export const KEY_STATUSES = ['ok', 'invalid', 'quota', 'unreadable'] as const;
export type KeyStatus = (typeof KEY_STATUSES)[number];

const Provider = z.enum(AI_PROVIDERS);
const Time = z.iso.datetime({ offset: true });

export const KeyEntrySchema = z.object({
  provider: Provider,
  /** The only part of the key ever shown. */
  last4: z.string(),
  status: z.enum(KEY_STATUSES),
  updatedAt: Time,
  lastCheckedAt: z.nullable(Time),
});
export type KeyEntry = z.infer<typeof KeyEntrySchema>;

const ModelSchema = z.object({ id: z.string(), label: z.string() });
export type ModelInfo = z.infer<typeof ModelSchema>;

export const KeysResponseSchema = z.object({
  /** Own keys work on this server; false: show F03 as unavailable (the server has no secret file). */
  available: z.boolean(),
  keys: z.array(KeyEntrySchema),
  prefs: z.nullable(z.object({ provider: Provider, model: z.string() })),
  /** What the Copilot uses now: the chosen provider when its key is ok, else the first ok key; null: "Chưa có key". */
  active: z.nullable(z.object({ provider: Provider, model: z.string(), last4: z.string() })),
  /** Each provider's models, the default first. */
  models: z.object({ openai: z.array(ModelSchema), gemini: z.array(ModelSchema), anthropic: z.array(ModelSchema) }),
});
export type KeysResponse = z.infer<typeof KeysResponseSchema>;

export function fetchKeys(): Promise<KeysResponse> {
  return getJson(KeysResponseSchema, '/api/me/keys');
}

/** Saves a key after the provider accepted it (one free call); replaces the account's key of that provider. */
export function saveKey(provider: AiProvider, key: string): Promise<KeyEntry> {
  return getJson(KeyEntrySchema, `/api/me/keys/${provider}`, { method: 'PUT', body: JSON.stringify({ key }) });
}

export function deleteKey(provider: AiProvider): Promise<{ deleted: boolean }> {
  return getJson(z.object({ deleted: z.boolean() }), `/api/me/keys/${provider}`, { method: 'DELETE' });
}

/** Chooses the Copilot's provider and model; answers the keys as `fetchKeys` does. */
export function saveKeyPrefs(prefs: { provider: AiProvider; model: string }): Promise<KeysResponse> {
  return getJson(KeysResponseSchema, '/api/me/key-prefs', { method: 'PUT', body: JSON.stringify(prefs) });
}
