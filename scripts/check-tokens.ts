/**
 * `pnpm check:tokens`: design-token guard of the web app.
 *
 * 1. No colour literal in apps/web/src (ts, tsx, css; tests excluded) or apps/web/index.html outside src/ui/tokens.css.
 * 2. Every text/background pair the UI uses meets WCAG 2 AA (text 4.5:1) in both themes (Tối and Sáng): on every
 *    opaque surface and on every fill that carries text; the focus ring, state borders and icons at 3:1 (non-text).
 *
 * Exits 1 on any failure, printing file:line for literals and the ratio of each failing pair.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type LiteralViolation, type TokenMap, contrastRatio, findColourLiterals, parseTokens } from './token-contrast';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps/web');
const TOKENS_FILE = path.join(WEB, 'src/ui/tokens.css');
const SCANNED = new Set(['.ts', '.tsx', '.css']);
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/** The themes of tokens.css: each declares its colours under its own prefix (--dark-*, --light-*). */
const THEMES = ['dark', 'light'] as const;
/** Text colours and the opaque backgrounds each must be readable on, per theme (the page, bg2 fills, solid cards). */
const SCREEN_TEXT = ['text', 'muted', 'sub', 'link', 'accent', 'success-text', 'warn-text', 'danger-text'];
const SCREEN_BACKGROUNDS = ['bg', 'bg2', 'surface-solid'];
/** Fills with text on them, and the text colours they carry. */
const FILLS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['primary', ['on-primary']],
  ['warn', ['on-warn']],
  ['accent-fill', ['on-accent-fill']],
  ['danger-fill', ['on-danger-fill']],
  ['tooltip-bg', ['tooltip-text']],
];
/** Non-text marks at 3:1 (focus ring, state borders and icons) on what they sit on. */
const MARK_COLOURS = ['focus', 'primary', 'accent', 'success', 'warn', 'danger'];
const MARKS: ReadonlyArray<readonly [string, readonly string[]]> = MARK_COLOURS.map((mark) => [mark, SCREEN_BACKGROUNDS] as const);

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return SCANNED.has(path.extname(entry.name)) ? [full] : [];
    }),
  );
  return nested.flat();
}

async function literalViolations(): Promise<LiteralViolation[]> {
  // Tests hold colours as data (a Space's tint in an API answer), not as styling: only the UI sources are checked.
  const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file);
  const files = [...(await sourceFiles(path.join(WEB, 'src'))).filter((f) => f !== TOKENS_FILE && !isTest(f)), path.join(WEB, 'index.html')];
  const results = await Promise.all(files.map(async (file) => findColourLiterals(await readFile(file, 'utf8'), path.relative(ROOT, file))));
  return results.flat();
}

function value(tokens: TokenMap, name: string): string {
  const found = tokens.get(name);
  if (found === undefined) throw new Error(`tokens.css does not define ${name}`);
  return found;
}

/** Every pair to check, in both themes: [label, foreground colour, background colour, minimum ratio]. */
function pairs(tokens: TokenMap): Array<readonly [string, string, string, number]> {
  const list: Array<readonly [string, string, string, number]> = [];
  for (const theme of THEMES) {
    const v = (name: string): string => value(tokens, `--${theme}-${name}`);
    const label = (fg: string, bg: string): string => `--${theme}-${fg} on --${theme}-${bg}`;
    for (const fg of SCREEN_TEXT) for (const bg of SCREEN_BACKGROUNDS) list.push([label(fg, bg), v(fg), v(bg), AA_TEXT]);
    for (const [fill, texts] of FILLS) for (const fg of texts) list.push([label(fg, fill), v(fg), v(fill), AA_TEXT]);
    for (const [mark, backgrounds] of MARKS) for (const bg of backgrounds) list.push([`${label(mark, bg)} (mark)`, v(mark), v(bg), AA_NON_TEXT]);
  }
  return list;
}

async function main(): Promise<number> {
  let failed = false;
  const violations = await literalViolations();
  if (violations.length > 0) {
    failed = true;
    console.error(`✗ ${violations.length} colour literal(s) outside apps/web/src/ui/tokens.css:`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.match}`);
  } else {
    console.log('✓ No colour literals outside tokens.css');
  }

  const checked = pairs(parseTokens(await readFile(TOKENS_FILE, 'utf8')));
  const failures = checked
    .map(([label, fg, bg, minimum]) => ({ label, minimum, ratio: contrastRatio(fg, bg) }))
    .filter((pair) => pair.ratio < pair.minimum)
    .map((pair) => `  ${pair.ratio.toFixed(2)}:1 < ${pair.minimum}:1  ${pair.label}`);
  if (failures.length > 0) {
    failed = true;
    console.error(`✗ ${failures.length} of ${checked.length} contrast pair(s) below WCAG AA:`);
    for (const line of failures) console.error(line);
  } else {
    console.log(`✓ ${checked.length} contrast pairs meet WCAG AA (text ${AA_TEXT}:1, outlines ${AA_NON_TEXT}:1)`);
  }
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error('check:tokens crashed:', error);
    process.exitCode = 1;
  },
);
