/**
 * A real Meilisearch for one test file. With MEILI_URL set (CI's service container) it uses that instance under a
 * prefix unique to the file; otherwise it starts the pinned binary (downloaded and verified on first use by
 * scripts/meili-binary.ts) on a free loopback port with a throwaway data directory, and stops it on `close`.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { type AddressInfo, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureMeiliBinary, meiliArgs } from '../../../scripts/meili-binary';
import type { MeiliConfig } from '../src/config';
import { MeiliClient } from '../src/search/meili-client';
import { INDEX_NAMES } from '../src/search/search-indexes';

/** First run on a machine downloads about 350 MB: give `beforeAll` this long. */
export const MEILI_SETUP_TIMEOUT_MS = 15 * 60 * 1000;

export interface TestMeili {
  config: MeiliConfig;
  client: MeiliClient;
  close(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

async function waitHealthy(client: MeiliClient, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`test Meilisearch exited with ${child.exitCode}`);
    if (await client.isHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('test Meilisearch did not become healthy in 30 s');
}

export async function startTestMeili(): Promise<TestMeili> {
  const indexPrefix = `t${randomBytes(4).toString('hex')}_`;
  const sharedUrl = process.env.MEILI_URL;
  if (sharedUrl) {
    const config = { url: sharedUrl.replace(/\/$/, ''), apiKey: process.env.MEILI_MASTER_KEY ?? '', indexPrefix };
    const client = new MeiliClient(config);
    return {
      config,
      client,
      async close() {
        for (const name of INDEX_NAMES) {
          await client.deleteIndex(client.uid(name));
          await client.deleteIndex(client.uid(`${name}_rebuild`));
        }
      },
    };
  }

  const binary = await ensureMeiliBinary();
  const port = await freePort();
  const dbPath = await mkdtemp(path.join(tmpdir(), 'kb-meili-test-'));
  const config = { url: `http://127.0.0.1:${port}`, apiKey: randomBytes(24).toString('hex'), indexPrefix };
  const child = spawn(binary, meiliArgs({ port, dbPath, masterKey: config.apiKey }), { stdio: 'ignore' });
  // A crashed test worker must not leave the instance running.
  const killOnExit = (): void => {
    child.kill('SIGKILL');
  };
  process.once('exit', killOnExit);
  const client = new MeiliClient(config);
  const stop = async (): Promise<void> => {
    if (child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await exited;
    }
    process.off('exit', killOnExit);
    await rm(dbPath, { recursive: true, force: true });
  };
  try {
    await waitHealthy(client, child);
  } catch (error) {
    await stop();
    throw error;
  }
  return { config, client, close: stop };
}
