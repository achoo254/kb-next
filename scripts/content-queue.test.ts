import { describe, expect, it } from 'vitest';
import { CONTENT_DIR, type Ledger, MIN_BODY_CHARS, type QueuedPlanet, type Spaces, type Topic, checkContent, checkPlanets, checkTopics, isTopUp, linkedTitles, looksVietnamese, parseArticle, publishOrder, titleKey, tldrProblem } from './content-queue';

const filler = 'Một đoạn văn đủ dài để thành bài. '.repeat(Math.ceil(MIN_BODY_CHARS / 30));
const tldr = '> [!TLDR]\n> - Ý thứ nhất.\n> - Ý thứ hai.\n> - Ý thứ ba.';
const body = `${tldr}\n\n## Mở đầu\n\n${filler}`;
const article = (head: string, text = body): string => `---\n${head}\n---\n${text}`;
/** An article titled `title` whose body links to `links`. */
const linked = (title: string, ...links: string[]): string => article(`title: ${title}\ntags: thử`, `${links.map((l) => `Xem [[${l}]].`).join(' ')}\n\n${body}`);
const englishBody = `> [!TLDR]\n> - First point.\n> - Second point.\n\n## Introduction\n\n${'An English paragraph long enough to make an article. '.repeat(Math.ceil(MIN_BODY_CHARS / 40))}`;
/** The same in English. */
const linkedEn = (title: string, ...links: string[]): string => article(`title: ${title}\ntags: test`, `${links.map((l) => `See [[${l}]].`).join(' ')}\n\n${englishBody}`);
const spaces: Spaces = { existing: ['networking'], create: [{ slug: 'ky-nang', nameVi: 'Kỹ năng', nameEn: 'Skills', tint: '#FBCFE8', glow: '#EC4899', art: '/art/orb-universe.webp', unitVi: 'bài', unitEn: 'articles' }] };
const topic = (slug: string, extra: Partial<Topic> = {}): Topic => ({ slug, space: 'ky-nang', lang: 'vi', name: slug, nameEn: slug, tech: false, brief: '', status: 'todo', ...extra });
const empty: Ledger = { planets: [], posts: [] };
/** The English twin of a Vietnamese test article: its title and each link get " EN" added. */
const twinOf = (text: string): string => {
  const parsed = parseArticle('x', text);
  if (Array.isArray(parsed)) return text.replace(/^title: (.*)$/m, 'title: $1 EN');
  return `---\ntitle: ${parsed.title} EN\ntags: test\n---\n${linkedTitles(parsed.body).map((l) => `See [[${l} EN]].`).join(' ')}\n\n${englishBody}`;
};
/** A ledger whose articles all have English twins (titles with " EN" added), unless they say otherwise. */
const withEnglish = (ledger: Ledger): Ledger => ({ ...ledger, posts: ledger.posts.map((p) => ({ ...p, en: p.en ?? { id: `en-${p.id}`, title: `${p.title} EN` } })) });
/** The problems of `planets`; a planet of a `vi` topic gets the English twins of its articles unless it has its own. */
const messages = (planets: QueuedPlanet[], topics: Topic[], ledger: Ledger = empty): string[] => {
  const given = planets.map((p) => (p.twins || topics.find((t) => t.slug === p.slug)?.lang === 'en' ? p : { ...p, twins: Object.fromEntries(Object.entries(p.files).map(([name, text]) => [name, twinOf(text)])) }));
  return checkPlanets(given, topics, withEnglish(ledger)).problems.map((p) => `${p.file}: ${p.message}`);
};

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
    expect(parseArticle('a', article('title: \ntype: essay', 'ngắn'))).toEqual(['title is empty', 'type must be one of note, lab, process', `body is shorter than ${MIN_BODY_CHARS} characters`, 'missing the "> [!TLDR]" box before the first ## heading']);
    expect(parseArticle('a', article(`title: A\ntags: ${Array.from({ length: 9 }, (_, i) => `t${i}`).join(', ')}`))).toEqual(['more than 8 tags']);
    expect(parseArticle('a', article('title: A\nauthor: me'))).toEqual(['unknown front matter key "author"']);
  });

  it('needs the TL;DR box of 2–4 points before the first heading', () => {
    expect(tldrProblem(body)).toBeNull();
    expect(tldrProblem(`## Mở đầu\n\n${tldr}`)).toBe('missing the "> [!TLDR]" box before the first ## heading');
    expect(tldrProblem('> [!TLDR]\n> - Chỉ một ý.\n\n## A')).toBe('the "> [!TLDR]" box must list 2–4 points ("> - …")');
    expect(tldrProblem(`> [!TLDR]\n${'> - Ý.\n'.repeat(5)}\n## A`)).toBe('the "> [!TLDR]" box must list 2–4 points ("> - …")');
  });

  it('refuses secrets, the retired source site and server addresses, but not "học cloud" in plain words', () => {
    expect(parseArticle('a', article('title: A', `${body}\nkf_admin_abc`))).toEqual(['the article looks like a secret']);
    expect(parseArticle('a', article('title: A', `${body}\nNguồn: Học Cloud`))).toEqual(['the article mentions the retired Học Cloud site']);
    // Built from parts so check:public does not flag this file.
    const address = [10, 20, 30, 40].join('.');
    expect(parseArticle('a', article('title: A', `${body}\nMáy ${address}`))).toEqual([`server detail on line 12: ${address}`]);
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

describe('top-ups of a published planet', () => {
  /** Planet p is published with X and Y; planet old with Bài cũ. */
  const ledger: Ledger = {
    planets: [
      { slug: 'p', space: 'ky-nang', collectionId: 'col-p', at: '' },
      { slug: 'old', space: 'ky-nang', collectionId: 'col-old', at: '' },
    ],
    posts: [
      { slug: 'p/x', id: 'doc-x', title: 'X', at: '' },
      { slug: 'p/y', id: 'doc-y', title: 'Y', at: '' },
      { slug: 'old/cu', id: 'doc-0', title: 'Bài cũ', at: '' },
    ],
  };

  it('knows a top-up by the planet and its articles in the ledger', () => {
    expect(isTopUp('p', ledger)).toBe(true);
    expect(isTopUp('q', ledger)).toBe(false);
    expect(isTopUp('p', { planets: ledger.planets, posts: [] })).toBe(false);
  });

  it('takes a single article linked to a published article of its planet, with no link to another planet needed', () => {
    expect(messages([{ slug: 'p', files: { z: linked('Z', 'x') } }], [topic('p', { status: 'queued' })], ledger)).toEqual([]);
    expect(messages([{ slug: 'p', files: { z: linked('Z', 'X'), w: linked('W', 'Z') } }], [topic('p')], ledger)).toEqual([]);
  });

  it('needs every new article linked to the planet, counting its published articles', () => {
    expect(messages([{ slug: 'p', files: { z: linked('Z') } }], [topic('p')], ledger)).toEqual(['content/queue/p: its articles are not all linked with [[ ]] to each other and to its published articles']);
    // Linked to each other but not to the planet; linking to another planet does not count.
    expect(messages([{ slug: 'p', files: { z: linked('Z', 'Bài cũ'), w: linked('W', 'Z') } }], [topic('p')], ledger)).toEqual([
      'content/queue/p: its articles are not all linked with [[ ]] to each other and to its published articles',
    ]);
  });

  it('holds 1–5 articles, while a new planet still needs 3', () => {
    const six = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((n) => [n, linked(n.toUpperCase(), 'X')]));
    expect(messages([{ slug: 'p', files: six }], [topic('p')], ledger)).toEqual(['content/queue/p: a top-up of a published planet holds 1–5 articles, this one 6']);
    expect(messages([{ slug: 'q', files: { a: linked('A', 'Bài cũ') } }], [topic('q')], ledger)).toEqual(['content/queue/q: a planet holds 3–5 articles, this one 1']);
  });

  it('keeps the other rules: a published or twice-used title, an unknown link, a circle, a published file name', () => {
    expect(messages([{ slug: 'p', files: { z: linked('y', 'X') } }], [topic('p')], ledger)).toEqual([
      'content/queue/p/z.md: an article titled "y" is already published',
      'content/queue/p/z.en.md: an English article titled "y EN" is already published',
    ]);
    expect(messages([{ slug: 'p', files: { z: linked('Z', 'X', 'Không có') } }], [topic('p')], ledger)).toEqual(['content/queue/p/z.md: [[Không có]] is neither queued nor in content/published.json']);
    expect(messages([{ slug: 'p', files: { z: linked('Z', 'W'), w: linked('W', 'Z', 'X') } }], [topic('p')], ledger)).toEqual(['content/queue: the [[links]] between queued articles go round in a circle; link one way only']);
    expect(messages([{ slug: 'p', files: { x: linked('Z', 'X') } }], [topic('p')], ledger)).toContain('content/queue/p/x.md: file name is taken by the published article "X"; pick another');
  });

  it('refuses a top-up whose topic is still published', () => {
    expect(messages([{ slug: 'p', files: { z: linked('Z', 'X') } }], [topic('p', { status: 'published' })], ledger)).toEqual(['content/queue/p: its topic is already published']);
  });
});

describe('languages', () => {
  it('tells Vietnamese prose from English, leaving code and a few Vietnamese names aside', () => {
    expect(looksVietnamese(body)).toBe(true);
    expect(looksVietnamese(englishBody)).toBe(false);
    expect(looksVietnamese(`Families in Hà Nội and Huế eat bánh chưng at Tết. ${englishBody}`)).toBe(false);
    expect(looksVietnamese(`Chạy lệnh sau:\n\n\`\`\`sh\n${'sudo systemctl restart the network service now\n'.repeat(40)}\`\`\`\n\nXong thì kiểm lại.`)).toBe(true);
  });

  it('needs each article in the language of its topic', () => {
    const en: QueuedPlanet = { slug: 'p-en', files: { a: linkedEn('A', 'B'), b: linkedEn('B', 'C'), c: linkedEn('C') } };
    expect(messages([en], [topic('p-en', { lang: 'en' })])).toEqual([]);
    expect(messages([{ slug: 'p-en', files: { ...en.files, c: linked('C') } }], [topic('p-en', { lang: 'en' })])).toEqual(['content/queue/p-en/c.md: its topic is en but the article is written in Vietnamese']);
    expect(messages([{ slug: 'p', files: { a: linked('A', 'B'), b: linked('B', 'C'), c: linkedEn('C') } }], [topic('p')])).toEqual(['content/queue/p/c.md: its topic is vi but the article is not written in Vietnamese']);
  });
});

describe('English twins', () => {
  const files = { a: linked('A', 'B'), b: linked('B', 'C'), c: linked('C') };
  const twins = Object.fromEntries(Object.entries(files).map(([name, text]) => [name, twinOf(text)]));
  const check = (extra: Partial<QueuedPlanet>, topics: Topic[] = [topic('p', { status: 'queued' })], ledger: Ledger = empty): string[] =>
    checkPlanets([{ slug: 'p', files, twins, ...extra }], topics, withEnglish(ledger)).problems.map((p) => `${p.file}: ${p.message}`);

  it('accepts a planet whose every article has its twin, linking the same articles with their English titles', () => {
    expect(check({})).toEqual([]);
  });

  it('needs a twin for every article of a Vietnamese planet, and none without its article', () => {
    expect(check({ twins: { a: twins.a ?? '' } })).toEqual([
      'content/queue/p/b.en.md: every Vietnamese article needs its English twin, written beside it as <article>.en.md',
      'content/queue/p/c.en.md: every Vietnamese article needs its English twin, written beside it as <article>.en.md',
    ]);
    expect(check({ twins: { ...twins, z: twins.a ?? '' } })).toEqual(['content/queue/p/z.en.md: an English twin without its Vietnamese article']);
  });

  it('gives an English planet no twins', () => {
    const en = { a: linkedEn('A', 'B'), b: linkedEn('B', 'C'), c: linkedEn('C') };
    expect(check({ files: en, twins: { a: twins.a ?? '' } }, [topic('p', { lang: 'en', status: 'queued' })])).toEqual(['content/queue/p/a.en.md: an English planet has no twins']);
  });

  it('needs the twin written in English, of the same type, long enough', () => {
    expect(check({ twins: { ...twins, c: linked('C EN') } })).toEqual(['content/queue/p/c.en.md: the English twin is not written in English']);
    expect(check({ twins: { ...twins, c: (twins.c ?? '').replace('tags: test', 'tags: test\ntype: lab') } })).toEqual(['content/queue/p/c.en.md: type must be "note", as in the Vietnamese article']);
    expect(check({ twins: { ...twins, c: article('title: C EN', '> [!TLDR]\n> - One.\n> - Two.\n\nShort.') } })).toEqual(['content/queue/p/c.en.md: body is shorter than 1000 characters']);
  });

  it('needs the twin to link the same articles, by their English titles', () => {
    expect(check({ twins: { ...twins, a: linkedEn('A EN', 'C EN') } })).toEqual(['content/queue/p/a.en.md: the English twin must link the same articles as its Vietnamese text (with their English titles)']);
    expect(check({ twins: { ...twins, a: linkedEn('A EN', 'Nothing') } })).toEqual(['content/queue/p/a.en.md: [[Nothing]] is not the English title of a queued or published article']);
  });

  it('refuses an English title that is already published or used twice', () => {
    const ledger: Ledger = { planets: [], posts: [{ slug: 'old/x', id: 'doc-1', title: 'Cũ', at: '', en: { id: 'en-1', title: 'A EN' } }] };
    expect(check({}, [topic('p', { status: 'queued' })], ledger)).toContain('content/queue/p/a.en.md: an English article titled "A EN" is already published');
    expect(check({ twins: { ...twins, c: linkedEn('a en') } })).toContain('content/queue/p/c.en.md: same title as content/queue/p/a.en.md');
  });

  it('links an old article by its published English title', () => {
    const ledger: Ledger = { planets: [], posts: [{ slug: 'old/x', id: 'doc-1', title: 'Bài cũ', at: '', en: { id: 'en-1', title: 'The old article' } }] };
    const own = { ...files, c: linked('C', 'Bài cũ') };
    const mine = { ...twins, c: linkedEn('C EN', 'The old article') };
    expect(check({ files: own, twins: mine }, [topic('p', { status: 'queued' })], ledger)).toEqual([]);
    expect(check({ files: own, twins: { ...twins, c: linkedEn('C EN', 'Bài cũ') } }, [topic('p', { status: 'queued' })], ledger)).toEqual(['content/queue/p/c.en.md: [[Bài cũ]] is not the English title of a queued or published article']);
  });
});

describe('the content folder of this repository', () => {
  it('is valid', async () => {
    expect(await checkContent(CONTENT_DIR)).toEqual([]);
  });
});
