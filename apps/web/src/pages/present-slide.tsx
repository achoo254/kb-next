/**
 * One slide of C21 (present-slides.ts makes them): each kind with its emoji kicker, the text big and short. Markdown
 * goes through the reader's renderer (no raw HTML, `[[ ]]` links resolved), so a slide reads like the text it
 * comes from. The deck and its controls are in present-screen.tsx.
 */
import { type ReactNode, useState } from 'react';
import type { DocumentView } from '../api/content-api';
import { ReaderMarkdown } from './reader-markdown';
import type { Slide, SlideKind } from './present-slides';
import { usePresentText } from './present-messages';
import { spaceName } from './space-panels';

/** The emoji above each kind of slide (none on the text itself). */
export const SLIDE_EMOJI: Readonly<Partial<Record<SlideKind, string>>> = {
  cover: '✨',
  tldr: '🧠',
  toc: '🧭',
  section: '🚀',
  stat: '⚡',
  quote: '💬',
  code: '🛠️',
  step: '✅',
  'table-cards': '📋',
  'table-link': '📊',
  image: '🖼️',
  end: '🎉',
};

/** How big the text of a slide may be drawn: short text big, long text smaller (the frame never scrolls for it). */
export function textSize(chars: number): 'l' | 'm' | 's' {
  if (chars <= 90) return 'l';
  if (chars <= 180) return 'm';
  return 's';
}

export interface SlideContext {
  view: DocumentView;
  wikilinks: ReadonlyMap<string, string>;
  /** The deck's size, for the cover. */
  total: number;
  /** Goes to a slide of the deck (the contents slide, "start again"). */
  onGo(index: number): void;
  onShare(): void;
  shareNote: string;
}

function Kicker({ kind, label }: { kind: SlideKind; label?: string }): ReactNode {
  const emoji = SLIDE_EMOJI[kind];
  if (!emoji && !label) return null;
  return (
    <p className="present-kicker">
      {emoji && (
        <span className="present-emoji" aria-hidden="true">
          {emoji}
        </span>
      )}
      {label}
    </p>
  );
}

function readerHref(view: DocumentView, anchor?: string): string {
  const base = `/d/${encodeURIComponent(view.document.id)}`;
  return anchor ? `${base}#${encodeURIComponent(anchor)}` : base;
}

function CodeSlide({ slide }: { slide: Extract<Slide, { kind: 'code' }> }): ReactNode {
  const { t } = usePresentText();
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard?.writeText(slide.code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  const label = [slide.lang, slide.part ? t('present.codePart', { part: slide.part[0], parts: slide.part[1] }) : ''].filter(Boolean).join(' · ');
  return (
    <>
      <Kicker kind="code" label={label || undefined} />
      <div className="present-code">
        <pre data-scroll>
          <code>{slide.code}</code>
        </pre>
        <button type="button" className="present-chip" onClick={copy} data-id="present-copy">
          {copied ? t('present.copied') : t('present.copy')}
        </button>
      </div>
    </>
  );
}

export function SlideView({ slide, context }: { slide: Slide; context: SlideContext }): ReactNode {
  const { t, locale } = usePresentText();
  const { view, wikilinks } = context;
  switch (slide.kind) {
    case 'cover':
      return (
        <div className="present-cover">
          <Kicker kind="cover" label={spaceName(locale, view.document.space)} />
          <h1 className="present-title">{slide.title}</h1>
          <p className="present-meta">
            {t('present.minutes', { count: view.document.readingMinutes })} · {t('present.slides', { count: context.total })}
          </p>
          <p className="present-hint">{t('present.start')}</p>
        </div>
      );
    case 'tldr':
      return (
        <>
          <Kicker kind="tldr" label={t('present.tldr')} />
          <ul className="present-points" data-size={textSize(slide.points.join('').length)}>
            {slide.points.map((point, index) => (
              <li key={index}>
                <ReaderMarkdown markdown={point} wikilinks={wikilinks} />
              </li>
            ))}
          </ul>
        </>
      );
    case 'toc':
      return (
        <>
          <Kicker kind="toc" label={t('present.toc')} />
          <p className="present-meta">{t('present.tocHint')}</p>
          <ol className="present-toc" data-scroll>
            {slide.items.map((item) => (
              <li key={item.anchor}>
                <button type="button" onClick={() => context.onGo(item.slide)} data-id="present-toc-item">
                  {item.title}
                </button>
              </li>
            ))}
          </ol>
        </>
      );
    case 'section':
      return (
        <div className="present-section">
          <Kicker kind="section" label={t('present.section', { index: slide.index, total: slide.total })} />
          <h2 className="present-heading">{slide.heading}</h2>
          <p className="present-meta">{t('present.sectionSlides', { count: slide.slides })}</p>
        </div>
      );
    case 'text':
      return (
        <div className="present-text" data-size={textSize(slide.markdown.length)}>
          <ReaderMarkdown markdown={slide.markdown} wikilinks={wikilinks} />
        </div>
      );
    case 'bullets': {
      const ListTag = slide.ordered ? 'ol' : 'ul';
      return (
        <ListTag className="present-points" start={slide.ordered ? slide.start : undefined} data-size={textSize(slide.items.join('').length)}>
          {slide.items.map((item, index) => (
            <li key={index}>
              <ReaderMarkdown markdown={item} wikilinks={wikilinks} />
            </li>
          ))}
        </ListTag>
      );
    }
    case 'step':
      return (
        <div className="present-step">
          <Kicker kind="step" label={t('present.step', { step: slide.step, steps: slide.steps })} />
          <h2 className="present-heading">{slide.term}</h2>
          {slide.body && (
            <div className="present-text" data-size={textSize(slide.body.length)}>
              <ReaderMarkdown markdown={slide.body} wikilinks={wikilinks} />
            </div>
          )}
        </div>
      );
    case 'quote':
      return (
        <figure className="present-quote" data-warning={slide.warning || undefined}>
          <Kicker kind="quote" label={slide.warning ? t('present.warning') : t('present.quote')} />
          <blockquote data-size={textSize(slide.markdown.length)}>
            <ReaderMarkdown markdown={slide.markdown} wikilinks={wikilinks} />
          </blockquote>
        </figure>
      );
    case 'stat':
      return (
        <div className="present-stat">
          <Kicker kind="stat" />
          <p className="present-figure">{slide.value}</p>
          <div className="present-text" data-size="m">
            <ReaderMarkdown markdown={slide.caption} wikilinks={wikilinks} />
          </div>
        </div>
      );
    case 'code':
      return <CodeSlide slide={slide} />;
    case 'table-cards':
      return (
        <>
          <Kicker kind="table-cards" />
          <div className="present-cards">
            {slide.rows.map((row, index) => (
              <dl key={index} className="present-card">
                {row.map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>
                      <ReaderMarkdown markdown={value} wikilinks={wikilinks} />
                    </dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
        </>
      );
    case 'table-link':
      return (
        <div className="present-section">
          <Kicker kind="table-link" />
          <p className="present-text" data-size="m">
            {t('present.tableLink')}
          </p>
          <a className="present-button" href={readerHref(view, slide.anchor)} data-id="present-table-link">
            {t('present.inReader')}
          </a>
        </div>
      );
    case 'image':
      return (
        <figure className="present-image">
          <img src={slide.src} alt={slide.alt} />
          {slide.alt && <figcaption>{slide.alt}</figcaption>}
        </figure>
      );
    case 'end':
      return (
        <div className="present-end">
          <Kicker kind="end" label={t('present.end')} />
          <h2 className="present-heading">{slide.title}</h2>
          {slide.headings.length > 0 && (
            <>
              <p className="present-meta">{t('present.endLead', { count: slide.headings.length })}</p>
              <ol className="present-recap" data-scroll>
                {slide.headings.map((heading, index) => (
                  <li key={index}>{heading}</li>
                ))}
              </ol>
            </>
          )}
          <div className="present-actions">
            <button type="button" className="present-button" data-tone="accent" onClick={context.onShare} data-id="present-share">
              {context.shareNote || t('present.share')}
            </button>
            <a className="present-button" href={readerHref(view)} data-id="present-read-full">
              {t('present.readFull')}
            </a>
            <button type="button" className="present-button" onClick={() => context.onGo(0)} data-id="present-again">
              {t('present.again')}
            </button>
          </div>
        </div>
      );
  }
}
