/**
 * Where the reader is in a document (board C11) and how far they got: the section under the top of the reading panel
 * (lit in the table of contents), `#anchor` deep links, J/K to move between sections, and the reading progress saved
 * while scrolling (throttled) and resumed at the passage read last.
 */
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveReadingProgress } from '../api/content-api';
import { toBoardPx } from '../layout/board-zoom';

/** How long scrolling may go on before the progress is saved (the last position wins). */
export const SAVE_DELAY_MS = 1500;
/** A section counts as the current one once its top is this close under the top of the panel. */
const CURRENT_OFFSET = 96;

interface ReadingOptions {
  documentId: string;
  /** Passage anchors in reading order (what progress may point at). */
  passages: readonly string[];
  /** A last section after the passages (the comments), reachable like the others but never saved as progress. */
  trailing?: string | null;
  /** The passage read last (null: not started or a guest). */
  readAnchor: string | null;
  /** Whether progress is kept for this reader (signed in). */
  track: boolean;
}

interface Reading {
  current: string | null;
  goTo(anchor: string): void;
}

/** The anchor of the location's hash when it names one of the sections. */
function hashAnchor(anchors: readonly string[]): string | null {
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  return anchors.includes(hash) ? hash : null;
}

/** Top of a section inside the scrolling panel, in the panel's scroll coordinates. */
function sectionTop(panel: HTMLElement, anchor: string): number | null {
  const target = document.getElementById(anchor);
  if (!target || !panel.contains(target)) return null;
  // the rects are on-screen (zoomed) px, scrollTop is in the panel's own (board) px
  return toBoardPx(target.getBoundingClientRect().top - panel.getBoundingClientRect().top) + panel.scrollTop;
}

/** How far down the panel has been read, 0–100 (all of it when it has nothing to scroll). */
export function scrolledPercent(scrollTop: number, clientHeight: number, scrollHeight: number): number {
  if (scrollHeight <= 0) return 0;
  return Math.min(100, Math.round(((scrollTop + clientHeight) / scrollHeight) * 100));
}

export function useReading(panelRef: RefObject<HTMLElement | null>, { documentId, passages, trailing = null, readAnchor, track }: ReadingOptions): Reading {
  const anchorsKey = [...passages, ...(trailing ? [trailing] : [])].join('\n');
  const passagesKey = passages.join('\n');
  // Where the reader starts: the deep link, else the passage read last, else the top. Then what they scroll or jump to.
  const opening = useMemo(() => {
    const list = anchorsKey === '' ? [] : anchorsKey.split('\n');
    return hashAnchor(list) ?? (readAnchor && list.includes(readAnchor) ? readAnchor : null) ?? list[0] ?? null;
  }, [anchorsKey, readAnchor]);
  const [moved, setMoved] = useState<{ key: string; anchor: string | null } | null>(null);
  const current = moved?.key === anchorsKey ? moved.anchor : opening;
  // Same section, same state: scrolling inside a section must not re-render the whole article.
  const setCurrent = useCallback(
    (anchor: string | null) => setMoved((prev) => (prev?.key === anchorsKey && prev.anchor === anchor ? prev : { key: anchorsKey, anchor })),
    [anchorsKey],
  );
  const currentRef = useRef<string | null>(null);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  const pending = useRef<{ progress: number; anchor: string | null } | null>(null);
  const saved = useRef<{ progress: number; anchor: string | null }>({ progress: 0, anchor: readAnchor });
  const timer = useRef<number | null>(null);
  /** A section jumped to (link, key, deep link): it stays current while it is on screen, even at the very end. */
  const pinned = useRef<string | null>(null);

  const scrollTo = useCallback(
    (anchor: string, behavior: ScrollBehavior) => {
      const panel = panelRef.current;
      if (!panel) return;
      const top = sectionTop(panel, anchor);
      pinned.current = anchor;
      if (top !== null) panel.scrollTo({ top: Math.max(0, top - 8), behavior });
    },
    [panelRef],
  );

  const flush = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (!next || !track) return;
    if (next.progress <= saved.current.progress && next.anchor === saved.current.anchor) return;
    saved.current = { progress: Math.max(next.progress, saved.current.progress), anchor: next.anchor };
    saveReadingProgress(documentId, next.progress, next.anchor).catch((error: unknown) => {
      // Progress is a convenience: a failed save is retried with the next scroll, never shown as an error.
      console.warn('reading progress not saved', error);
    });
  }, [documentId, track]);

  // Open at the deep link, else resume at the passage read last when it is not already on screen.
  useEffect(() => {
    const list = anchorsKey === '' ? [] : anchorsKey.split('\n');
    const panel = panelRef.current;
    const linked = hashAnchor(list);
    const resume = readAnchor && list.includes(readAnchor) ? readAnchor : null;
    if (!panel) return;
    if (linked) scrollTo(linked, 'auto');
    else if (resume) {
      const top = sectionTop(panel, resume);
      if (top !== null && top > panel.clientHeight - CURRENT_OFFSET) scrollTo(resume, 'auto');
    }
  }, [anchorsKey, readAnchor, panelRef, scrollTo]);

  // The current section and the progress follow the scrolling.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const list = anchorsKey === '' ? [] : anchorsKey.split('\n');
    // At most one measure per frame: a smooth scroll fires many events per frame, each would read every section.
    let frame: number | null = null;
    function onScroll(): void {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    }
    function measure(): void {
      frame = null;
      if (!panel) return;
      const atEnd = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2;
      let here = list[0] ?? null;
      for (const anchor of list) {
        const top = sectionTop(panel, anchor);
        if (top !== null && top - panel.scrollTop <= CURRENT_OFFSET) here = anchor;
      }
      const pin = pinned.current;
      const pinTop = pin ? sectionTop(panel, pin) : null;
      const pinVisible = pinTop !== null && pinTop - panel.scrollTop < panel.clientHeight && pinTop - panel.scrollTop >= -CURRENT_OFFSET;
      if (!pinVisible) pinned.current = null;
      const reading = pinVisible ? pin : atEnd ? (list.at(-1) ?? here) : here;
      setCurrent(reading);
      const passageList = passagesKey === '' ? [] : passagesKey.split('\n');
      const passage = reading && passageList.includes(reading) ? reading : (passageList.at(-1) ?? null);
      pending.current = { progress: scrolledPercent(panel.scrollTop, panel.clientHeight, panel.scrollHeight), anchor: passage };
      if (timer.current === null) timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    }
    panel.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      panel.removeEventListener('scroll', onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [anchorsKey, passagesKey, panelRef, flush, setCurrent]);

  // Leaving the page or the document saves what is pending.
  useEffect(() => {
    const onHide = (): void => flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  const goTo = useCallback(
    (anchor: string) => {
      scrollTo(anchor, 'smooth');
      setCurrent(anchor);
      window.history.replaceState(window.history.state, '', `#${encodeURIComponent(anchor)}`);
    },
    [scrollTo, setCurrent],
  );

  // A changed hash (a link inside the page) and J/K move between sections.
  useEffect(() => {
    const list = anchorsKey === '' ? [] : anchorsKey.split('\n');
    function onHash(): void {
      const anchor = hashAnchor(list);
      if (anchor) {
        scrollTo(anchor, 'smooth');
        setCurrent(anchor);
      }
    }
    function onKey(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const key = event.key.toLowerCase();
      if (key !== 'j' && key !== 'k') return;
      const here = currentRef.current;
      const index = here ? list.indexOf(here) : -1;
      const next = list[Math.min(list.length - 1, Math.max(0, index + (key === 'j' ? 1 : -1)))];
      event.preventDefault();
      if (!next || next === here) return;
      scrollTo(next, 'smooth');
      setCurrent(next);
      window.history.replaceState(window.history.state, '', `#${encodeURIComponent(next)}`);
    }
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchorsKey, scrollTo, setCurrent]);

  return { current, goTo };
}
