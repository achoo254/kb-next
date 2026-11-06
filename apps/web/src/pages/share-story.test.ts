/**
 * The QR code and story picture helpers: a scannable QR matrix, its SVG path, the download's file name from a
 * Vietnamese title, and the title's lines on the canvas.
 */
import { describe, expect, it } from 'vitest';
import { qrMatrix, qrPath, storyFileName, wrapLines } from './share-story';

const measure = { measureText: (text: string) => ({ width: Array.from(text).length * 10 }) as TextMetrics };

describe('qrMatrix', () => {
  it('makes a square code with the three finder patterns', () => {
    const matrix = qrMatrix('https://kb.example.com/l/AbCdEfGhIjKlMnOpQrStUvWxYz012345');
    const size = matrix.length;
    expect(size).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === size)).toBe(true);
    for (const [row, col] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ] as const) {
      expect(matrix[row]?.[col]).toBe(true);
      expect(matrix[row + 1]?.[col + 1]).toBe(false);
      expect(matrix[row + 3]?.[col + 3]).toBe(true);
    }
  });

  it('draws one unit square per dark module', () => {
    expect(qrPath([
      [true, false],
      [false, true],
    ])).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
  });
});

describe('storyFileName', () => {
  it('folds Vietnamese letters into a short slug', () => {
    expect(storyFileName('Giao thức DHCP', 'App')).toBe('giao-thuc-dhcp-story.png');
    expect(storyFileName('Đường đi của gói tin — phần 2!', 'App')).toBe('duong-di-cua-goi-tin-phan-2-story.png');
    expect(storyFileName('a'.repeat(80), 'App')).toBe(`${'a'.repeat(60)}-story.png`);
  });

  it('falls back to the app name when the title has no letters', () => {
    expect(storyFileName('???', 'KB App')).toBe('kb-app-story.png');
  });
});

describe('wrapLines', () => {
  it('breaks at spaces and keeps the diacritics of each letter', () => {
    expect(wrapLines(measure, 'Máy mới xin IP thế nào', 100, 4)).toEqual(['Máy mới', 'xin IP thế', 'nào']);
  });

  it('breaks a word wider than a line and ends the last line with an ellipsis', () => {
    expect(wrapLines(measure, 'abcdefghijklmnop', 50, 4)).toEqual(['abcde', 'fghij', 'klmno', 'p']);
    expect(wrapLines(measure, 'one two three four five six', 90, 2)).toEqual(['one two', 'three…']);
  });
});
