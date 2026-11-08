import { describe, expect, it } from 'vitest';
import { CODE_LINES_PER_SLIDE, MAX_SLIDES, type Slide, SLIDE_CHARS, buildSlides, paragraphPieces, sectionRanges, slideFromHash, splitBlocks } from './present-slides';

const kinds = (slides: readonly Slide[]): string[] => slides.map((slide) => slide.kind);

function deck(chunks: Array<[string | null, string]>): Slide[] {
  return buildSlides({ title: 'Bài thử', chunks: chunks.map(([heading, markdown], index) => ({ anchor: `a${index}`, heading, markdown })) }, 'vi');
}

const LONG_PARAGRAPH = Array.from({ length: 12 }, (_, i) => `Câu thứ ${i + 1} nói về một ý nhỏ của bài, đủ dài để thấy cách cắt.`).join(' ');

describe('splitBlocks', () => {
  it('reads paragraphs, lists, code, quotes, tables and images', () => {
    const blocks = splitBlocks(
      ['Một đoạn.', 'Dòng tiếp của đoạn.', '', '- a', '- b', '', '```sh', 'ls', '```', '', '> trích', '', '| A | B |', '|---|---|', '| 1 | 2 |', '', '![sao](/x.png)'].join('\n'),
    );
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'list', 'code', 'quote', 'table', 'image']);
  });

  it('ends a paragraph at a list written right under it', () => {
    expect(splitBlocks('Các bước:\n- một\n- hai').map((block) => block.type)).toEqual(['paragraph', 'list']);
  });

  it('keeps code nested in a list item with its indentation', () => {
    const [list] = splitBlocks('1. Chạy:\n\n   ```yaml\n   a:\n     b: 1\n   ```\n2. Xong');
    expect(list?.type).toBe('list');
    if (list?.type !== 'list') return;
    expect(list.items[0]).toContain('```yaml\na:\n  b: 1\n```');
  });
});

describe('paragraphPieces', () => {
  it('keeps a short paragraph whole', () => {
    expect(paragraphPieces('Ngắn thôi.', 'vi')).toEqual(['Ngắn thôi.']);
  });

  it('cuts a long paragraph at sentence ends, about SLIDE_CHARS each, losing nothing', () => {
    const pieces = paragraphPieces(LONG_PARAGRAPH, 'vi');
    expect(pieces.length).toBeGreaterThan(2);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(SLIDE_CHARS);
    expect(pieces.join(' ')).toBe(LONG_PARAGRAPH);
  });

  it('never cuts inside inline code or bold', () => {
    const text = `${'Mở đầu khá dài để vượt giới hạn của một slide. '.repeat(4)}Gõ \`echo a. b\` rồi **xem. kết quả** nhé.`;
    for (const piece of paragraphPieces(text, 'vi')) {
      expect((piece.match(/`/g) ?? []).length % 2).toBe(0);
      expect((piece.match(/\*\*/g) ?? []).length % 2).toBe(0);
    }
  });

  it('cuts a very long sentence at its clauses', () => {
    const sentence = `${Array.from({ length: 10 }, (_, i) => `vế thứ ${i + 1} của một câu rất dài`).join(', ')}.`;
    const pieces = paragraphPieces(sentence, 'vi');
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(260);
  });
});

describe('buildSlides', () => {
  it('opens with the cover and the table of contents, ends with the end slide', () => {
    const slides = deck([
      [null, 'Lời mở.'],
      ['Phần một', 'Nội dung một.'],
      ['Phần hai', 'Nội dung hai.'],
    ]);
    expect(kinds(slides)).toEqual(['cover', 'toc', 'text', 'section', 'text', 'section', 'text', 'end']);
    const toc = slides[1];
    expect(toc?.kind === 'toc' && toc.items.map((item) => [item.title, slides[item.slide]?.kind])).toEqual([
      ['Phần một', 'section'],
      ['Phần hai', 'section'],
    ]);
  });

  it('uses a TL;DR quote of the opening part as the second slide, before the contents, not shown again', () => {
    const slides = deck([
      [null, '> [!TLDR]\n> - ý một\n> - ý hai\n> - ý ba\n\nLời mở.'],
      ['Phần một', 'Nội dung.'],
    ]);
    expect(kinds(slides)).toEqual(['cover', 'tldr', 'toc', 'text', 'section', 'text', 'end']);
    expect(slides[1]?.kind === 'tldr' && slides[1].points).toEqual(['ý một', 'ý hai', 'ý ba']);
  });

  it('counts the slides of each section and numbers the sections', () => {
    const slides = deck([
      ['A', LONG_PARAGRAPH],
      ['B', 'Ngắn.'],
    ]);
    const sections = slides.filter((slide): slide is Extract<Slide, { kind: 'section' }> => slide.kind === 'section');
    expect(sections.map((s) => [s.index, s.total])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(sections[0]?.slides).toBe(paragraphPieces(LONG_PARAGRAPH, 'vi').length);
    expect(sections[1]?.slides).toBe(1);
  });

  it('shows a list 3 items a slide, numbered on', () => {
    const slides = deck([['L', '1. a\n2. b\n3. c\n4. d\n5. e']]).filter((slide) => slide.kind === 'bullets');
    expect(slides.map((slide) => slide.kind === 'bullets' && [slide.start, slide.items])).toEqual([
      [1, ['a', 'b', 'c']],
      [4, ['d', 'e']],
    ]);
  });

  it('turns a list of steps into one slide a step', () => {
    const steps = deck([['S', '1. **Mở** cài đặt\n2. **Bật** xác thực\n3. **Lưu** mã dự phòng']]).filter((slide) => slide.kind === 'step');
    expect(steps.map((slide) => slide.kind === 'step' && [slide.term, slide.body, slide.step, slide.steps])).toEqual([
      ['Mở', 'cài đặt', 1, 3],
      ['Bật', 'xác thực', 2, 3],
      ['Lưu', 'mã dự phòng', 3, 3],
    ]);
  });

  it('follows a list item with the code nested under it', () => {
    const slides = deck([['C', '- Chạy lệnh:\n\n  ```sh\n  ls -la\n  ```\n- Xong']]);
    expect(kinds(slides).slice(3, 6)).toEqual(['bullets', 'code', 'bullets']);
  });

  it('cuts code into parts of CODE_LINES_PER_SLIDE lines', () => {
    const code = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    const parts = deck([['K', `\`\`\`sh\n${code}\n\`\`\``]]).filter((slide): slide is Extract<Slide, { kind: 'code' }> => slide.kind === 'code');
    expect(parts.map((part) => part.part)).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    for (const part of parts) expect(part.code.split('\n').length).toBeLessThanOrEqual(CODE_LINES_PER_SLIDE);
    expect(parts.map((part) => part.code).join('\n')).toBe(code);
  });

  it('draws a narrow table as cards and points a wide one to the reader', () => {
    const narrow = deck([['T', '| Máy | Vai trò |\n|---|---|\n| a | b |\n| c | d |']]).find((slide) => slide.kind === 'table-cards');
    expect(narrow?.kind === 'table-cards' && narrow.rows).toEqual([
      [
        ['Máy', 'a'],
        ['Vai trò', 'b'],
      ],
      [
        ['Máy', 'c'],
        ['Vai trò', 'd'],
      ],
    ]);
    expect(kinds(deck([['T', '| A | B | C | D |\n|---|---|---|---|\n| 1 | 2 | 3 | 4 |']]))).toContain('table-link');
  });

  it('marks quotes, warnings, figures and images', () => {
    const slides = deck([['Q', '> Một câu hay.\n\n> [!WARNING]\n> Cẩn thận.\n\n**73%** người dùng quên mật khẩu.\n\n**1.** Bước tự đánh số.\n\n![Sơ đồ](/art/x.webp)']]);
    expect(kinds(slides).slice(3, -1)).toEqual(['quote', 'quote', 'stat', 'text', 'image']);
    expect(slides[4]?.kind === 'quote' && slides[4].warning).toBe(true);
    expect(slides[5]?.kind === 'stat' && [slides[5].value, slides[5].caption]).toEqual(['73%', 'người dùng quên mật khẩu.']);
  });

  it('keeps every paragraph of the text in the notes', () => {
    const paragraphs = [LONG_PARAGRAPH, 'Đoạn ngắn thứ hai.'];
    const slides = deck([['N', paragraphs.join('\n\n')]]);
    const notes = new Set(slides.flatMap((slide) => ('notes' in slide ? [slide.notes] : [])));
    for (const paragraph of paragraphs) expect(notes.has(paragraph)).toBe(true);
  });

  it('gives the same slides for the same text', () => {
    const chunks: Array<[string | null, string]> = [['A', LONG_PARAGRAPH]];
    expect(deck(chunks)).toEqual(deck(chunks));
  });

  it(`never makes more than ${MAX_SLIDES} slides`, () => {
    const many = Array.from({ length: 1200 }, (_, i) => `Đoạn ${i}.`).join('\n\n');
    expect(deck([['X', many]])).toHaveLength(MAX_SLIDES);
  });
});

describe('slideFromHash and sectionRanges', () => {
  it('reads #n as a 1-based slide, anything else as the first', () => {
    expect(slideFromHash('#3', 5)).toBe(2);
    expect(slideFromHash('#9', 5)).toBe(0);
    expect(slideFromHash('#abc', 5)).toBe(0);
    expect(slideFromHash('', 5)).toBe(0);
  });

  it('splits a deck at its section slides', () => {
    const slides = deck([
      [null, 'Mở.'],
      ['A', 'a.'],
      ['B', 'b.'],
    ]);
    expect(sectionRanges(slides)).toEqual([
      [0, 2],
      [3, 4],
      [5, 7],
    ]);
  });
});
