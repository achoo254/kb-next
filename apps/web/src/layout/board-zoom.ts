/**
 * The board frame's zoom: every board screen is laid out in the mock's 1440×900 space (design/mock) and the frame
 * (`.board-frame`, ui/app.css) scales it with CSS `zoom` to the window's width, so a smaller window shows the whole
 * board instead of cutting its right side off. Wider windows keep 1 (the board is centred, see app-shell.css); below
 * 768px the zoom stops at its floor and the page scrolls sideways (no phone boards are built yet).
 *
 * The zoom is `--board-zoom` on the root element. It is worked out from the window's size rather than read back from
 * the page: when the zoomed board is taller than the window the page scrolls, and its scrollbar takes width from the
 * board; reading the width after the scrollbar shows would shrink the board, which may hide the scrollbar again.
 */

export const BOARD_WIDTH = 1440;
export const BOARD_HEIGHT = 900;
/** The smallest zoom: a 768px window (a portrait tablet); narrower windows scroll sideways. */
export const MIN_BOARD_ZOOM = 768 / BOARD_WIDTH;

function clampZoom(zoom: number): number {
  return Math.min(1, Math.max(MIN_BOARD_ZOOM, zoom));
}

/**
 * The zoom that fits the board to a window `width` × `height` px whose vertical scrollbar, when the page scrolls, is
 * `scrollbar` px wide (0 for overlay scrollbars): the board's width, less the scrollbar when the zoomed board is
 * taller than the window.
 */
export function boardZoomFor(width: number, height = Number.POSITIVE_INFINITY, scrollbar = 0): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  const zoom = clampZoom(width / BOARD_WIDTH);
  return BOARD_HEIGHT * zoom > height + 0.5 && scrollbar > 0 ? clampZoom((width - scrollbar) / BOARD_WIDTH) : zoom;
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

/** The zoom in force (1 before the frame is installed or outside a browser). */
export function boardZoom(): number {
  if (typeof document === 'undefined') return 1;
  const value = Number.parseFloat(document.documentElement.style.getPropertyValue('--board-zoom'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * A length measured on screen (getBoundingClientRect, pointer events: zoomed px) in the board's own px, the units of
 * `left`/`top` styles and of `scrollTop` inside the frame.
 */
export function toBoardPx(screenPx: number): number {
  return screenPx / boardZoom();
}

/** Keeps `--board-zoom` on the root in step with the window's size; returns the function that stops it. */
export function installBoardZoom(root: HTMLElement = document.documentElement): () => void {
  const scrollbar = scrollbarWidth();
  const update = (): void => {
    root.style.setProperty('--board-zoom', String(boardZoomFor(window.innerWidth, window.innerHeight, scrollbar)));
  };
  update();
  window.addEventListener('resize', update);
  return () => window.removeEventListener('resize', update);
}
