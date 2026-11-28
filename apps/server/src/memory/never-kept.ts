/**
 * Numbers the AI memory never keeps, whatever the user says: identity papers (CCCD, CMND, passport) and financial
 * accounts (bank accounts, cards). A best effort, not a guarantee: a number next to one of those words (before or
 * after it, with or without Vietnamese diacritics), or a 13–19 digit card number that passes the Luhn check. Dates
 * (`2027-05-01`, `01/05/2027`) are not numbers of that kind.
 */

const KEYWORDS = [
  'cccd',
  'cmnd',
  'can cuoc',
  'chung minh nhan dan',
  'ho chieu',
  'passport',
  'so tai khoan',
  'stk',
  'tai khoan ngan hang',
  'account number',
  'bank account',
  'iban',
  'the tin dung',
  'the ghi no',
  'credit card',
  'debit card',
  'card number',
  'visa',
  'mastercard',
];
const KEYWORD = KEYWORDS.map((k) => k.replace(/ /g, '\\s+')).join('|');
/** Up to two letters (a passport's "C"), then at least 7 digits, spaces, dots or dashes allowed between them. */
const NUMBER = String.raw`[a-z]{0,2}\d(?:[\s.-]?\d){6,}`;
const NEAR = new RegExp(String.raw`(?:\b(?:${KEYWORD})\b\D{0,24}${NUMBER})|(?:${NUMBER}\D{0,24}\b(?:${KEYWORD})\b)`, 'i');
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;
const DATE = /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/g;

/** Lower case, no diacritics, đ → d: the form the keywords are written in. */
function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Whether `text` holds an identity or financial account number memory never keeps. */
export function holdsNeverKeptNumber(text: string): boolean {
  const plain = folded(text).replace(DATE, ' ');
  if (NEAR.test(plain)) return true;
  for (const match of plain.matchAll(CARD)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) return true;
  }
  return false;
}
