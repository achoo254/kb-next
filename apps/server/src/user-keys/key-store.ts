/**
 * The users' own AI keys and their choice of provider and model, in `user_keys` and `user_key_prefs`. Keys are
 * sealed with the secret (src/user-keys/crypto.ts) and opened only right before a call; what leaves this module for
 * a response is a KeyEntry (provider, last 4 characters, status, times), never the key.
 *
 * Which key a call uses (`active`): the provider the account chose when its key is `ok`, else the first `ok` key in
 * the order openai, gemini, anthropic; the model is the chosen one when that key may call it, else the first model the
 * key may call. A key that may call none of the app's models is not usable.
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { userKeyPrefs, userKeyStatus, userKeys } from '../db/schema';
import { AI_PROVIDERS, type AiProvider, modelsFor } from '../llm/providers';
import { openKey, sealKey } from './crypto';

export type KeyStatus = (typeof userKeyStatus.enumValues)[number];

export interface KeyEntry {
  provider: AiProvider;
  last4: string;
  status: KeyStatus;
  updatedAt: string;
  lastCheckedAt: string | null;
  /** Ids of the app's models this key may call, in the app's order (all of them while not known). */
  models: string[];
}

export interface KeyPrefs {
  provider: AiProvider;
  model: string;
}

export interface ActiveChoice {
  provider: AiProvider;
  model: string;
  last4: string;
}

/** An opened key for one call; `nonce` identifies the saved version, so a failure marks only that version. */
export interface OpenedKey extends ActiveChoice {
  apiKey: string;
  nonce: string;
}

export type KeyOpening = { kind: 'ok'; key: OpenedKey } | { kind: 'none' } | { kind: 'unreadable'; provider: AiProvider; last4: string };

const order = (provider: AiProvider): number => AI_PROVIDERS.indexOf(provider);

/** The last 4 characters, the only part of a key ever shown. */
export function last4Of(key: string): string {
  return key.slice(-4);
}

/** The provider and model a call would use, from the keys' statuses and the account's choice; null without an ok key. */
export function pickActive(keys: readonly KeyEntry[], prefs: KeyPrefs | null): ActiveChoice | null {
  const usable = keys.filter((k) => k.status === 'ok' && k.models.length > 0).sort((a, b) => order(a.provider) - order(b.provider));
  const chosen = (prefs && usable.find((k) => k.provider === prefs.provider)) ?? usable[0];
  const firstModel = chosen?.models[0];
  if (!chosen || firstModel === undefined) return null;
  const model = prefs && prefs.provider === chosen.provider && chosen.models.includes(prefs.model) ? prefs.model : firstModel;
  return { provider: chosen.provider, model, last4: chosen.last4 };
}

export class UserKeyStore {
  constructor(
    private readonly db: Db,
    /** Null: own keys are off (no readable secret file); keys can be listed and deleted, not saved or used. */
    private readonly secret: Buffer | null,
    private readonly now: () => Date,
  ) {}

  get available(): boolean {
    return this.secret !== null;
  }

  async list(userId: string): Promise<KeyEntry[]> {
    const rows = await this.db
      .select({ provider: userKeys.provider, last4: userKeys.last4, status: userKeys.status, updatedAt: userKeys.updatedAt, lastCheckedAt: userKeys.lastCheckedAt, models: userKeys.models })
      .from(userKeys)
      .where(eq(userKeys.userId, userId));
    return rows
      .map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
        lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
        models: modelsFor(row.provider, row.models).map((m) => m.id),
      }))
      .sort((a, b) => order(a.provider) - order(b.provider));
  }

  /**
   * Saves a key the provider just accepted (replacing the account's key of that provider), with the app's models the
   * provider listed for it (null: not known).
   */
  async save(userId: string, provider: AiProvider, key: string, models: string[] | null): Promise<KeyEntry> {
    if (!this.secret) throw new Error('own keys are off');
    const sealed = sealKey(this.secret, userId, provider, key);
    const at = this.now();
    const values = { ...sealed, last4: last4Of(key), status: 'ok' as const, models, updatedAt: at, lastCheckedAt: at };
    await this.db
      .insert(userKeys)
      .values({ userId, provider, ...values, createdAt: at })
      .onConflictDoUpdate({ target: [userKeys.userId, userKeys.provider], set: values });
    return {
      provider,
      last4: values.last4,
      status: 'ok',
      updatedAt: at.toISOString(),
      lastCheckedAt: at.toISOString(),
      models: modelsFor(provider, models).map((m) => m.id),
    };
  }

  async remove(userId: string, provider: AiProvider): Promise<void> {
    await this.db.delete(userKeys).where(and(eq(userKeys.userId, userId), eq(userKeys.provider, provider)));
  }

  async prefs(userId: string): Promise<KeyPrefs | null> {
    const [row] = await this.db.select({ provider: userKeyPrefs.provider, model: userKeyPrefs.model }).from(userKeyPrefs).where(eq(userKeyPrefs.userId, userId));
    return row ?? null;
  }

  async setPrefs(userId: string, prefs: KeyPrefs): Promise<void> {
    await this.db.insert(userKeyPrefs).values({ userId, ...prefs }).onConflictDoUpdate({ target: userKeyPrefs.userId, set: prefs });
  }

  /**
   * The key a call uses (`pickActive`), opened. `none`: no usable key (or own keys are off). `unreadable`: that key no
   * longer opens (the secret changed); it is marked `unreadable` and this turn stops: a turn never moves to another
   * key or provider (the next turn picks the new active key).
   */
  async open(userId: string): Promise<KeyOpening> {
    if (!this.secret) return { kind: 'none' };
    const choice = pickActive(await this.list(userId), await this.prefs(userId));
    if (!choice) return { kind: 'none' };
    const [row] = await this.db
      .select({ ciphertext: userKeys.ciphertext, nonce: userKeys.nonce })
      .from(userKeys)
      .where(and(eq(userKeys.userId, userId), eq(userKeys.provider, choice.provider)));
    if (!row) return { kind: 'none' };
    const apiKey = openKey(this.secret, userId, choice.provider, row);
    if (apiKey !== null) return { kind: 'ok', key: { ...choice, apiKey, nonce: row.nonce } };
    console.error(JSON.stringify({ event: 'user-key-unreadable', provider: choice.provider }));
    await this.mark(userId, choice.provider, row.nonce, 'unreadable');
    return { kind: 'unreadable', provider: choice.provider, last4: choice.last4 };
  }

  /**
   * Drops `model` from what the saved version `nonce` of a key may call, after the provider answered that the model
   * is not there for it (404): the next turn picks another model of that key instead of failing again.
   */
  async dropModel(userId: string, provider: AiProvider, nonce: string, model: string): Promise<void> {
    const [row] = await this.db
      .select({ models: userKeys.models })
      .from(userKeys)
      .where(and(eq(userKeys.userId, userId), eq(userKeys.provider, provider), eq(userKeys.nonce, nonce)));
    if (!row) return;
    const left = modelsFor(provider, row.models)
      .map((m) => m.id)
      .filter((id) => id !== model);
    await this.db
      .update(userKeys)
      .set({ models: left, lastCheckedAt: this.now() })
      .where(and(eq(userKeys.userId, userId), eq(userKeys.provider, provider), eq(userKeys.nonce, nonce)));
  }

  /** Marks the saved version `nonce` of a key after a call it failed (a key saved again since then is left alone). */
  async mark(userId: string, provider: AiProvider, nonce: string, status: Exclude<KeyStatus, 'ok'>): Promise<void> {
    await this.db
      .update(userKeys)
      .set({ status, lastCheckedAt: this.now() })
      .where(and(eq(userKeys.userId, userId), eq(userKeys.provider, provider), eq(userKeys.nonce, nonce)));
  }
}
