/**
 * Encryption of the users' own AI keys: AES-256-GCM with a 32-byte secret read from the file USER_KEYS_SECRET_PATH
 * (outside the repo and the database, mode 600 or stricter). Every seal draws a fresh random 96-bit nonce; the
 * additional data binds the ciphertext to the account and the provider, so a ciphertext copied to another account or
 * another provider's slot does not open. Leaking the database alone (or its backup) leaks no key.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import type { AiProvider } from '../llm/providers';

export const SECRET_BYTES = 32;
export const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * The secret in `path`: exactly 32 bytes, readable by its owner only. Throws an error naming what is wrong (never
 * the file's content).
 */
export function loadUserKeysSecret(path: string): Buffer {
  let stat;
  try {
    stat = statSync(path);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'error';
    throw new Error(`cannot read the user keys secret file (${code})`, { cause: error });
  }
  if (!stat.isFile()) throw new Error('the user keys secret path is not a file');
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) throw new Error('the user keys secret file must be mode 600 (owner only)');
  if (stat.size !== SECRET_BYTES) throw new Error(`the user keys secret file must be exactly ${SECRET_BYTES} bytes`);
  const secret = readFileSync(path);
  if (secret.length !== SECRET_BYTES) throw new Error(`the user keys secret file must be exactly ${SECRET_BYTES} bytes`);
  return secret;
}

/** The secret, or null with the reason (own keys are off): the server starts either way. */
export function readUserKeysSecret(path: string | null): { secret: Buffer | null; status: string } {
  if (!path) return { secret: null, status: 'off (USER_KEYS_SECRET_PATH unset)' };
  try {
    return { secret: loadUserKeysSecret(path), status: 'on' };
  } catch (error) {
    return { secret: null, status: `off (${error instanceof Error ? error.message : 'unreadable secret'})` };
  }
}

/** A sealed key, both parts base64; the GCM tag is appended to the ciphertext. */
export interface SealedKey {
  ciphertext: string;
  nonce: string;
}

function additionalData(userId: string, provider: AiProvider): Buffer {
  return Buffer.from(`kb/user-key/v1\u0000${userId}\u0000${provider}`, 'utf8');
}

export function sealKey(secret: Buffer, userId: string, provider: AiProvider, plain: string): SealedKey {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', secret, nonce);
  cipher.setAAD(additionalData(userId, provider));
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext: encrypted.toString('base64'), nonce: nonce.toString('base64') };
}

/** The key, or null when it does not open: another secret, account or provider, or a damaged ciphertext or nonce. */
export function openKey(secret: Buffer, userId: string, provider: AiProvider, sealed: SealedKey): string | null {
  const nonce = Buffer.from(sealed.nonce, 'base64');
  const data = Buffer.from(sealed.ciphertext, 'base64');
  if (nonce.length !== NONCE_BYTES || data.length < TAG_BYTES || secret.length !== SECRET_BYTES) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', secret, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(additionalData(userId, provider));
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
    return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
