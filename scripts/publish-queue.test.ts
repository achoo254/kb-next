import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Ledger, MIN_BODY_CHARS, type Topic, linkedTitles, parseArticle } from './content-queue';
import { publishQueue } from './publish-queue';

const body = `> [!TLDR]\n> - Ý thứ nhất.\n> - Ý thứ hai.\n\n## Mở đầu\n\n${'Một đoạn văn đủ dài để thành bài. '.repeat(Math.ceil(MIN_BODY_CHARS / 30))}`;
const NOW = new Date('2026-11-07T13:00:00Z');
/** An article titled `title` whose body links to `links`. */
const linked = (title: string, ...links: string[]): string => `---\ntitle: ${title}\ntags: thử\n---\n${links.map((l) => `Xem [[${l}]].`).join(' ')}\n\n${body}`;
/** A planet of three articles: A links to B, B links to C. */
const trio = (prefix: string, ...outside: string[]): Record<string, string> => ({
  a: linked(`${prefix} A`, `${prefix} B`),
  b: linked(`${prefix} B`, `${prefix} C`),
  c: linked(`${prefix} C`, ...outside),
});

interface Call {
  route: string;
  auth: string;
  body: Record<string, unknown>;
}

let dir = '';

const englishBody = `> [!TLDR]\n> - First point.\n> - Second point.\n\n## Introduction\n\n${'An English paragraph long enough to make an article. '.repeat(Math.ceil(MIN_BODY_CHARS / 40))}`;
/** The English twin of a Vietnamese test article: its title and each link get " EN" added. */
const twinOf = (text: string): string => {
  const parsed = parseArticle('x', text);
  if (Array.isArray(parsed)) throw new Error(`bad test article: ${parsed.join('; ')}`);
  return `---\ntitle: ${parsed.title} EN\ntags: test\n---\n${linkedTitles(parsed.body).map((l) => `See [[${l} EN]].`).join(' ')}\n\n${englishBody}`;
};
/** A ledger whose articles have English twins (titles with " EN" added), except those with `en: undefined` set. */
const withEnglish = (ledger: Ledger): Ledger => ({ ...ledger, posts: ledger.posts.map((p) => ({ ...p, en: 'en' in p ? p.en : { id: `en-${p.id}`, title: `${p.title} EN` } })) });

async function setUp(topics: Topic[], planets: Record<string, Record<string, string>>, ledger: Ledger = { planets: [], posts: [] }): Promise<void> {
  await mkdir(path.join(dir, 'queue'), { recursive: true });
  const spaces = { existing: ['networking'], create: [{ slug: 'ky-nang', nameVi: 'Kỹ năng', nameEn: 'Skills', tint: '#FBCFE8', glow: '#EC4899', art: '/art/orb-universe.webp', unitVi: 'bài', unitEn: 'articles' }] };
  await writeFile(path.join(dir, 'spaces.json'), JSON.stringify(spaces));
  await writeFile(path.join(dir, 'topics.json'), JSON.stringify({ topics }));
  await writeFile(path.join(dir, 'published.json'), JSON.stringify(withEnglish(ledger)));
  await writeFile(path.join(dir, 'queue', '.gitkeep'), '');
  for (const [planet, files] of Object.entries(planets)) {
    await mkdir(path.join(dir, 'queue', planet));
    for (const [name, text] of Object.entries(files)) {
      await writeFile(path.join(dir, 'queue', planet, `${name}.md`), text);
      // A Vietnamese planet's article comes with its English twin.
      if (topics.find((t) => t.slug === planet)?.lang === 'vi') await writeFile(path.join(dir, 'queue', planet, `${name}.en.md`), twinOf(text));
    }
  }
}

const linkedEn = (title: string, ...links: string[]): string => `---\ntitle: ${title}\ntags: test\n---\n${links.map((l) => `See [[${l}]].`).join(' ')}\n\n${englishBody}`;
const topic = (slug: string, space = 'ky-nang'): Topic => ({ slug, space, lang: 'vi', name: `Hành tinh ${slug}`, nameEn: `Planet ${slug}`, tech: false, brief: '', status: 'queued' });

/** A fake admin API: answers posts with fresh ids unless told otherwise, records each call. */
function fakeApi(answers: Record<string, Array<{ status: number; body: unknown }>> = {}): { calls: Call[]; fetch: Parameters<typeof publishQueue>[0]['fetch'] } {
  const calls: Call[] = [];
  let next = 0;
  return {
    calls,
    fetch: async (url, init) => {
      const route = url.replace('https://kb.test/api/admin/', '');
      calls.push({ route, auth: init.headers.authorization ?? '', body: JSON.parse(init.body) as Record<string, unknown> });
      next += 1;
      const answer = answers[route]?.shift() ?? { status: 201, body: route === 'spaces' ? { slug: 'x' } : { id: `${route}-${next}` } };
      return { status: answer.status, json: async () => answer.body };
    },
  };
}

const run = (fetch: Parameters<typeof publishQueue>[0]['fetch']) => publishQueue({ dir, token: 'kf_admin_test', origin: 'https://kb.test', fetch, now: () => NOW, log: () => {} });
const readTopics = async (): Promise<Topic[]> => (JSON.parse(await readFile(path.join(dir, 'topics.json'), 'utf8')) as { topics: Topic[] }).topics;
const readLedger = async (): Promise<Ledger> => JSON.parse(await readFile(path.join(dir, 'published.json'), 'utf8')) as Ledger;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'kb-queue-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('publishQueue', () => {
  it('makes the Space and the planet, publishes linked-to articles first, visible as AI, then removes the folder', async () => {
    await setUp([topic('p')], { p: trio('P') });
    const api = fakeApi();
    const result = await run(api.fetch);
    expect(result.failed).toEqual([]);
    expect(api.calls.map((c) => c.route)).toEqual(['spaces', 'collections', 'posts', 'posts', 'posts', 'posts', 'posts', 'posts']);
    expect(api.calls.every((c) => c.auth === 'Bearer kf_admin_test')).toBe(true);
    expect(api.calls[1]?.body).toEqual({ space: 'ky-nang', nameVi: 'Hành tinh p', nameEn: 'Planet p' });
    const posts = api.calls.filter((c) => c.route === 'posts');
    // Each Vietnamese article is followed at once by its English twin.
    expect(posts.map((c) => c.body.title)).toEqual(['P C', 'P C EN', 'P B', 'P B EN', 'P A', 'P A EN']);
    expect(posts[0]?.body).toMatchObject({ lang: 'vi', collection: 'collections-2', tags: ['thử'], type: 'note', source: 'ai', hidden: false });
    expect(posts[1]?.body).toMatchObject({ lang: 'en', translationOf: 'posts-3', tags: ['test'], type: 'note', source: 'ai', hidden: false });
    expect(posts[1]?.body.collection).toBeUndefined();
    expect(result.translated).toEqual(['p/c', 'p/b', 'p/a']);
    expect(await readdir(path.join(dir, 'queue'))).toEqual(['.gitkeep']);
    expect((await readTopics())[0]?.status).toBe('published');
    const ledger = await readLedger();
    expect(ledger.planets).toEqual([{ slug: 'p', space: 'ky-nang', collectionId: 'collections-2', at: NOW.toISOString() }]);
    expect(ledger.posts.map((p) => [p.slug, p.en?.title])).toEqual([['p/c', 'P C EN'], ['p/b', 'P B EN'], ['p/a', 'P A EN']]);
  });

  it('publishes three planets of a day in order across planets, making an existing Space only once', async () => {
    const ledger: Ledger = { planets: [], posts: [{ slug: 'old', id: 'doc-0', title: 'Bài cũ', at: '' }] };
    await setUp([topic('p'), topic('q'), topic('r', 'networking')], { p: trio('P', 'Bài cũ'), q: trio('Q', 'P A'), r: trio('R', 'Q A') }, ledger);
    const api = fakeApi({ spaces: [{ status: 409, body: { error: 'slug-taken' } }] });
    const result = await run(api.fetch);
    expect(result.failed).toEqual([]);
    expect(api.calls.filter((c) => c.route === 'spaces')).toHaveLength(1);
    expect(api.calls.filter((c) => c.route === 'collections').map((c) => c.body.space)).toEqual(['ky-nang', 'ky-nang', 'networking']);
    const titles = api.calls.filter((c) => c.route === 'posts').map((c) => String(c.body.title));
    expect(titles.indexOf('P A')).toBeLessThan(titles.indexOf('Q C'));
    expect(titles.indexOf('Q A')).toBeLessThan(titles.indexOf('R C'));
    expect((await readTopics()).map((t) => t.status)).toEqual(['published', 'published', 'published']);
  });

  it('keeps a planet whose article failed, holds back the articles linking to it, and reuses its planet next time', async () => {
    await setUp([topic('p', 'networking')], { p: trio('P') });
    const first = fakeApi({ posts: [{ status: 400, body: { error: 'invalid-body' } }] });
    const result = await run(first.fetch);
    expect(result.failed).toEqual([
      { slug: 'p/c', reason: '400 invalid-body' },
      { slug: 'p/b', reason: 'waits for p/c' },
      { slug: 'p/a', reason: 'waits for p/b' },
    ]);
    expect((await readdir(path.join(dir, 'queue', 'p'))).sort()).toEqual(['a.en.md', 'a.md', 'b.en.md', 'b.md', 'c.en.md', 'c.md']);
    expect((await readTopics())[0]?.status).toBe('queued');

    const second = fakeApi();
    expect((await run(second.fetch)).failed).toEqual([]);
    expect(second.calls.map((c) => c.route)).toEqual(['posts', 'posts', 'posts', 'posts', 'posts', 'posts']);
    expect(second.calls[0]?.body.collection).toBe('collections-1');
  });

  it('keeps the folder when a twin fails, and the next run publishes only the missing twin', async () => {
    await setUp([topic('p', 'networking')], { p: trio('P') });
    // The first twin (of P C) is refused: every Vietnamese article still publishes, and the twins of the articles linking to it wait.
    const first = fakeApi({ posts: [{ status: 201, body: { id: 'doc-c' } }, { status: 400, body: { error: 'invalid-body' } }] });
    const result = await run(first.fetch);
    expect(result.failed.map((f) => [f.slug, f.reason])).toEqual([
      ['p/c.en', '400 invalid-body'],
      ['p/b.en', 'waits for p/c.en'],
      ['p/a.en', 'waits for p/b.en'],
    ]);
    expect((await readLedger()).posts.map((p) => [p.slug, p.en?.title])).toEqual([['p/c', undefined], ['p/b', undefined], ['p/a', undefined]]);
    expect((await readTopics())[0]?.status).toBe('queued');

    const second = fakeApi();
    expect((await run(second.fetch)).failed).toEqual([]);
    expect(second.calls.map((c) => [c.body.title, c.body.translationOf])).toEqual([
      ['P C EN', 'doc-c'],
      ['P B EN', 'posts-4'],
      ['P A EN', 'posts-5'],
    ]);
    expect(await readdir(path.join(dir, 'queue'))).toEqual(['.gitkeep']);
    expect((await readTopics())[0]?.status).toBe('published');
  });

  it('goes on after a run that died: does not publish twice what the ledger already has', async () => {
    const ledger: Ledger = { planets: [{ slug: 'p', space: 'networking', collectionId: 'col-1', at: '' }], posts: [{ slug: 'p/c', id: 'doc-1', title: 'P C', at: '', en: undefined }] };
    await setUp([topic('p', 'networking')], { p: trio('P') }, ledger);
    const api = fakeApi();
    const result = await run(api.fetch);
    expect(result.failed).toEqual([]);
    // The twin of the article that was published before the run died comes first, then the rest.
    expect(api.calls.map((c) => [c.route, c.body.title, c.body.collection, c.body.translationOf])).toEqual([
      ['posts', 'P C EN', undefined, 'doc-1'],
      ['posts', 'P B', 'col-1', undefined],
      ['posts', 'P B EN', undefined, 'posts-2'],
      ['posts', 'P A', 'col-1', undefined],
      ['posts', 'P A EN', undefined, 'posts-4'],
    ]);
    expect(await readdir(path.join(dir, 'queue'))).toEqual(['.gitkeep']);
  });

  it('holds a planet that fails its checks, and stops at a Space it cannot make', async () => {
    await setUp([topic('p'), topic('q', 'networking')], { p: trio('P', 'Q A'), q: { a: linked('Q A') } });
    const api = fakeApi({ spaces: [{ status: 401, body: { error: 'invalid-token' } }] });
    const result = await run(api.fetch);
    expect(result.failed.map((f) => f.slug).sort()).toEqual(['p', 'q']);
    expect(result.failed.find((f) => f.slug === 'p')?.reason).toBe('Space ky-nang: 401 invalid-token');
    expect(api.calls.some((c) => c.route === 'posts')).toBe(false);
  });

  it('tops up a published planet in its own Collection, without a second planet in the ledger', async () => {
    const ledger: Ledger = {
      planets: [{ slug: 'p', space: 'ky-nang', collectionId: 'col-1', at: 'earlier' }],
      posts: [
        { slug: 'p/a', id: 'doc-1', title: 'P A', at: '' },
        { slug: 'p/b', id: 'doc-2', title: 'P B', at: '' },
        { slug: 'p/c', id: 'doc-3', title: 'P C', at: '' },
      ],
    };
    // The topic was put back to todo with a new brief, then queued.
    await setUp([topic('p')], { p: { d: linked('P D', 'P A'), e: linked('P E', 'P D') } }, ledger);
    const api = fakeApi();
    const result = await run(api.fetch);
    expect(result.failed).toEqual([]);
    expect(api.calls.map((c) => [c.route, c.body.title, c.body.collection])).toEqual([
      ['posts', 'P D', 'col-1'],
      ['posts', 'P D EN', undefined],
      ['posts', 'P E', 'col-1'],
      ['posts', 'P E EN', undefined],
    ]);
    expect(await readdir(path.join(dir, 'queue'))).toEqual(['.gitkeep']);
    expect((await readTopics())[0]?.status).toBe('published');
    const after = await readLedger();
    expect(after.planets).toEqual(ledger.planets);
    expect(after.posts.map((p) => p.slug)).toEqual(['p/a', 'p/b', 'p/c', 'p/d', 'p/e']);
  });

  it('publishes an English planet in English, its Collection named in English', async () => {
    const en: Topic = { ...topic('p-en'), lang: 'en', name: 'Hành tinh p', nameEn: 'Planet p' };
    await setUp([en], { 'p-en': { a: linkedEn('A', 'B'), b: linkedEn('B', 'C'), c: linkedEn('C') } });
    const api = fakeApi();
    expect((await run(api.fetch)).failed).toEqual([]);
    expect(api.calls.find((c) => c.route === 'collections')?.body).toEqual({ space: 'ky-nang', nameVi: 'Planet p', nameEn: 'Planet p' });
    expect(api.calls.filter((c) => c.route === 'posts').map((c) => c.body.lang)).toEqual(['en', 'en', 'en']);
  });

  it('holds an English planet whose articles are in Vietnamese', async () => {
    await setUp([{ ...topic('p-en'), lang: 'en' }], { 'p-en': trio('P') });
    const api = fakeApi();
    const result = await run(api.fetch);
    expect(result.failed.map((f) => f.slug)).toEqual(['p-en']);
    expect(api.calls).toEqual([]);
  });
});
