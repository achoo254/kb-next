import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIN_BOARD_ZOOM, SHORT_WINDOW_FACTOR, boardSideFor, boardZoom, boardZoomFor, installBoardZoom, tabletZoomFor, toBoardPx } from './board-zoom';

describe('boardZoomFor', () => {
  it('keeps the board 1:1 from 1440px up and shrinks it to the window below', () => {
    expect(boardZoomFor(1440, 900)).toBe(1);
    expect(boardZoomFor(2000, 1200)).toBe(1);
    expect(boardZoomFor(1080, 900)).toBe(0.75);
  });

  it('fits both the width and the height, so a short laptop window shows the whole board', () => {
    // the board itself: 1:1, nothing on the sides
    expect(boardZoomFor(1440, 900, 15)).toBe(1);
    expect(boardSideFor(1440, 900, 15)).toBe(0);
    // a 13" laptop: the height sets the zoom, the board fits without a scrollbar and is centred
    expect(boardZoomFor(1440, 840, 15)).toBe(840 / 900);
    expect(boardSideFor(1440, 840, 15)).toBeCloseTo((1440 / (840 / 900) - 1440) / 2);
    // a full HD window: 1:1, the extra width shared by both sides
    expect(boardZoomFor(1920, 1080, 15)).toBe(1);
    expect(boardSideFor(1920, 1080, 15)).toBe(240);
    // narrower and short: the height still wins while it is within the limit
    expect(boardZoomFor(1280, 700, 15)).toBe(700 / 900);
    expect(boardSideFor(1280, 700, 15)).toBeCloseTo((1280 / (700 / 900) - 1440) / 2);
    expect(boardZoomFor(1024, 600, 15)).toBe(600 / 900);
    expect(boardSideFor(1024, 600, 15)).toBeCloseTo(48);
    // a narrow, tall window: the width sets the zoom, no side strips
    expect(boardSideFor(1080, 900, 15)).toBe(0);
  });

  it('stops shrinking for the height at its limit; a shorter window scrolls and leaves room for the scrollbar', () => {
    // 1440×600 asks for 0.67; the board stops at 0.85 of the width's zoom and scrolls
    expect(boardZoomFor(1440, 600, 0)).toBe(SHORT_WINDOW_FACTOR);
    expect(boardSideFor(1440, 600, 0)).toBeCloseTo((1440 / SHORT_WINDOW_FACTOR - 1440) / 2);
    // with a classic scrollbar the board's width is the window's less the scrollbar's 15px
    expect(boardZoomFor(1440, 600, 15)).toBeCloseTo((1425 / 1440) * SHORT_WINDOW_FACTOR);
    expect(boardSideFor(1440, 600, 15)).toBeCloseTo((1440 / SHORT_WINDOW_FACTOR - 1440) / 2);
    // the zoomed board is taller than the window, so the page does scroll
    expect(900 * boardZoomFor(1440, 600, 15)).toBeGreaterThan(600);
    // a height that is just within the limit once the scrollbar is counted fits without one
    const height = 900 * SHORT_WINDOW_FACTOR * (1430 / 1440);
    expect(boardZoomFor(1440, height, 15)).toBe(height / 900);
  });

  it('stops at the 768px floor and falls back to 1 without a width', () => {
    expect(boardZoomFor(768)).toBeCloseTo(MIN_BOARD_ZOOM);
    expect(boardZoomFor(390, 844, 15)).toBe(MIN_BOARD_ZOOM);
    expect(boardZoomFor(0)).toBe(1);
    expect(boardZoomFor(Number.NaN)).toBe(1);
    expect(boardSideFor(0)).toBe(0);
    // a height that sizes nothing leaves the zoom to the width
    expect(boardZoomFor(1080, 0)).toBe(0.75);
  });
});

describe('tabletZoomFor', () => {
  it('fits the 1180×820 tablet board the same way: 1:1 at its own size, smaller on a smaller tablet', () => {
    expect(tabletZoomFor(1180, 820)).toBe(1);
    expect(tabletZoomFor(1024, 768)).toBeCloseTo(1024 / 1180);
    // a short tablet window: the height sets the zoom
    expect(tabletZoomFor(1180, 738)).toBeCloseTo(0.9);
    // no 768px floor: the tablet layout starts above a phone's width
    expect(tabletZoomFor(700, 1000)).toBeCloseTo(700 / 1180);
  });
});

describe('installBoardZoom', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty('--board-zoom');
    document.documentElement.style.removeProperty('--board-side');
    document.documentElement.style.removeProperty('--tablet-zoom');
    delete document.documentElement.dataset.device;
    document.body.replaceChildren();
  });

  it('sets the layout and the tablet zoom; a screen on its tablet board reads the tablet zoom', () => {
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 768);
    const stop = installBoardZoom();
    expect(document.documentElement.dataset.device).toBe('tablet');
    expect(Number(document.documentElement.style.getPropertyValue('--tablet-zoom'))).toBeCloseTo(1024 / 1180);
    expect(boardZoom()).toBeCloseTo(1024 / 1440);
    const frame = document.createElement('div');
    frame.className = 'universe board-frame board-frame-tablet';
    document.body.append(frame);
    expect(boardZoom()).toBeCloseTo(1024 / 1180);
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);
    window.dispatchEvent(new Event('resize'));
    expect(document.documentElement.dataset.device).toBe('phone');
    // a tablet frame left on the page counts only in the tablet layout
    expect(boardZoom()).toBe(MIN_BOARD_ZOOM);
    // a phone screen has no board frame: its px are the window's
    frame.remove();
    expect(boardZoom()).toBe(1);
    stop();
  });

  it('sets --board-zoom and --board-side from the window and follows resizes; screen px become board px', () => {
    vi.stubGlobal('innerWidth', 720);
    vi.stubGlobal('innerHeight', 900);
    const stop = installBoardZoom();
    expect(boardZoom()).toBe(MIN_BOARD_ZOOM);
    vi.stubGlobal('innerWidth', 1080);
    window.dispatchEvent(new Event('resize'));
    expect(boardZoom()).toBe(0.75);
    expect(toBoardPx(300)).toBe(400);
    vi.stubGlobal('innerWidth', 1920);
    vi.stubGlobal('innerHeight', 1080);
    window.dispatchEvent(new Event('resize'));
    expect(boardZoom()).toBe(1);
    expect(document.documentElement.style.getPropertyValue('--board-side')).toBe('240px');
    vi.stubGlobal('innerWidth', 1080);
    vi.stubGlobal('innerHeight', 900);
    window.dispatchEvent(new Event('resize'));
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
