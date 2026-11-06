/**
 * The reader's body text size (C11, T02, M05): 16, 17 (default), 18 or 20px, chosen with A−/A+ in the reader. The
 * server keeps it per account (PATCH /api/me `readerTextSize`) and the session hands it over (GET /api/session); this
 * browser keeps a copy so the first paint already has it. Applied as `--reader-text-size` on <html>; the reader's
 * CSS sizes its text, lead and headings from it (reader-screen.css, reader-phone.css).
 */
import { useSyncExternalStore } from 'react';
import { DEFAULT_READER_TEXT_SIZE, READER_TEXT_SIZES, type ReaderTextSize } from './reader-text-sizes';

export { DEFAULT_READER_TEXT_SIZE, READER_TEXT_SIZES, type ReaderTextSize };

/** Where this browser keeps the copy. */
export const READER_TEXT_SIZE_KEY = 'kb-reader-text-size';

export function isReaderTextSize(value: unknown): value is ReaderTextSize {
  return typeof value === 'number' && (READER_TEXT_SIZES as readonly number[]).includes(value);
}

/** The next size up (`step` 1) or down (-1), or null at the end of the scale. */
export function nextReaderTextSize(size: ReaderTextSize, step: 1 | -1): ReaderTextSize | null {
  return READER_TEXT_SIZES[READER_TEXT_SIZES.indexOf(size) + step] ?? null;
}

/** The copy kept in this browser; the default when there is none or it cannot be read. */
export function readStoredReaderTextSize(): ReaderTextSize {
  try {
    const stored = Number(localStorage.getItem(READER_TEXT_SIZE_KEY));
    return isReaderTextSize(stored) ? stored : DEFAULT_READER_TEXT_SIZE;
  } catch {
    return DEFAULT_READER_TEXT_SIZE;
  }
}

let current: ReaderTextSize = DEFAULT_READER_TEXT_SIZE;
const listeners = new Set<() => void>();

/** Applies the size to the page at once (the reader follows) and keeps the copy for the next first paint. */
export function applyReaderTextSize(size: ReaderTextSize): void {
  document.documentElement.style.setProperty('--reader-text-size', `${size}px`);
  try {
    localStorage.setItem(READER_TEXT_SIZE_KEY, String(size));
  } catch {
    // Storage blocked: the size still applies now and comes back from the server next time.
  }
  if (size === current) return;
  current = size;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = (): ReaderTextSize => current;

/** The size in use. */
export function useReaderTextSize(): ReaderTextSize {
  return useSyncExternalStore(subscribe, read, read);
}
