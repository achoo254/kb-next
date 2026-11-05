import type { CSSProperties, ReactNode } from 'react';
import { SEARCH_MODES, type SearchResult, resultHref } from '../api/search-api';
import { PhoneShell } from '../layout/phone-shell';
import { SHELL_PATHS } from '../layout/shell-paths';
import { Icon } from '../ui/icon';
import { stateArtSrc } from '../ui/art';
import { copilotHref } from './copilot-links';
import { usePhoneText } from './phone-messages';
import { PhoneOrigin } from './phone-origin';
import { type SearchTranslate, useSearchText } from './search-messages';
import { Highlighted, SearchSkeleton, SpaceOrb } from './search-results';
import { useSearchAddress, useVisibleSpaces } from './search-address';
import { originOf, relevanceText } from './space-labels';
import { spaceName } from './space-panels';
import { spaceHref } from './universe-spaces';
import type { Locale } from '../i18n/i18n';
import './search-phone.css';

/**
 * Search on a phone (board M06): the query at the top with "Huỷ", the three ways to search, the results by Space with
 * their highlighted excerpt and how each was found, and "Hỏi AI với các đoạn này". Before anything is typed it offers
 * every Space to fly to (the phone's Universe shows only six).
 */

function PhoneResult({ result, t, locale }: { result: SearchResult; t: SearchTranslate; locale: Locale }): ReactNode {
  const meaning = result.match === 'meaning' && result.relevance !== null;
  const how = meaning && result.relevance !== null ? `${t('search.meaningMatch')} ${relevanceText(locale, result.relevance * 100)}` : t('search.keywordMatch');
  return (
    <a href={resultHref(result)} className="phone-result" data-match={meaning ? 'meaning' : 'keyword'} data-id={`search-result-${result.id}`}>
      <span className="phone-result-top">
        <span className="phone-result-title">{result.title}</span>
        <PhoneOrigin origin={originOf(result)} />
      </span>
      <Highlighted parts={result.snippet} className="phone-result-snippet" />
      <span className="phone-result-foot">
        <span className="phone-result-how">{how}</span>
        <span className="phone-result-path">{result.collection ? spaceName(locale, result.collection) : spaceName(locale, result.space)}</span>
      </span>
    </a>
  );
}

function FlyToSpaces(): ReactNode {
  const spaces = useVisibleSpaces();
  const { t } = usePhoneText();
  const { locale } = useSearchText();
  if (spaces.length === 0) return null;
  return (
    <section className="phone-search-spaces" aria-labelledby="phone-search-spaces-title">
      <h2 id="phone-search-spaces-title" className="phone-search-label">
        {t('search.spaces')}
      </h2>
      <div className="phone-search-grid">
        {spaces.map((space) => (
          <a key={space.slug} className="phone-search-space" href={space.kind === 'personal' ? SHELL_PATHS.mine : spaceHref(space.slug)}>
            <span className="phone-search-space-orb" style={{ '--tint': space.glow } as CSSProperties} aria-hidden="true" />
            {spaceName(locale, space)}
          </a>
        ))}
      </div>
    </section>
  );
}

/** /search on a phone (board M06). */
export function SearchPhone(): ReactNode {
  const { t: tp } = usePhoneText();
  const { t, locale } = useSearchText();
  const { address, update, state, retry } = useSearchAddress();
  const response = state.status === 'ready' ? state.response : null;
  const screenState = response ? (response.total === 0 ? 'empty' : 'results') : state.status;
  return (
    <PhoneShell screen="M06" stars={false}>
      <div className="phone-search" data-id="search-screen" data-state={screenState}>
        <div className="phone-search-top">
          <label className="phone-search-field">
            <Icon name="search" size={20} strokeWidth={2.2} />
            <input
              type="search"
              aria-label={tp('search.label')}
              value={address.q}
              placeholder={tp('universe.search')}
              maxLength={200}
              onChange={(event) => update({ q: event.target.value })}
              data-id="search-input"
            />
            {address.q && (
              <button type="button" className="phone-search-clear" aria-label={tp('search.clear')} onClick={() => update({ q: '' })}>
                <span aria-hidden="true">
                  <Icon name="close" size={16} />
                </span>
              </button>
            )}
          </label>
          <a className="phone-search-cancel" href={SHELL_PATHS.universe}>
            {tp('search.cancel')}
          </a>
        </div>
        <div role="group" aria-label={t('search.modes')} className="phone-search-modes">
          {SEARCH_MODES.map((mode) => (
            <button key={mode} type="button" className="phone-search-mode" aria-pressed={address.mode === mode} onClick={() => update({ mode })} data-id={`search-mode-${mode}`}>
              {t(`search.mode.${mode}`)}
            </button>
          ))}
        </div>
        <div className="phone-search-body">
          {state.status === 'idle' && <FlyToSpaces />}
          {state.status === 'searching' && <SearchSkeleton t={t} keywordDone={state.keywordDone} />}
          {state.status === 'failed' && (
            <div className="phone-search-empty" role="alert">
              <span className="phone-search-empty-title">{t('search.error.title')}</span>
              <button type="button" className="phone-button" data-tone="rim" onClick={retry}>
                {t('search.retry')}
              </button>
            </div>
          )}
          {response && response.total === 0 && (
            <div className="phone-search-empty" data-id="search-empty">
              <img src={stateArtSrc('telescope-empty')} alt="" className="phone-search-empty-art" />
              <span className="phone-search-empty-title">{t('search.empty.title', { query: response.query })}</span>
              <span className="phone-search-empty-text">{t('search.empty.text')}</span>
              <a className="phone-button" data-tone="rim" href={SHELL_PATHS.create}>
                {tp('create.label')}
              </a>
            </div>
          )}
          {response && response.total > 0 && (
            <>
              <span className="phone-search-count">{tp('search.count', { results: response.total, spaces: response.groups.length })}</span>
              {response.groups.map((group) => (
                <section key={group.space.slug} className="phone-search-group" aria-label={spaceName(locale, group.space)}>
                  <div className="phone-search-group-head">
                    <SpaceOrb space={group.space} className="phone-search-orb" />
                    <span className="phone-search-group-name">
                      {spaceName(locale, group.space)} <span>· {tp('search.groupCount', { count: group.results.length })}</span>
                    </span>
                    <a className="phone-search-all" href={group.space.kind === 'personal' ? SHELL_PATHS.mine : spaceHref(group.space.slug)}>
                      {tp('search.all')}
                    </a>
                  </div>
                  {group.results.map((result) => (
                    <PhoneResult key={result.id} result={result} t={t} locale={locale} />
                  ))}
                </section>
              ))}
              <a className="phone-button phone-search-ask" data-tone="rim" href={copilotHref(response.query)} data-id="search-ask">
                <Icon name="sparkle" size={16} />
                {tp('search.ask')}
              </a>
            </>
          )}
        </div>
      </div>
    </PhoneShell>
  );
}
