import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { NONCE_BYTES, loadUserKeysSecret, openKey, readUserKeysSecret, sealKey } from './crypto';

const KEY = 'sk-test-0123456789abcdefWXYZ';
const secret = randomBytes(32);
const dirs: string[] = [];

afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

async function secretFile(bytes: Buffer, mode: number): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'kb-secret-'));
  dirs.push(dir);
  const file = path.join(dir, 'secret');
  await writeFile(file, bytes);
  await chmod(file, mode);
  return file;
}

describe('own key encryption', () => {
  it('opens with the same secret, account and provider, and the ciphertext does not show the key', () => {
    const sealed = sealKey(secret, 'user-1', 'openai', KEY);
    expect(openKey(secret, 'user-1', 'openai', sealed)).toBe(KEY);
    expect(Buffer.from(sealed.nonce, 'base64')).toHaveLength(NONCE_BYTES);
    expect(Buffer.from(sealed.ciphertext, 'base64').toString('latin1')).not.toContain('WXYZ');
  });

  it('does not open for another account, provider or secret, nor a damaged ciphertext or nonce', () => {
    const sealed = sealKey(secret, 'user-1', 'openai', KEY);
    expect(openKey(secret, 'user-2', 'openai', sealed)).toBeNull();
    expect(openKey(secret, 'user-1', 'gemini', sealed)).toBeNull();
    expect(openKey(randomBytes(32), 'user-1', 'openai', sealed)).toBeNull();
    const damaged = Buffer.from(sealed.ciphertext, 'base64');
    damaged[0] = (damaged[0] ?? 0) ^ 1;
    expect(openKey(secret, 'user-1', 'openai', { ...sealed, ciphertext: damaged.toString('base64') })).toBeNull();
    expect(openKey(secret, 'user-1', 'openai', { ...sealed, nonce: Buffer.alloc(8).toString('base64') })).toBeNull();
    expect(openKey(secret, 'user-1', 'openai', { ...sealed, ciphertext: '' })).toBeNull();
  });

  it('draws a fresh nonce for every seal', () => {
    const nonces = new Set(Array.from({ length: 1_000 }, () => sealKey(secret, 'u', 'anthropic', KEY).nonce));
    expect(nonces.size).toBe(1_000);
  });
});

describe('secret file', () => {
  it('must be exactly 32 bytes and readable by its owner only', async () => {
    expect(loadUserKeysSecret(await secretFile(secret, 0o600)).equals(secret)).toBe(true);
    expect(loadUserKeysSecret(await secretFile(secret, 0o400)).equals(secret)).toBe(true);
    expect(() => loadUserKeysSecret(tmpdir())).toThrow(/not a file/);
    expect(() => loadUserKeysSecret(path.join(tmpdir(), 'kb-no-such-secret'))).toThrow(/cannot read the user keys secret file \(ENOENT\)/);
    await expect(secretFile(secret, 0o644).then(loadUserKeysSecret)).rejects.toThrow(/mode 600/);
    await expect(secretFile(secret, 0o640).then(loadUserKeysSecret)).rejects.toThrow(/mode 600/);
    await expect(secretFile(randomBytes(31), 0o600).then(loadUserKeysSecret)).rejects.toThrow(/exactly 32 bytes/);
    await expect(secretFile(randomBytes(33), 0o600).then(loadUserKeysSecret)).rejects.toThrow(/exactly 32 bytes/);
  });

  it('turns own keys off instead of stopping the server, saying why without the content', async () => {
    expect(readUserKeysSecret(null)).toEqual({ secret: null, status: 'off (USER_KEYS_SECRET_PATH unset)' });
    const open = readUserKeysSecret(await secretFile(secret, 0o644));
    expect(open.secret).toBeNull();
    expect(open.status).toMatch(/^off \(.*mode 600/);
    expect(readUserKeysSecret(await secretFile(secret, 0o600))).toMatchObject({ status: 'on' });
  });
});
