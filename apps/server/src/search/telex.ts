/**
 * Vietnamese diacritics written the Telex way, so the search index can tell "mạng" from "mang" (Meilisearch folds
 * diacritics away and cannot be told not to). Vowel marks stay on their letter (â → aa, ă → aw, ê → ee, ô → oo,
 * ơ → ow, ư → uw, đ → dd); the word's tone goes at its end (sắc s, huyền f, hỏi r, ngã x, nặng j):
 * "mạng" → "mangj", "màng" → "mangf", "đường" → "dduwowngf". A word without diacritics stays as it is, lower-cased.
 */

const TONES: Record<string, string> = {
  '́': 's', // acute
  '̀': 'f', // grave
  '̉': 'r', // hook above
  '̃': 'x', // tilde
  '̣': 'j', // dot below
};

/** Vowel marks after NFD: circumflex doubles the letter, breve and horn add `w`. */
const VOWEL_MARKS: Record<string, (base: string) => string> = {
  '̂': (base) => base, // â ê ô
  '̆': () => 'w', // ă
  '̛': () => 'w', // ơ ư
};

const COMBINING = /[̀-ͯ]/;
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

/** Telex form of `text`, lower-cased; characters other than letters and marks are kept. */
export function toTelex(text: string): string {
  const decomposed = text.normalize('NFD').toLowerCase();
  let out = '';
  let tone = '';
  let lastBase = '';
  for (const char of decomposed) {
    if (char === 'đ') {
      out += 'dd';
      lastBase = 'd';
      continue;
    }
    const toneLetter = TONES[char];
    if (toneLetter) {
      tone = toneLetter;
      continue;
    }
    const vowelMark = VOWEL_MARKS[char];
    if (vowelMark) {
      out += vowelMark(lastBase);
      continue;
    }
    if (COMBINING.test(char)) continue; // a mark Vietnamese does not use: dropped, as the index would
    if (WORD_CHAR.test(char)) {
      out += char;
      lastBase = char;
      continue;
    }
    // Word boundary: the pending tone closes the word.
    out += tone + char;
    tone = '';
    lastBase = '';
  }
  return out + tone;
}

/** True when `text` carries a Vietnamese diacritic (a tone, a vowel mark or đ). */
export function hasDiacritics(text: string): boolean {
  return /[̀-ͯđĐ]/.test(text.normalize('NFD'));
}
