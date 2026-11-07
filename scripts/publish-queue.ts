/**
 * `pnpm publish:queue` (run by .github/workflows/publish-queue.yml): publishes every article in `content/queue/`
 * through the admin API, visible at once and marked as written by AI. No one reviews it by hand (owner's decision,
 * 07/11/2026): the routine reviews its own article before queueing it, and `check:queue` refuses the mechanical faults.
 *
 * For each queued article: makes its Space first when `content/spaces.json` lists it under `create` (409
 * `slug-taken` means it is there already); skips the call when the ledger already has the slug (a run that died after
 * publishing); then records `slug → id` in `content/published.json`, marks the topic `published` and removes the file.
 * A failed article keeps its file and its topic, so the next run tries again. Needs `KB_ADMIN_TOKEN`; `KB_ORIGIN`
 * defaults to https://kb.hoandat.com.
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_DIR, type PublishedPost, type Spaces, type Topic, checkQueued, parseArticle, queuedSlugs, readJson } from './content-queue';

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

export interface PublishOptions {
  dir: string;
  token: string;
  origin: string;
  fetch: Fetch;
  now: () => Date;
  log?: (line: string) => void;
}

export interface PublishResult {
  published: PublishedPost[];
  failed: Array<{ slug: string; reason: string }>;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function errorCode(body: unknown): string {
  return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : 'unknown';
}

export async function publishQueue({ dir, token, origin, fetch, now, log = console.log }: PublishOptions): Promise<PublishResult> {
  const spaces = await readJson<Spaces>(path.join(dir, 'spaces.json'));
  const topicsFile = path.join(dir, 'topics.json');
  const ledgerFile = path.join(dir, 'published.json');
  const { topics } = await readJson<{ topics: Topic[] }>(topicsFile);
  const ledger = await readJson<{ posts: PublishedPost[] }>(ledgerFile);
  const result: PublishResult = { published: [], failed: [] };
  const madeSpaces = new Set<string>();

  const post = async (route: string, body: unknown): Promise<{ status: number; body: unknown }> => {
    const res = await fetch(`${origin}/api/admin/${route}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const ensureSpace = async (slug: string): Promise<string | null> => {
    const spec = spaces.create.find((s) => s.slug === slug);
    if (!spec || madeSpaces.has(slug)) return null;
    const res = await post('spaces', spec);
    if (res.status === 201) log(`made Space ${slug}`);
    else if (res.status !== 409) return `Space ${slug}: ${res.status} ${errorCode(res.body)}`;
    madeSpaces.add(slug);
    return null;
  };

  const done = async (topic: Topic, file: string): Promise<void> => {
    topic.status = 'published';
    await rm(file);
  };

  for (const slug of await queuedSlugs(dir)) {
    const file = path.join(dir, 'queue', `${slug}.md`);
    const text = await readFile(file, 'utf8');
    const problems = checkQueued(slug, text, topics);
    const article = parseArticle(slug, text);
    const topic = topics.find((t) => t.slug === slug);
    if (problems.length > 0 || Array.isArray(article) || !topic) {
      result.failed.push({ slug, reason: problems.map((p) => p.message).join('; ') || 'invalid article' });
      continue;
    }
    if (ledger.posts.some((p) => p.slug === slug)) {
      log(`${slug} was published before; removing its queue file`);
      await done(topic, file);
      continue;
    }
    const spaceError = await ensureSpace(topic.space);
    if (spaceError) {
      result.failed.push({ slug, reason: spaceError });
      continue;
    }
    const res = await post('posts', {
      title: article.title,
      lang: topic.lang,
      space: topic.space,
      tags: article.tags,
      markdown: article.body,
      type: article.type,
      source: 'ai',
      hidden: false,
    });
    const id = typeof res.body === 'object' && res.body !== null && 'id' in res.body && typeof res.body.id === 'string' ? res.body.id : null;
    if (res.status !== 201 || !id) {
      result.failed.push({ slug, reason: `${res.status} ${errorCode(res.body)}` });
      continue;
    }
    const entry: PublishedPost = { slug, id, title: article.title, at: now().toISOString() };
    ledger.posts.push(entry);
    result.published.push(entry);
    // Write the ledger before removing the file: a run that dies here leaves a file the next run skips.
    await writeJson(ledgerFile, ledger);
    await done(topic, file);
    log(`published ${slug}: ${origin}/d/${id}`);
  }

  await writeJson(topicsFile, { topics });
  await writeJson(ledgerFile, ledger);
  return result;
}

async function main(): Promise<number> {
  if ((await queuedSlugs(CONTENT_DIR)).length === 0) {
    console.log('publish:queue: nothing queued');
    return 0;
  }
  const token = process.env.KB_ADMIN_TOKEN?.trim();
  if (!token) {
    console.error('publish:queue: KB_ADMIN_TOKEN is not set');
    return 1;
  }
  const result = await publishQueue({
    dir: CONTENT_DIR,
    token,
    origin: process.env.KB_ORIGIN?.trim() || 'https://kb.hoandat.com',
    fetch: (url, init) => fetch(url, init),
    now: () => new Date(),
  });
  for (const f of result.failed) console.error(`✗ ${f.slug}: ${f.reason}`);
  console.log(`published ${result.published.length}, failed ${result.failed.length}`);
  return result.failed.length > 0 ? 1 : 0;
}

// Run as a script, not when a test imports it.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error('publish:queue crashed:', error);
      process.exitCode = 1;
    },
  );
}
