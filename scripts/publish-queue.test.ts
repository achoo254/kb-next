import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIN_BODY_CHARS, type PublishedPost, type Topic } from './content-queue';
import { publishQueue } from './publish-queue';

const body = `## Mở đầu\n\n${'Một đoạn văn đủ dài để thành bài. '.repeat(Math.ceil(MIN_BODY_CHARS / 30))}`;
const NOW = new Date('2026-11-07T14:40:00Z');

interface Call {
  url: string;
  auth: string;
  body: Record<string, unknown>;
}

let dir = '';

async function setUp(topics: Topic[], queued: Record<string, string>, posts: PublishedPost[] = []): Promise<void> {
  await mkdir(path.join(dir, 'queue'), { recursive: true });
  const spaces = { existing: ['networking'], create: [{ slug: 'ky-nang', nameVi: 'Kỹ năng', nameEn: 'Skills', tint: '#FBCFE8', glow: '#EC4899', art: '/art/orb-universe.webp', unitVi: 'bài', unitEn: 'articles' }] };
  await writeFile(path.join(dir, 'spaces.json'), JSON.stringify(spaces));
  await writeFile(path.join(dir, 'topics.json'), JSON.stringify({ topics }));
  await writeFile(path.join(dir, 'published.json'), JSON.stringify({ posts }));
  await writeFile(path.join(dir, 'queue', '.gitkeep'), '');
  for (const [slug, text] of Object.entries(queued)) await writeFile(path.join(dir, 'queue', `${slug}.md`), text);
}

const topic = (slug: string, space = 'ky-nang'): Topic => ({ slug, space, lang: 'vi', title: slug, tech: false, brief: '', status: 'queued' });
const article = (title: string): string => `---\ntitle: ${title}\ntags: học tập\ntype: note\n---\n${body}`;

/** A fake admin API: answers by route, records each call. */
function fakeApi(answers: Record<string, Array<{ status: number; body: unknown }>>): { calls: Call[]; fetch: Parameters<typeof publishQueue>[0]['fetch'] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, auth: init.headers.authorization ?? '', body: JSON.parse(init.body) as Record<string, unknown> });
      const route = url.replace('https://kb.test/api/admin/', '');
      const answer = answers[route]?.shift() ?? { status: 500, body: { error: 'internal' } };
      return { status: answer.status, json: async () => answer.body };
    },
  };
}

const run = (fetch: Parameters<typeof publishQueue>[0]['fetch']) => publishQueue({ dir, token: 'kf_admin_test', origin: 'https://kb.test', fetch, now: () => NOW, log: () => {} });
const readTopics = async (): Promise<Topic[]> => (JSON.parse(await readFile(path.join(dir, 'topics.json'), 'utf8')) as { topics: Topic[] }).topics;
const readPosts = async (): Promise<PublishedPost[]> => (JSON.parse(await readFile(path.join(dir, 'published.json'), 'utf8')) as { posts: PublishedPost[] }).posts;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'kb-queue-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('publishQueue', () => {
  it('makes the Space, publishes as AI, visible, records the id and removes the file', async () => {
    await setUp([topic('ghi-chu')], { 'ghi-chu': article('Ghi chú Cornell') });
    const api = fakeApi({ spaces: [{ status: 201, body: { slug: 'ky-nang' } }], posts: [{ status: 201, body: { id: 'doc-1' } }] });
    const result = await run(api.fetch);
    expect(result).toEqual({ published: [{ slug: 'ghi-chu', id: 'doc-1', title: 'Ghi chú Cornell', at: NOW.toISOString() }], failed: [] });
    expect(api.calls.map((c) => c.url)).toEqual(['https://kb.test/api/admin/spaces', 'https://kb.test/api/admin/posts']);
    expect(api.calls.every((c) => c.auth === 'Bearer kf_admin_test')).toBe(true);
    expect(api.calls[1]?.body).toEqual({ title: 'Ghi chú Cornell', lang: 'vi', space: 'ky-nang', tags: ['học tập'], markdown: body.trim(), type: 'note', source: 'ai', hidden: false });
    expect(await readdir(path.join(dir, 'queue'))).toEqual(['.gitkeep']);
    expect((await readTopics())[0]?.status).toBe('published');
    expect(await readPosts()).toEqual(result.published);
  });

  it('takes an existing Space (409) once, and does not make a Space that is already on kb', async () => {
    await setUp([topic('a'), topic('b'), topic('c', 'networking')], { a: article('A'), b: article('B'), c: article('C') });
    const api = fakeApi({ spaces: [{ status: 409, body: { error: 'slug-taken' } }], posts: [1, 2, 3].map((n) => ({ status: 201, body: { id: `doc-${n}` } })) });
    const result = await run(api.fetch);
    expect(result.failed).toEqual([]);
    expect(api.calls.filter((c) => c.url.endsWith('/spaces'))).toHaveLength(1);
    expect(api.calls.filter((c) => c.url.endsWith('/posts')).map((c) => c.body.space)).toEqual(['ky-nang', 'ky-nang', 'networking']);
  });

  it('keeps a failed article for the next run and goes on with the others', async () => {
    await setUp([topic('a', 'networking'), topic('b', 'networking'), topic('c', 'networking')], { a: article('A'), b: article('B'), c: '---\ntitle: C\n---\nngắn' });
    const api = fakeApi({ posts: [{ status: 400, body: { error: 'invalid-body' } }, { status: 201, body: { id: 'doc-2' } }] });
    const result = await run(api.fetch);
    expect(result.failed.map((f) => [f.slug, f.reason])).toEqual([
      ['a', '400 invalid-body'],
      ['c', `body is shorter than ${MIN_BODY_CHARS} characters`],
    ]);
    expect(result.published.map((p) => p.slug)).toEqual(['b']);
    expect(await readdir(path.join(dir, 'queue'))).toEqual(['.gitkeep', 'a.md', 'c.md']);
    expect((await readTopics()).map((t) => t.status)).toEqual(['queued', 'published', 'queued']);
  });

  it('does not publish twice an article the ledger already has', async () => {
    const earlier: PublishedPost = { slug: 'a', id: 'doc-1', title: 'A', at: '2026-11-06T14:40:00.000Z' };
    await setUp([topic('a', 'networking')], { a: article('A') }, [earlier]);
    const api = fakeApi({});
    const result = await run(api.fetch);
    expect(api.calls).toEqual([]);
    expect(result).toEqual({ published: [], failed: [] });
    expect(await readdir(path.join(dir, 'queue'))).toEqual(['.gitkeep']);
    expect(await readPosts()).toEqual([earlier]);
  });

  it('stops at a Space it cannot make, keeping the article', async () => {
    await setUp([topic('a')], { a: article('A') });
    const api = fakeApi({ spaces: [{ status: 401, body: { error: 'invalid-token' } }] });
    const result = await run(api.fetch);
    expect(result.failed).toEqual([{ slug: 'a', reason: 'Space ky-nang: 401 invalid-token' }]);
    expect(api.calls.some((c) => c.url.endsWith('/posts'))).toBe(false);
  });
});
