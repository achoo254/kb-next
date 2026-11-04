/**
 * How a search result reads, on C12 and in the ⌘K palette (F01): its highlighted words, its place ("Networking ›
 * Giao thức nền tảng · Minh"), its kind and languages, and how it was found ("Khớp từ khoá" or "Theo nghĩa · Jev"
 * with Jev's relevance).
 */
import type { CSSProperties, ReactNode } from 'react';
import { type SearchGroup, type SearchResult, resultHref } from '../api/search-api';
import type { Locale } from '../i18n/i18n';
import { OriginTag } from '../ui/origin-tag';
import { Skeleton } from '../ui/skeleton';
import type { SearchTranslate } from './search-messages';
import { kindLabel, langList, originOf, relevanceText } from './space-labels';
import { useSpaceText } from './space-messages';
import { spaceName, tintStyle } from './space-panels';
import './search-surfaces.css';

/** Plain text with the matched words in <mark> (never HTML from the server). */
export function Highlighted({ parts, className }: { parts: SearchResult['snippet']; className?: string }): ReactNode {
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.hit ? (
          <mark key={i} className="search-hit">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}

/** "Networking › Giao thức nền tảng · Minh": the Space, the collection, and the author of a community text. */
export function resultPath(locale: Locale, result: SearchResult): string {
  const place = [spaceName(locale, result.space), ...(result.collection ? [spaceName(locale, result.collection)] : [])].join(' › ');
  return result.origin === 'community' && result.authorName ? `${place} · ${result.authorName}` : place;
}

/** "Lab · VI · EN": the kind and the languages the text can be read in. */
export function useKindLine(): (result: SearchResult) => string {
  const { t } = useSpaceText();
  return (result) => `${kindLabel(t, result)} · ${langList(result.translations)}`;
}

/** The Space's orb of a group header or a palette row, in the Space's colours. */
export function SpaceOrb({ space, className }: { space: SearchGroup['space']; className: string }): ReactNode {
  return <span className={className} style={tintStyle(space)} aria-hidden="true" />;
}

/** "Theo nghĩa · Jev ▬▬ 0,82" or "Khớp từ khoá". */
export function MatchLabel({ result, t, locale }: { result: SearchResult; t: SearchTranslate; locale: Locale }): ReactNode {
  if (result.match === 'keyword' || result.relevance === null) {
    return <span className="search-match" data-match="keyword">{t('search.keywordMatch')}</span>;
  }
  const value = relevanceText(locale, result.relevance * 100);
  return (
    <span className="search-match" data-match="meaning">
      {t('search.meaningMatch')}
      <span className="search-meter" role="img" aria-label={t('search.relevanceLabel', { value })}>
        <span className="search-meter-fill" style={{ width: `${Math.round(result.relevance * 100)}%` } as CSSProperties} />
      </span>
      {value}
    </span>
  );
}

/** A C12 result: title, origin, kind and languages, how it was found, its place and the excerpt. */
export function ResultCard({ result, t, locale, onFocus }: { result: SearchResult; t: SearchTranslate; locale: Locale; onFocus(): void }): ReactNode {
  const kindLine = useKindLine();
  return (
    <a href={resultHref(result)} className="search-result" onMouseEnter={onFocus} onFocus={onFocus} data-id={`search-result-${result.id}`}>
      <span className="search-result-top">
        <span className="search-result-title">{result.title}</span>
        <OriginTag origin={originOf(result)} variant="inline" className="search-origin" />
        <span className="search-kind">{kindLine(result)}</span>
        <span className="search-result-gap" />
        <MatchLabel result={result} t={t} locale={locale} />
      </span>
      <span className="search-result-path">{resultPath(locale, result)}</span>
      <Highlighted parts={result.snippet} className="search-result-snippet" />
    </a>
  );
}

const SKELETONS = [
  { title: '46%', line: '88%' },
  { title: '38%', line: '76%' },
  { title: '52%', line: '82%' },
  { title: '34%', line: '70%' },
];

/** C12 while searching: what is done so far, and four result-shaped placeholders. */
export function SearchSkeleton({ t, keywordDone }: { t: SearchTranslate; keywordDone: boolean }): ReactNode {
  return (
    <div className="search-loading" aria-busy="true" aria-label={t('search.loadingLabel')} data-id="search-loading">
      <span className="search-loading-line" role="status">
        <span className="search-spinner" aria-hidden="true" />
        {keywordDone ? t('search.loadingMeaning') : t('search.loadingKeyword')}
      </span>
      {SKELETONS.map((s, i) => (
        <span key={i} className="search-skeleton-card">
          <Skeleton width={s.title} height={16} radius={8} tone="glow" />
          <Skeleton width="30%" height={10} radius={5} tone="glow" />
          <Skeleton width={s.line} height={10} radius={5} tone="glow" />
        </span>
      ))}
    </div>
  );
}
