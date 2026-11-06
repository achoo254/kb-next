import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * Contrast of the visible text against what is really painted behind it. axe-core cannot judge text over a gradient,
 * a picture or a backdrop blur (most of this UI's panels), so here the page is shot once with every glyph made
 * transparent, and each text box's colour is compared with the mean of the pixels behind it in that shot: the
 * effective background, whatever layers made it. WCAG 2 AA: 4.5:1, 3:1 for large text (24px, or 18.66px bold).
 *
 * Left out, as WCAG leaves them out: text of disabled controls (and of a label holding one), text nobody sees (hidden,
 * transparent, covered by another element such as a dialog's scrim), gradient-filled titles (transparent fill) and SVG
 * text (drawn with fill).
 */

type Rgba = readonly [number, number, number, number];

interface TextBox {
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  color: Rgba;
  large: boolean;
}

/** Collects the text boxes in the viewport; runs in the page. */
function collectTextBoxes(): TextBox[] {
  const parseColour = (value: string): Rgba | null => {
    const numbers = (value.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number);
    if (value.startsWith('rgb')) return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0, numbers[3] ?? 1];
    if (value.startsWith('color(srgb')) return [(numbers[0] ?? 0) * 255, (numbers[1] ?? 0) * 255, (numbers[2] ?? 0) * 255, numbers[3] ?? 1];
    return null;
  };
  const opacityOf = (element: Element): number => {
    let opacity = 1;
    for (let node: Element | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    return opacity;
  };
  const boxes: TextBox[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const element = node.parentElement;
    if (!text || !element || element.closest('script, style, noscript, svg, :disabled, [aria-disabled="true"], label:has(:disabled)')) continue;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible') continue;
    const colour = parseColour(style.webkitTextFillColor || style.color);
    const opacity = opacityOf(element);
    if (!colour || colour[3] * opacity < 0.05) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()]
      .map((rect) => ({
        left: Math.max(rect.left, 0),
        top: Math.max(rect.top, 0),
        right: Math.min(rect.right, window.innerWidth),
        bottom: Math.min(rect.bottom, window.innerHeight),
      }))
      .filter((rect) => rect.right - rect.left > 2 && rect.bottom - rect.top > 2);
    const first = rects[0];
    if (!first) continue;
    // Seen only if the text's element is what the pointer would hit at its middle (not under a scrim, a dialog or
    // outside a scrolled frame).
    const hit = document.elementFromPoint((first.left + first.right) / 2, (first.top + first.bottom) / 2);
    if (!hit || !(hit === element || element.contains(hit))) continue;
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const size = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700;
    const tag = element.tagName.toLowerCase();
    const cls = (element.getAttribute('class') ?? '').split(' ')[0];
    const id = element.closest('[data-id]')?.getAttribute('data-id');
    boxes.push({
      label: `${tag}${cls ? `.${cls}` : ''}${id ? ` in [data-id="${id}"]` : ''} "${text.slice(0, 40)}"`,
      left,
      top,
      width: Math.max(...rects.map((rect) => rect.right)) - left,
      height: Math.max(...rects.map((rect) => rect.bottom)) - top,
      color: [colour[0], colour[1], colour[2], colour[3] * opacity],
      large: size >= 24 || (size >= 18.66 && bold),
    });
  }
  return boxes;
}

const MEASURE_STYLE = 'kb-contrast-measure';
/** Hit testing must see labels drawn with `pointer-events: none` too. */
const HIT_ALL = '* { pointer-events: auto !important; }';
const NO_GLYPHS = [
  '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; transition: none !important; }',
  '*::selection, *::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; }',
].join('\n');

async function withStyle<T>(page: Page, css: string, run: () => Promise<T>): Promise<T> {
  await page.evaluate(
    ({ id, text }) => {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = text;
      document.head.append(style);
      return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    },
    { id: MEASURE_STYLE, text: css },
  );
  try {
    return await run();
  } finally {
    await page.evaluate((id) => document.getElementById(id)?.remove(), MEASURE_STYLE);
  }
}

function luminance([r, g, b]: Rgba): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratioOf(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const hex = ([r, g, b]: Rgba): string => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** The mean colour of the shot under a box (at most ~400 samples). */
function meanUnder(png: PNG, box: TextBox, scale: number): Rgba {
  const x0 = Math.floor(box.left * scale);
  const y0 = Math.floor(box.top * scale);
  const x1 = Math.min(png.width, Math.ceil((box.left + box.width) * scale));
  const y1 = Math.min(png.height, Math.ceil((box.top + box.height) * scale));
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 400)));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * png.width + x) * 4;
      r += png.data[i] ?? 0;
      g += png.data[i + 1] ?? 0;
      b += png.data[i + 2] ?? 0;
      n += 1;
    }
  }
  return n === 0 ? [0, 0, 0, 1] : [r / n, g / n, b / n, 1];
}

/** The texts of the viewport below WCAG 2 AA against their effective background, one line each. */
export async function textContrastFailures(page: Page): Promise<string[]> {
  const boxes = await withStyle(page, HIT_ALL, () => page.evaluate(collectTextBoxes));
  const shot = await withStyle(page, NO_GLYPHS, () => page.screenshot({ fullPage: false }));
  const png = PNG.sync.read(shot);
  const viewport = page.viewportSize();
  const scale = viewport ? png.width / viewport.width : 1;
  const failures = new Set<string>();
  for (const box of boxes) {
    const background = meanUnder(png, box, scale);
    const [r, g, b, a] = box.color;
    const text: Rgba = [r * a + background[0] * (1 - a), g * a + background[1] * (1 - a), b * a + background[2] * (1 - a), 1];
    const needed = box.large ? 3 : 4.5;
    const ratio = ratioOf(text, background);
    if (ratio < needed) failures.add(`${box.label}: ${ratio.toFixed(2)}:1 (needs ${needed}:1), ${hex(text)} on ${hex(background)}`);
  }
  return [...failures];
}
