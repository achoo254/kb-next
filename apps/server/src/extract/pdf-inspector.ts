/**
 * PDF Inspector: measures every page of a PDF with pdf.js, without rendering it: the page's text layer (what a
 * selection would copy) and how much of the page images cover (each image's placement through the page's transforms,
 * summed and capped at the whole page). The OCR Decision Engine (ocr-decision.ts) reads these numbers.
 *
 * pdf.js is loaded on first use (it is large, and most of the server never needs it) and runs on the main thread
 * (its "fake worker"), one page at a time, each page's resources released before the next.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ensureDomMatrix } from './dom-matrix';
import { ExtractionError } from './extraction-error';

export interface PdfPageReport {
  /** 1-based page number. */
  page: number;
  /** The page's text layer, lines ending in `\n`. */
  text: string;
  /** Non-whitespace characters of `text`. */
  textChars: number;
  /** Share of the page's area covered by images, 0–1. */
  imageRatio: number;
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let loading: Promise<PdfJs> | null = null;

async function loadPdfJs(): Promise<PdfJs> {
  loading ??= (async () => {
    ensureDomMatrix();
    // The worker's message handler on the main thread: no worker file to find at run time (the server is bundled).
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return import('pdfjs-dist/legacy/build/pdf.mjs');
  })();
  return loading;
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  // n applied first, then m (PDF's `cm`: the new matrix is n × CTM).
  return [
    n[0] * m[0] + n[1] * m[2],
    n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2],
    n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4],
    n[4] * m[1] + n[5] * m[3] + m[5],
  ];
}

function asMatrix(value: unknown): Matrix | null {
  if (!value || typeof value !== 'object' || !('length' in value) || value.length !== 6) return null;
  const numbers = Array.from(value as ArrayLike<unknown>);
  return numbers.every((n): n is number => typeof n === 'number' && Number.isFinite(n)) ? (numbers as Matrix) : null;
}

/** An image is drawn into the unit square of the current transform: its area is the transform's determinant. */
function unitArea(m: Matrix): number {
  return Math.abs(m[0] * m[3] - m[1] * m[2]);
}

/** Area of the page covered by images, from the page's operator list. */
export function imageAreaOf(ops: PdfJs['OPS'], fnArray: readonly number[], argsArray: readonly unknown[]): number {
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  let area = 0;
  for (let i = 0; i < fnArray.length; i += 1) {
    const fn = fnArray[i];
    const args = argsArray[i];
    const list = Array.isArray(args) ? (args as unknown[]) : [];
    switch (fn) {
      case ops.save:
        stack.push(ctm);
        break;
      case ops.restore:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case ops.transform: {
        const m = asMatrix(list);
        if (m) ctm = multiply(ctm, m);
        break;
      }
      case ops.paintFormXObjectBegin: {
        stack.push(ctm);
        const m = asMatrix(list[0]);
        if (m) ctm = multiply(ctm, m);
        break;
      }
      case ops.paintFormXObjectEnd:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case ops.paintImageXObject:
      case ops.paintInlineImageXObject:
      case ops.paintImageMaskXObject:
        area += unitArea(ctm);
        break;
      case ops.paintImageXObjectRepeat: {
        // [objId, scaleX, scaleY, positions]: the same image at each (x, y).
        const [, scaleX, scaleY, positions] = list;
        if (typeof scaleX === 'number' && typeof scaleY === 'number' && positions && typeof positions === 'object' && 'length' in positions) {
          const copies = Math.floor(Number(positions.length) / 2);
          area += copies * unitArea(multiply(ctm, [scaleX, 0, 0, scaleY, 0, 0]));
        }
        break;
      }
      default:
        break;
    }
  }
  return area;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

/** Measures every page; rejects with `encrypted` (password) or `corrupt` (not a readable PDF). */
export async function inspectPdf(bytes: Uint8Array, signal?: AbortSignal): Promise<PdfPageReport[]> {
  const pdfjs = await loadPdfJs();
  let doc: PDFDocumentProxy;
  try {
    // A copy: pdf.js takes over (detaches) the buffer it is given.
    doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    }).promise;
  } catch (error) {
    if (errorName(error) === 'PasswordException') throw new ExtractionError('encrypted', 'PDF needs a password', { cause: error });
    throw new ExtractionError('corrupt', `PDF unreadable: ${errorName(error) || 'error'}`, { cause: error });
  }
  try {
    const reports: PdfPageReport[] = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      if (signal?.aborted) throw new ExtractionError('timeout', 'job deadline passed');
      const page = await doc.getPage(number);
      try {
        const content = await page.getTextContent();
        const text = content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join('');
        const list = await page.getOperatorList();
        const [x0, y0, x1, y1] = page.view;
        const pageArea = Math.abs(((x1 ?? 0) - (x0 ?? 0)) * ((y1 ?? 0) - (y0 ?? 0)));
        const covered = imageAreaOf(pdfjs.OPS, list.fnArray, list.argsArray);
        reports.push({
          page: number,
          text,
          textChars: text.replace(/\s+/g, '').length,
          imageRatio: pageArea > 0 ? Math.min(1, covered / pageArea) : 0,
        });
      } finally {
        page.cleanup();
      }
    }
    return reports;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError('corrupt', `PDF page unreadable: ${errorName(error) || 'error'}`, { cause: error });
  } finally {
    await doc.destroy();
  }
}
