import { describe, expect, it } from 'vitest';
import { CONTENT_DIR, type Ledger, MIN_BODY_CHARS, type QueuedPlanet, type Spaces, type Topic, checkContent, checkPlanets, checkTopics, linkedTitles, parseArticle, publishOrder, titleKey } from './content-queue';

const filler = 'Một đoạn văn đủ dài để thành bài. '.repeat(Math.ceil(MIN_BODY_CHARS / 30));
const body = `## Mở đầu\n\n${filler}`;
const article = (head: string, text = body): string => `---\n${head}\n---\n${text}`;
/** An article titled `title` whose body links to `links`. */
const linked = (title: string, ...links: string[]): string => article(`title: ${title}\ntags: thử`, `${links.map((l) => `Xem [[${l}]].`).join(' ')}\n\n${body}`);
const spaces: Spaces = { existing: ['networking'], create: [{ slug: 'ky-nang', nameVi: 'Kỹ năng', nameEn: 'Skills', tint: '#FBCFE8', glow: '#EC4899', art: '/art/orb-universe.webp', unitVi: 'bài', unitEn: 'articles' }] };
const topic = (slug: string, extra: Partial<Topic> = {}): Topic => ({ slug, space: 'ky-nang', lang: 'vi', name: slug, nameEn: slug, tech: false, brief: '', status: 'todo', ...extra });
const empty: Ledger = { planets: [], posts: [] };
const messages = (planets: QueuedPlanet[], topics: Topic[], ledger: Ledger = empty): string[] => checkPlanets(planets, topics, ledger).problems.map((p) => `${p.file}: ${p.message}`);

describe('parseArticle', () => {
  it('reads the title, tags and type above the body', () => {
    expect(parseArticle('p/ghi-chu', article('title: Ghi chú Cornell\ntags: học tập, ghi chú\ntype: note'))).toEqual({
      slug: 'p/ghi-chu',
      title: 'Ghi chú Cornell',
      tags: ['học tập', 'ghi chú'],
      type: 'note',
      body: body.trim(),
    });
  });

  it('refuses an article without front matter, a title, a long enough body or a known type', () => {
    expect(parseArticle('a', body)).toEqual(['missing the --- front matter (title, tags, type)']);
    expect(parseArticle('a', article('title: \ntype: essay', 'ngắn'))).toEqual(['title is empty', 'type must be one of note, lab, process', `body is shorter than ${MIN_BODY_CHARS} characters`]);
    expect(parseArticle('a', article(`title: A\ntags: ${Array.from({ length: 9 }, (_, i) => `t${i}`).join(', ')}`))).toEqual(['more than 8 tags']);
    expect(parseArticle('a', article('title: A\nauthor: me'))).toEqual(['unknown front matter key "author"']);
  });

  it('refuses secrets, the retired source site and server addresses, but not "học cloud" in plain words', () => {
    expect(parseArticle('a', article('title: A', `${body}\nkf_admin_abc`))).toEqual(['the article looks like a secret']);
    expect(parseArticle('a', article('title: A', `${body}\nNguồn: Học Cloud`))).toEqual(['the article mentions the retired Học Cloud site']);
    // Built from parts so check:public does not flag this file.
    const address = [10, 20, 30, 40].join('.');
    expect(parseArticle('a', article('title: A', `${body}\nMáy ${address}`))).toEqual([`server detail on line 7: ${address}`]);
    expect(parseArticle('a', article('title: A', `${body}\nBắt đầu học cloud từ đâu? Ví dụ 192.0.2.10.`))).not.toBeInstanceOf(Array);
  });
});

describe('links', () => {
  it('reads [[Title]] and [[Title|text]], matching titles without case or accents', () => {
    expect(linkedTitles('Xem [[Ghi chú Cornell]] và [[Sơ đồ tư duy|sơ đồ]].')).toEqual(['Ghi chú Cornell', 'Sơ đồ tư duy']);
    expect(titleKey('Đường  Cong Quên Lãng')).toBe(titleKey('đường cong quên lãng'));
  });

  it('orders a linked-to article first, and finds a circle', () => {
    const a = { slug: 'p/a', title: 'A', tags: [], type: 'note' as const, body: 'xem [[B]]' };
    const b = { slug: 'p/b', title: 'B', tags: [], type: 'note' as const, body: 'xem [[C]]' };
    const c = { slug: 'p/c', title: 'C', tags: [], type: 'note' as const, body: 'hết' };
    expect(publishOrder([a, b, c])?.map((x) => x.slug)).toEqual(['p/c', 'p/b', 'p/a']);
    expect(publishOrder([a, { ...b, body: 'xem [[A]]' }])).toBeNull();
  });
});

describe('checkTopics', () => {
  it('needs known Spaces, unique slugs, names and tech at most a third', () => {
    expect(checkTopics([topic('a'), topic('b'), topic('c', { tech: true, space: 'networking' })], spaces)).toEqual([]);
    const problems = checkTopics([topic('a', { space: 'nowhere' }), topic('a'), topic('B', { name: '' })], spaces).map((p) => p.message);
    expect(problems).toEqual(['unknown Space "nowhere"', 'slug is listed twice', 'slug must be lowercase letters, digits and dashes', 'name must be 1–80 characters']);
    expect(checkTopics([topic('a', { tech: true }), topic('b')], spaces).map((p) => p.message)).toEqual(['1 of 2 topics are tech; keep tech at most a third']);
  });
});

describe('checkPlanets', () => {
  const planet: QueuedPlanet = { slug: 'p', files: { a: linked('A', 'B'), b: linked('B', 'C'), c: linked('C') } };

  it('takes 3 linked articles of a queued topic when nothing else is published', () => {
    expect(messages([planet], [topic('p', { status: 'queued' })])).toEqual([]);
  });

  it('needs 3–5 articles, all linked together, and a link to another planet once there is one', () => {
    expect(messages([{ slug: 'p', files: { a: linked('A', 'B'), b: linked('B') } }], [topic('p')])).toEqual(['content/queue/p: a planet holds 3–5 articles, this one 2']);
    expect(messages([{ slug: 'p', files: { a: linked('A', 'B'), b: linked('B'), c: linked('C') } }], [topic('p')])).toEqual(['content/queue/p: its articles are not all linked together with [[ ]]']);
    const ledger: Ledger = { planets: [], posts: [{ slug: 'old', id: 'doc-1', title: 'Bài cũ', at: '' }] };
    expect(messages([planet], [topic('p')], ledger)).toEqual(['content/queue/p: no [[link]] to an article of another planet']);
    expect(messages([{ slug: 'p', files: { ...planet.files, c: linked('C', 'bài CŨ') } }], [topic('p')], ledger)).toEqual([]);
  });

  it('refuses links to unknown titles, a title already published or used twice, and links in a circle', () => {
    expect(messages([{ slug: 'p', files: { ...planet.files, c: linked('C', 'Không có') } }], [topic('p')])).toEqual(['content/queue/p/c.md: [[Không có]] is neither queued nor in content/published.json']);
    const ledger: Ledger = { planets: [], posts: [{ slug: 'old', id: 'doc-1', title: 'A', at: '' }] };
    expect(messages([planet], [topic('p')], ledger)).toContain('content/queue/p/a.md: an article titled "A" is already published');
    expect(messages([{ slug: 'p', files: { ...planet.files, c: linked('C', 'A') } }], [topic('p')])).toEqual(['content/queue: the [[links]] between queued articles go round in a circle; link one way only']);
    expect(messages([{ slug: 'p', files: { ...planet.files, c: linked('a') } }], [topic('p')])).toContain('content/queue/p/c.md: same title as content/queue/p/a.md');
  });

  it('needs a topic that is not published or skipped yet', () => {
    expect(messages([planet], [])).toEqual(['content/queue/p: no topic with this slug in content/topics.json']);
    expect(messages([planet], [topic('p', { status: 'published' })])).toEqual(['content/queue/p: its topic is already published']);
  });
});

describe('the content folder of this repository', () => {
  it('is valid', async () => {
    expect(await checkContent(CONTENT_DIR)).toEqual([]);
  });
});
