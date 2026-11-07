import { describe, expect, it } from 'vitest';
import { CONTENT_DIR, MIN_BODY_CHARS, type Spaces, type Topic, checkContent, checkQueued, checkTopics, parseArticle } from './content-queue';

const body = `## Mở đầu\n\n${'Một đoạn văn đủ dài để thành bài. '.repeat(Math.ceil(MIN_BODY_CHARS / 30))}`;
const article = (head: string, text = body): string => `---\n${head}\n---\n${text}`;
const spaces: Spaces = { existing: ['networking'], create: [{ slug: 'ky-nang', nameVi: 'Kỹ năng', nameEn: 'Skills', tint: '#FBCFE8', glow: '#EC4899', art: '/art/orb-universe.webp', unitVi: 'bài', unitEn: 'articles' }] };
const topic = (slug: string, extra: Partial<Topic> = {}): Topic => ({ slug, space: 'ky-nang', lang: 'vi', title: slug, tech: false, brief: '', status: 'todo', ...extra });

describe('parseArticle', () => {
  it('reads the title, tags and type above the body', () => {
    expect(parseArticle('ghi-chu', article('title: Ghi chú Cornell\ntags: học tập, ghi chú\ntype: note'))).toEqual({
      slug: 'ghi-chu',
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

describe('checkTopics', () => {
  it('needs known Spaces, unique slugs and tech at most a third', () => {
    expect(checkTopics([topic('a'), topic('b'), topic('c', { tech: true, space: 'networking' })], spaces)).toEqual([]);
    const problems = checkTopics([topic('a', { space: 'nowhere' }), topic('a'), topic('B', { tech: true })], spaces).map((p) => p.message);
    expect(problems).toEqual(['unknown Space "nowhere"', 'slug is listed twice', 'slug must be lowercase letters, digits and dashes']);
    expect(checkTopics([topic('a', { tech: true }), topic('b')], spaces).map((p) => p.message)).toEqual(['1 of 2 topics are tech; keep tech at most a third']);
  });
});

describe('checkQueued', () => {
  it('needs a topic that is not published or skipped yet', () => {
    const text = article('title: A');
    expect(checkQueued('a', text, [topic('a', { status: 'queued' })])).toEqual([]);
    expect(checkQueued('x', text, [topic('a')])[0]?.message).toBe('no topic with this slug in content/topics.json');
    expect(checkQueued('a', text, [topic('a', { status: 'published' })])[0]?.message).toBe('its topic is already published');
  });
});

describe('the content folder of this repository', () => {
  it('is valid', async () => {
    expect(await checkContent(CONTENT_DIR)).toEqual([]);
  });
});
