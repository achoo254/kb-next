import { describe, expect, it } from 'vitest';
import { foldVietnamese, plainText, queryTerms, snippet, variantWords } from './snippet';

const marked = (parts: ReturnType<typeof snippet>): string => parts.map((p) => (p.hit ? `[${p.text}]` : p.text)).join('');

describe('snippet', () => {
  it('marks every variant for a query without diacritics, one run for adjacent words', () => {
    const text = 'Máy mới chưa có IP nên phải xin cấp phát IP qua 4 bước DORA.';
    expect(marked(snippet(text, 'cap phat ip', false))).toBe('Máy mới chưa có [IP] nên phải xin [cấp phát IP] qua 4 bước DORA.');
  });

  it('marks only the exact diacritics of a query typed with them', () => {
    expect(marked(snippet('Mạng máy tính, mang laptop, màng lọc.', 'mạng', true))).toBe('[Mạng] máy tính, mang laptop, màng lọc.');
    expect(marked(snippet('Mạng máy tính, mang laptop, màng lọc.', 'mang', false))).toBe('[Mạng] máy tính, [mang] laptop, [màng] lọc.');
  });

  it('matches the last word as a prefix, as search-as-you-type does', () => {
    expect(marked(snippet('Cấu hình swap trên Linux.', 'cau hinh sw', false))).toBe('[Cấu hình swap] trên Linux.');
  });

  it('cuts a long passage around the first match at word boundaries, with ellipses', () => {
    const text = `${'Một câu mở đầu dài dòng không liên quan gì cả. '.repeat(4)}Lease là thời hạn cho mượn IP. ${'Đoạn sau cũng dài. '.repeat(10)}`;
    const parts = snippet(text, 'lease', false, 80);
    const out = marked(parts);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toContain('[Lease]');
    expect(out.length).toBeLessThanOrEqual(80 + 4);
  });

  it('starts at the beginning when nothing matches (a passage found by meaning)', () => {
    expect(marked(snippet('**Discover** Hét lên cả mạng xin IP', 'how does a computer get an address', false))).toBe('Discover Hét lên cả mạng xin IP');
  });
});

describe('text helpers', () => {
  it('folds Vietnamese, splits query words and flattens Markdown', () => {
    expect(foldVietnamese('Đường MẠNG')).toBe('duong mang');
    expect(queryTerms('cấp phát IP, cấp')).toEqual(['cấp', 'phát', 'ip']);
    expect(plainText('## Tiêu đề\n\nXem [ARP](/d/1) và [[DHCP|giao thức]] `code`')).toBe('Tiêu đề Xem ARP và DHCP code');
  });

  it('lists the variant words a query with diacritics left out', () => {
    expect(variantWords(['Nhớ mang theo laptop.', 'Màng lọc nước, mạng nhà.'], 'mạng')).toEqual(['mang', 'màng']);
  });
});
