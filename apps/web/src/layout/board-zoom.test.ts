import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIN_BOARD_ZOOM, boardZoom, boardZoomFor, installBoardZoom, toBoardPx } from './board-zoom';

describe('boardZoomFor', () => {
  it('keeps the board 1:1 from 1440px up and shrinks it to the window below', () => {
    expect(boardZoomFor(1440, 900)).toBe(1);
    expect(boardZoomFor(2000, 1200)).toBe(1);
    expect(boardZoomFor(1080, 900)).toBe(0.75);
  });

  it('leaves room for the scrollbar only when the zoomed board is taller than the window', () => {
    // 1440×900: the board fits, no scrollbar, 1:1
    expect(boardZoomFor(1440, 900, 15)).toBe(1);
    // 1440×700: the page scrolls, the board gives the scrollbar its 15px
    expect(boardZoomFor(1440, 700, 15)).toBe(1425 / 1440);
    // overlay scrollbars take no width
    expect(boardZoomFor(1440, 700, 0)).toBe(1);
  });

  it('stops at the 768px floor and falls back to 1 without a width', () => {
    expect(boardZoomFor(768)).toBeCloseTo(MIN_BOARD_ZOOM);
    expect(boardZoomFor(390, 844, 15)).toBe(MIN_BOARD_ZOOM);
    expect(boardZoomFor(0)).toBe(1);
    expect(boardZoomFor(Number.NaN)).toBe(1);
  });
});

describe('installBoardZoom', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty('--board-zoom');
  });

  it('sets --board-zoom from the window and follows resizes; screen px become board px', () => {
    vi.stubGlobal('innerWidth', 720);
    vi.stubGlobal('innerHeight', 900);
    const stop = installBoardZoom();
    expect(boardZoom()).toBe(MIN_BOARD_ZOOM);
    vi.stubGlobal('innerWidth', 1080);
    window.dispatchEvent(new Event('resize'));
    expect(boardZoom()).toBe(0.75);
    expect(toBoardPx(300)).toBe(400);
    stop();
    vi.stubGlobal('innerWidth', 1440);
    window.dispatchEvent(new Event('resize'));
    expect(boardZoom()).toBe(0.75);
  });

  it('reads 1 before it is installed', () => {
    expect(boardZoom()).toBe(1);
    expect(toBoardPx(300)).toBe(300);
  });
});
