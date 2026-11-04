/**
 * The ⌘K palette (board F01), over any signed-in screen: quick search (keyword and meaning, as C12) with a preview,
 * the recent texts and four quick commands while nothing is typed, and "Xem tất cả kết quả" to C12. States: nothing
 * typed, searching, results (with "Hỏi AI" and the meaning results), typed with diacritics, nothing found, keyword
 * only (Jev failed), failed. Keyboard: ↑↓ move, Enter opens, ⇧Enter shows every result on C12, Tab toggles the
 * preview, Esc closes; on a quick command its letter (N, C, A, U) runs it.
 */
import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { type DocumentSummary, fetchRecent } from '../api/content-api';
import { type SearchResponse, type SearchResult, resultHref } from '../api/search-api';
import { SHELL_PATHS } from '../layout/shell-paths';
import { allResults, useSearch } from '../pages/search-data';
import { useSearchText } from '../pages/search-messages';
import { Highlighted } from '../pages/search-results';
import { copilotHref } from '../pages/copilot-links';
import { searchHref } from '../pages/search-links';
import { kindLabel, langList, originOf } from '../pages/space-labels';
import { useSpaceText } from '../pages/space-messages';
import { spaceName, tintStyle } from '../pages/space-panels';
import { timeAgo } from '../pages/reader-messages';
import { spaceKindOf } from '../pages/universe-spaces';
import { CRYSTAL_ART, ORB_ART } from '../ui/art';
import { Icon, type IconName } from '../ui/icon';
import { OriginTag } from '../ui/origin-tag';
import { Skeleton } from '../ui/skeleton';
import { type PaletteMessageKey, usePaletteText } from './palette-messages';
import './command-palette.css';

interface Command {
  id: 'note' | 'canvas' | 'ask' | 'upload';
  key: string;
  icon: IconName;
  label: PaletteMessageKey;
  href: string;
}

/** The quick commands of F01. Writing and uploading start from "Của tôi" (C08) until C01 and C03 are built. */
export const COMMANDS: readonly Command[] = [
  { id: 'note', key: 'N', icon: 'plus', label: 'palette.command.note', href: SHELL_PATHS.mine },
  { id: 'canvas', key: 'C', icon: 'graph-tree', label: 'palette.command.canvas', href: SHELL_PATHS.canvas },
  { id: 'ask', key: 'A', icon: 'star', label: 'palette.command.ask', href: SHELL_PATHS.copilot },
  { id: 'upload', key: 'U', icon: 'upload', label: 'palette.command.upload', href: SHELL_PATHS.mine },
];

/** Something the arrows can land on, and where Enter takes it. */
type Item =
  | { kind: 'recent'; doc: DocumentSummary; href: string }
  | { kind: 'command'; command: Command; href: string }
  | { kind: 'ask'; href: string }
  | { kind: 'result'; result: SearchResult; href: string };

/** The selectable items, in the order they show. */
export function paletteItems(query: string, recent: readonly DocumentSummary[], response: SearchResponse | null): Item[] {
  if (!query.trim()) {
    return [
      ...recent.map((doc): Item => ({ kind: 'recent', doc, href: `/d/${encodeURIComponent(doc.id)}` })),
      ...COMMANDS.map((command): Item => ({ kind: 'command', command, href: command.href })),
    ];
  }
  if (!response || response.total === 0) return [];
  const results = allResults(response);
  return [
    { kind: 'ask', href: copilotHref(query.trim()) },
    ...results.filter((r) => r.match === 'keyword').map((result): Item => ({ kind: 'result', result, href: resultHref(result) })),
    ...results.filter((r) => r.match === 'meaning').map((result): Item => ({ kind: 'result', result, href: resultHref(result) })),
  ];
}

const RECENT_SHOWN = 3;

function useRecent(): readonly DocumentSummary[] {
  const [recent, setRecent] = useState<readonly DocumentSummary[]>([]);
  useEffect(() => {
    let live = true;
    // Without them the palette still offers its commands.
    fetchRecent()
      .then((docs) => live && setRecent(docs.slice(0, RECENT_SHOWN)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return recent;
}

interface CommandPaletteProps {
  initialQuery?: string;
  onClose(): void;
  /** Opens an address (default: the browser goes there). */
  navigate?: (href: string) => void;
}

const goTo = (href: string): void => window.location.assign(href);

export function CommandPalette({ initialQuery = '', onClose, navigate = goTo }: CommandPaletteProps): ReactNode {
  const { t, locale } = usePaletteText();
  const search = useSearchText();
  const space = useSpaceText();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState<number | null>(null);
  const [preview, setPreview] = useState(true);
  const recent = useRecent();
  const params = useMemo(() => (query.trim() ? { q: query, mode: 'all' as const } : null), [query]);
  const { state, retry } = useSearch(params);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [now] = useState(Date.now);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.current?.focus();
    return () => previous?.focus();
  }, []);

  const response = state.status === 'ready' ? state.response : null;
  const items = paletteItems(query, recent, response);
  // The first result is in focus by default (the ask row stays one ↑ away); nothing typed: the first recent text.
  const fallback = items.findIndex((item) => item.kind === 'result');
  const index = active !== null && active < items.length ? active : Math.max(fallback, 0);
  const selected = items[index];
  const optionId = (i: number): string => `${listId}-${i}`;

  const go = (href: string): void => {
    onClose();
    navigate(href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length > 0) setActive((index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
    } else if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      go(searchHref(query));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (state.status === 'failed') retry();
      else if (selected) go(selected.href);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      setPreview((on) => !on);
    } else if (selected?.kind === 'command' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const command = COMMANDS.find((c) => c.key === event.key.toUpperCase());
      if (command) {
        event.preventDefault();
        go(command.href);
      }
    }
  };

  const optionProps = (i: number) => ({
    id: optionId(i),
    role: 'option' as const,
    'aria-selected': i === index,
    'data-active': i === index || undefined,
    onMouseEnter: () => setActive(i),
  });

  const keywordResults = response ? allResults(response).filter((r) => r.match === 'keyword') : [];
  const meaningResults = response ? allResults(response).filter((r) => r.match === 'meaning') : [];
  const previewed = selected?.kind === 'result' ? selected.result : null;
  const showPreview = preview && previewed !== null;
  const previewSpace = response?.groups.find((g) => g.results.some((r) => r.id === previewed?.id))?.space;
  const previewKind = previewSpace ? spaceKindOf(previewSpace) : undefined;
  const previewArt = previewKind ? CRYSTAL_ART[previewKind] : (previewSpace?.art ?? ORB_ART);
  const keywordGroups = response
    ? response.groups.flatMap((group) => {
        const rows = group.results.filter((r) => r.match === 'keyword');
        return rows.length > 0 ? [{ space: group.space, rows }] : [];
      })
    : [];
  const itemIndex = (result: SearchResult): number => items.findIndex((item) => item.kind === 'result' && item.result.id === result.id);
  const paletteState = !query.trim() ? 'empty' : state.status === 'ready' ? (state.response.total === 0 ? 'none' : 'results') : state.status;

  return (
    <div className="kf-palette" data-id="palette" data-state={paletteState}>
      <div className="kf-palette-backdrop" aria-hidden="true" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t('palette.label')} className="kf-palette-dialog">
        <label className="kf-palette-input">
          <span className="kf-palette-key">⌘ K</span>
          <input
            ref={input}
            type="text"
            aria-label={t('palette.inputLabel')}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-activedescendant={selected ? optionId(index) : undefined}
            aria-autocomplete="list"
            value={query}
            placeholder={t('palette.placeholder')}
            maxLength={200}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(null);
            }}
            onKeyDown={onKeyDown}
            data-id="palette-input"
          />
          {state.status === 'searching' && <span className="kf-palette-pending">{t('palette.meaningPending')}</span>}
          <span className="kf-palette-esc">Esc</span>
        </label>
        <div className="kf-palette-body">
          <div className="kf-palette-list" id={listId} role="listbox" aria-label={t('palette.label')}>
            {!query.trim() && (
              <>
                <span className="kf-palette-heading">{t('palette.recent')}</span>
                {recent.map((doc, i) => (
                  <a key={doc.id} href={`/d/${encodeURIComponent(doc.id)}`} className="kf-palette-row kf-palette-recent" {...optionProps(i)}>
                    <span className="kf-palette-orb" style={tintStyle(doc.space)} aria-hidden="true" />
                    <span className="kf-palette-row-title">{doc.title}</span>
                    <span className="kf-palette-row-meta">{`${kindLabel(space.t, doc)} · ${timeAgo(locale, doc.updatedAt, now)}`}</span>
                  </a>
                ))}
                <span className="kf-palette-heading kf-palette-heading-gap">{t('palette.commands')}</span>
                <div className="kf-palette-commands">
                  {COMMANDS.map((command, i) => (
                    <a key={command.id} href={command.href} className="kf-palette-command" data-command={command.id} {...optionProps(recent.length + i)}>
                      <Icon name={command.icon} size={18} />
                      {t(command.label)}
                      <span className="kf-palette-command-key">{command.key}</span>
                    </a>
                  ))}
                </div>
              </>
            )}
            {query.trim() && state.status === 'searching' && (
              <div className="kf-palette-loading" aria-busy="true" aria-label={search.t('search.loadingLabel')}>
                {[62, 48, 70, 40, 56, 44].map((width, i) => (
                  <span key={i} className="kf-palette-skeleton">
                    <Skeleton width={28} height={28} circle tone="glow" />
                    <Skeleton width={`${width}%`} height={12} radius={6} tone="glow" />
                  </span>
                ))}
              </div>
            )}
            {query.trim() && state.status === 'failed' && (
              <span className="kf-palette-note" role="alert">
                {t('palette.failed')}
              </span>
            )}
            {response && response.total === 0 && query.trim() && (
              <div className="kf-palette-none" data-id="palette-none">
                <span className="kf-palette-none-ring" aria-hidden="true">
                  <span />
                </span>
                <span className="kf-palette-none-title">{t('palette.none.title')}</span>
                <span className="kf-palette-none-text">{t('palette.none.text', { query: query.trim() })}</span>
                <span className="kf-palette-none-actions">
                  <a href={copilotHref(query.trim())} className="kf-palette-rim-button">
                    {search.t('search.askAi')}
                  </a>
                  <a href={SHELL_PATHS.mine} className="kf-palette-ghost-button">
                    {t('palette.none.note')}
                  </a>
                </span>
              </div>
            )}
            {response && response.total > 0 && (
              <>
                <a href={copilotHref(query.trim())} className="kf-palette-row kf-palette-ask" {...optionProps(0)}>
                  <Icon name="sparkle" size={20} />
                  <span className="kf-palette-row-title">{t('palette.ask', { query: query.trim() })}</span>
                  {index === 0 && <span className="kf-palette-enter">Enter</span>}
                </a>
                {response.exact && <span className="kf-palette-pill">{t('palette.accent')}</span>}
                {(response.meaning === 'failed' || response.meaning === 'off') && <span className="kf-palette-pill" data-id="palette-keyword-only">{t('palette.keywordOnly')}</span>}
                {keywordResults.length > 0 && (
                  <span className="kf-palette-heading">
                    {response.exact ? t('palette.keywordGroupExact', { query: query.trim(), count: keywordResults.length }) : t('palette.keywordGroup', { count: keywordResults.length })}
                  </span>
                )}
                {keywordGroups.map((group) => (
                  <div key={group.space.slug} className="kf-palette-group" role="group" aria-label={spaceName(locale, group.space)}>
                    <span className="kf-palette-space">
                      <span className="kf-palette-space-dot" style={tintStyle(group.space)} aria-hidden="true" />
                      {spaceName(locale, group.space)}
                      <span className="kf-palette-space-count">{t('palette.groupCount', { count: group.rows.length })}</span>
                    </span>
                    {group.rows.map((result) => (
                      <a key={result.id} href={resultHref(result)} className="kf-palette-row kf-palette-result" {...optionProps(itemIndex(result))}>
                        <span className="kf-palette-orb kf-palette-orb-sm" style={tintStyle(result.space)} aria-hidden="true" />
                        <Highlighted parts={result.titleParts} className="kf-palette-row-title" />
                        <OriginTag origin={originOf(result)} variant="inline" className="kf-palette-origin" />
                        <span className="kf-palette-lang">{result.lang.toUpperCase()}</span>
                      </a>
                    ))}
                  </div>
                ))}
                {meaningResults.length > 0 && (
                  <>
                    <span className="kf-palette-heading kf-palette-meaning-heading">
                      {t('palette.meaningGroup')} <span>{t('palette.meaningHint')}</span>
                    </span>
                    {meaningResults.map((result) => (
                      <a key={result.id} href={resultHref(result)} className="kf-palette-row kf-palette-meaning" {...optionProps(itemIndex(result))}>
                        <span className="kf-palette-orb kf-palette-orb-glow" style={tintStyle(result.space)} aria-hidden="true" />
                        <span className="kf-palette-meaning-text">
                          <span className="kf-palette-row-title">{result.title}</span>
                          <span className="kf-palette-why">{result.heading ?? result.snippet.map((p) => p.text).join('')}</span>
                        </span>
                        <span className="kf-palette-meter" aria-hidden="true">
                          <span style={{ width: `${Math.round((result.relevance ?? 0) * 100)}%` }} />
                        </span>
                      </a>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
          {showPreview && previewed && (
            <aside className="kf-palette-preview" aria-label={search.t('search.preview')} data-id="palette-preview">
              <span className="kf-palette-preview-label">{t('palette.previewLabel')}</span>
              <img src={previewArt} alt="" className="kf-palette-preview-art" style={tintStyle(previewed.space)} />
              <span className="kf-palette-preview-title">{previewed.title}</span>
              <span className="kf-palette-preview-text">{previewed.snippet.map((p) => p.text).join('')}</span>
              <span className="kf-palette-preview-meta">{`${kindLabel(space.t, previewed)} · ${langList(previewed.translations)}`}</span>
              <a href={resultHref(previewed)} className="kf-palette-rim-button kf-palette-preview-open">
                {t('palette.open')}
              </a>
            </aside>
          )}
        </div>
        <div className="kf-palette-footer">
          <span>
            <b>↑↓</b> {t('palette.hint.move')}
          </span>
          <span>
            <b>Enter</b> {t('palette.hint.open')}
          </span>
          <span>
            <b>Tab</b> {t('palette.hint.preview')}
          </span>
          <span>
            <b>Esc</b> {t('palette.hint.close')}
          </span>
          <span className="kf-palette-free">{t('palette.free')}</span>
          <a href={searchHref(query)} className="kf-palette-all" data-id="palette-all">
            {t('palette.all')}
            <b aria-hidden="true">⇧↵</b>
          </a>
        </div>
      </div>
    </div>
  );
}
