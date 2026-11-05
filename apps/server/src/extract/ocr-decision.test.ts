/** Which pages go to OCR: rules on the Inspector's numbers, Jev for the borderline ones, the words when Jev is off. */
import { describe, expect, it, vi } from 'vitest';
import { ENGLISH_PAGE, fakeJev } from '../../test/extract-fixtures';
import type { PdfPageReport } from './pdf-inspector';
import { decidePages } from './ocr-decision';

function page(n: number, text: string, imageRatio: number): PdfPageReport {
  return { page: n, text, textChars: text.replace(/\s+/g, '').length, imageRatio };
}

const GLYPHS = '#$%& @@!! *&^% ~~~~ ++== <<>> ||\\\\ ;;:: ##$$ %%^^ &&** (()) [[]] {{}}';

describe('decidePages', () => {
  it('reads text layers, OCRs scans and leaves blank pages, without asking Jev', async () => {
    const jev = fakeJev();
    const decisions = await decidePages(jev, [page(1, ENGLISH_PAGE, 0), page(2, '', 1), page(3, '12', 0.98), page(4, '', 0), page(5, 'Thank you.', 0)]);
    expect(decisions.map((d) => [d.page, d.source, d.reason])).toEqual([
      [1, 'text', 'text-layer'],
      [2, 'ocr', 'no-text-layer'],
      [3, 'ocr', 'no-text-layer'],
      [4, 'empty', 'blank'],
      [5, 'text', 'text-layer'],
    ]);
    expect(jev.calls).toEqual([]);
  });

  it('asks Jev about a garbage text layer and a caption over a full-page image, in one call', async () => {
    const jev = fakeJev((_purpose, _state, questions) => ({
      ...Object.fromEntries(Object.keys(questions).map((id) => [id, { type: 'noul', noul: 0.1 }])),
      p2: { type: 'noul', noul: 0.8 },
    }));
    const decisions = await decidePages(jev, [page(1, GLYPHS, 0), page(2, 'Figure 3: the lab topology with two routers and one switch', 0.9)]);
    expect(decisions.map((d) => [d.source, d.reason, d.garbageTextLayer])).toEqual([
      ['ocr', 'jev-unreadable', true],
      ['text', 'jev-readable', false],
    ]);
    expect(jev.calls.map((c) => [c.purpose, Object.keys(c.questions)])).toEqual([['extract-ocr-decision', ['p1', 'p2']]]);
  });

  it('falls back to the words when Jev is off or fails', async () => {
    const reports = [page(1, GLYPHS, 0), page(2, 'Figure 3: the lab topology with two routers and one switch', 0.9)];
    expect((await decidePages(null, reports)).map((d) => d.reason)).toEqual(['garbage-text-layer', 'little-text-on-image']);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = fakeJev(() => {
      throw new Error('timeout');
    });
    expect((await decidePages(failing, reports)).map((d) => d.source)).toEqual(['ocr', 'ocr']);
    quiet.mockRestore();
  });
});
