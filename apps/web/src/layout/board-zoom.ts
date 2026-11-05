/**
 * The board frame's zoom: every board screen is laid out in the mock's 1440×900 space (design/mock) and the frame
 * (`.board-frame`, ui/app.css) scales it with CSS `zoom` so the whole board fits the window: the zoom is the smaller
 * of width/1440 and height/900, never above 1. Height may shrink the board only down to SHORT_WINDOW_FACTOR of the
 * width's zoom; a shorter window keeps that zoom and scrolls instead of making the board tiny. Below 768px wide the
 * zoom stops at its floor and the page scrolls sideways: the screens with a phone board (device.ts) leave the frame
 * on a phone and lay themselves out at the window's width instead.
 *
 * In the tablet layout the screens with a tablet board (T01, T02) are laid out in its 1180×820 space and zoomed by
 * `--tablet-zoom`, worked out the same way (`.board-frame-tablet`, ui/app.css).
 *
 * When the board is narrower than the frame (a window wider than 1440, or a short one where the height sets the zoom)
 * the board is centred (app-shell.css) and `--board-side` holds the frame's extra width on each side, in board px, for
 * the pieces that keep to the window's edge instead of the board's (the Universe's AI panel).
 *
 * The zoom is `--board-zoom` on the root element. It is worked out from the window's size rather than read back from
 * the page: when the zoomed board is taller than the window the page scrolls, and its scrollbar takes width from the
 * board; reading the width after the scrollbar shows would shrink the board, which may hide the scrollbar again.
 */

import { deviceFor } from './device';

export const BOARD_WIDTH = 1440;
export const BOARD_HEIGHT = 900;
/** The tablet boards (T01, T02). */
export const TABLET_BOARD = { width: 1180, height: 820 } as const;
/** The smallest zoom: a 768px window (a portrait tablet); narrower windows scroll sideways. */
export const MIN_BOARD_ZOOM = 768 / BOARD_WIDTH;

/**
 * How far the window's height may shrink the board below the zoom its width allows. 0.85 lets a 1440px-wide laptop
 * window down to 765px tall (a 13" screen with the browser's bars and the dock) show the whole board, while the
 * boards' 12–13px text stays at 11px or more; a shorter window scrolls rather than shrink the text further.
 */
export const SHORT_WINDOW_FACTOR = 0.85;

interface BoardSize {
  width: number;
  height: number;
}

const DESKTOP_BOARD: BoardSize = { width: BOARD_WIDTH, height: BOARD_HEIGHT };

/** The desktop board stops at its 768px floor; a tablet board is only ever used on a tablet-wide window. */
function clampZoom(zoom: number, board: BoardSize): number {
  return Math.min(1, Math.max(board === DESKTOP_BOARD ? MIN_BOARD_ZOOM : 0, zoom));
}

/** A window height that sizes nothing (unknown, 0) counts as unlimited. */
function knownHeight(height: number): number {
  return Number.isFinite(height) && height > 0 ? height : Number.POSITIVE_INFINITY;
}

/** Whether a board zoomed by `zoom` is taller than a window `height` px tall, so the page scrolls. */
function scrolls(zoom: number, height: number, board: BoardSize = DESKTOP_BOARD): boolean {
  return board.height * zoom > height + 0.5;
}

/** The zoom for a window whose usable width is `width` px: its width's zoom, less what its height asks within limits. */
function fitZoom(width: number, height: number, board: BoardSize): number {
  const byWidth = clampZoom(width / board.width, board);
  const byHeight = Math.max(height / board.height, byWidth * SHORT_WINDOW_FACTOR);
  return clampZoom(Math.min(byWidth, byHeight), board);
}

function zoomFor(width: number, height: number, scrollbar: number, board: BoardSize): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  const usableHeight = knownHeight(height);
  const zoom = fitZoom(width, usableHeight, board);
  return scrolls(zoom, usableHeight, board) && scrollbar > 0 ? fitZoom(width - scrollbar, usableHeight, board) : zoom;
}

/**
 * The zoom that fits the board to a window `width` × `height` px whose vertical scrollbar, when the page scrolls, is
 * `scrollbar` px wide (0 for overlay scrollbars): the board's width and height, less the scrollbar's width when the
 * zoomed board is still taller than the window.
 */
export function boardZoomFor(width: number, height = Number.POSITIVE_INFINITY, scrollbar = 0): number {
  return zoomFor(width, height, scrollbar, DESKTOP_BOARD);
}

/** The same fit for the 1180×820 tablet boards (T01, T02). */
export function tabletZoomFor(width: number, height = Number.POSITIVE_INFINITY, scrollbar = 0): number {
  return zoomFor(width, height, scrollbar, TABLET_BOARD);
}

/**
 * The frame's width beyond the board on each side, in board px, for the same window: 0 while the board fills the
 * window's width (1440px and narrower windows whose height leaves the zoom to the width).
 */
export function boardSideFor(width: number, height = Number.POSITIVE_INFINITY, scrollbar = 0): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  const usableHeight = knownHeight(height);
  const zoom = boardZoomFor(width, usableHeight, scrollbar);
  const frameWidth = (width - (scrolls(zoom, usableHeight) ? scrollbar : 0)) / zoom;
  return Math.max(0, (frameWidth - BOARD_WIDTH) / 2);
}

/** The width of a classic vertical scrollbar in this browser (0 with overlay scrollbars). */
function scrollbarWidth(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll';
  document.body.append(probe);
  const width = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return width;
}

/**
 * The zoom in force (1 before the frame is installed or outside a browser): the tablet board's when the screen on
 * show is laid out on it, else the desktop board's.
 */
export function boardZoom(): number {
  if (typeof document === 'undefined') return 1;
  const root = document.documentElement;
  const tablet = root.dataset.device === 'tablet' && document.querySelector('.board-frame-tablet') !== null;
  const value = Number.parseFloat(root.style.getPropertyValue(tablet ? '--tablet-zoom' : '--board-zoom'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * A length measured on screen (getBoundingClientRect, pointer events: zoomed px) in the board's own px, the units of
 * `left`/`top` styles and of `scrollTop` inside the frame.
 */
export function toBoardPx(screenPx: number): number {
  return screenPx / boardZoom();
}

/**
 * Keeps `--board-zoom`, `--board-side`, `--tablet-zoom` and `data-device` (device.ts) on the root in step with the
 * window's size; returns the function that stops it.
 */
export function installBoardZoom(root: HTMLElement = document.documentElement): () => void {
  const scrollbar = scrollbarWidth();
  const update = (): void => {
    const { innerWidth: width, innerHeight: height } = window;
    root.style.setProperty('--board-zoom', String(boardZoomFor(width, height, scrollbar)));
    root.style.setProperty('--board-side', `${boardSideFor(width, height, scrollbar)}px`);
    root.style.setProperty('--tablet-zoom', String(tabletZoomFor(width, height, scrollbar)));
    const device = deviceFor(width);
    if (root.dataset.device !== device) root.dataset.device = device;
  };
  update();
  window.addEventListener('resize', update);
  return () => window.removeEventListener('resize', update);
}
