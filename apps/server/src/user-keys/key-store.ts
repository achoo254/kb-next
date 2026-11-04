/**
 * The users' own AI keys and their choice of provider and model, in `user_keys` and `user_key_prefs`. Keys are
 * sealed with the secret (src/user-keys/crypto.ts) and opened only right before a call; what leaves this module for
 * a response is a KeyEntry (provider, last 4 characters, status, times), never the key.
 *
 * Which key a call uses (`active`): the provider the account chose when its key is `ok`, else the first `ok` key in
 * the order openai, gemini, anthropic; the model is the chosen one when it belongs to that provider, else its default.
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { userKeyPrefs, userKeyStatus, userKeys } from '../db/schema';
import { AI_PROVIDERS, type AiProvider, defaultModel, isListedModel } from '../llm/providers';
import { openKey, sealKey } from './crypto';

export type KeyStatus = (typeof userKeyStatus.enumValues)[number];

export interface KeyEntry {
  provider: AiProvider;
  last4: string;
  status: KeyStatus;
  updatedAt: string;
  lastCheckedAt: string | null;
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

const order = (provider: AiProvider): number => AI_PROVIDERS.indexOf(provider);

/** The last 4 characters, the only part of a key ever shown. */
export function last4Of(key: string): string {
  return key.slice(-4);
}

/** The provider and model a call would use, from the keys' statuses and the account's choice; null without an ok key. */
export function pickActive(keys: readonly KeyEntry[], prefs: KeyPrefs | null): ActiveChoice | null {
  const usable = keys.filter((k) => k.status === 'ok').sort((a, b) => order(a.provider) - order(b.provider));
  const chosen = (prefs && usable.find((k) => k.provider === prefs.provider)) ?? usable[0];
  if (!chosen) return null;
  const model = prefs && prefs.provider === chosen.provider && isListedModel(chosen.provider, prefs.model) ? prefs.model : defaultModel(chosen.provider);
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
      .select({ provider: userKeys.provider, last4: userKeys.last4, status: userKeys.status, updatedAt: userKeys.updatedAt, lastCheckedAt: userKeys.lastCheckedAt })
      .from(userKeys)
      .where(eq(userKeys.userId, userId));
    return rows
      .map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString(), lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null }))
      .sort((a, b) => order(a.provider) - order(b.provider));
  }

  /** Saves a key the provider just accepted (replacing the account's key of that provider). */
  async save(userId: string, provider: AiProvider, key: string): Promise<KeyEntry> {
    if (!this.secret) throw new Error('own keys are off');
    const sealed = sealKey(this.secret, userId, provider, key);
    const at = this.now();
    const values = { ...sealed, last4: last4Of(key), status: 'ok' as const, updatedAt: at, lastCheckedAt: at };
    await this.db
      .insert(userKeys)
      .values({ userId, provider, ...values, createdAt: at })
      .onConflictDoUpdate({ target: [userKeys.userId, userKeys.provider], set: values });
    return { provider, last4: values.last4, status: 'ok', updatedAt: at.toISOString(), lastCheckedAt: at.toISOString() };
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
   * The key a call uses, opened; null when the account has no usable key (or own keys are off). A key that no longer
   * opens (the secret changed) is marked `unreadable` and the next usable one is tried.
   */
  async open(userId: string): Promise<OpenedKey | null> {
    if (!this.secret) return null;
    const prefs = await this.prefs(userId);
    // Each failed round marks one key unreadable, so there are at most as many rounds as providers.
    for (let round = 0; round < AI_PROVIDERS.length; round++) {
      const choice = pickActive(await this.list(userId), prefs);
      if (!choice) return null;
      const [row] = await this.db
        .select({ ciphertext: userKeys.ciphertext, nonce: userKeys.nonce })
        .from(userKeys)
        .where(and(eq(userKeys.userId, userId), eq(userKeys.provider, choice.provider)));
      if (!row) return null;
      const apiKey = openKey(this.secret, userId, choice.provider, row);
      if (apiKey !== null) return { ...choice, apiKey, nonce: row.nonce };
      console.error(JSON.stringify({ event: 'user-key-unreadable', provider: choice.provider }));
      await this.mark(userId, choice.provider, row.nonce, 'unreadable');
    }
    return null;
  }

  /** Marks the saved version `nonce` of a key after a call it failed (a key saved again since then is left alone). */
  async mark(userId: string, provider: AiProvider, nonce: string, status: Exclude<KeyStatus, 'ok'>): Promise<void> {
    await this.db
      .update(userKeys)
      .set({ status, lastCheckedAt: this.now() })
      .where(and(eq(userKeys.userId, userId), eq(userKeys.provider, provider), eq(userKeys.nonce, nonce)));
  }
}
