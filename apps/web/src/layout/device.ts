import { useSyncExternalStore } from 'react';
import { PHONE_MAX_WIDTH, TABLET_MAX_WIDTH } from '../ui/breakpoints';

/**
 * The three layouts of KnowFlow, chosen from the window's width (docs/board-frame.md):
 * - `desktop`: every screen is its 1440×900 board, zoomed to the window (board-zoom.ts);
 * - `tablet`: the Universe (T01) and the reader (T02) have their own 1180×820 board, zoomed the same way; the other
 *   screens keep their desktop board;
 * - `phone`: the screens with a phone board (Mobile, M02–M06) lay themselves out at the window's own width, 2D only,
 *   with the bottom tab bar; the other screens keep their desktop board at its smallest zoom.
 *
 * The layout is `data-device` on <html>, set with the zoom (installBoardZoom), so CSS and components read one value.
 */
export type Device = 'phone' | 'tablet' | 'desktop';

export function deviceFor(width: number): Device {
  if (!Number.isFinite(width) || width <= 0) return 'desktop';
  if (width <= PHONE_MAX_WIDTH) return 'phone';
  return width <= TABLET_MAX_WIDTH ? 'tablet' : 'desktop';
}

function isDevice(value: unknown): value is Device {
  return value === 'phone' || value === 'tablet' || value === 'desktop';
}

/** The layout in force: `data-device` on <html>, else desktop (before the zoom is installed, in tests). */
export function currentDevice(): Device {
  if (typeof document === 'undefined') return 'desktop';
  const value = document.documentElement.dataset.device;
  return isDevice(value) ? value : 'desktop';
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-device'] });
  return () => observer.disconnect();
}

/** The layout in force, re-rendering when the window crosses a breakpoint. */
export function useDevice(): Device {
  return useSyncExternalStore(subscribe, currentDevice, () => 'desktop');
}
