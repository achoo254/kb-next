/**
 * Versions and activity of a document (board C17) at /d/:id/history: the timeline (versions, review steps, hiding
 * and showing, filtered by kind), the difference between two picked versions, a version's full text, and restoring
 * an older one as a new version (who may edit the document). States: loading, the timeline, a filter with nothing,
 * a single version, comparing / compare failed, restore confirm / done / failed, and the document not found,
 * not readable or hidden, offline, or failing to load.
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { readErrorOf } from '../api/content-api';
import { type DocumentHistory, type HistoryEvent, type StoredVersion, type VersionDiff, fetchDiff, fetchHistory, fetchVersion, restoreVersion } from '../api/history-api';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { EmptyState } from '../ui/empty-state';
import { Icon } from '../ui/icon';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { ErrorPanel } from './error-screen';
import { type HistoryMessageKey, useHistoryText } from './history-messages';
import { HISTORY_FILTERS, type HistoryFilter, avatarOf, defaultPair, eventText, eventTime, pickVersion, shown, tagOf, whoText } from './history-model';
import { ReaderMarkdown } from './reader-markdown';
import { spaceName } from './space-panels';
import './history-screen.css';

type HistoryFailure = 'not-found' | 'no-access' | 'hidden' | 'offline' | 'server';
type HistoryLoad = { status: 'loading' } | { status: 'ready'; history: DocumentHistory } | { status: 'failed'; error: HistoryFailure };

function loadError(error: unknown): HistoryFailure {
  const read = readErrorOf(error);
  if (read) return read;
  return error instanceof ApiError && error.code === NETWORK_ERROR ? 'offline' : 'server';
}

function useHistory(id: string): { load: HistoryLoad; reload(): void } {
  const [result, setResult] = useState<{ key: string; load: HistoryLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${id}|${attempt}`;
  useEffect(() => {
    let current = true;
    fetchHistory(id).then(
      (history) => current && setResult({ key, load: { status: 'ready', history } }),
      (error: unknown) => {
        if (!current) return;
        if (!(error instanceof ApiError)) console.error('history load failed', error);
        setResult({ key, load: { status: 'failed', error: loadError(error) } });
      },
    );
    return () => {
      current = false;
    };
  }, [id, key]);
  return { load: result?.key === key ? result.load : { status: 'loading' }, reload: useCallback(() => setAttempt((n) => n + 1), []) };
}

type DiffLoad = { status: 'loading' } | { status: 'ready'; diff: VersionDiff } | { status: 'failed' };

function useDiff(id: string, pair: [number, number] | null): { diff: DiffLoad; retry(): void } {
  const [result, setResult] = useState<{ key: string; diff: DiffLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const from = pair?.[0] ?? 0;
  const to = pair?.[1] ?? 0;
  const key = `${id}|${from}|${to}|${attempt}`;
  useEffect(() => {
    if (from === to) return;
    let current = true;
    fetchDiff(id, from, to).then(
      (diff) => current && setResult({ key, diff: { status: 'ready', diff } }),
      (error: unknown) => {
        if (!current) return;
        if (!(error instanceof ApiError)) console.error('diff failed', error);
        setResult({ key, diff: { status: 'failed' } });
      },
    );
    return () => {
      current = false;
    };
  }, [id, from, to, key]);
  return { diff: result?.key === key ? result.diff : { status: 'loading' }, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}

export function HistoryScreen({ id }: { id: string }): ReactNode {
  const { t, locale } = useHistoryText();
  const { load, reload } = useHistory(id);
  const [notice, setNotice] = useState<string | null>(null);
  const doc = load.status === 'ready' ? load.history.document : null;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2800);
    return () => clearTimeout(timer);
  }, [notice]);
  const crumbs: BreadcrumbItem[] = doc
    ? [
        { label: 'Universe', href: SHELL_PATHS.universe },
        { label: spaceName(locale, doc.space), href: `/s/${encodeURIComponent(doc.space.slug)}` },
        ...(doc.collection ? [{ label: spaceName(locale, doc.collection), href: `/s/${encodeURIComponent(doc.space.slug)}` }] : []),
        { label: doc.title, href: `/d/${encodeURIComponent(doc.id)}` },
        { label: t('history.title') },
      ]
    : [{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('history.title') }];
  return (
    <AppShell
      screen="C17"
      rail="spaces"
      view="docs"
      veil="strong"
      breadcrumb={crumbs}
      spaceHref={doc ? `/s/${encodeURIComponent(doc.space.slug)}` : SHELL_PATHS.universe}
      docHref={`/d/${encodeURIComponent(id)}`}
      className="history-shell"
    >
      <div className="history-screen" data-id="history-screen" data-state={load.status === 'failed' ? load.error : load.status}>
        {load.status === 'loading' && <HistoryLoading />}
        {load.status === 'failed' && <HistoryFailed error={load.error} onRetry={reload} />}
        {load.status === 'ready' && (
          <HistoryBody
            key={load.history.currentVersion}
            history={load.history}
            onRestored={(from, to) => {
              setNotice(t('history.restored', { from, to }));
              reload();
            }}
          />
        )}
      </div>
      {notice && (
        <div className="history-toast" role="status" data-id="history-toast">
          <span className="history-toast-dot" aria-hidden="true" />
          {notice}
        </div>
      )}
    </AppShell>
  );
}

function HistoryLoading(): ReactNode {
  const { t } = useHistoryText();
  return (
    <section className="history-panel history-timeline" aria-busy="true" aria-label={t('history.loading')} data-id="history-loading">
      <Skeleton width="70%" height={32} radius={8} tone="glow" />
      {[0, 1, 2, 3, 4].map((n) => (
        <Skeleton key={n} height={62} radius={18} tone="glow" />
      ))}
    </section>
  );
}

function HistoryFailed({ error, onRetry }: { error: HistoryFailure; onRetry(): void }): ReactNode {
  const { t } = useHistoryText();
  if (error === 'offline') {
    return <EmptyState art="planet-offline" title={t('history.offline.title')} description={t('history.offline.text')} action={{ label: t('history.retry'), onClick: onRetry }} tone="accent" className="history-state" dataId="history-offline" />;
  }
  return <ErrorPanel kind={error === 'server' ? 'server' : error === 'not-found' ? 'not-found' : 'forbidden'} onRetry={onRetry} className="history-state" />;
}

function EventRow({ event, pair, current, onPick }: { event: HistoryEvent; pair: [number, number] | null; current: number; onPick(version: number): void }): ReactNode {
  const { t, locale } = useHistoryText();
  const picked = event.kind === 'version' && pair !== null && pair.includes(event.version);
  const avatar = avatarOf(event);
  const tag = tagOf(event);
  const isNow = event.kind === 'version' && event.version === current;
  return (
    <li className="history-event" data-kind={event.kind} data-picked={picked || undefined} data-now={isNow || undefined}>
      <span className="history-node" aria-hidden="true" />
      <div className="history-card">
        <span className="history-avatar" data-tone={avatar.tone} aria-hidden="true">
          {avatar.letters}
        </span>
        <div className="history-card-text">
          <div className="history-card-title">{eventText(t, event)}</div>
          <div className="history-card-who">
            {whoText(t, event)} · <time dateTime={event.at}>{eventTime(locale, event.at)}</time>
          </div>
        </div>
        {event.kind === 'version' && (
          <button type="button" className="history-version" aria-pressed={picked} aria-label={t('history.pick', { version: event.version })} onClick={() => onPick(event.version)} data-id={`history-pick-${event.version}`}>
            {t(isNow ? 'history.versionNow' : 'history.versionChip', { version: event.version })}
          </button>
        )}
        {tag && (
          <span className="history-tag" data-tone={tag.tone}>
            {t(tag.key)}
          </span>
        )}
      </div>
    </li>
  );
}

const LINE_LABEL: Record<'add' | 'del' | 'same' | 'gap', HistoryMessageKey> = { add: 'history.line.add', del: 'history.line.del', same: 'history.line.same', gap: 'history.line.gap' };
const LINE_SIGN = { add: '+', del: '−', same: '', gap: '⋯' } as const;

function Comparison({ id, history, pair, onRestored }: { id: string; history: DocumentHistory; pair: [number, number] | null; onRestored(from: number, to: number): void }): ReactNode {
  const { t, locale } = useHistoryText();
  const { diff, retry } = useDiff(id, pair);
  const [viewing, setViewing] = useState<{ version: number; text: StoredVersion | 'loading' | 'failed' } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [restoreError, setRestoreError] = useState<HistoryMessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const older = pair?.[0] ?? null;
  const canPickOlder = older !== null && older !== history.currentVersion;

  const view = (version: number): void => {
    setViewing({ version, text: 'loading' });
    fetchVersion(id, version).then(
      (text) => setViewing({ version, text }),
      () => setViewing({ version, text: 'failed' }),
    );
  };

  const restore = async (): Promise<void> => {
    if (older === null) return;
    setBusy(true);
    setRestoreError(null);
    try {
      const done = await restoreVersion(id, older);
      setConfirm(false);
      onRestored(older, done.version);
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('restore failed', error);
      setConfirm(false);
      setRestoreError(error instanceof ApiError && error.code === 'stale' ? 'history.restoreStale' : 'history.restoreFailed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="history-panel history-compare" aria-label={t('history.compare')} data-id="history-compare">
      {pair && pair[0] !== pair[1] ? (
        <>
          <div className="history-compare-head">
            <span className="history-compare-chip">v{pair[0]}</span>
            <Icon name="swap" size={22} className="history-compare-swap" />
            <span className="history-compare-chip" data-newer="true">
              v{pair[1]}
            </span>
            <span className="history-compare-gap" />
            {diff.status === 'ready' && (
              <>
                <span className="history-count" data-tone="add">
                  {t('history.added', { count: diff.diff.added })}
                </span>
                <span className="history-count" data-tone="del">
                  {t('history.removed', { count: diff.diff.removed })}
                </span>
              </>
            )}
          </div>
          <div className="history-lines" role="list" aria-label={t('history.changes')} aria-busy={diff.status === 'loading' || undefined} data-id="history-lines" data-state={diff.status}>
            {diff.status === 'loading' && <span className="history-muted" role="status">{t('history.diffLoading')}</span>}
            {diff.status === 'failed' && (
              <span className="history-muted" role="alert">
                {t('history.diffFailed')}{' '}
                <button type="button" className="history-link-button" onClick={retry}>
                  {t('history.retry')}
                </button>
              </span>
            )}
            {diff.status === 'ready' && diff.diff.lines.length === 0 && <span className="history-muted">{t('history.same')}</span>}
            {diff.status === 'ready' &&
              diff.diff.lines.map((line, index) => (
                <div key={index} role="listitem" className="history-line" data-op={line.op} data-heading={line.heading || undefined}>
                  <span className="history-line-sign" aria-label={t(LINE_LABEL[line.op])}>
                    {LINE_SIGN[line.op]}
                  </span>
                  <span className="history-line-text">{line.text}</span>
                </div>
              ))}
          </div>
        </>
      ) : (
        <p className="history-muted history-only-one">{t('history.onlyOne')}</p>
      )}
      <div className="history-compare-foot">
        <span className="history-note">{restoreError ? <span role="alert">{t(restoreError)}</span> : t('history.note')}</span>
        {older !== null && (
          <button type="button" className="history-glass-button" onClick={() => view(older)} data-id="history-view">
            {t('history.view', { version: older })}
          </button>
        )}
        {canPickOlder && (
          <button
            type="button"
            className="history-rim-button"
            aria-disabled={!history.canRestore || undefined}
            title={history.canRestore ? undefined : t('history.restoreNoRight')}
            onClick={() => {
              if (history.canRestore) setConfirm(true);
            }}
            data-id="history-restore"
          >
            {t('history.restore', { version: older })}
          </button>
        )}
      </div>
      {confirm && older !== null && (
        <Modal
          open
          onClose={() => setConfirm(false)}
          title={t('history.confirm.title', { version: older })}
          description={t('history.confirm.text')}
          dataId="history-confirm"
          actions={
            <>
              <Button variant="glass" onClick={() => setConfirm(false)}>
                {t('history.confirm.cancel')}
              </Button>
              <Button variant="rim" disabled={busy} onClick={() => void restore()} dataId="history-confirm-restore">
                {t('history.confirm.restore')}
              </Button>
            </>
          }
        />
      )}
      {viewing && (
        <Modal
          open
          onClose={() => setViewing(null)}
          title={viewing.text !== 'loading' && viewing.text !== 'failed' ? t('history.versionTitle', { version: viewing.version, time: eventTime(locale, viewing.text.savedAt) }) : t('history.view', { version: viewing.version })}
          dataId="history-version"
          actions={
            <Button variant="glass" onClick={() => setViewing(null)}>
              {t('history.close')}
            </Button>
          }
        >
          <div className="history-version-text">
            {viewing.text === 'loading' && <span role="status">{t('history.versionLoading')}</span>}
            {viewing.text === 'failed' && <span role="alert">{t('history.diffFailed')}</span>}
            {viewing.text !== 'loading' && viewing.text !== 'failed' && <ReaderMarkdown markdown={viewing.text.markdown} />}
          </div>
        </Modal>
      )}
    </section>
  );
}

function HistoryBody({ history, onRestored }: { history: DocumentHistory; onRestored(from: number, to: number): void }): ReactNode {
  const { t } = useHistoryText();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [pair, setPair] = useState<[number, number] | null>(() => defaultPair(history.events));
  const events = shown(history.events, filter);

  return (
    <>
      <section className="history-panel history-timeline" aria-label={t('history.timeline')} data-id="history-timeline">
        <div className="history-head">
          <h1 className="history-title">{t('history.title')}</h1>
          <span className="history-hint">{t('history.pickTwo')}</span>
        </div>
        <div className="history-filters" role="group" aria-label={t('history.filters')}>
          {HISTORY_FILTERS.map((f) => (
            <button key={f} type="button" className="history-filter" aria-pressed={filter === f} onClick={() => setFilter(f)} data-id={`history-filter-${f}`}>
              {t(`history.filter.${f}`)}
            </button>
          ))}
        </div>
        {events.length > 0 ? (
          <ol className="history-events">
            {events.map((event, index) => (
              <EventRow key={`${event.kind}-${event.at}-${index}`} event={event} pair={pair} current={history.currentVersion} onPick={(v) => setPair((p) => (p ? pickVersion(p, v) : [v, v]))} />
            ))}
          </ol>
        ) : (
          <p className="history-muted" data-id="history-empty">
            {t('history.empty')}
          </p>
        )}
      </section>
      <Comparison id={history.document.id} history={history} pair={pair} onRestored={onRestored} />
    </>
  );
}
