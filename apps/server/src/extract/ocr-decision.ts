/**
 * OCR Decision Engine: which pages of a PDF are read from their text layer and which go to OCR, from the PDF
 * Inspector's numbers.
 * - No text layer (under MIN_TEXT_CHARS) on a page with images: OCR. Neither text nor images: an empty page; a little
 *   text and no image: text.
 * - A text layer of plausible words (validWordRatio at least CLEAN_WORD_RATIO): text. A scanner's invisible OCR layer
 *   counts too.
 * - Anything in between (a text layer of odd glyphs or a broken legacy encoding, a few words over a page-sized image)
 *   is borderline: Jev's `noul` "is this text layer readable" decides (READABLE_NOUL or more: text). Without Jev, or
 *   when it fails, the words decide: a ratio under GARBAGE_WORD_RATIO, or a few words over a mostly-image page, go to
 *   OCR.
 */
import type { JevJudge, JevQuestion } from '../jev/jev-client';
import { safeErrorText } from '../log-error';
import type { PdfPageReport } from './pdf-inspector';
import { JEV_EXTRACT_TIMEOUT_MS, JEV_PAGES_PER_CALL, JEV_SAMPLE_CHARS, sampleOf, validWordRatio } from './quality-validator';

export const MIN_TEXT_CHARS = 40;
/** Images covering less than this share of a page with no text: decoration, not a scan (the page is empty). */
export const MIN_SCAN_IMAGE_RATIO = 0.05;
export const CLEAN_WORD_RATIO = 0.75;
export const GARBAGE_WORD_RATIO = 0.5;
/** A page mostly image with only a little text (a caption, a stamp) is borderline. */
const MOSTLY_IMAGE_RATIO = 0.5;
const LITTLE_TEXT_CHARS = 200;
export const READABLE_NOUL = 0.5;

export type PageSource = 'text' | 'ocr' | 'empty';
export type DecisionReason = 'text-layer' | 'no-text-layer' | 'blank' | 'jev-readable' | 'jev-unreadable' | 'garbage-text-layer' | 'little-text-on-image';

export interface PageDecision {
  page: number;
  source: PageSource;
  reason: DecisionReason;
  /** Whether the page had a text layer that was judged unusable (its fix: export the PDF with text). */
  garbageTextLayer: boolean;
}

function fallback(report: PdfPageReport, ratio: number): PageDecision {
  if (ratio < GARBAGE_WORD_RATIO) return { page: report.page, source: 'ocr', reason: 'garbage-text-layer', garbageTextLayer: true };
  if (report.imageRatio >= MOSTLY_IMAGE_RATIO && report.textChars < LITTLE_TEXT_CHARS) {
    return { page: report.page, source: 'ocr', reason: 'little-text-on-image', garbageTextLayer: false };
  }
  return { page: report.page, source: 'text', reason: 'text-layer', garbageTextLayer: false };
}

/** Jev's readability (0–1) of each borderline page's text layer; empty when Jev is off or fails. */
async function readability(jev: JevJudge | null, pages: readonly PdfPageReport[]): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (!jev) return result;
  for (let start = 0; start < pages.length; start += JEV_PAGES_PER_CALL) {
    const batch = pages.slice(start, start + JEV_PAGES_PER_CALL);
    const id = (page: number): string => `p${page}`;
    const state = { pages: Object.fromEntries(batch.map((p) => [id(p.page), sampleOf(p.text, JEV_SAMPLE_CHARS)])) };
    const questions: Record<string, JevQuestion> = Object.fromEntries(
      batch.map((p) => [
        id(p.page),
        {
          type: 'noul',
          instructions: `\`pages.${id(p.page)}\` is the text layer copied out of one PDF page. Can a person read it as Vietnamese or English text?`,
          criteria: {
            true: 'Real words and sentences (technical terms, code and numbers included), even with a few wrong characters',
            false: 'Mostly wrong glyphs, symbols or mis-encoded letters: the words cannot be made out',
          },
        },
      ]),
    );
    try {
      const { answers } = await jev.ask('extract-ocr-decision', state, questions, { timeoutMs: JEV_EXTRACT_TIMEOUT_MS });
      for (const p of batch) {
        const answer = answers[id(p.page)];
        if (answer?.type === 'noul') result.set(p.page, answer.noul);
      }
    } catch (error) {
      console.error('extract: Jev OCR decision failed', safeErrorText(error));
    }
  }
  return result;
}

/** The source of every page, in page order. */
export async function decidePages(jev: JevJudge | null, reports: readonly PdfPageReport[]): Promise<PageDecision[]> {
  const decisions = new Map<number, PageDecision>();
  const borderline: Array<{ report: PdfPageReport; ratio: number }> = [];
  for (const report of reports) {
    const decide = (source: PageSource, reason: DecisionReason): void => {
      decisions.set(report.page, { page: report.page, source, reason, garbageTextLayer: false });
    };
    if (report.textChars < MIN_TEXT_CHARS) {
      // A page number or a stamp over a scan is no text layer; a short page of text with no image is just short.
      if (report.imageRatio >= MIN_SCAN_IMAGE_RATIO) decide('ocr', 'no-text-layer');
      else if (report.textChars === 0) decide('empty', 'blank');
      else decide('text', 'text-layer');
      continue;
    }
    const ratio = validWordRatio(report.text);
    const littleOnImage = report.imageRatio >= MOSTLY_IMAGE_RATIO && report.textChars < LITTLE_TEXT_CHARS;
    if (ratio >= CLEAN_WORD_RATIO && !littleOnImage) {
      decide('text', 'text-layer');
    } else {
      borderline.push({ report, ratio });
    }
  }
  const verdicts = await readability(
    jev,
    borderline.map((b) => b.report),
  );
  for (const { report, ratio } of borderline) {
    const noul = verdicts.get(report.page);
    if (noul === undefined) decisions.set(report.page, fallback(report, ratio));
    else if (noul >= READABLE_NOUL) decisions.set(report.page, { page: report.page, source: 'text', reason: 'jev-readable', garbageTextLayer: false });
    else decisions.set(report.page, { page: report.page, source: 'ocr', reason: 'jev-unreadable', garbageTextLayer: report.imageRatio < MOSTLY_IMAGE_RATIO });
  }
  return reports.map((r) => decisions.get(r.page) ?? { page: r.page, source: 'empty', reason: 'blank', garbageTextLayer: false });
}
