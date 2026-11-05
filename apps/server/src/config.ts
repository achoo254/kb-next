import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
export const DEFAULT_ISSUER = 'https://auth.hoandat.com';
export const DEFAULT_CLIENT_ID = 'kb-web';
/** Apache Tika server on the same host (loopback), shared with other apps. */
export const DEFAULT_TIKA_URL = 'http://127.0.0.1:9998';
/** Uploaded files in production: outside the web root, owned by the user running `kb-server`. */
export const PRODUCTION_FILES_DIR = '/var/lib/kb/files';
/** The Office editor (ranuts/document, unmodified build) on its own subdomain in production (docs/office-editor.md). */
export const PRODUCTION_OFFICE_EDITOR_ORIGIN = 'https://kb-office.hoandat.com';
/** Uploaded files on a developer's machine: next to the dev PGlite directory (`.data/`, gitignored). */
export const DEV_FILES_DIR = fileURLToPath(new URL('../../../.data/files', import.meta.url));

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
  /** Apache Tika server that extracts the text of uploaded files (and OCRs scanned pages); loopback, or https. */
  TIKA_URL: z.preprocess(emptyIsUnset, z.url().default(DEFAULT_TIKA_URL)),
  /** Directory of uploaded files (`<FILES_DIR>/<storageKey>`); default /var/lib/kb/files in production, .data/files otherwise. */
  FILES_DIR: z.preprocess(emptyIsUnset, z.string().min(1).optional()),
  /**
   * How GET /api/files/:id sends a file: `x-accel` hands it to nginx (an `internal` location reads the files
   * directory, docs/deployment-guide.md); `node` streams it from this process (dev and tests, no nginx in front).
   * Default: x-accel in production, node otherwise.
   */
  FILE_DELIVERY: z.preprocess(emptyIsUnset, z.enum(['x-accel', 'node']).optional()),
  /**
   * Origin of the Office editor the web app embeds in an iframe (its own subdomain). Default in production:
   * https://kb-office.hoandat.com; unset elsewhere (Office files open read-only as their extracted text).
   */
  OFFICE_EDITOR_ORIGIN: z.preprocess(emptyIsUnset, z.url().optional()),
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
  /** Provider calls per minute per account on its own key: a Copilot question costs 1, a translation its calls. */
  askLimitPerMinute: number;
  /** Own-key saves per minute per account: each save calls the provider to check the key. */
  keySaveLimitPerMinute: number;
  /** Uploads and Office editor saves per minute per account: each is up to 25 MB on disk and a job in the shared queue. */
  uploadLimitPerMinute: number;
  /** Extraction retries per minute per account: each is a new run through the shared Tika. */
  retryLimitPerMinute: number;
  /** Load the dev seed at startup as this owner (KB_SEED=mock); null otherwise. Never set in production. */
  startupSeed: { ownerSub: string } | null;
  /** Base URL of the Tika server (no trailing slash). */
  tikaUrl: string;
  /** Absolute directory holding uploaded files by their storage key. */
  filesDir: string;
  /** How downloads leave the server (FILE_DELIVERY). */
  fileDelivery: 'x-accel' | 'node';
  /** Origin of the embedded Office editor (no trailing slash); null: no editor. */
  officeEditorOrigin: string | null;
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
  const tikaUrl = new URL(e.TIKA_URL);
  // File contents travel to Tika: in the clear only to this host.
  if (tikaUrl.protocol !== 'https:' && (tikaUrl.protocol !== 'http:' || !LOOPBACK_HOSTS.includes(tikaUrl.hostname))) {
    throw new Error('Invalid server env: TIKA_URL must be loopback http or https');
  }
  const editorUrl = e.OFFICE_EDITOR_ORIGIN ? new URL(e.OFFICE_EDITOR_ORIGIN) : production ? new URL(PRODUCTION_OFFICE_EDITOR_ORIGIN) : null;
  // File bytes go to that page: https only, plain http only on loopback outside production (a local editor build).
  if (editorUrl && editorUrl.protocol !== 'https:' && (production || editorUrl.protocol !== 'http:' || !LOOPBACK_HOSTS.includes(editorUrl.hostname))) {
    throw new Error('Invalid server env: OFFICE_EDITOR_ORIGIN must be https (http only on loopback outside production)');
  }
  if (editorUrl && editorUrl.origin === publicUrl.origin) throw new Error('Invalid server env: OFFICE_EDITOR_ORIGIN must be its own origin, not PUBLIC_URL');
  if (e.FILES_DIR && !path.isAbsolute(e.FILES_DIR)) throw new Error('Invalid server env: FILES_DIR must be an absolute path');
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
    uploadLimitPerMinute: 30,
    retryLimitPerMinute: 10,
    startupSeed: e.KB_SEED === 'mock' ? { ownerSub: e.SEED_OWNER_SUB ?? DEFAULT_SEED_OWNER_SUB } : null,
    tikaUrl: tikaUrl.href.replace(/\/$/, ''),
    filesDir: e.FILES_DIR ?? (production ? PRODUCTION_FILES_DIR : DEV_FILES_DIR),
    fileDelivery: e.FILE_DELIVERY ?? (production ? 'x-accel' : 'node'),
    officeEditorOrigin: editorUrl?.origin ?? null,
  };
}
