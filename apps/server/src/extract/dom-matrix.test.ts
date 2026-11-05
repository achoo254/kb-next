/** The DOMMatrix stand-in pdf.js reads PDFs with when the production bundle has no native canvas package. */
import { describe, expect, it } from 'vitest';
import { Matrix2D, ensureDomMatrix } from './dom-matrix';

describe('Matrix2D', () => {
  it('starts as the identity, or from six numbers', () => {
    expect({ ...new Matrix2D() }).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expect({ ...new Matrix2D([2, 0, 0, 3, 4, 5]) }).toEqual({ a: 2, b: 0, c: 0, d: 3, e: 4, f: 5 });
  });

  it('scales then translates as DOMMatrix does (pdf.js flips a Type3 glyph bitmap this way)', () => {
    const width = 8;
    const height = 4;
    const m = new Matrix2D().scaleSelf(1 / width, -1 / height).translateSelf(0, -height);
    expect({ ...m }).toEqual({ a: 0.125, b: 0, c: 0, d: -0.25, e: 0, f: 1 });
  });

  it('never replaces a DOMMatrix the runtime has', () => {
    const scope = globalThis as { DOMMatrix?: unknown };
    const existing = scope.DOMMatrix;
    ensureDomMatrix();
    expect(scope.DOMMatrix).toBeDefined();
    if (existing) expect(scope.DOMMatrix).toBe(existing);
  });
});
