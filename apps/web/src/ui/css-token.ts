/**
 * The value of a token of tokens.css as the page sees it (a hex colour as written there), empty when styles are not loaded (unit
 * tests). For pages that document the tokens: they show the real values instead of copies.
 */
export function cssToken(name: `--${string}`): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A token's colour as the mock writes it: upper-case hex. */
export function cssColourLabel(name: `--${string}`): string {
  return cssToken(name).toUpperCase();
}
