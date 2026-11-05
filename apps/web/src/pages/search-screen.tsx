/**
 * The Search screen (board C12) at /search: the query with its mode (all, keywords, by meaning), the filters, the
 * results grouped by Space with their highlighted excerpts, query suggestions, "Hỏi AI với kết quả này" and a
 * preview of the result in focus. States: nothing typed, searching ("Từ khoá xong · Jev đang tìm theo nghĩa…"),
 * results, nothing found (`ill-telescope-empty`), typed with diacritics (only the exact ones, a way to see every
 * variant), keyword only (Jev failed or is off), and a search that did not answer.
 *
 * The board's "Trạng thái (demo)" switch is the preview panel here: each of its states is a real state of the screen.
 */
import { type ReactNode, useState } from 'react';
import { SEARCH_MODES, type SearchMode, type SearchResponse, type SearchResult, resultHref } from '../api/search-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { useDevice } from '../layout/device';
import { Icon, type IconName } from '../ui/icon';
import { OriginTag } from '../ui/origin-tag';
import { RimPanel } from '../ui/rim-panel';
import { stateArtSrc } from '../ui/art';
import { allResults, type SearchFailure, type SearchState } from './search-data';
import { useSearchAddress, useVisibleSpaces } from './search-address';
import { FilterPanel, type SearchAddress, type SearchFilters } from './search-filters';
import { copilotHref } from './copilot-links';
import { SearchPhone } from './search-phone';
import { type SearchTranslate, useSearchText } from './search-messages';
import { Highlighted, ResultCard, SearchSkeleton, SpaceOrb, resultPath } from './search-results';
import { originOf } from './space-labels';
import { spaceName } from './space-panels';
import type { Locale } from '../i18n/i18n';
import './search-screen.css';

const MODE_ICON: Record<SearchMode, IconName> = { all: 'menu', keyword: 'type', meaning: 'star' };

/** The input's right-hand note: "7 kết quả", "đúng dấu · 2 kết quả", "đang tìm…". */
function countText(t: SearchTranslate, state: SearchState): string {
  if (state.status === 'searching') return t('search.searching');
  if (state.status !== 'ready') return '';
  const { total, exact } = state.response;
  return exact ? t('search.countExact', { count: total }) : t('search.count', { count: total });
}

/** Shorter ways to ask when nothing was found: the server's suggestions, else the query with its last words dropped. */
export function emptySuggestions(response: SearchResponse): string[] {
  if (response.suggestions.length > 0) return response.suggestions;
  const words = response.query.split(/\s+/).filter(Boolean);
  const shorter: string[] = [];
  for (let n = words.length - 1; n >= 1 && shorter.length < 3; n -= 1) shorter.push(words.slice(0, n).join(' '));
  return shorter;
}

function Notice({ text, action, onAction, dataId }: { text: string; action?: string; onAction?: () => void; dataId: string }): ReactNode {
  return (
    <div className="search-notice" role="status" data-id={dataId}>
      <Icon name="info-circle" size={18} strokeWidth={2.2} />
      <span className="search-notice-text">{text}</span>
      {action && onAction && (
        <button type="button" className="search-notice-action" onClick={onAction} data-id={`${dataId}-action`}>
          {action}
        </button>
      )}
    </div>
  );
}

/** The banners over the results: diacritics kept exact, Jev failed or off (keyword only), keyword search failed. */
function Notices({ response, t, onAllVariants, onRetry }: { response: SearchResponse; t: SearchTranslate; onAllVariants(): void; onRetry(): void }): ReactNode {
  const notices: ReactNode[] = [];
  if (response.exact && response.variants) {
    const { hidden, words } = response.variants;
    const quoted = words.map((w) => `"${w}"`).join(', ');
    const text =
      hidden === 0
        ? t('search.accent.only', { query: response.query })
        : t(words.length > 0 ? 'search.accent.hidden' : 'search.accent.hiddenNoWords', { query: response.query, count: hidden, words: quoted });
    notices.push(<Notice key="accent" text={text} action={hidden > 0 ? t('search.accent.all') : undefined} onAction={onAllVariants} dataId="search-accent" />);
  }
  if ((response.meaning === 'failed' || response.meaning === 'off') && response.keyword === 'ok') {
    notices.push(
      <Notice
        key="keyword-only"
        text={t(response.meaning === 'failed' ? 'search.keywordOnly.failed' : 'search.keywordOnly.off')}
        action={response.meaning === 'failed' ? t('search.retry') : undefined}
        onAction={onRetry}
        dataId="search-keyword-only"
      />,
    );
  }
  if (response.keyword === 'failed' && response.meaning === 'ok') notices.push(<Notice key="meaning-only" text={t('search.meaningOnly')} dataId="search-meaning-only" />);
  return notices;
}

function EmptyResults({ response, t, onPick }: { response: SearchResponse; t: SearchTranslate; onPick(q: string): void }): ReactNode {
  return (
    <div className="search-empty" data-id="search-empty">
      <img src={stateArtSrc('telescope-empty')} alt="" className="search-empty-art" />
      <span className="search-empty-title">{t('search.empty.title', { query: response.query })}</span>
      <span className="search-empty-text">{t('search.empty.text')}</span>
      <div className="search-empty-chips">
        {emptySuggestions(response).map((q) => (
          <button key={q} type="button" className="search-glass-button" onClick={() => onPick(q)}>
            {q}
          </button>
        ))}
      </div>
      <div className="search-empty-actions">
        <a href={SHELL_PATHS.mine} className="search-glass-button search-empty-note">
          {t('search.empty.note')}
        </a>
        <a href={copilotHref(response.query)} className="search-ask-button" data-id="search-empty-ask">
          {t('search.askAi')}
        </a>
      </div>
    </div>
  );
}

const FAILURE_TEXT: Record<SearchFailure, 'search.error.text' | 'search.error.rateLimited' | 'search.error.offline'> = {
  server: 'search.error.text',
  'rate-limited': 'search.error.rateLimited',
  offline: 'search.error.offline',
};

interface ResultsProps {
  state: SearchState;
  t: SearchTranslate;
  locale: Locale;
  onFocusResult(result: SearchResult): void;
  onAllVariants(): void;
  onRetry(): void;
  onPick(q: string): void;
}

function Results({ state, t, locale, onFocusResult, onAllVariants, onRetry, onPick }: ResultsProps): ReactNode {
  if (state.status === 'idle') {
    return (
      <div className="search-empty" data-id="search-idle">
        <img src={stateArtSrc('telescope-empty')} alt="" className="search-empty-art" />
        <span className="search-empty-title">{t('search.idle.title')}</span>
        <span className="search-empty-text">{t('search.idle.text')}</span>
      </div>
    );
  }
  if (state.status === 'searching') return <SearchSkeleton t={t} keywordDone={state.keywordDone} />;
  if (state.status === 'failed') {
    return (
      <div className="search-empty" role="alert" data-id="search-failed">
        <img src={stateArtSrc(state.failure === 'offline' ? 'planet-offline' : 'satellite-repair')} alt="" className="search-empty-art" />
        <span className="search-empty-title">{t('search.error.title')}</span>
        <span className="search-empty-text">{t(FAILURE_TEXT[state.failure])}</span>
        <button type="button" className="search-ask-button" onClick={onRetry} data-id="search-retry">
          {t('search.retry')}
        </button>
      </div>
    );
  }
  const { response } = state;
  return (
    <>
      <Notices response={response} t={t} onAllVariants={onAllVariants} onRetry={onRetry} />
      {response.total === 0 ? (
        <EmptyResults response={response} t={t} onPick={onPick} />
      ) : (
        response.groups.map((group) => (
          <section key={group.space.slug} className="search-group" aria-label={spaceName(locale, group.space)}>
            <div className="search-group-head">
              <SpaceOrb space={group.space} className="search-group-orb" />
              <a href={group.space.kind === 'personal' ? SHELL_PATHS.mine : `/s/${encodeURIComponent(group.space.slug)}`} className="search-group-name">
                {spaceName(locale, group.space)}
              </a>
              <span className="search-group-count">{t('search.groupCount', { count: group.results.length })}</span>
            </div>
            {group.results.map((result) => (
              <ResultCard key={result.id} result={result} t={t} locale={locale} onFocus={() => onFocusResult(result)} />
            ))}
          </section>
        ))
      )}
    </>
  );
}

/** The right column: other ways to ask, the cross-language hint, asking AI about the results, the preview. */
function SidePanels({ state, preview, t, locale, onPick }: { state: SearchState; preview: SearchResult | null; t: SearchTranslate; locale: Locale; onPick(q: string): void }): ReactNode {
  const response = state.status === 'ready' ? state.response : null;
  const passages = response ? response.total : 0;
  return (
    <aside className="search-side" aria-label={t('search.didYouMean')}>
      <RimPanel label={t('search.didYouMean')} className="search-side-panel search-suggest" dataId="search-suggestions">
        <span className="search-side-title">{t('search.didYouMean')}</span>
        {response?.suggestions.map((suggestion) => (
          <button key={suggestion} type="button" className="search-suggestion" onClick={() => onPick(suggestion)}>
            {suggestion}
          </button>
        ))}
        <div className="search-cross">
          <span className="search-cross-badge">{t('search.crossLang.badge')}</span>
          <span>{t('search.crossLang.text')}</span>
        </div>
      </RimPanel>
      <a href={copilotHref(response?.query ?? '')} className="search-side-panel search-ask" data-id="search-ask">
        <span className="search-ask-orb" aria-hidden="true">
          <Icon name="sparkles" size={24} />
        </span>
        <span className="search-ask-text">
          <span className="search-ask-title">{t('search.askWith')}</span>
          <span className="search-ask-sub">{t('search.askWithSub', { count: passages })}</span>
        </span>
        <Icon name="chevron-right" size={18} />
      </a>
      <RimPanel label={t('search.preview')} className="search-side-panel search-preview" dataId="search-preview">
        <span className="search-side-title">{t('search.preview')}</span>
        {preview ? (
          <>
            <span className="search-preview-head">
              <a href={resultHref(preview)} className="search-preview-title" data-id="search-preview-open">
                {preview.title}
              </a>
              <OriginTag origin={originOf(preview)} variant="inline" className="search-origin" />
            </span>
            <span className="search-preview-path">{resultPath(locale, preview)}</span>
            <Highlighted parts={preview.snippet} className="search-preview-text" />
          </>
        ) : (
          <span className="search-preview-none">{t('search.preview.none')}</span>
        )}
      </RimPanel>
    </aside>
  );
}


/** /search: the phone board M06 on a phone, C12 elsewhere. */
export function SearchScreen(): ReactNode {
  return useDevice() === 'phone' ? <SearchPhone /> : <SearchDesktop />;
}

function SearchDesktop(): ReactNode {
  const { t, locale } = useSearchText();
  const spaces = useVisibleSpaces();
  const search = useSearchAddress();
  const { address, state, retry } = search;
  const [focused, setFocused] = useState<string | null>(null);

  const update = (next: Partial<SearchAddress>): void => {
    search.update(next);
    setFocused(null);
  };

  const results = state.status === 'ready' ? allResults(state.response) : [];
  const preview = results.find((r) => r.id === focused) ?? results[0] ?? null;
  const counts = state.status === 'ready' ? state.response.origins : null;
  const screenState = state.status === 'ready' ? (state.response.total === 0 ? 'empty' : state.response.meaning === 'failed' || state.response.meaning === 'off' ? 'keyword-only' : 'results') : state.status;

  return (
    <AppShell screen="C12" rail="search" veil="strong" className="search-shell" breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('search.crumb') }]}>
      <div className="search-screen" data-id="search-screen" data-state={screenState}>
        <section className="search-bar">
          <label className="search-input">
            <Icon name="search" size={22} strokeWidth={2.2} />
            <input
              type="search"
              aria-label={t('search.inputLabel')}
              value={address.q}
              placeholder={t('search.placeholder')}
              maxLength={200}
              onChange={(e) => update({ q: e.target.value })}
              data-id="search-input"
            />
            <span className="search-input-count" aria-live="polite">
              {countText(t, state)}
            </span>
          </label>
          <div role="group" aria-label={t('search.modes')} className="search-modes">
            {SEARCH_MODES.map((mode) => (
              <button key={mode} type="button" className="search-mode" aria-pressed={address.mode === mode} onClick={() => update({ mode })} data-id={`search-mode-${mode}`}>
                <Icon name={MODE_ICON[mode]} size={14} strokeWidth={2.2} />
                {t(`search.mode.${mode}`)}
              </button>
            ))}
          </div>
        </section>
        <FilterPanel filters={address.filters} onChange={(filters: SearchFilters) => update({ filters })} spaces={spaces} counts={counts} t={t} locale={locale} />
        <RimPanel as="section" label={t('search.results')} className="search-results" dataId="search-results">
          <Results
            state={state}
            t={t}
            locale={locale}
            onFocusResult={(result) => setFocused(result.id)}
            onAllVariants={() => update({ variants: true })}
            onRetry={retry}
            onPick={(q) => update({ q })}
          />
        </RimPanel>
        <SidePanels state={state} preview={preview} t={t} locale={locale} onPick={(q) => update({ q })} />
      </div>
    </AppShell>
  );
}
