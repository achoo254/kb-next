/**
 * A PDF holding only some pages of another (pdf-lib), so Tika OCRs just the pages that need it: OCR is the slow,
 * memory-hungry part, and a mostly-text PDF may have a single scanned page.
 */
import { PDFDocument } from 'pdf-lib';
import { ExtractionError } from './extraction-error';

/** Parses a PDF once, for every subset a job takes of it. */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (error) {
    throw new ExtractionError('corrupt', `PDF could not be parsed: ${error instanceof Error ? error.name : 'error'}`, { cause: error });
  }
}

/** The given 1-based pages of `source`, in that order, as a new PDF. */
export async function pagesOf(source: PDFDocument, pages: readonly number[]): Promise<Uint8Array> {
  try {
    const target = await PDFDocument.create({ updateMetadata: false });
    const copied = await target.copyPages(
      source,
      pages.map((page) => page - 1),
    );
    for (const page of copied) target.addPage(page);
    return await target.save({ useObjectStreams: false });
  } catch (error) {
    throw new ExtractionError('corrupt', `PDF pages could not be copied: ${error instanceof Error ? error.name : 'error'}`, { cause: error });
  }
}

/** The given 1-based pages of `bytes`, in that order, as a new PDF. */
export async function pdfWithPages(bytes: Uint8Array, pages: readonly number[]): Promise<Uint8Array> {
  return pagesOf(await loadPdf(bytes), pages);
}
