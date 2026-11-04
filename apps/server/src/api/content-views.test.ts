import { describe, expect, it } from 'vitest';
import type { DocumentRow } from '../access/content';
import { pickTexts, readingMinutes, tableOfContents } from './content-views';

function row(id: string, lang: 'vi' | 'en', group: string | null, aiTranslated = false): DocumentRow {
  const at = new Date('2026-11-04T00:00:00Z');
  return {
    id,
    spaceId: 'space',
    collectionId: null,
    title: id,
    type: 'lab',
    lang,
    translationGroupId: group,
    aiTranslated,
    origin: 'official',
    status: 'approved',
    hidden: false,
    authorId: 'author',
    sourceUrl: null,
    sortOrder: 0,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

describe('pickTexts', () => {
  const docs = [row('a-vi', 'vi', 'a'), row('b-en', 'en', 'b', true), row('a-en', 'en', 'a', true), row('b-vi', 'vi', 'b'), row('c', 'vi', null)];

  it('keeps one document per text in the asked language, in the order texts first appear', () => {
    expect(pickTexts(docs, 'en').map((t) => [t.doc.id, t.langs])).toEqual([
      ['a-en', ['vi', 'en']],
      ['b-en', ['vi', 'en']],
      ['c', ['vi']],
    ]);
    expect(pickTexts(docs, 'vi').map((t) => t.doc.id)).toEqual(['a-vi', 'b-vi', 'c']);
  });

  it('falls back to the original, not an AI translation', () => {
    // No Vietnamese text: the original English one rather than an AI-made English copy.
    expect(pickTexts([row('z-ai', 'en', 'z', true), row('z-original', 'en', 'z')], 'vi')[0]?.doc.id).toBe('z-original');
    // Only an AI translation readable (the original is someone's draft): that one.
    expect(pickTexts([row('w-ai', 'en', 'w', true)], 'vi')[0]?.doc.id).toBe('w-ai');
  });
});

describe('tableOfContents', () => {
  it('takes each heading’s level from the Markdown, the overview first', () => {
    const markdown = ['# DHCP', 'Mở đầu.', '## Bước 1', 'a', '### Chi tiết', 'b', '```', '## not a heading', '```', '## Bước 2', 'c'].join('\n');
    const chunks = [
      { anchor: 'tong-quan', heading: null },
      { anchor: 'buoc-1', heading: 'Bước 1' },
      { anchor: 'chi-tiet', heading: 'Chi tiết' },
      { anchor: 'buoc-2', heading: 'Bước 2' },
      { anchor: 'gone', heading: 'Không còn trong Markdown' },
    ];
    expect(tableOfContents(chunks, markdown)).toEqual([
      { anchor: 'tong-quan', title: null, level: 2 },
      { anchor: 'buoc-1', title: 'Bước 1', level: 2 },
      { anchor: 'chi-tiet', title: 'Chi tiết', level: 3 },
      { anchor: 'buoc-2', title: 'Bước 2', level: 2 },
      { anchor: 'gone', title: 'Không còn trong Markdown', level: 2 },
    ]);
    expect(tableOfContents(chunks.slice(0, 1), null)).toEqual([{ anchor: 'tong-quan', title: null, level: 2 }]);
  });
});

describe('readingMinutes', () => {
  it('counts words at 200 a minute, at least one minute', () => {
    expect(readingMinutes([])).toBe(1);
    expect(readingMinutes(['từ '.repeat(201)])).toBe(2);
  });
});
