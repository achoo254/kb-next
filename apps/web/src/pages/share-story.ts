/**
 * The QR code of a share link and its story picture (board C18, "Tải ảnh story"), both made in the browser: no network
 * call, and the link (it carries the token) is never logged or stored. The QR comes from qrcode-generator; the story is
 * a 1080×1920 PNG drawn on a canvas in the dark brand look whatever the page's theme: the brand, the Space, the
 * ill-doc-planet art, the text's title and the QR code with a "scan to read" line naming only the host.
 */
import qrcode from 'qrcode-generator';
import { ILLUSTRATIONS } from '../ui/art';
import { cssToken } from '../ui/css-token';

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/** The modules of the QR code of `text` (true = dark), row by row; medium error correction, the smallest version. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

/** An SVG path of the dark modules, one unit per module (viewBox 0 0 size size). */
export function qrPath(matrix: readonly (readonly boolean[])[]): string {
  const parts: string[] = [];
  matrix.forEach((cells, row) =>
    cells.forEach((dark, col) => {
      if (dark) parts.push(`M${col} ${row}h1v1h-1z`);
    }),
  );
  return parts.join('');
}

/** "giao-thuc-dhcp-story.png" from "Giao thức DHCP": Vietnamese letters folded to ASCII, at most 60 characters. */
export function storyFileName(title: string, fallback: string): string {
  const slug = (value: string): string =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '');
  return `${slug(title) || slug(fallback) || 'story'}-story.png`;
}

export interface StoryContent {
  title: string;
  space: string;
  appName: string;
  /** The full share link: only inside the QR code, never written as text. */
  url: string;
  /** The line under the QR code, e.g. "Quét mã để đọc · kb.hoandat.com". */
  caption: string;
}

type StoryContext = Pick<
  CanvasRenderingContext2D,
  | 'createRadialGradient'
  | 'fillRect'
  | 'fillText'
  | 'measureText'
  | 'drawImage'
  | 'beginPath'
  | 'roundRect'
  | 'fill'
  | 'stroke'
  | 'save'
  | 'restore'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'shadowColor'
  | 'shadowBlur'
>;

const MARGIN = 108;
const TEXT_WIDTH = STORY_WIDTH - MARGIN * 2;
const TITLE_LINE = 92;
const TITLE_LINES = 4;
const QR_TILE = 440;
const QR_TOP = 1290;
const QR_PAD = 36;

/** The story's fonts: the page's own font stacks (Space Grotesk titles, Inter text). */
function storyFonts(): { title: string; brand: string; text: string } {
  const display = cssToken('--font-display') || 'sans-serif';
  const sans = cssToken('--font-sans') || 'sans-serif';
  return { title: `700 80px ${display}`, brand: `700 56px ${display}`, text: `600 38px ${sans}` };
}

/**
 * `text` cut into lines no wider than `width`, at most `max` lines (the last one ends with "…" when the text goes on).
 * Words break at spaces; a word wider than a line breaks between its letters (NFC keeps each letter with its marks).
 */
export function wrapLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, width: number, max: number): string[] {
  const fits = (line: string): boolean => ctx.measureText(line).width <= width;
  const pieces: string[] = [];
  for (const word of text.normalize('NFC').split(/\s+/).filter(Boolean)) {
    if (fits(word)) {
      pieces.push(word);
      continue;
    }
    let part = '';
    for (const letter of Array.from(word)) {
      if (part && !fits(part + letter)) {
        pieces.push(part);
        part = '';
      }
      part += letter;
    }
    if (part) pieces.push(part);
  }
  const lines: string[] = [];
  let line = '';
  for (const piece of pieces) {
    const next = line ? `${line} ${piece}` : piece;
    if (line && !fits(next)) {
      lines.push(line);
      line = piece;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1] ?? '';
  while (last && !fits(`${last}…`)) last = Array.from(last).slice(0, -1).join('').trimEnd();
  kept[max - 1] = `${last}…`;
  return kept;
}

/** Draws the story on `ctx` (STORY_WIDTH × STORY_HEIGHT); `art` is left out when it did not load. */
export function drawStory(ctx: StoryContext, content: StoryContent, art: CanvasImageSource | null, qr: readonly (readonly boolean[])[]): void {
  const fonts = storyFonts();
  const text = cssToken('--share-story-text');
  const soft = cssToken('--share-story-url');

  const sky = ctx.createRadialGradient(STORY_WIDTH / 2, 620, 0, STORY_WIDTH / 2, 620, 1300);
  sky.addColorStop(0, cssToken('--share-story-sky'));
  sky.addColorStop(0.75, cssToken('--share-story-deep'));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  ctx.strokeStyle = cssToken('--share-story-border');
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(36, 36, STORY_WIDTH - 72, STORY_HEIGHT - 72, 72);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = text;
  ctx.font = fonts.brand;
  ctx.fillText(content.appName, MARGIN, 120);
  ctx.fillStyle = soft;
  ctx.font = fonts.text;
  ctx.fillText(content.space, MARGIN, 196);

  if (art) {
    ctx.save();
    ctx.shadowColor = cssToken('--share-story-glow');
    ctx.shadowBlur = 80;
    ctx.drawImage(art, (STORY_WIDTH - 500) / 2, 290, 500, 500);
    ctx.restore();
  }

  ctx.fillStyle = text;
  ctx.font = fonts.title;
  wrapLines(ctx, content.title, TEXT_WIDTH, TITLE_LINES).forEach((line, i) => ctx.fillText(line, MARGIN, 850 + i * TITLE_LINE));

  // The QR code on its white tile; whole pixels per module keep it sharp, the tile's padding is its quiet zone.
  const left = (STORY_WIDTH - QR_TILE) / 2;
  ctx.fillStyle = cssToken('--white');
  ctx.beginPath();
  ctx.roundRect(left, QR_TOP, QR_TILE, QR_TILE, 40);
  ctx.fill();
  const size = qr.length;
  if (size > 0) {
    const cell = Math.floor((QR_TILE - QR_PAD * 2) / size);
    const start = (QR_TILE - cell * size) / 2;
    ctx.fillStyle = cssToken('--share-qr-ink');
    qr.forEach((cells, row) =>
      cells.forEach((dark, col) => {
        if (dark) ctx.fillRect(left + start + col * cell, QR_TOP + start + row * cell, cell, cell);
      }),
    );
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = soft;
  ctx.font = fonts.text;
  ctx.fillText(content.caption, STORY_WIDTH / 2, QR_TOP + QR_TILE + 56);
}

/**
 * Waits for the story's fonts with the glyphs of `text`: the self-hosted faces are split by script (the Vietnamese
 * letters are a subset of their own), so each is asked for with the text before the fonts settle. A face that does not
 * load leaves the browser's fallback font, which still draws the diacritics.
 */
async function storyFontsReady(text: string): Promise<void> {
  const set = typeof document === 'undefined' ? undefined : document.fonts;
  if (!set) return;
  const fonts = storyFonts();
  await Promise.all([fonts.title, fonts.brand, fonts.text].map((font) => set.load(font, text).catch(() => [])));
  await set.ready;
}

/** The art, decoded; null when it does not load (the story is drawn without it). */
async function loadArt(src: string): Promise<HTMLImageElement | null> {
  try {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/** Draws the story and downloads it as `<title slug>-story.png`; rejects when the canvas cannot draw or encode. */
export async function downloadStory(content: StoryContent): Promise<void> {
  await storyFontsReady(`${content.appName} ${content.space} ${content.title} ${content.caption}`);
  const art = await loadArt(ILLUSTRATIONS['doc-planet']);
  const canvas = document.createElement('canvas');
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  drawStory(ctx, content, art, qrMatrix(content.url));
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('canvas-empty'))), 'image/png'));
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = storyFileName(content.title, content.appName);
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Some browsers read the blob after click() returns; give them a moment before letting it go.
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
}
