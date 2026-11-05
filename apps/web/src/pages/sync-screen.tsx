/**
 * Offline sync (board H04, `/sync`): what this browser keeps that the server does not have yet (Office drafts from
 * the editor, note drafts), the connection (offline, reconnecting, back online), a conflict between a draft and a
 * newer server version side by side (keep this one, keep the other, keep both), what still works offline, and a
 * warning when the browser's storage is nearly full.
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { type FileKind, MAX_UPLOAD_BYTES, fetchFileBytes } from '../api/files-api';
import { AppShell } from '../layout/app-shell';
import { ILLUSTRATIONS } from '../ui/art';
import { Icon } from '../ui/icon';
import { type EditorDraft, listDrafts } from './editor-drafts';
import { currentAccountId } from './office-account';
import { FileBadge } from './file-badge';
import { clockTime, syncReasonKey, useOfficeText } from './office-messages';
import { type OfficeEntry, type StorageStatus, listEntries, pending, storageStatus, warmKinds } from './office-store';
import { OFFICE_CHANGE, type SyncReport, keepBoth, keepMine, keepServer, syncAll, syncEntry, syncing } from './office-sync';
import { type VersionComparison, compareParagraphs, officeParagraphs } from './office-text';
import './sync-screen.css';

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

export type Connection = 'offline' | 'reconnecting' | 'online';

/** The browser's connection, with "Kết nối lại" checking the server is reachable before saying online. */
export function useConnection(): { connection: Connection; reconnect(): void; cancel(): void } {
  const [connection, setConnection] = useState<Connection>(() => (navigator.onLine ? 'online' : 'offline'));
  const [attempt, setAttempt] = useState<AbortController | null>(null);
  useEffect(() => {
    const online = (): void => setConnection('online');
    const offline = (): void => setConnection('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);
  const reconnect = useCallback(() => {
    const controller = new AbortController();
    setAttempt(controller);
    setConnection('reconnecting');
    fetch('/healthz', { cache: 'no-store', signal: controller.signal }).then(
      (res) => !controller.signal.aborted && setConnection(res.ok ? 'online' : 'offline'),
      () => !controller.signal.aborted && setConnection('offline'),
    );
  }, []);
  const cancel = useCallback(() => {
    attempt?.abort();
    setConnection(navigator.onLine ? 'online' : 'offline');
  }, [attempt]);
  return { connection, reconnect, cancel };
}

interface SyncData {
  entries: OfficeEntry[];
  notes: EditorDraft[];
  storage: StorageStatus | null;
  /** Drafts are being sent now. */
  sending: boolean;
}

function useSyncData(): { data: SyncData; refresh(): void } {
  const [data, setData] = useState<SyncData>({ entries: [], notes: [], storage: null, sending: false });
  const refresh = useCallback(() => {
    void currentAccountId()
      .then((userId) => Promise.all([userId ? listEntries(userId) : [], userId ? listDrafts(userId) : [], storageStatus()]))
      .then(([entries, notes, storage]) => setData({ entries, notes, storage, sending: syncing() }));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(OFFICE_CHANGE, refresh);
    return () => window.removeEventListener(OFFICE_CHANGE, refresh);
  }, [refresh]);
  return { data, refresh };
}

function QueueRow({ entry, connection, sending, onRetry }: { entry: OfficeEntry; connection: Connection; sending: boolean; onRetry(): void }): ReactNode {
  const { t } = useOfficeText();
  const state = sending ? 'sending' : entry.state === 'conflict' ? 'conflict' : entry.state === 'failed' ? 'failed' : connection === 'online' ? 'ready' : 'wait';
  const label =
    state === 'failed'
      ? t('sync.state.failed', { reason: t(syncReasonKey(entry.error), { max: MAX_MB }) })
      : t(state === 'sending' ? 'sync.state.sending' : state === 'conflict' ? 'sync.state.conflict' : state === 'ready' ? 'sync.state.ready' : 'sync.state.wait');
  return (
    <li className="sync-row" data-state={state} data-id="sync-row">
      <div className="sync-row-head">
        <FileBadge kind={entry.kind} name={entry.name} size={30} />
        <span className="sync-row-text">
          <span className="sync-row-name">{entry.name}</span>
          <span className="sync-row-what">{t('sync.edited', { time: clockTime(entry.editedAt ?? entry.usedAt) })}</span>
        </span>
        {state === 'sending' && <span className="sync-spin" aria-hidden="true" />}
      </div>
      <div className="sync-row-foot">
        <span className="sync-pill" data-state={state}>
          {label}
        </span>
        {state === 'failed' && (
          <button type="button" className="sync-retry" onClick={onRetry} aria-label={t('sync.retryName', { name: entry.name })}>
            {t('sync.retry')}
          </button>
        )}
      </div>
      {state === 'sending' && (
        <span className="sync-row-bar" aria-hidden="true">
          <span />
        </span>
      )}
    </li>
  );
}

function NoteRow({ draft, connection }: { draft: EditorDraft; connection: Connection }): ReactNode {
  const { t } = useOfficeText();
  const fresh = draft.doc.version <= 1 && draft.doc.status === 'draft';
  return (
    <li className="sync-row" data-state={connection === 'online' ? 'ready' : 'wait'} data-id="sync-note">
      <div className="sync-row-head">
        <FileBadge kind="note" name={draft.title} size={30} />
        <span className="sync-row-text">
          <span className="sync-row-name">{draft.title || draft.doc.title}</span>
          <span className="sync-row-what">{fresh ? t('sync.newNote') : t('sync.noteEdited', { time: clockTime(draft.editedAt) })}</span>
        </span>
      </div>
      <div className="sync-row-foot">
        {connection === 'online' ? (
          <a className="sync-pill sync-pill-link" data-state="ready" href={`/d/${encodeURIComponent(draft.id)}/edit`} aria-label={t('sync.openNote', { name: draft.title || draft.doc.title })}>
            {t('sync.state.openNote')}
          </a>
        ) : (
          <span className="sync-pill" data-state="wait">
            {t('sync.state.wait')}
          </span>
        )}
      </div>
    </li>
  );
}

type Side = { kind: 'ready'; paragraphs: string[] } | { kind: 'loading' } | { kind: 'missing' };

/** Both versions' paragraphs, the server's fetched when it was not kept and there is a connection. */
function useComparison(entry: OfficeEntry, connection: Connection): VersionComparison | null {
  const [local, setLocal] = useState<Side>({ kind: 'loading' });
  const [server, setServer] = useState<Side>({ kind: 'loading' });
  const kind: FileKind = entry.kind;
  useEffect(() => {
    let live = true;
    void officeParagraphs(entry.bytes, kind).then((paragraphs) => live && setLocal({ kind: 'ready', paragraphs }));
    return () => {
      live = false;
    };
  }, [entry.bytes, kind]);
  const conflict = entry.conflict;
  useEffect(() => {
    let live = true;
    const read = async (): Promise<Side> => {
      const bytes = conflict?.bytes ?? (conflict?.fileId && connection === 'online' ? await fetchFileBytes(conflict.fileId).catch(() => null) : null);
      return bytes ? { kind: 'ready', paragraphs: await officeParagraphs(bytes, kind) } : { kind: 'missing' };
    };
    void read().then((side) => live && setServer(side));
    return () => {
      live = false;
    };
  }, [conflict, connection, kind]);
  if (local.kind === 'loading' || server.kind === 'loading') return null;
  return compareParagraphs(local.kind === 'ready' ? local.paragraphs : [], server.kind === 'ready' ? server.paragraphs : []);
}

type Picked = 'local' | 'server' | 'both';

/** What a choice came to (shown after the conflict leaves the queue). */
interface ChoiceResult {
  ok: boolean;
  text: string;
}

function ConflictPanel({ entry, connection, title, onResult }: { entry: OfficeEntry; connection: Connection; title: string; onResult(result: ChoiceResult): void }): ReactNode {
  const { t } = useOfficeText();
  const comparison = useComparison(entry, connection);
  const [picked, setPicked] = useState<Picked | null>(null);
  const setResult = onResult;
  const conflict = entry.conflict;
  const serverKnown = comparison !== null && (comparison.serverTitle !== null || comparison.server !== null);

  const choose = async (choice: Picked): Promise<void> => {
    setPicked(choice);
    try {
      if (choice === 'local') {
        const outcome = await keepMine(entry.documentId);
        setResult(outcome === 'synced' ? { ok: true, text: t('sync.kept.local') } : { ok: false, text: t('sync.keepFailed') });
      } else if (choice === 'server') {
        setResult((await keepServer(entry.documentId)) ? { ok: true, text: t('sync.kept.server') } : { ok: false, text: t('sync.keepFailed') });
      } else {
        const name = await keepBoth(entry.documentId, t('sync.offlineCopy'));
        setResult(name ? { ok: true, text: t('sync.kept.both', { name }) } : { ok: false, text: t('sync.keepFailed') });
      }
    } catch {
      setResult({ ok: false, text: t('sync.keepFailed') });
    }
  };

  const offline = connection !== 'online';
  return (
    <>
      <div className="sync-conflict-head">
        <span className="sync-conflict-mark">
          <Icon name="conflict" size={20} />
        </span>
        <div className="sync-conflict-text">
          <span className="sync-conflict-title">{t('sync.conflictTitle', { name: entry.name })}</span>
          <span className="sync-conflict-sub">{t('sync.conflictText')}</span>
        </div>
      </div>
      <div className="sync-versions">
        <button type="button" className="sync-version" data-side="local" aria-pressed={picked === 'local' || picked === 'both'} onClick={() => setPicked('local')}>
          <span className="sync-version-label">
            <Icon name="monitor" size={16} />
            {t('sync.local', { time: clockTime(entry.editedAt ?? entry.usedAt) })}
          </span>
          <span className="sync-version-title">{comparison?.localTitle ?? title}</span>
          <span className="sync-version-body">
            {comparison?.context && <>{comparison.context} </>}
            {comparison?.local ? <mark>{comparison.local}</mark> : comparison ? t('sync.noText') : null}
          </span>
          <span className="sync-line" style={{ width: '90%' }} />
          <span className="sync-line" style={{ width: '70%' }} />
          <span className="sync-version-foot">{comparison && comparison.localExtra > 0 ? t('sync.localExtra', { count: comparison.localExtra }) : t('sync.localSame')}</span>
        </button>
        <button type="button" className="sync-version" data-side="server" aria-pressed={picked === 'server' || picked === 'both'} onClick={() => setPicked('server')}>
          <span className="sync-version-label">
            <Icon name="cloud-copy" size={16} />
            {t('sync.server', { time: conflict ? clockTime(conflict.savedAt) : '' })}
          </span>
          <span className="sync-version-title">{comparison?.serverTitle ?? title}</span>
          <span className="sync-version-body">
            {serverKnown ? (
              <>
                {comparison.context && <>{comparison.context} </>}
                {comparison.server && <mark>{comparison.server}</mark>}
              </>
            ) : comparison ? (
              t('sync.serverOffline')
            ) : null}
          </span>
          <span className="sync-line" style={{ width: '90%' }} />
          <span className="sync-line" style={{ width: '76%' }} />
          <span className="sync-version-foot">
            {conflict && comparison && comparison.serverExtra > 0 ? t('sync.serverExtra', { version: conflict.version, count: comparison.serverExtra }) : t('sync.serverSame', { version: conflict?.version ?? 0 })}
          </span>
        </button>
      </div>
      <div className="sync-choices">
        <button type="button" className="sync-choice" data-on={picked === 'local' || undefined} data-tone="local" disabled={offline} onClick={() => void choose('local')}>
          {t('sync.keepMine')}
        </button>
        <button type="button" className="sync-choice" data-on={picked === 'server' || undefined} data-tone="server" disabled={offline} onClick={() => void choose('server')}>
          {t('sync.keepServer')}
        </button>
        <button type="button" className="sync-choice" data-on={picked === 'both' || undefined} data-tone="both" disabled={offline} onClick={() => void choose('both')}>
          {t('sync.keepBoth')}
        </button>
      </div>
    </>
  );
}

function OfflineCard({ connection, report, backAt }: { connection: Connection; report: SyncReport | null; backAt: number | null }): ReactNode {
  const { t } = useOfficeText();
  if (connection === 'online' && report && backAt !== null) {
    return (
      <div className="sync-side sync-side-online" role="status" data-id="sync-online">
        <span className="sync-online-mark">
          <Icon name="check" size={22} strokeWidth={3} />
        </span>
        <div className="sync-online-text">
          <span className="sync-online-title">{report.synced > 0 ? t('sync.synced', { count: report.synced }) : t('sync.syncedNone')}</span>
          <span className="sync-online-sub">{t('sync.backAt', { time: clockTime(backAt) })}</span>
        </div>
      </div>
    );
  }
  const warm = warmKinds();
  return (
    <div className="sync-side" data-id="sync-offline-card">
      <img className="sync-side-art" src={ILLUSTRATIONS['planet-offline']} alt="" aria-hidden="true" />
      <span className="sync-side-title">{t('sync.can')}</span>
      {(['sync.can.read', 'sync.can.edit', 'sync.can.find'] as const).map((key) => (
        <span key={key} className="sync-can">
          <Icon name="check" size={16} className="sync-can-yes" />
          {t(key)}
        </span>
      ))}
      <span className="sync-can sync-can-no">
        <Icon name="close" size={16} strokeWidth={2.6} className="sync-can-x" />
        {t('sync.cannot')}
      </span>
      <span className="sync-warm">{warm.length > 0 ? t('sync.warm', { kinds: warm.map((kind) => t(`sync.kind.${kind}`)).join(', ') }) : t('sync.warmNone')}</span>
    </div>
  );
}

function Banner({ connection, onReconnect, onCancel, onSync }: { connection: Connection; onReconnect(): void; onCancel(): void; onSync(): void }): ReactNode {
  const { t } = useOfficeText();
  const icon = connection === 'offline' ? 'wifi-off' : connection === 'reconnecting' ? 'reconnect' : 'wifi';
  return (
    <div className="sync-banner" data-state={connection} role="status" data-id="sync-banner">
      <Icon name={icon} size={20} className={connection === 'reconnecting' ? 'sync-banner-spin' : undefined} />
      <span className="sync-banner-text">{t(`sync.banner.${connection}`)}</span>
      <button type="button" className="sync-banner-button" onClick={connection === 'offline' ? onReconnect : connection === 'reconnecting' ? onCancel : onSync}>
        {t(connection === 'offline' ? 'sync.reconnect' : connection === 'reconnecting' ? 'sync.cancel' : 'sync.syncNow')}
      </button>
    </div>
  );
}

export function SyncScreen(): ReactNode {
  const { t } = useOfficeText();
  const { connection, reconnect, cancel } = useConnection();
  const { data } = useSyncData();
  const [report, setReport] = useState<SyncReport | null>(null);
  const [backAt, setBackAt] = useState<number | null>(null);
  const [result, setResult] = useState<ChoiceResult | null>(null);
  const queue = pending(data.entries);
  const conflict = queue.find((entry) => entry.state === 'conflict') ?? null;

  const sync = useCallback(() => {
    syncAll().then(
      (done) => {
        setReport(done);
        setBackAt(Date.now());
      },
      (error: unknown) => console.warn('sync failed', error),
    );
  }, []);

  // Back online: send what waits.
  useEffect(() => {
    if (connection === 'online') sync();
  }, [connection, sync]);

  const usedMb = data.storage?.usage !== null && data.storage?.usage !== undefined ? Math.round(data.storage.usage / (1024 * 1024)) : 0;
  const usableMb = data.storage?.usable ? Math.round(data.storage.usable / (1024 * 1024)) : 0;
  const count = queue.length + data.notes.length;

  return (
    <AppShell screen="H04" veil="radial" className="sync-shell">
      <div className="sync-screen" data-id="sync-screen" data-connection={connection}>
        <div className="sync-stage">
          <section className="sync-queue" aria-labelledby="sync-queue-title">
            <div className="sync-queue-head">
              <h1 id="sync-queue-title" className="sync-queue-title">
                {t('sync.queue')}
              </h1>
              <span className="sync-count">{count}</span>
            </div>
            {count === 0 ? (
              <p className="sync-muted">{t('sync.empty')}</p>
            ) : (
              <ul className="sync-rows">
                {queue.map((entry) => (
                  <QueueRow key={entry.documentId} entry={entry} connection={connection} sending={data.sending && entry.state === 'draft' && connection === 'online'} onRetry={() => void syncEntry(entry.documentId)} />
                ))}
                {data.notes.map((draft) => (
                  <NoteRow key={draft.id} draft={draft} connection={connection} />
                ))}
              </ul>
            )}
            {data.storage?.near && (
              <p className="sync-storage" role="alert" data-id="sync-storage">
                {t('sync.storageNear', { used: usedMb, usable: usableMb })}
              </p>
            )}
            <span className="sync-muted">{t('sync.safe')}</span>
          </section>

          <section className="sync-conflict" aria-label={t('sync.conflict')}>
            {conflict ? (
              <ConflictPanel key={`${conflict.documentId}-${conflict.conflict?.fileId ?? ''}`} entry={conflict} connection={connection} title={conflict.name} onResult={setResult} />
            ) : (
              <div className="sync-none">
                <span className="sync-conflict-title">{t('sync.noConflict')}</span>
                <span className="sync-conflict-sub">{t('sync.noConflictText')}</span>
              </div>
            )}
            {result && (
              <div className="sync-result" data-ok={result.ok || undefined} role="status" data-id="sync-result">
                <Icon name={result.ok ? 'check' : 'warning'} size={18} />
                {result.text}
              </div>
            )}
          </section>

          <OfflineCard connection={connection} report={report} backAt={backAt} />
          <Banner connection={connection} onReconnect={reconnect} onCancel={cancel} onSync={sync} />
        </div>
      </div>
    </AppShell>
  );
}

