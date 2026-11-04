/**
 * C12 "Bộ lọc": source (origin, with how many results each has), Space, type, the documents' language and time, and
 * the address that keeps them (`/search?q=…&origin=…`), so a search can be shared or reloaded as it was.
 */
import type { ReactNode } from 'react';
import { DOCUMENT_ORIGINS, type SpaceListItem } from '../api/content-api';
import { SEARCH_MODES, SEARCH_TIMES, type SearchMode, type SearchParams, type SearchResponse, type SearchTime } from '../api/search-api';
import type { Locale } from '../i18n/i18n';
import { Icon } from '../ui/icon';
import { RimPanel } from '../ui/rim-panel';
import type { SearchMessageKey, SearchTranslate } from './search-messages';
import { spaceName, tintStyle } from './space-panels';

export type Origin = (typeof DOCUMENT_ORIGINS)[number];
/** The types C12 offers as chips (the others are found without a filter). */
export const FILTER_TYPES = ['lab', 'note', 'office', 'journey'] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

export interface SearchFilters {
  /** Origins kept; null: every origin. */
  origins: Origin[] | null;
  /** Space slugs kept; null: every Space. */
  spaces: string[] | null;
  /** Types picked; empty: every type. */
  types: FilterType[];
  /** The documents' language; null: both. */
  lang: 'vi' | 'en' | null;
  time: SearchTime | null;
}

export const NO_FILTERS: SearchFilters = { origins: null, spaces: null, types: [], lang: null, time: null };

export interface SearchAddress {
  q: string;
  mode: SearchMode;
  filters: SearchFilters;
  variants: boolean;
}

/** `?lang=` already picks the page language (i18n), so the documents' language is `doclang`. */
const DOC_LANG_PARAM = 'doclang';

function listParam<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[]): T[] | null {
  const raw = params.get(name);
  if (raw === null) return null;
  return raw.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
}

/** The search an address holds. Unknown values are dropped. */
export function readAddress(search: string): SearchAddress {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  const lang = params.get(DOC_LANG_PARAM);
  const time = params.get('time');
  const spaces = params.get('space');
  return {
    q: params.get('q') ?? '',
    mode: (SEARCH_MODES as readonly string[]).includes(mode ?? '') ? (mode as SearchMode) : 'all',
    variants: params.get('variants') === '1',
    filters: {
      origins: listParam(params, 'origin', DOCUMENT_ORIGINS),
      spaces: spaces === null ? null : spaces.split(',').filter(Boolean),
      types: listParam(params, 'type', FILTER_TYPES) ?? [],
      lang: lang === 'vi' || lang === 'en' ? lang : null,
      time: (SEARCH_TIMES as readonly string[]).includes(time ?? '') ? (time as SearchTime) : null,
    },
  };
}

/** The address of a search (`/search?…`), only with what differs from the defaults. */
export function addressOf({ q, mode, filters, variants }: SearchAddress): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (mode !== 'all') params.set('mode', mode);
  if (filters.origins) params.set('origin', filters.origins.join(','));
  if (filters.spaces) params.set('space', filters.spaces.join(','));
  if (filters.types.length > 0) params.set('type', filters.types.join(','));
  if (filters.lang) params.set(DOC_LANG_PARAM, filters.lang);
  if (filters.time) params.set('time', filters.time);
  if (variants) params.set('variants', '1');
  const query = params.toString();
  return query ? `/search?${query}` : '/search';
}

/** What the API is asked. The origin filter is applied by the server after counting each origin. */
export function searchParamsOf({ q, mode, filters, variants }: SearchAddress): SearchParams {
  return {
    q,
    mode,
    variants,
    origins: filters.origins ?? undefined,
    spaces: filters.spaces ?? undefined,
    types: filters.types.length > 0 ? filters.types : undefined,
    lang: filters.lang ?? undefined,
    time: filters.time ?? undefined,
  };
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const ORIGIN_LABEL: Record<Origin, SearchMessageKey> = { official: 'search.origin.official', community: 'search.origin.community', own: 'search.origin.own' };

interface FilterPanelProps {
  filters: SearchFilters;
  onChange(filters: SearchFilters): void;
  spaces: readonly SpaceListItem[];
  /** Results per origin of the latest answer (C12's counts); null before the first answer. */
  counts: SearchResponse['origins'] | null;
  t: SearchTranslate;
  locale: Locale;
}

export function FilterPanel({ filters, onChange, spaces, counts, t, locale }: FilterPanelProps): ReactNode {
  const origins = filters.origins ?? [...DOCUMENT_ORIGINS];
  const slugs = filters.spaces ?? spaces.map((s) => s.slug);
  const setOrigins = (next: Origin[]): void => onChange({ ...filters, origins: next.length === DOCUMENT_ORIGINS.length ? null : next });
  const setSpaces = (next: string[]): void => onChange({ ...filters, spaces: next.length === spaces.length ? null : next });
  return (
    <RimPanel as="aside" label={t('search.filters')} className="search-filters" dataId="search-filters">
      <div className="search-filters-head">
        <span className="search-filters-title">{t('search.filters')}</span>
        <button type="button" className="search-clear" onClick={() => onChange(NO_FILTERS)} data-id="search-clear">
          {t('search.clear')}
        </button>
      </div>
      <fieldset className="search-fieldset search-sources">
        <legend>{t('search.source')}</legend>
        {DOCUMENT_ORIGINS.map((origin) => {
          const on = origins.includes(origin);
          return (
            <button
              key={origin}
              type="button"
              role="checkbox"
              aria-checked={on}
              className="search-source"
              data-origin={origin}
              onClick={() => setOrigins(toggle(origins, origin))}
              data-id={`search-source-${origin}`}
            >
              <span className="search-source-box" aria-hidden="true">
                {on && <Icon name="check" size={12} strokeWidth={3.4} />}
              </span>
              <span className="search-source-name">{t(ORIGIN_LABEL[origin])}</span>
              <span className="search-source-count">{counts ? counts[origin] : ''}</span>
            </button>
          );
        })}
      </fieldset>
      <fieldset className="search-fieldset search-spaces">
        <legend>{t('search.space')}</legend>
        {spaces.map((space) => (
          <label key={space.slug} className="search-space">
            <input type="checkbox" checked={slugs.includes(space.slug)} onChange={() => setSpaces(toggle(slugs, space.slug))} />
            <span className="search-space-dot" style={tintStyle(space)} aria-hidden="true" />
            {spaceName(locale, space)}
          </label>
        ))}
      </fieldset>
      <fieldset className="search-fieldset search-types">
        <legend>{t('search.type')}</legend>
        {FILTER_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="search-type"
            aria-pressed={filters.types.includes(type)}
            onClick={() => onChange({ ...filters, types: toggle(filters.types, type) })}
            data-id={`search-type-${type}`}
          >
            {t(`search.type.${type}`)}
          </button>
        ))}
      </fieldset>
      <div className="search-selects">
        <label className="search-select">
          {t('search.lang')}
          <select value={filters.lang ?? ''} onChange={(e) => onChange({ ...filters, lang: e.target.value === 'vi' || e.target.value === 'en' ? e.target.value : null })} data-id="search-lang">
            <option value="">{t('search.lang.all')}</option>
            <option value="vi">{t('search.lang.vi')}</option>
            <option value="en">{t('search.lang.en')}</option>
          </select>
        </label>
        <label className="search-select">
          {t('search.time')}
          <select
            value={filters.time ?? ''}
            onChange={(e) => onChange({ ...filters, time: (SEARCH_TIMES as readonly string[]).includes(e.target.value) ? (e.target.value as SearchTime) : null })}
            data-id="search-time"
          >
            <option value="">{t('search.time.all')}</option>
            {SEARCH_TIMES.map((time) => (
              <option key={time} value={time}>
                {t(`search.time.${time}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </RimPanel>
  );
}
