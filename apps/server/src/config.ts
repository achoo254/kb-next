import { z } from 'zod';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
export const DEFAULT_ISSUER = 'https://auth.hoandat.com';
export const DEFAULT_CLIENT_ID = 'kb-web';

/** An env line with nothing after `=` counts as not set. */
const emptyIsUnset = (value: unknown): unknown => (value === '' ? undefined : value);

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5320),
  /** Public origin of the app; the sign-in callback is PUBLIC_URL/auth/callback. */
  PUBLIC_URL: z.preprocess(emptyIsUnset, z.url().default('http://localhost:5321')),
  DATABASE_URL: z.preprocess(emptyIsUnset, z.url().optional()),
  /** PGlite directory when DATABASE_URL is unset; `memory` keeps it in RAM (E2E starts from an empty database). */
  PGLITE_DIR: z.preprocess(emptyIsUnset, z.string().min(1).optional()),
  AUTH_ISSUER: z.preprocess(emptyIsUnset, z.url().default(DEFAULT_ISSUER)),
  /** `kb-web` in production; `kb-web-dev` on a developer's machine (the IdP's loopback client). */
  AUTH_CLIENT_ID: z.preprocess(emptyIsUnset, z.string().min(1).default(DEFAULT_CLIENT_ID)),
  /** Secret of that confidential client. Unset: sign-in is off (only the public pages work). */
  AUTH_CLIENT_SECRET: z.preprocess(emptyIsUnset, z.string().min(32).optional()),
  /** IdP subs of the admins, comma-separated. There is no other way to become one. */
  ADMIN_SUBS: z.preprocess(emptyIsUnset, z.string().optional()),
  /** Meilisearch of kb (loopback). Unset outside production: search sync is off and the server still runs. */
  MEILI_URL: z.preprocess(emptyIsUnset, z.url().optional()),
  MEILI_MASTER_KEY: z.preprocess(emptyIsUnset, z.string().min(16).optional()),
  /** TypeSafe key for Jev (server-side judgments such as the crystal captions). Unset: those fall back to plain text. */
  TYPESAFE_API_KEY: z.preprocess(emptyIsUnset, z.string().min(8).optional()),
  /**
   * File holding the 32-byte secret that encrypts the users' own AI keys (mode 600 or stricter). Unset, unreadable,
   * the wrong size or too open: own keys are off (the Copilot answers 503) and the server still runs.
   */
  USER_KEYS_SECRET_PATH: z.preprocess(emptyIsUnset, z.string().min(1).optional()),
  /** `mock`: load the dev seed (the mock's Spaces and documents) at startup, for E2E. Refused in production. */
  KB_SEED: z.preprocess(emptyIsUnset, z.enum(['mock']).optional()),
  /** IdP sub that owns the seed's personal Space and private documents (KB_SEED and `pnpm seed`). */
  SEED_OWNER_SUB: z.preprocess(emptyIsUnset, z.string().trim().min(1).optional()),
});

export interface AuthConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface MeiliConfig {
  url: string;
  apiKey: string;
  /** Prepended to the index names (`kb_public`, `kb_private`); empty in production, unique per test file. */
  indexPrefix: string;
}

export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  /** Origin of the web app: the only origin allowed to make state-changing requests (CSRF check). */
  publicOrigin: string;
  databaseUrl: string | undefined;
  /** PGlite location when no DATABASE_URL: a directory, null for in-memory, undefined for the dev default. */
  pgliteDir: string | null | undefined;
  /** Sign-in through the hoandat.com account; null when AUTH_CLIENT_SECRET is not set. */
  auth: AuthConfig | null;
  /** IdP subs of the admins (ADMIN_SUBS). */
  adminSubs: ReadonlySet<string>;
  /** Search index; null when MEILI_URL is unset (dev/test only). */
  meili: MeiliConfig | null;
  /**
   * Sign-in starts per 15 minutes per IP. Generous: mobile carriers put many people behind one address, and the
   * real client IP is the one nginx forwards (Cloudflare's real-IP restore is global on the host).
   */
  signInLimitPer15Min: number;
  /** Back-channel logout calls per 15 minutes per IP (the IdP calls from one address). */
  backchannelLimitPer15Min: number;
  /**
   * Searches per minute per account (per IP for guests): no cap on Jev requests, only this limit against abuse of
   * the shared API. A search as you type in ⌘K and C12 sends two requests per pause in typing.
   */
  searchLimitPerMinute: number;
  /** TypeSafe API key for Jev; null when unset (Jev-made choices use their plain fallback). */
  typesafeApiKey: string | null;
  /** Secret file of the users' own AI keys (USER_KEYS_SECRET_PATH); null when unset (own keys off). */
  userKeysSecretPath: string | null;
  /** Copilot questions and translations per minute per account (each is a call billed to the user's own key). */
  askLimitPerMinute: number;
  /** Own-key saves per minute per account: each save calls the provider to check the key. */
  keySaveLimitPerMinute: number;
  /** Load the dev seed at startup as this owner (KB_SEED=mock); null otherwise. Never set in production. */
  startupSeed: { ownerSub: string } | null;
}

/** The seed's owner when SEED_OWNER_SUB is unset: the seed admin. */
export const DEFAULT_SEED_OWNER_SUB = 'seed:dat';

/** Validates env once at startup; throws naming the offending keys (never their values) so the process fails fast. */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid server env: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  const publicUrl = new URL(e.PUBLIC_URL);
  const issuerUrl = new URL(e.AUTH_ISSUER);
  if (production) {
    const missing = [
      !e.DATABASE_URL && 'DATABASE_URL',
      !e.AUTH_CLIENT_SECRET && 'AUTH_CLIENT_SECRET',
      !e.MEILI_URL && 'MEILI_URL',
      !e.MEILI_MASTER_KEY && 'MEILI_MASTER_KEY',
    ].filter(Boolean);
    if (missing.length > 0) throw new Error(`Invalid server env: ${missing.join(', ')} required in production`);
    if (publicUrl.protocol !== 'https:') throw new Error('Invalid server env: PUBLIC_URL must be https in production');
    if (e.PGLITE_DIR) throw new Error('Invalid server env: PGLITE_DIR is dev/test only');
    if (e.KB_SEED) throw new Error('Invalid server env: KB_SEED is dev/test only');
  }
  // https only; plain http only for a local fake IdP outside production (E2E).
  if (issuerUrl.protocol !== 'https:' && (production || issuerUrl.protocol !== 'http:' || !LOOPBACK_HOSTS.includes(issuerUrl.hostname))) {
    throw new Error('Invalid server env: AUTH_ISSUER must be https (http only on loopback outside production)');
  }
  if (Boolean(e.MEILI_URL) !== Boolean(e.MEILI_MASTER_KEY)) {
    throw new Error('Invalid server env: MEILI_URL and MEILI_MASTER_KEY go together');
  }
  // The code exchange is only as trustworthy as the TLS it travels over.
  if (e.AUTH_CLIENT_SECRET && env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error('Invalid server env: NODE_TLS_REJECT_UNAUTHORIZED=0 is not allowed with sign-in');
  }
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    publicOrigin: publicUrl.origin,
    databaseUrl: e.DATABASE_URL,
    pgliteDir: e.PGLITE_DIR === 'memory' ? null : e.PGLITE_DIR,
    auth: e.AUTH_CLIENT_SECRET
      ? {
          issuer: issuerUrl.href.replace(/\/$/, ''),
          clientId: e.AUTH_CLIENT_ID,
          clientSecret: e.AUTH_CLIENT_SECRET,
          redirectUri: `${publicUrl.origin}/auth/callback`,
        }
      : null,
    adminSubs: new Set((e.ADMIN_SUBS ?? '').split(',').map((sub) => sub.trim()).filter((sub) => sub.length > 0)),
    meili: e.MEILI_URL && e.MEILI_MASTER_KEY ? { url: e.MEILI_URL.replace(/\/$/, ''), apiKey: e.MEILI_MASTER_KEY, indexPrefix: '' } : null,
    signInLimitPer15Min: 100,
    backchannelLimitPer15Min: 300,
    searchLimitPerMinute: 120,
    typesafeApiKey: e.TYPESAFE_API_KEY ?? null,
    userKeysSecretPath: e.USER_KEYS_SECRET_PATH ?? null,
    askLimitPerMinute: 20,
    keySaveLimitPerMinute: 5,
    startupSeed: e.KB_SEED === 'mock' ? { ownerSub: e.SEED_OWNER_SUB ?? DEFAULT_SEED_OWNER_SUB } : null,
  };
}
