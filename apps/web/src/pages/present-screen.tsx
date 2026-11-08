/**
 * The slides of a text (board C21, /d/:id/present): open to whoever may read the text, the same as the reader (C11).
 * Phone first (portrait 9:16, full screen), a centred 16:9 frame on a landscape screen. Always dark whatever the theme,
 * on the palette the viewer picks (kept in this browser).
 *
 * - Slides: present-slides.ts cuts them from the text when it opens; `#n` is the slide on view (1-based), kept with
 *   `replaceState` so Back leaves the slides instead of stepping through them.
 * - Moving: tap the left third / the rest, swipe left or right, ←/→/Space/PageUp/PageDown, Home/End; T goes to the
 *   contents, F toggles full screen, Esc or a swipe down leaves for the reader. Nothing moves on its own.
 * - N opens the speaker view (`?view=speaker`, landscape screens): the slide on view, the next one, the slide's full
 *   source text and a timer; present-sync.ts keeps both windows on the same slide.
 * - The other language (`?lang=`) opens at its first slide: the two versions may cut into different decks.
 * - As the page goes away, one beacon records how far this viewing went (furthest slide, of how many).
 */
import { type CSSProperties, type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type DocumentView, LANGS, type Lang, fetchDocument } from '../api/content-api';
import { useI18n } from '../i18n/i18n';
import { useDevice } from '../layout/device';
import { navigate } from '../router/navigation';
import { BACKDROP_ART } from '../ui/universe-backdrop';
import { PHONE_MEDIA } from '../ui/breakpoints';
import { type ReaderLoad, ReaderFailed, readerLoadError } from './reader-states';
import { type PresentMessageKey, usePresentText } from './present-messages';
import { SlideView, type SlideContext } from './present-slide';
import { type Slide, buildSlides, sectionRanges, slideFromHash } from './present-slides';
import { canSync, useSlideSync } from './present-sync';
import './present-screen.css';

export const PALETTES = ['universe', 'sunset', 'aurora', 'acid'] as const;
export type Palette = (typeof PALETTES)[number];
const PALETTE_KEY = 'kb.present.palette';
/** The address parameter naming the language of the deck. */
export const LANG_PARAM = 'lang';
/** A deck longer than this shows its progress by part instead of one mark a slide. */
export const SEGMENTS_BY_SLIDE = 40;
const SWIPE_PX = 50;
const SWIPE_DOWN_PX = 120;

/** The language a deck's address asks for (`?lang=en`), if any. */
export function langOf(search: string): Lang | undefined {
  const value = new URLSearchParams(search).get(LANG_PARAM);
  return (LANGS as readonly string[]).includes(value ?? '') ? (value as Lang) : undefined;
}

function readPalette(): Palette {
  try {
    const stored = window.localStorage.getItem(PALETTE_KEY);
    return (PALETTES as readonly string[]).includes(stored ?? '') ? (stored as Palette) : 'universe';
  } catch {
    return 'universe';
  }
}

function keepPalette(palette: Palette): void {
  try {
    window.localStorage.setItem(PALETTE_KEY, palette);
  } catch {
    // private window or blocked storage: the choice lasts this visit only
  }
}

/**
 * C21: records one viewing of a text's slides (how far it went, of how many), as the page goes away. A beacon, so it
 * is sent even while the tab closes; it may still be lost, and nothing waits for it. Returns whether it was queued.
 */
function sendPresentView(id: string, view: { furthest: number; total: number }): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  const body = new Blob([JSON.stringify(view)], { type: 'application/json' });
  return navigator.sendBeacon(`/api/documents/${encodeURIComponent(id)}/present-views`, body);
}

export function presentPath(id: string, lang?: Lang): string {
  return `/d/${encodeURIComponent(id)}/present${lang ? `?${LANG_PARAM}=${lang}` : ''}`;
}

function useDeck(id: string, lang: Lang | undefined): { load: ReaderLoad; reload(): Promise<void> } {
  const key = `${id}|${lang ?? ''}`;
  const [result, setResult] = useState<{ key: string; load: ReaderLoad } | null>(null);
  const request = useCallback(async (): Promise<ReaderLoad> => {
    try {
      return { status: 'ready', view: await fetchDocument(id, lang), loadedAt: Date.now() };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('slides load failed', error);
      return { status: 'failed', error: readerLoadError(error) };
    }
  }, [id, lang]);
  useEffect(() => {
    let current = true;
    void request().then((load) => {
      if (current) setResult({ key, load });
    });
    return () => {
      current = false;
    };
  }, [request, key]);
  const reload = useCallback(async () => {
    setResult(null);
    setResult({ key, load: await request() });
  }, [request, key]);
  return { load: result?.key === key ? result.load : { status: 'loading' }, reload };
}

/** Whether a pointer started on something of its own (a link, a button, a scrolling box): it is not a tap or swipe. */
function ownsPointer(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a, button, select, input, [data-scroll]') !== null;
}

function Progress({ slides, current }: { slides: readonly Slide[]; current: number }): ReactNode {
  const { t } = usePresentText();
  const label = t('present.progress', { n: current + 1, total: slides.length });
  const ranges: Array<[number, number]> = slides.length <= SEGMENTS_BY_SLIDE ? slides.map((_, i): [number, number] => [i, i]) : sectionRanges(slides);
  return (
    <div className="present-progress" role="progressbar" aria-label={label} aria-valuemin={1} aria-valuemax={slides.length} aria-valuenow={current + 1}>
      {ranges.map(([from, to]) => {
        const fill = current >= to ? 1 : current < from ? 0 : (current - from + 1) / (to - from + 1);
        return (
          <span key={from} className="present-segment">
            <span style={{ '--fill': fill } as CSSProperties} />
          </span>
        );
      })}
    </div>
  );
}

function SpeakerView({ slides, current, context, onGo }: { slides: readonly Slide[]; current: number; context: SlideContext; onGo(index: number): void }): ReactNode {
  const { t } = usePresentText();
  const slide = slides[current];
  const next = slides[current + 1];
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const first = useRef(current);
  useEffect(() => {
    if (startedAt === null && current !== first.current) setStartedAt(Date.now());
  }, [current, startedAt]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'r' || event.key === 'R') setStartedAt(Date.now());
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const seconds = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const notes = slide && 'notes' in slide ? slide.notes : '';
  return (
    <div className="present-speaker" data-id="present-speaker">
      <section className="present-speaker-now" aria-label={t('present.speaker.now')}>
        <p className="present-speaker-label">
          {t('present.speaker.now')} · {t('present.counter', { n: current + 1, total: slides.length })}
        </p>
        <div className="present-frame present-mini">{slide && <div className="present-slide">{<SlideView slide={slide} context={{ ...context, onGo }} />}</div>}</div>
      </section>
      <section className="present-speaker-next" aria-label={t('present.speaker.next')}>
        <p className="present-speaker-label">{t('present.speaker.next')}</p>
        {next ? (
          <div className="present-frame present-mini">
            <div className="present-slide">
              <SlideView slide={next} context={context} />
            </div>
          </div>
        ) : (
          <p className="present-meta">{t('present.speaker.last')}</p>
        )}
      </section>
      <section className="present-speaker-notes" aria-label={t('present.speaker.notes')} data-scroll>
        <p className="present-speaker-label">{t('present.speaker.notes')}</p>
        {notes ? <pre className="present-notes">{notes}</pre> : <p className="present-meta">{t('present.speaker.noNotes')}</p>}
      </section>
      <section className="present-speaker-timer" aria-label={t('present.speaker.timer')}>
        <p className="present-speaker-label">{t('present.speaker.timer')}</p>
        <p className="present-clock">{clock}</p>
        <p className="present-meta">{t('present.speaker.reset')}</p>
      </section>
    </div>
  );
}

function Deck({ view, speaker }: { view: DocumentView; speaker: boolean }): ReactNode {
  const { t } = usePresentText();
  const device = useDevice();
  const id = view.document.id;
  const slides = useMemo(() => buildSlides({ title: view.document.title, chunks: view.chunks }, view.document.lang), [view]);
  const [position, setPosition] = useState<{ index: number; direction: 'forward' | 'back' }>(() => ({ index: slideFromHash(window.location.hash, slides.length), direction: 'forward' }));
  const { index, direction } = position;
  const [palette, setPalette] = useState<Palette>(readPalette);
  const [note, setNote] = useState<PresentMessageKey | null>(null);
  const current = Math.min(Math.max(index, 0), slides.length - 1);
  const wikilinks = useMemo(() => new Map(view.wikilinks.map((link) => [link.title, link.id])), [view.wikilinks]);
  const rootRef = useRef<HTMLDivElement>(null);
  const furthest = useRef(current);
  const pointer = useRef<{ x: number; y: number; own: boolean } | null>(null);

  const follow = useCallback(
    (to: number) => {
      const target = Math.min(Math.max(to, 0), slides.length - 1);
      setPosition((from) => (from.index === target ? from : { index: target, direction: target < from.index ? 'back' : 'forward' }));
    },
    [slides.length],
  );
  const post = useSlideSync(id, follow);
  const go = useCallback(
    (to: number) => {
      const target = Math.min(Math.max(to, 0), slides.length - 1);
      follow(target);
      post(target);
    },
    [follow, post, slides.length],
  );

  // The address follows the slide on view; Back still leaves the slides.
  useEffect(() => {
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}#${current + 1}`);
    furthest.current = Math.max(furthest.current, current);
  }, [current]);

  // One record of this viewing, as the page goes away (not from the speaker view, which only follows).
  useEffect(() => {
    if (speaker) return undefined;
    let sent = false;
    const send = (): void => {
      if (sent) return;
      sent = true;
      sendPresentView(id, { furthest: furthest.current + 1, total: slides.length });
    };
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') send();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', send);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', send);
      send();
    };
  }, [id, slides.length, speaker]);

  const leave = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    navigate(`/d/${encodeURIComponent(id)}`);
  }, [id]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void rootRef.current?.requestFullscreen?.();
  }, []);

  const openSpeaker = useCallback(() => {
    if (device === 'phone' || !canSync()) return;
    const opened = window.open(`${presentPath(id, view.document.lang)}&view=speaker#${current + 1}`, 'kb-speaker');
    setNote(opened ? null : 'present.speaker.blocked');
  }, [current, device, id, view.document.lang]);

  const share = useCallback(() => {
    const url = `${window.location.origin}${presentPath(id, view.document.lang)}`;
    if (typeof navigator.share === 'function') {
      void navigator.share({ title: view.document.title, url }).catch(() => undefined);
      return;
    }
    void navigator.clipboard?.writeText(url).then(() => setNote('present.linkCopied'));
  }, [id, view.document.lang, view.document.title]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          event.preventDefault();
          go(current + 1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          go(current - 1);
          break;
        case 'Home':
          go(0);
          break;
        case 'End':
          go(slides.length - 1);
          break;
        case 't':
        case 'T': {
          const toc = slides.findIndex((slide) => slide.kind === 'toc');
          go(toc >= 0 ? toc : 0);
          break;
        }
        case 'f':
        case 'F':
          if (!speaker) toggleFullscreen();
          break;
        case 'n':
        case 'N':
          if (!speaker) openSpeaker();
          break;
        case 'Escape':
          if (!speaker && !document.fullscreenElement) leave();
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, go, leave, openSpeaker, slides, speaker, toggleFullscreen]);

  const onPointerDown = (event: PointerEvent<HTMLElement>): void => {
    pointer.current = { x: event.clientX, y: event.clientY, own: ownsPointer(event.target) };
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>): void => {
    const start = pointer.current;
    pointer.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      if (!start.own) go(current + (dx < 0 ? 1 : -1));
      return;
    }
    if (dy >= SWIPE_DOWN_PX && Math.abs(dy) > Math.abs(dx)) {
      if (!start.own) leave();
      return;
    }
    if (start.own || Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
    if (window.getSelection()?.toString()) return;
    const box = event.currentTarget.getBoundingClientRect();
    go(current + (event.clientX - box.left < box.width / 3 ? -1 : 1));
  };

  const other = view.translations.find((tr) => tr.lang !== view.document.lang);
  const slide = slides[current];
  const context: SlideContext = { view, wikilinks, total: slides.length, onGo: go, onShare: share, shareNote: note === 'present.linkCopied' ? t(note) : '' };

  return (
    <div ref={rootRef} className="present" data-palette={palette} data-view={speaker ? 'speaker' : 'slides'} data-id="present-screen">
      {palette === 'universe' && (
        <picture className="present-art">
          <source srcSet={BACKDROP_ART.mobile} media={PHONE_MEDIA} />
          <img src={BACKDROP_ART.dark} alt="" decoding="async" />
        </picture>
      )}
      <header className="present-top">
        <Progress slides={slides} current={current} />
        <div className="present-toolbar">
          <button type="button" className="present-icon" onClick={leave} aria-label={t('present.close')} data-id="present-close">
            ✕
          </button>
          <span className="present-counter" aria-hidden="true">
            {t('present.counter', { n: current + 1, total: slides.length })}
          </span>
          <span className="present-spacer" />
          {other && (
            <a className="present-chip" href={`${presentPath(other.id, other.lang)}#1`} aria-label={t('present.lang', { lang: other.lang.toUpperCase() })} data-id="present-lang">
              {other.lang.toUpperCase()}
            </a>
          )}
          <select
            className="present-palette"
            aria-label={t('present.palette')}
            value={palette}
            onChange={(event) => {
              const next = event.target.value as Palette;
              setPalette(next);
              keepPalette(next);
            }}
            data-id="present-palette"
          >
            {PALETTES.map((name) => (
              <option key={name} value={name}>
                {t(`present.palette.${name}`)}
              </option>
            ))}
          </select>
          {!speaker && device !== 'phone' && (
            <button type="button" className="present-icon" onClick={toggleFullscreen} aria-label={t('present.fullscreen')} data-id="present-fullscreen">
              ⛶
            </button>
          )}
        </div>
      </header>

      {speaker ? (
        <SpeakerView slides={slides} current={current} context={context} onGo={go} />
      ) : (
        <main className="present-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} data-id="present-stage">
          <div className="present-frame">
            {slide && (
              <div key={current} className="present-slide" data-kind={slide.kind} data-dir={direction} aria-live="polite" aria-roledescription="slide" aria-label={t('present.progress', { n: current + 1, total: slides.length })}>
                <SlideView slide={slide} context={context} />
              </div>
            )}
          </div>
        </main>
      )}

      {!speaker && (
        <footer className="present-bottom">
          <button type="button" className="present-nav" onClick={() => go(current - 1)} disabled={current === 0} aria-label={t('present.prev')} data-id="present-prev">
            ←
          </button>
          <p className="present-keys">{note && note !== 'present.linkCopied' ? t(note) : device === 'phone' ? '' : t('present.keys')}</p>
          <button type="button" className="present-nav" onClick={() => go(current + 1)} disabled={current === slides.length - 1} aria-label={t('present.next')} data-id="present-next">
            →
          </button>
        </footer>
      )}
    </div>
  );
}

export function PresentScreen({ id }: { id: string }): ReactNode {
  const { t } = usePresentText();
  const { locale } = useI18n();
  const search = window.location.search;
  const lang = langOf(search) ?? locale;
  const speaker = new URLSearchParams(search).get('view') === 'speaker';
  const { load, reload } = useDeck(id, lang);

  if (load.status === 'loading') {
    return (
      <div className="present" data-palette="universe" data-id="present-screen" data-state="loading">
        <div className="present-loading" aria-busy="true">
          {t('present.loading')}
        </div>
      </div>
    );
  }
  if (load.status === 'failed') {
    return (
      <div className="present present-failed" data-palette="universe" data-id="present-screen" data-state={load.error}>
        <ReaderFailed error={load.error} onRetry={reload} />
      </div>
    );
  }
  if (load.view.chunks.length === 0) {
    return (
      <div className="present" data-palette="universe" data-id="present-screen" data-state="empty">
        <p className="present-loading">{t('present.empty')}</p>
      </div>
    );
  }
  return <Deck view={load.view} speaker={speaker} />;
}
