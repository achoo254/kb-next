/**
 * Quality Validator: how readable a page's OCR text is, from up to three signals, each 0–1:
 * - `confidence`: Tesseract's mean word confidence, when Tika passes the hOCR word confidences through;
 * - `wordRatio`: the share of its words that are plausible Vietnamese or English words (validWordRatio);
 * - `coherence`: Jev's `score` of whether the text reads as coherent prose, when Jev is on and answers.
 * The page's score is their mean. A page is low quality when that score is under MIN_PAGE_SCORE, when its words are
 * mostly not words (under MIN_WORD_RATIO), or when OCR found almost nothing on it: such a page is flagged on C16 and
 * left out of the index, so no OCR garbage is ever searchable.
 */
import type { JevJudge, JevQuestion } from '../jev/jev-client';
import { safeErrorText } from '../log-error';

export const MIN_PAGE_SCORE = 0.55;
export const MIN_WORD_RATIO = 0.5;
/** Fewer non-whitespace characters than this: OCR read (next to) nothing on an image page. */
export const MIN_OCR_CHARS = 20;
/** Characters of a page Jev reads, and pages per Jev call. */
export const JEV_SAMPLE_CHARS = 1_200;
export const JEV_PAGES_PER_CALL = 20;
export const JEV_EXTRACT_TIMEOUT_MS = 20_000;

const VI_VOWELS = 'aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ';
/** Letters a Vietnamese or English word may use; anything else (µ, ¸, Ò… of a broken legacy encoding) is not a word. */
const WORD_LETTERS = new RegExp(`^[a-z${VI_VOWELS}đ]+$`);
/** One Vietnamese syllable: onset, one to three vowels, coda. */
const VI_SYLLABLE = new RegExp(`^(ngh|ng|gh|gi|kh|nh|ph|qu|th|tr|ch|[bcdđghklmnpqrstvx])?[${VI_VOWELS}]{1,3}(ng|nh|ch|[cmnpt])?$`);
const EDGE_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;
const NUMBER = /^[\d.,:%/+-]+$/;
const ALPHANUMERIC = /^(?=.*\p{L})(?=.*\d)[\p{L}\d]{2,12}$/u;

function isWord(raw: string): boolean {
  const token = raw.replace(EDGE_PUNCTUATION, '');
  if (!token) return false;
  if (NUMBER.test(token)) return true;
  // IPv4, eth0, k8s, x86_64-ish names: letters and digits together, kept short.
  if (ALPHANUMERIC.test(token)) return true;
  // Compound words and paths keep each part: e-mail, TCP/IP, don't.
  const parts = token.split(/[-/'’.]/);
  return parts.length <= 4 && parts.every((part) => part !== '' && isPlainWord(part));
}

function isPlainWord(word: string): boolean {
  if (/(.)\1{3,}/u.test(word)) return false;
  const lower = word.toLowerCase();
  if (!WORD_LETTERS.test(lower)) return false;
  // Plain ASCII: English (or Vietnamese written without marks). An acronym (DNS, TCP) needs no vowel.
  if (/^[a-z]+$/.test(lower)) {
    if (word.length <= 6 && word === word.toUpperCase() && word.length >= 2) return true;
    if (word.length === 1) return /^[aiouy]$/.test(lower);
    return word.length <= 25 && /[aeiouy]/.test(lower) && !/[^aeiouy]{6,}/.test(lower);
  }
  // With Vietnamese letters: one syllable.
  return VI_SYLLABLE.test(lower);
}

/** Share (0–1) of the text's whitespace-separated tokens that are plausible words; 0 for no tokens. */
export function validWordRatio(text: string): number {
  const tokens = text.split(/\s+/).filter((t) => t !== '');
  if (tokens.length === 0) return 0;
  return tokens.filter(isWord).length / tokens.length;
}

/** The start of a page's text, at most `chars` long, cut at a word boundary. */
export function sampleOf(text: string, chars: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= chars) return flat;
  const cut = flat.slice(0, chars);
  const space = cut.lastIndexOf(' ');
  return space > chars / 2 ? cut.slice(0, space) : cut;
}

export interface OcrPageText {
  page: number;
  text: string;
  /** Tesseract's mean word confidence, 0–1; null when Tika gave none. */
  confidence: number | null;
}

export interface PageQuality {
  page: number;
  /** 0–1: the mean of the signals present. */
  score: number;
  wordRatio: number;
  confidence: number | null;
  coherence: number | null;
  low: boolean;
}

const COHERENCE_LEVELS = [
  'Unreadable: scattered characters and symbols, no real words',
  'Mostly broken: a few words or phrases make sense, the rest is noise',
  'Readable with recognition errors: the meaning comes through despite wrong characters',
  'Clear: coherent sentences or well-formed notes, tables or lists',
];

/** Jev's coherence (0–1) of each page, by page number; empty when Jev is off or fails (logged, never fatal). */
async function coherenceOf(jev: JevJudge | null, pages: readonly OcrPageText[]): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (!jev) return result;
  const top = COHERENCE_LEVELS.length - 1;
  for (let start = 0; start < pages.length; start += JEV_PAGES_PER_CALL) {
    const batch = pages.slice(start, start + JEV_PAGES_PER_CALL).filter((p) => p.text.trim() !== '');
    if (batch.length === 0) continue;
    const id = (page: number): string => `p${page}`;
    const state = { pages: Object.fromEntries(batch.map((p) => [id(p.page), sampleOf(p.text, JEV_SAMPLE_CHARS)])) };
    const questions: Record<string, JevQuestion> = Object.fromEntries(
      batch.map((p) => [
        id(p.page),
        {
          type: 'score',
          instructions:
            `The text \`pages.${id(p.page)}\` was read by OCR from a scanned page, in Vietnamese or English. ` +
            'How coherent and readable is it? Judge only that text; technical terms, commands and numbers are normal.',
          criteria: COHERENCE_LEVELS,
        },
      ]),
    );
    try {
      const { answers } = await jev.ask('extract-quality', state, questions, { timeoutMs: JEV_EXTRACT_TIMEOUT_MS });
      for (const p of batch) {
        const answer = answers[id(p.page)];
        if (answer?.type === 'score') result.set(p.page, Math.min(1, Math.max(0, answer.score / top)));
      }
    } catch (error) {
      console.error('extract: Jev quality check failed', safeErrorText(error));
    }
  }
  return result;
}

/** The quality of each OCR page, in the given order. */
export async function assessOcrPages(jev: JevJudge | null, pages: readonly OcrPageText[]): Promise<PageQuality[]> {
  const coherence = await coherenceOf(jev, pages);
  return pages.map((p) => {
    const wordRatio = validWordRatio(p.text);
    const pageCoherence = coherence.get(p.page) ?? null;
    const signals = [wordRatio, p.confidence, pageCoherence].filter((s): s is number => s !== null);
    const score = signals.reduce((sum, s) => sum + s, 0) / signals.length;
    const empty = p.text.replace(/\s+/g, '').length < MIN_OCR_CHARS;
    return {
      page: p.page,
      score: Math.round(score * 100) / 100,
      wordRatio,
      confidence: p.confidence,
      coherence: pageCoherence,
      low: empty || score < MIN_PAGE_SCORE || wordRatio < MIN_WORD_RATIO,
    };
  });
}
