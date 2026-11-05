/**
 * The PDF worker thread (started by pdf-work.ts, one per job): pdf.js measures the pages, pdf-lib copies the pages
 * to OCR, both outside the API's thread and inside the heap limit the thread was given. A file that needs more
 * memory kills this thread, not the server. pdf-lib parses the PDF once and keeps it for every OCR batch.
 */
import { parentPort } from 'node:worker_threads';
import type { PDFDocument } from 'pdf-lib';
import { ExtractionError } from './extraction-error';
import { inspectPdf } from './pdf-inspector';
import { loadPdf, pagesOf } from './pdf-subset';

export type PdfRequest = { id: number; op: 'inspect'; bytes: Uint8Array } | { id: number; op: 'subset'; pages: number[]; bytes: Uint8Array | null };

export type PdfReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; code: string; message: string };

let source: PDFDocument | null = null;

async function answer(request: PdfRequest): Promise<unknown> {
  if (request.op === 'inspect') return inspectPdf(request.bytes, undefined, true);
  if (!source) {
    if (!request.bytes) throw new ExtractionError('internal', 'subset asked before the PDF was given');
    source = await loadPdf(request.bytes);
  }
  return pagesOf(source, request.pages);
}

parentPort?.on('message', (request: PdfRequest) => {
  answer(request).then(
    (result) => {
      const transfer = result instanceof Uint8Array ? [result.buffer as ArrayBuffer] : [];
      parentPort?.postMessage({ id: request.id, ok: true, result } satisfies PdfReply, transfer);
    },
    (error: unknown) => {
      const code = error instanceof ExtractionError ? error.code : 'internal';
      const message = error instanceof Error ? `${error.name}: ${error.message}` : 'error';
      parentPort?.postMessage({ id: request.id, ok: false, code, message } satisfies PdfReply);
    },
  );
});
