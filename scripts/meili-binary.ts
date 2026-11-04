/**
 * The pinned Meilisearch release for dev and tests (no Docker on the dev machine): the binary for this OS/arch is
 * downloaded once into `.data/meili/` (gitignored) and kept only when its sha256 matches the pinned value.
 *
 * Pinned digests: the `digest` GitHub records for each asset of the release (GitHub Releases API,
 * `gh api repos/meilisearch/meilisearch/releases/tags/v1.56.1 -q '.assets[] | .name + " " + .digest'`).
 * Upgrading: change the version, the digests here, the Docker image in .github/workflows/ci.yml and in
 * docs/deployment-guide.md, together.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, chmod, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';

export const MEILI_VERSION = 'v1.56.1';

const ASSETS: Record<string, { name: string; sha256: string }> = {
  'darwin-arm64': { name: 'meilisearch-macos-apple-silicon', sha256: '293b48304c8452cf67c5ab3f5882e542bfe63d52f357bb155f576412cb6f739d' },
  'darwin-x64': { name: 'meilisearch-macos-amd64', sha256: 'cfd3d4214df99a0270227924cedb62f4db6a857c2ec26723a33b3086f59c3985' },
  'linux-x64': { name: 'meilisearch-linux-amd64', sha256: 'b2c7a647d4cdfdd7a901466bfd6797077b849e90f5eb2c0f5b1d05869592e27e' },
  'linux-arm64': { name: 'meilisearch-linux-aarch64', sha256: 'f73987f92b094fd15b79956f9bfc9e8fc7294ad6ad610ebf8a4403c170890726' },
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MEILI_DIR = path.join(ROOT, '.data', 'meili');
export const MEILI_BINARY = path.join(MEILI_DIR, `meilisearch-${MEILI_VERSION}`);

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Path of the pinned binary, downloading and verifying it first when missing. */
export async function ensureMeiliBinary(log: (message: string) => void = console.log): Promise<string> {
  if (await exists(MEILI_BINARY)) return MEILI_BINARY;
  const platform = `${process.platform}-${process.arch}`;
  const asset = ASSETS[platform];
  if (!asset) throw new Error(`no pinned Meilisearch ${MEILI_VERSION} binary for ${platform}`);
  await mkdir(MEILI_DIR, { recursive: true });
  const url = `https://github.com/meilisearch/meilisearch/releases/download/${MEILI_VERSION}/${asset.name}`;
  log(`downloading Meilisearch ${MEILI_VERSION} (${asset.name}, about 350 MB) into ${path.relative(ROOT, MEILI_DIR)}/`);
  const res = await fetch(url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!res.ok || !res.body) throw new Error(`Meilisearch download failed: HTTP ${res.status}`);
  // A unique partial name: two test files may download at once; the rename at the end is atomic.
  const partial = `${MEILI_BINARY}.${randomBytes(4).toString('hex')}.part`;
  const hash = createHash('sha256');
  try {
    await pipeline(
      // The DOM lib's ReadableStream type (root tsconfig) differs from node:stream/web's; at runtime they are one.
      Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(partial),
    );
    const digest = hash.digest('hex');
    if (digest !== asset.sha256) throw new Error(`Meilisearch download checksum mismatch: got ${digest}, pinned ${asset.sha256}`);
    await chmod(partial, 0o755);
    await rename(partial, MEILI_BINARY);
  } finally {
    await rm(partial, { force: true });
  }
  log(`Meilisearch ${MEILI_VERSION} verified (sha256 ${asset.sha256.slice(0, 12)}…)`);
  return MEILI_BINARY;
}

/** Flags every local instance uses: loopback, no telemetry, modest memory on a shared machine. */
export function meiliArgs(options: { port: number; dbPath: string; masterKey: string }): string[] {
  return [
    '--http-addr',
    `127.0.0.1:${options.port}`,
    '--db-path',
    options.dbPath,
    '--master-key',
    options.masterKey,
    '--env',
    'development',
    '--no-analytics',
    '--max-indexing-memory',
    '256MiB',
    '--max-indexing-threads',
    '2',
    '--log-level',
    'WARN',
  ];
}
