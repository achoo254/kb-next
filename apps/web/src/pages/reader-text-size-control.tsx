import type { ReactNode } from 'react';
import { updateMe } from '../api/content-api';
import { type ReaderTextSize, applyReaderTextSize, nextReaderTextSize, useReaderTextSize } from '../ui/reader-text-size';
import { useReaderText } from './reader-messages';
import './reader-text-size.css';

/** The element that scrolls `element`: its nearest scrolling ancestor (the desktop reader's panel), else the page. */
function scrollerOf(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * Runs `change` (a new text size) and keeps the passage being read where it was on screen: the text reflows, so
 * without this the page would jump and the reading progress and anchor would move to another passage.
 */
export function keepReadingPlace(change: () => void): void {
  const passages = Array.from(document.querySelectorAll<HTMLElement>('.reader-passage, .phone-reader-passage'));
  const first = passages[0];
  if (!first) {
    change();
    return;
  }
  const scroller = scrollerOf(first);
  const top = scroller ? scroller.getBoundingClientRect().top : 0;
  // the passage at the top of the view: the first one that still shows below the top edge
  const reading = passages.find((passage) => passage.getBoundingClientRect().bottom > top + 1) ?? first;
  const before = reading.getBoundingClientRect().top;
  change();
  // reading the position again lays the page out with the new size at once
  const shift = reading.getBoundingClientRect().top - before;
  if (shift === 0) return;
  if (!scroller) {
    window.scrollBy(0, shift);
    return;
  }
  // rects are on-screen px; inside the zoomed board (board-zoom.ts) scrollTop counts the panel's own px
  const zoom = scroller.clientHeight > 0 ? scroller.getBoundingClientRect().height / scroller.clientHeight : 1;
  scroller.scrollTop += shift / (zoom > 0 ? zoom : 1);
}

/** Changes the size here at once and saves it to the account; a failed save keeps it in this browser. */
export function chooseReaderTextSize(size: ReaderTextSize): void {
  keepReadingPlace(() => applyReaderTextSize(size));
  updateMe({ readerTextSize: size }).catch((error: unknown) => console.error('reader text size not saved', error));
}

/**
 * A−/A+ for the reader's text size (16, 17, 18, 20px). The buttons stay focusable at the ends of the scale
 * (aria-disabled), so a keyboard user pressing A+ to the largest size keeps focus; on a phone they are 44px targets.
 */
export function ReaderTextSizeControl({ phone = false }: { phone?: boolean }): ReactNode {
  const { t } = useReaderText();
  const size = useReaderTextSize();
  const smaller = nextReaderTextSize(size, -1);
  const larger = nextReaderTextSize(size, 1);
  return (
    <div role="group" aria-label={t('reader.textSize')} className={phone ? 'reader-text-size reader-text-size-phone' : 'reader-text-size'} data-id="reader-text-size">
      <button
        type="button"
        className="reader-text-size-step"
        aria-label={t('reader.textSmaller')}
        aria-disabled={smaller === null}
        onClick={() => smaller !== null && chooseReaderTextSize(smaller)}
        data-id="reader-text-smaller"
      >
        A−
      </button>
      <span className="reader-text-size-value" aria-live="polite" data-id="reader-text-size-value">
        {t('reader.textSizeValue', { size })}
      </span>
      <button
        type="button"
        className="reader-text-size-step reader-text-size-larger"
        aria-label={t('reader.textLarger')}
        aria-disabled={larger === null}
        onClick={() => larger !== null && chooseReaderTextSize(larger)}
        data-id="reader-text-larger"
      >
        A+
      </button>
    </div>
  );
}
