/** OCR quality: plausible vi/en words, Tesseract's confidence and Jev's coherence decide which pages are indexed. */
import { describe, expect, it, vi } from 'vitest';
import { GARBAGE_OCR, VIETNAMESE_OCR, fakeJev } from '../../test/extract-fixtures';
import { assessOcrPages, sampleOf, validWordRatio } from './quality-validator';

describe('validWordRatio', () => {
  it('reads Vietnamese and English prose, commands and numbers as words', () => {
    expect(validWordRatio(VIETNAMESE_OCR)).toBeGreaterThan(0.95);
    expect(validWordRatio('The resolver caches each answer for its TTL, about 300 seconds.')).toBe(1);
    expect(validWordRatio('Gõ ip addr show eth0 rồi xem địa chỉ IPv4 192.168.1.10/24 của TCP/IP.')).toBe(1);
  });

  it('reads OCR noise and legacy-encoded Vietnamese as not words', () => {
    expect(validWordRatio(GARBAGE_OCR)).toBeLessThan(0.3);
    // "Hà Nội" in the old TCVN3 encoding, read as Latin-1.
    expect(validWordRatio('Hµ Néi lµ thñ ®« cña ViÖt Nam')).toBeLessThan(0.5);
    expect(validWordRatio('')).toBe(0);
  });
});

describe('sampleOf', () => {
  it('keeps short text whole and cuts long text at a word', () => {
    expect(sampleOf('a  b\n c', 10)).toBe('a b c');
    expect(sampleOf('alpha beta gamma delta', 13)).toBe('alpha beta');
  });
});

describe('assessOcrPages', () => {
  it('scores a clear page high and flags noise, a near-empty page and a low-confidence page', async () => {
    const jev = fakeJev((_purpose, _state, questions) =>
      Object.fromEntries(Object.keys(questions).map((id) => [id, { type: 'score', score: id === 'p2' ? 0 : 3, confidence: 1, probabilities: {} }])),
    );
    const result = await assessOcrPages(jev, [
      { page: 1, text: VIETNAMESE_OCR, confidence: 0.91 },
      { page: 2, text: GARBAGE_OCR, confidence: 0.4 },
      { page: 3, text: 'ab', confidence: 0.95 },
      { page: 4, text: VIETNAMESE_OCR, confidence: 0.1 },
    ]);
    expect(result.map((r) => [r.page, r.low])).toEqual([
      [1, false],
      [2, true],
      [3, true],
      [4, false],
    ]);
    expect(result[0]).toMatchObject({ coherence: 1, confidence: 0.91 });
    expect(result[0]?.score).toBeGreaterThan(0.9);
    expect(jev.calls).toHaveLength(1);
    expect(jev.calls[0]?.purpose).toBe('extract-quality');
  });

  it('judges on the words and the confidence alone when Jev is off or fails', async () => {
    expect((await assessOcrPages(null, [{ page: 1, text: VIETNAMESE_OCR, confidence: null }]))[0]).toMatchObject({ low: false, coherence: null, confidence: null });
    const failing = fakeJev(() => {
      throw new Error('down');
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const [page] = await assessOcrPages(failing, [{ page: 1, text: GARBAGE_OCR, confidence: null }]);
    quiet.mockRestore();
    expect(page).toMatchObject({ low: true, coherence: null });
  });
});
