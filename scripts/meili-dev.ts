/**
 * `pnpm meili`: the dev Meilisearch, pinned version, on 127.0.0.1:5322 with its data in `.data/meili/data`.
 * Downloads and verifies the binary first when missing (scripts/meili-binary.ts). `--download-only` stops there.
 * The master key is MEILI_MASTER_KEY when set, else the dev default below (use the same in apps/server/.env).
 * Stops with Ctrl-C.
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { MEILI_DIR, MEILI_VERSION, ensureMeiliBinary, meiliArgs } from './meili-binary';

const DEV_PORT = 5322;
/** Loopback-only dev instance; never used anywhere else. */
const DEV_MASTER_KEY = 'kb-dev-meili-master-key';

async function alreadyRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${DEV_PORT}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  const binary = await ensureMeiliBinary();
  if (process.argv.includes('--download-only')) return 0;
  if (await alreadyRunning()) {
    console.log(`a Meilisearch already answers on 127.0.0.1:${DEV_PORT}; not starting another`);
    return 0;
  }
  const dbPath = path.join(MEILI_DIR, 'data');
  await mkdir(dbPath, { recursive: true });
  const masterKey = process.env.MEILI_MASTER_KEY || DEV_MASTER_KEY;
  console.log(`Meilisearch ${MEILI_VERSION} on http://127.0.0.1:${DEV_PORT} (data ${path.relative(process.cwd(), dbPath)})`);
  const child = spawn(binary, meiliArgs({ port: DEV_PORT, dbPath, masterKey }), { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill('SIGTERM'));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 0));
  });
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error('meili-dev failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
