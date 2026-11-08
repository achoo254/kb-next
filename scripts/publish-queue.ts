/**
 * `pnpm publish:queue` (run by .github/workflows/publish-queue.yml): publishes every queued planet through the admin
 * API, visible at once and marked as written by AI. No one reviews it by hand (owner's decision, 07/11/2026): the
 * routine reviews its own articles before queueing them, and `check:queue` refuses the mechanical faults.
 *
 * For each planet: makes its Space when `content/spaces.json` lists it under `create` (409 `slug-taken` means it is
 * there already), makes its Collection once (the ledger keeps its id; a top-up of a published planet goes into that
 * same Collection), then publishes its articles in the topic's `lang`, each after the
 * queued articles it links to so every `[[link]]` resolves. A Vietnamese article is followed at once by its English
 * twin (`<article>.en.md`), published as another language of the same text (`translationOf`), so the twin's links to
 * other English articles resolve too. Each publish is written to `content/published.json` at
 * once, so a run that dies never publishes twice. A planet whose articles and twins are all published loses its
 * folder and its topic becomes `published`; anything that failed stays for the next run. Needs `KB_ADMIN_TOKEN`; `KB_ORIGIN` defaults
 * to https://kb.hoandat.com.
 */
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_DIR, type Ledger, type PublishedPost, type QueuedArticle, type Spaces, type Topic, checkPlanets, linkedTitles, publishOrder, readJson, readQueue, titleKey } from './content-queue';

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
  /** The slugs of the articles whose English twin was published. */
  translated: string[];
  failed: Array<{ slug: string; reason: string }>;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function field(body: unknown, key: string): string | null {
  if (typeof body !== 'object' || body === null || !(key in body)) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

const planetOf = (slug: string): string => slug.split('/')[0] ?? slug;

export async function publishQueue({ dir, token, origin, fetch, now, log = console.log }: PublishOptions): Promise<PublishResult> {
  const spaces = await readJson<Spaces>(path.join(dir, 'spaces.json'));
  const topicsFile = path.join(dir, 'topics.json');
  const ledgerFile = path.join(dir, 'published.json');
  const { topics } = await readJson<{ topics: Topic[] }>(topicsFile);
  const ledger = await readJson<Ledger>(ledgerFile);
  const result: PublishResult = { published: [], translated: [], failed: [] };
  const failedPlanets = new Map<string, string>();

  const post = async (route: string, body: unknown): Promise<{ status: number; body: unknown }> => {
    const res = await fetch(`${origin}/api/admin/${route}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const failure = (res: { status: number; body: unknown }): string => `${res.status} ${field(res.body, 'error') ?? 'unknown'}`;

  // Check everything first: a planet with any problem waits for the next run as a whole.
  const queue = await readQueue(dir);
  const { problems, articles, twins } = checkPlanets(queue, topics, ledger);
  const circle = problems.some((p) => p.file === 'content/queue');
  for (const planet of queue) {
    const own = problems.filter((p) => circle || p.file === `content/queue/${planet.slug}` || p.file.startsWith(`content/queue/${planet.slug}/`));
    if (own.length > 0) failedPlanets.set(planet.slug, own.map((p) => p.message).join('; '));
  }

  // The Space and the Collection of each planet.
  const collections = new Map<string, string>();
  const madeSpaces = new Set<string>();
  for (const planet of queue.filter((p) => !failedPlanets.has(p.slug))) {
    const topic = topics.find((t) => t.slug === planet.slug);
    if (!topic) continue;
    // A planet in the ledger already has its Space and its Collection: a top-up, or a run that died, goes on there.
    const known = ledger.planets.find((p) => p.slug === planet.slug);
    if (known) {
      collections.set(planet.slug, known.collectionId);
      continue;
    }
    const spec = spaces.create.find((s) => s.slug === topic.space);
    if (spec && !madeSpaces.has(spec.slug)) {
      const res = await post('spaces', spec);
      if (res.status !== 201 && res.status !== 409) {
        failedPlanets.set(planet.slug, `Space ${spec.slug}: ${failure(res)}`);
        continue;
      }
      if (res.status === 201) log(`made Space ${spec.slug}`);
      madeSpaces.add(spec.slug);
    }
    // An English planet is named in English whichever language the reader picks.
    const res = await post('collections', { space: topic.space, nameVi: topic.lang === 'en' ? topic.nameEn : topic.name, nameEn: topic.nameEn });
    const id = field(res.body, 'id');
    if (res.status !== 201 || !id) {
      failedPlanets.set(planet.slug, `Collection: ${failure(res)}`);
      continue;
    }
    ledger.planets.push({ slug: planet.slug, space: topic.space, collectionId: id, at: now().toISOString() });
    await writeJson(ledgerFile, ledger);
    collections.set(planet.slug, id);
    log(`made planet ${planet.slug} in ${topic.space}`);
  }

  // The articles, a linked-to one before the one linking to it.
  const ready = [...articles.entries()].filter(([slug]) => collections.has(slug)).flatMap(([, list]) => list);
  const byKey = new Map(ready.map((a) => [titleKey(a.title), a]));
  const done = new Set(ledger.posts.map((p) => p.slug));
  for (const article of publishOrder(ready) ?? []) {
    let entry = ledger.posts.find((p) => p.slug === article.slug);
    if (!entry) {
      const waits = linkedTitles(article.body)
        .map((title) => byKey.get(titleKey(title)))
        .find((target): target is QueuedArticle => target !== undefined && target !== article && !done.has(target.slug));
      if (waits) {
        result.failed.push({ slug: article.slug, reason: `waits for ${waits.slug}` });
        continue;
      }
      const res = await post('posts', {
        title: article.title,
        lang: topics.find((t) => t.slug === planetOf(article.slug))?.lang ?? 'vi',
        collection: collections.get(planetOf(article.slug)),
        tags: article.tags,
        markdown: article.body,
        type: article.type,
        source: 'ai',
        hidden: false,
      });
      const id = field(res.body, 'id');
      if (res.status !== 201 || !id) {
        result.failed.push({ slug: article.slug, reason: failure(res) });
        continue;
      }
      entry = { slug: article.slug, id, title: article.title, at: now().toISOString() };
      ledger.posts.push(entry);
      done.add(article.slug);
      result.published.push(entry);
      // The ledger is written before anything else: a run that dies here never publishes this article again.
      await writeJson(ledgerFile, ledger);
      log(`published ${article.slug}: ${origin}/d/${id}`);
    }

    // The English twin goes right after its article (also on a later run, when the article is published already).
    const twin = twins.get(article.slug);
    if (!twin || entry.en) continue;
    const waitsTwin = linkedTitles(article.body)
      .map((title) => byKey.get(titleKey(title)))
      .find((target): target is QueuedArticle => target !== undefined && target !== article && twins.has(target.slug) && !ledger.posts.find((p) => p.slug === target.slug)?.en);
    if (waitsTwin) {
      result.failed.push({ slug: `${article.slug}.en`, reason: `waits for ${waitsTwin.slug}.en` });
      continue;
    }
    const res = await post('posts', { title: twin.title, lang: 'en', translationOf: entry.id, tags: twin.tags, markdown: twin.body, type: twin.type, source: 'ai', hidden: false });
    const twinId = field(res.body, 'id');
    if (res.status !== 201 || !twinId) {
      result.failed.push({ slug: `${article.slug}.en`, reason: failure(res) });
      continue;
    }
    entry.en = { id: twinId, title: twin.title };
    result.translated.push(article.slug);
    await writeJson(ledgerFile, ledger);
    log(`published ${article.slug}.en: ${origin}/d/${twinId}`);
  }

  for (const [slug, reason] of failedPlanets) result.failed.push({ slug, reason });
  for (const planet of queue) {
    const list = articles.get(planet.slug) ?? [];
    const translated = (a: QueuedArticle): boolean => !twins.has(a.slug) || ledger.posts.find((p) => p.slug === a.slug)?.en !== undefined;
    if (failedPlanets.has(planet.slug) || list.length === 0 || !list.every((a) => done.has(a.slug) && translated(a))) continue;
    await rm(path.join(dir, 'queue', planet.slug), { recursive: true });
    const topic = topics.find((t) => t.slug === planet.slug);
    if (topic) topic.status = 'published';
  }

  await writeJson(topicsFile, { topics });
  await writeJson(ledgerFile, ledger);
  return result;
}

async function main(): Promise<number> {
  if ((await readQueue(CONTENT_DIR)).length === 0) {
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
  console.log(`published ${result.published.length} (${result.translated.length} English twins), failed ${result.failed.length}`);
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
