/**
 * "Của tôi" (board C08, `/me`): the account's own texts and canvases as a small universe (rings by step of review) or
 * a list, what it opened lately, its favourites and its trash, filtered by type and by review status. The panel on the
 * right shows the picked text: its status and the reviewer's reason, where it lives, and what can be done with it.
 * States: loading, failed (retry), the empty own universe ("vũ trụ riêng còn trống": no personal Space, or one without
 * texts), and an empty state per tab. Moving to the trash, restoring and deleting for good confirm with a toast; the
 * first two can be undone.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import {
  type FavoriteDocument,
  type MyDocument,
  type RecentDocument,
  type TrashedDocument,
  emptyTrash,
  fetchFavorites,
  fetchMyDocuments,
  fetchMyRecent,
  fetchTrash,
  purgeFromTrash,
  restoreFromTrash,
  setFavorite,
  trashDocument,
} from '../api/authoring-api';
import { type CanvasListItem, fetchCanvases } from '../api/canvas-api';
import { type SpaceListItem, fetchSpaces } from '../api/content-api';
import { withdrawSubmission } from '../api/review-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { Tabs } from '../ui/tabs';
import { Toast } from '../ui/toast';
import { FavoritesView, RecentView, TrashView } from './mine-lists';
import { type MineMessageKey, useMineText } from './mine-messages';
import {
  type Filters,
  MINE_TABS,
  type MineItem,
  type MineTab,
  NO_FILTER,
  STATUS_FILTERS,
  type StatusFilter,
  TYPE_FILTERS,
  type TypeFilter,
  documentMatches,
  firstPick,
  matches,
  mineItems,
  personalUniverseEmpty,
} from './mine-model';
import { Detail, EmptyUniverse, ListView, OrbitView } from './mine-orbit';
import './mine-screen.css';

export interface MineData {
  docs: MyDocument[];
  recent: RecentDocument[];
  favorites: FavoriteDocument[];
  trash: TrashedDocument[];
  canvases: CanvasListItem[];
  spaces: SpaceListItem[];
}

/** `now`: when the data came, the "now" of its relative times. */
type Load = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; data: MineData; now: number };

async function loadMine(): Promise<MineData> {
  const [docs, recent, favorites, trash, canvases, spaces] = await Promise.all([fetchMyDocuments(), fetchMyRecent(), fetchFavorites(), fetchTrash(), fetchCanvases(), fetchSpaces()]);
  return { docs, recent, favorites, trash, canvases, spaces };
}

/** Everything C08 shows, loaded at once; `retry` loads again, `refresh` reloads quietly after a change. */
function useMineData(): { load: Load; retry(): void; refresh(): Promise<void> } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; load: Load } | null>(null);
  useEffect(() => {
    let current = true;
    loadMine().then(
      (data) => current && setResult({ attempt, load: { status: 'ready', data, now: Date.now() } }),
      (error: unknown) => {
        if (!current) return;
        if (!(error instanceof ApiError)) console.error('my content load failed', error);
        setResult({ attempt, load: { status: 'failed' } });
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const refresh = useCallback(async () => {
    const data = await loadMine();
    setResult({ attempt, load: { status: 'ready', data, now: Date.now() } });
  }, [attempt]);
  return { load: result && result.attempt === attempt ? result.load : { status: 'loading' }, retry, refresh };
}

const TAB_LABEL: Record<MineTab, MineMessageKey> = { universe: 'mine.tab.universe', recent: 'mine.tab.recent', favorites: 'mine.tab.favorites', trash: 'mine.tab.trash' };

function FilterChips<T extends string>({ label, group, values, value, onChange, labelOf, dots }: { label: string; group: string; values: readonly T[]; value: T; onChange(next: T): void; labelOf(value: T): string; dots?: boolean }): ReactNode {
  return (
    <>
      <span className="mine-filter-label" aria-hidden="true">
        {label}
      </span>
      <div role="group" aria-label={group} className="mine-filter-group">
        {values.map((v) => (
          <button key={v} type="button" className="mine-chip" aria-pressed={v === value} data-dot={dots ? v : undefined} onClick={() => onChange(v)} data-id={`mine-filter-${v}`}>
            {dots && <span className="mine-chip-dot" aria-hidden="true" />}
            {labelOf(v)}
          </button>
        ))}
      </div>
    </>
  );
}

type ToastState = { message: string; tone: 'success' | 'warn'; undo?: () => void } | null;
type PurgeTarget = { kind: 'one'; doc: TrashedDocument } | { kind: 'all'; count: number } | null;

const TOAST_MS = 5000;

function failureMessage(error: unknown): MineMessageKey {
  return error instanceof ApiError && error.code === NETWORK_ERROR ? 'mine.toast.offline' : 'mine.toast.failed';
}

/** The "Xoá vĩnh viễn?" dialog: typing the word (XOÁ) unlocks the button. */
function PurgeDialog({ target, onClose, onConfirm }: { target: PurgeTarget; onClose(): void; onConfirm(): void }): ReactNode {
  const { t } = useMineText();
  const [typed, setTyped] = useState('');
  const word = t('mine.purge.word');
  const ok = typed.trim().toLocaleUpperCase() === word;
  const name = target?.kind === 'one' ? target.doc.title : t('mine.purge.all', { count: target?.kind === 'all' ? target.count : 0 });
  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      tone="danger"
      title={t('mine.purge.title')}
      description={t('mine.purge.text', { name })}
      dataId="mine-purge-dialog"
      actions={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            {t('mine.cancel')}
          </Button>
          <Button variant="danger-solid" size="lg" disabled={!ok} onClick={onConfirm} dataId="mine-purge-confirm">
            {t('mine.trash.purge')}
          </Button>
        </>
      }
    >
      <label className="mine-purge-field">
        {t('mine.purge.type', { word })}
        <input type="text" className="mine-purge-input" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" data-id="mine-purge-input" />
      </label>
    </Modal>
  );
}

export function MineScreen(): ReactNode {
  const { t } = useMineText();
  const { load, retry, refresh } = useMineData();
  const [tab, setTab] = useState<MineTab>('universe');
  const [view, setView] = useState<'orbit' | 'list'>('orbit');
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const [picked, setPicked] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [purge, setPurge] = useState<PurgeTarget>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const data = load.status === 'ready' ? load.data : null;
  const now = load.status === 'ready' ? load.now : 0;
  const items = useMemo(() => (data ? mineItems(data.docs, data.canvases, data.spaces) : []), [data]);
  const shown = useMemo(() => items.filter((item) => matches(item, filters)), [items, filters]);
  const selectedKey = picked !== null && items.some((item) => item.key === picked) ? picked : firstPick(items);
  const selected = items.find((item) => item.key === selectedKey) ?? null;
  const personal = data?.spaces.find((space) => space.kind === 'personal') ?? null;
  const ownEmpty = data ? personalUniverseEmpty(data.docs, personal?.slug ?? null) : false;

  /** Runs a change, says how it went (with an undo when there is one), then reloads what it touched. */
  const act = (change: () => Promise<unknown>, done: string, undo?: () => void): void => {
    change().then(
      () => {
        setToast({ message: done, tone: 'success', undo });
        refresh().catch(() => undefined);
      },
      (error: unknown) => setToast({ message: t(failureMessage(error)), tone: 'warn' }),
    );
  };

  const star = (doc: Pick<MyDocument, 'id' | 'favorite'>): void => {
    setFavorite(doc.id, !doc.favorite).then(
      () => refresh().catch(() => undefined),
      (error: unknown) => setToast({ message: t(failureMessage(error)), tone: 'warn' }),
    );
  };

  const moveToTrash = (item: MineItem): void =>
    act(
      () => trashDocument(item.id),
      t('mine.toast.trashed', { title: item.title }),
      () => act(() => restoreFromTrash(item.id), t('mine.toast.restored', { title: item.title })),
    );

  const withdraw = (item: MineItem): void => act(() => withdrawSubmission(item.id), t('mine.toast.withdrawn', { title: item.title }));

  const restore = (doc: TrashedDocument): void =>
    act(
      () => restoreFromTrash(doc.id),
      t('mine.toast.restored', { title: doc.title }),
      () => act(() => trashDocument(doc.id), t('mine.toast.trashed', { title: doc.title })),
    );

  const confirmPurge = (): void => {
    const target = purge;
    setPurge(null);
    if (target?.kind === 'one') act(() => purgeFromTrash(target.doc.id), t('mine.toast.purged', { title: target.doc.title }));
    else if (target?.kind === 'all') act(() => emptyTrash(), t('mine.toast.emptied'));
  };

  const counts: Record<MineTab, number> = data
    ? { universe: items.length, recent: data.recent.length, favorites: data.favorites.length, trash: data.trash.length }
    : { universe: 0, recent: 0, favorites: 0, trash: 0 };

  let body: ReactNode;
  if (!data) {
    body =
      load.status === 'failed' ? (
        <div className="mine-state" data-id="mine-failed">
          <p role="alert">{t('mine.failed')}</p>
          <Button variant="rim" size="lg" onClick={retry} dataId="mine-retry">
            {t('mine.retry')}
          </Button>
        </div>
      ) : (
        <p className="mine-state" role="status" data-id="mine-loading">
          {t('mine.loading')}
        </p>
      );
  } else if (tab === 'universe') {
    if (items.length === 0) body = <EmptyUniverse hasSpace={personal !== null} />;
    else if (view === 'orbit') body = <OrbitView items={shown} selected={selectedKey} onPick={setPicked} centre={ownEmpty ? 'first' : 'crystal'} />;
    else body = <ListView items={shown} selected={selectedKey} onPick={setPicked} now={now} />;
  } else if (tab === 'recent') {
    body = <RecentView docs={data.recent.filter((doc) => documentMatches(doc, filters))} onStar={star} now={now} />;
  } else if (tab === 'favorites') {
    body = <FavoritesView docs={data.favorites.filter((doc) => documentMatches(doc, filters))} onStar={star} />;
  } else {
    body = (
      <TrashView
        docs={data.trash.filter((doc) => documentMatches(doc, filters))}
        now={now}
        onRestore={restore}
        onPurge={(doc) => setPurge({ kind: 'one', doc })}
        onEmpty={() => setPurge({ kind: 'all', count: data.trash.length })}
      />
    );
  }

  const state = load.status !== 'ready' ? load.status : tab === 'universe' && items.length === 0 ? 'empty-universe' : 'ready';
  return (
    <AppShell screen="C08" rail="mine" className="mine-shell" breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('mine.crumb') }]}>
      <div className="mine-screen" data-id="mine-screen" data-state={state} data-tab={tab}>
        <div className="mine-content">
          <div className="mine-bar">
            <Tabs
              label={t('mine.tabs')}
              items={MINE_TABS.map((id) => ({ id, label: t(TAB_LABEL[id]), count: counts[id] }))}
              value={tab}
              onChange={(id) => setTab(MINE_TABS.find((candidate) => candidate === id) ?? 'universe')}
              panelIdPrefix="mine-panel"
              className="mine-tabs"
              dataId="mine-tab"
            />
            <span className="mine-bar-fill" />
            {tab === 'universe' && (
              <div role="group" aria-label={t('mine.views')} className="mine-views">
                {(['orbit', 'list'] as const).map((v) => (
                  <button key={v} type="button" className="mine-view" aria-pressed={view === v} onClick={() => setView(v)} data-id={`mine-view-${v}`}>
                    {t(`mine.view.${v}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mine-filters">
            <FilterChips<TypeFilter>
              label={t('mine.filter.type')}
              group={t('mine.filter.typeGroup')}
              values={TYPE_FILTERS}
              value={filters.type}
              onChange={(type) => setFilters((current) => ({ ...current, type }))}
              labelOf={(v) => t(`mine.type.${v}`)}
            />
            <span className="mine-filter-gap" />
            <FilterChips<StatusFilter>
              label={t('mine.filter.status')}
              group={t('mine.filter.statusGroup')}
              values={STATUS_FILTERS}
              value={filters.status}
              onChange={(status) => setFilters((current) => ({ ...current, status }))}
              labelOf={(v) => t(`mine.statusFilter.${v}`)}
              dots
            />
          </div>
          <section id={`mine-panel-${tab}`} role="tabpanel" aria-label={t(TAB_LABEL[tab])} className="mine-section" data-id="mine-section">
            {body}
          </section>
          <aside aria-label={t('mine.details')} className="mine-aside" data-id="mine-aside">
            {data && selected ? (
              <Detail item={selected} onStar={star} onTrash={moveToTrash} onWithdraw={withdraw} now={now} />
            ) : (
              <span className="mine-aside-none">{data && items.length === 0 ? t('mine.empty.aside') : t('mine.pickOne')}</span>
            )}
          </aside>
          {toast && (
            <Toast
              tone={toast.tone}
              message={toast.message}
              onUndo={
                toast.undo
                  ? () => {
                      const undo = toast.undo;
                      setToast(null);
                      undo?.();
                    }
                  : undefined
              }
              className="mine-toast"
              dataId="mine-toast"
            />
          )}
        </div>
        <PurgeDialog key={purge ? (purge.kind === 'one' ? purge.doc.id : 'all') : 'closed'} target={purge} onClose={() => setPurge(null)} onConfirm={confirmPurge} />
      </div>
    </AppShell>
  );
}
