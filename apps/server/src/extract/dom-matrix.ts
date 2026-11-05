/**
 * The 2D part of the browser's DOMMatrix that pdf.js needs when it only reads a PDF (no rendering): pdf.js 5 builds
 * one at load time and uses `scaleSelf` / `translateSelf` while compiling Type3 glyphs. In development and tests
 * `@napi-rs/canvas` (an optional dependency of pdf.js) supplies the real one; the production bundle ships without
 * native packages, so this one is installed there, never over an existing DOMMatrix.
 */
export class Matrix2D {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: ArrayLike<number>) {
    if (init && init.length === 6) [this.a, this.b, this.c, this.d, this.e, this.f] = Array.from(init) as [number, number, number, number, number, number];
  }

  /** This × other, in place (other applied first, as DOMMatrix.multiplySelf). */
  private multiplySelf(m: { a: number; b: number; c: number; d: number; e: number; f: number }): this {
    const { a, b, c, d, e, f } = this;
    this.a = a * m.a + c * m.b;
    this.b = b * m.a + d * m.b;
    this.c = a * m.c + c * m.d;
    this.d = b * m.c + d * m.d;
    this.e = a * m.e + c * m.f + e;
    this.f = b * m.e + d * m.f + f;
    return this;
  }

  scaleSelf(scaleX = 1, scaleY = scaleX): this {
    return this.multiplySelf({ a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 });
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }
}

/** Installs Matrix2D as the global DOMMatrix when the runtime has none. */
export function ensureDomMatrix(): void {
  const scope = globalThis as { DOMMatrix?: unknown };
  scope.DOMMatrix ??= Matrix2D;
}
