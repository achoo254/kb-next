/** Normalizing extracted text: pages in order with their own anchors, headings below the title, long sections cut. */
import { describe, expect, it } from 'vitest';
import { hocrPagesHtml, pdfPagesHtml } from '../../test/fake-tika';
import { MAX_CHUNK_CHARS, demoteHeadings, normalize, ocrPageText, tikaMarkdown, tikaPages } from './document-normalizer';

describe('Tika XHTML', () => {
  it('splits a PDF into its pages and reads each as Markdown', () => {
    const pages = tikaPages(pdfPagesHtml(['first page', '', 'third page']));
    expect(pages).toHaveLength(3);
    expect(pages.map(tikaMarkdown)).toEqual(['first page', '', 'third page']);
    expect(tikaPages('<html><body><p>no pages</p></body></html>')).toEqual([]);
  });

  it('reads an hOCR page as text with its mean word confidence', () => {
    const [page = ''] = tikaPages(hocrPagesHtml([{ text: 'Mạng máy tính\nchia sẻ dữ liệu', confidence: 82 }]));
    expect(ocrPageText(page)).toEqual({ text: 'Mạng máy tính chia sẻ dữ liệu', confidence: 0.82 });
    expect(ocrPageText('<p>plain OCR text</p>')).toEqual({ text: 'plain OCR text', confidence: null });
  });
});

describe('demoteHeadings', () => {
  it('moves headings one level down, but not inside code', () => {
    expect(demoteHeadings('# Title\n## Part\n```\n# comment\n```\n###### deep')).toBe('## Title\n### Part\n```\n# comment\n```\n###### deep');
  });
});

describe('normalize', () => {
  it('keeps pages in order under their own headings, leaving out pages with no text', () => {
    const { markdown, chunks } = normalize(
      [
        { page: 1, markdown: 'Intro text' },
        { page: 2, markdown: '   ' },
        { page: 3, markdown: '# Lab\nSteps' },
      ],
      'vi',
    );
    expect(markdown).toBe('## Trang 1\n\nIntro text\n\n## Trang 3\n\n## Lab\nSteps');
    expect(chunks.map((c) => [c.anchor, c.heading, c.text])).toEqual([
      ['trang-1', 'Trang 1', 'Intro text'],
      ['lab', 'Lab', 'Steps'],
    ]);
    expect(normalize([{ page: 2, markdown: 'x' }], 'en').chunks[0]?.anchor).toBe('page-2');
  });

  it('cuts a long section at paragraph breaks into parts with their own anchors', () => {
    const paragraph = 'word '.repeat(300).trim();
    const body = Array.from({ length: 10 }, () => paragraph).join('\n\n');
    const { chunks } = normalize([{ page: null, markdown: `## Notes\n\n${body}` }], 'en');
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.map((c) => c.anchor).slice(0, 3)).toEqual(['notes', 'notes--2', 'notes--3']);
    expect(chunks.every((c) => c.text.length <= MAX_CHUNK_CHARS && c.heading === 'Notes')).toBe(true);
    expect(new Set(chunks.map((c) => c.anchor)).size).toBe(chunks.length);
  });

  it('cuts a single huge line too', () => {
    const { chunks } = normalize([{ page: null, markdown: 'x'.repeat(MAX_CHUNK_CHARS * 2 + 5) }], 'vi');
    expect(chunks.map((c) => [c.anchor, c.text.length])).toEqual([
      ['tong-quan', MAX_CHUNK_CHARS],
      ['tong-quan--2', MAX_CHUNK_CHARS],
      ['tong-quan--3', 5],
    ]);
  });
});
