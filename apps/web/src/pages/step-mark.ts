/** A number standing alone as a word: "2", "2.", "2:", "2)". */
const STEP_NUMBER = /^(\d{1,3})[.:)]?$/;

/**
 * The mark on a step card, shared by the reader (C11) and the editor (C02): the step's number when its term names
 * one in its first two words ("Bước 2", "Step 3:", "2. Cài đặt"), else the term's first letter, as the board's DORA
 * (Discover → D). An empty term gets a dot.
 */
export function stepMark(term: string): string {
  const trimmed = term.trim();
  for (const word of trimmed.split(/\s+/).slice(0, 2)) {
    const number = STEP_NUMBER.exec(word)?.[1];
    if (number) return number;
  }
  return Array.from(trimmed)[0]?.toLocaleUpperCase() ?? '·';
}
