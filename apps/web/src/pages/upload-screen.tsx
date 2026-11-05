/**
 * Uploading Office files (board C03, `/upload`): the drop area on the left and the queue on the right. Files are
 * checked in the browser as the server checks them (docx, xlsx, pptx, pdf, md, at most 25 MB), then each uploads on
 * its own with its progress, so one bad file never stops the others. The left side follows the batch: waiting for
 * files, a drag over it, the overall ring while uploading, then reading (the server's processing, polled) or the
 * errors with how to fix them. `?space=&collection=` puts the new documents there (default: the personal Space).
 */
import { type DragEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { MAX_UPLOAD_BYTES, type Upload, fetchUploads } from '../api/files-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { CRYSTAL_ART, ORB_ART } from '../ui/art';
import { Icon } from '../ui/icon';
import { FileBadge } from './file-badge';
import { type OfficeMessageKey, fileSize, useOfficeText } from './office-messages';
import { type UploadRow, overallPercent, rowPercent, useUploadQueue } from './upload-queue';
import './upload-screen.css';

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
/** How often the reading state asks how the uploaded files are processed. */
const READ_POLL_MS = 2500;
const RING_RADIUS = 84;

/** The API error codes the screen has words for; any other reads as `other`. */
const KNOWN_ERRORS = ['network', 'too-large', 'unsupported-type', 'wrong-content', 'encrypted'] as const;
type KnownError = (typeof KNOWN_ERRORS)[number];

export function knownError(code: string | null): KnownError | 'other' {
  return KNOWN_ERRORS.find((known) => known === code) ?? 'other';
}

/** The line under a failed row ("Quá 25 MB · chia nhỏ hoặc nén lại"). */
export function errorLine(code: string | null): OfficeMessageKey {
  if (code === 'rate-limited') return 'file.err.rate-limited';
  if (code === 'sign-in-required') return 'file.err.sign-in-required';
  return `file.err.${knownError(code)}`;
}

/** Whether pressing "Thử lại" may help (a refusal of the file itself will not). */
function retryable(row: UploadRow): boolean {
  return row.state === 'failed' && !row.refused && !['too-large', 'unsupported-type', 'wrong-content', 'encrypted'].includes(row.error ?? '');
}

function useUploadTarget(): { space?: string; collection?: string } {
  const [target] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return { space: query.get('space') ?? undefined, collection: query.get('collection') ?? undefined };
  });
  return target;
}

/** The server's processing of the files uploaded here (polled while any is still running). */
function useProcessing(fileIds: readonly string[]): Upload[] {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const key = fileIds.join(',');
  useEffect(() => {
    if (!key) return;
    const wanted = new Set(key.split(','));
    let timer: ReturnType<typeof setTimeout> | null = null;
    let live = true;
    const poll = async (): Promise<void> => {
      try {
        const mine = (await fetchUploads()).filter((upload) => wanted.has(upload.fileId));
        if (!live) return;
        setUploads(mine);
        const busy = mine.length < wanted.size || mine.some((u) => !u.processing || ['queued', 'running', 'waiting'].includes(u.processing.status));
        if (busy) timer = setTimeout(() => void poll(), READ_POLL_MS);
      } catch {
        if (live) timer = setTimeout(() => void poll(), READ_POLL_MS * 2);
      }
    };
    void poll();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [key]);
  return uploads;
}

function Ring({ percent, label }: { percent: number; label: string }): ReactNode {
  const { t } = useOfficeText();
  const circumference = 2 * Math.PI * RING_RADIUS;
  return (
    <div className="upload-ring" role="progressbar" aria-label={t('upload.ring.label', { percent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <svg width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
        <defs>
          <linearGradient id="upload-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="upload-ring-stop-a" />
            <stop offset="1" className="upload-ring-stop-b" />
          </linearGradient>
        </defs>
        <circle cx="110" cy="110" r={RING_RADIUS} className="upload-ring-track" strokeWidth="12" />
        <circle
          cx="110"
          cy="110"
          r={RING_RADIUS}
          className="upload-ring-value"
          fill="none"
          stroke="url(#upload-ring-grad)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${Math.round((circumference * percent) / 100)} ${Math.round(circumference)}`}
          transform="rotate(-90 110 110)"
        />
      </svg>
      <span className="upload-ring-text">
        <span className="upload-ring-percent">{percent}%</span>
        <span className="upload-ring-label">{label}</span>
      </span>
    </div>
  );
}

interface DropAreaProps {
  rows: UploadRow[];
  dragging: number | null;
  reading: Upload[];
  onPick(): void;
  onPickFolder(): void;
  onCancelAll(): void;
  onRetry(key: string): void;
}

/** The left side, in the state of the batch. */
function DropArea({ rows, dragging, reading, onPick, onPickFolder, onCancelAll, onRetry }: DropAreaProps): ReactNode {
  const { t } = useOfficeText();
  if (dragging !== null) {
    return (
      <div className="upload-drag" data-id="upload-drag">
        <span className="upload-portal" aria-hidden="true" />
        <span className="upload-big">{dragging > 0 ? t('upload.drag.title', { count: dragging }) : t('upload.drag.titleAny')}</span>
        <span className="upload-sub">{t('upload.drag.text')}</span>
      </div>
    );
  }
  const busy = rows.filter((row) => row.state === 'queued' || row.state === 'uploading');
  if (busy.length > 0) {
    return (
      <div className="upload-busy" data-id="upload-busy">
        <Ring percent={overallPercent(rows)} label={t('upload.ring.left', { count: busy.length })} />
        <span className="upload-busy-text">{t('upload.uploading')}</span>
        <button type="button" className="upload-ghost upload-ghost-lg" onClick={onCancelAll} data-id="upload-cancel-all">
          {t('upload.cancelAll')}
        </button>
      </div>
    );
  }
  const done = rows.filter((row) => row.state === 'done');
  const failed = rows.filter((row) => row.state === 'failed');
  if (failed.length > 0 && done.length === 0) {
    return (
      <div className="upload-errors" data-id="upload-errors">
        {failed.map((row) => {
          const code = knownError(row.error);
          return (
            <div key={row.key} className="upload-error" role="alert">
              <Icon name="warning" size={22} strokeWidth={2.2} className="upload-error-icon" />
              <div className="upload-error-text">
                <span className="upload-error-title">{t(`file.errTitle.${code}`, { name: row.name })}</span>
                <span className="upload-error-sub">{t(`file.errSub.${code}`, { max: MAX_MB })}</span>
                <span className="upload-error-fix">{t('upload.err.fix', { fix: t(`file.fix.${code}`) })}</span>
              </div>
              {retryable(row) && (
                <button type="button" className="upload-warn-button" onClick={() => onRetry(row.key)}>
                  {t('upload.retry')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (done.length > 0) {
    const finished = reading.filter((u) => u.processing && (u.processing.status === 'done' || u.processing.status === 'failed')).length;
    return (
      <div className="upload-read" data-id="upload-read">
        <img className="upload-read-orb" src={ORB_ART} alt="" />
        <span className="upload-big">{finished >= done.length ? t('upload.read.done', { total: done.length }) : t('upload.read.title', { done: finished, total: done.length })}</span>
        <span className="upload-sub">{t('upload.read.text')}</span>
        <a href={SHELL_PATHS.imports} className="upload-read-link">
          {t('upload.read.link')}
        </a>
      </div>
    );
  }
  return (
    <div className="upload-idle" data-id="upload-idle">
      <span className="upload-idle-art">
        <img src={CRYSTAL_ART.linux} alt="" />
        <span className="upload-idle-core" aria-hidden="true" />
        <Icon name="upload" size={40} className="upload-idle-icon" />
      </span>
      <span className="upload-big">{t('upload.idle.title')}</span>
      <span className="upload-sub">{t('upload.idle.kinds', { max: MAX_MB })}</span>
      <div className="upload-idle-actions">
        <button type="button" className="upload-rim-button" onClick={onPick} data-id="upload-pick">
          {t('upload.pick')}
        </button>
        <button type="button" className="upload-ghost upload-ghost-lg" onClick={onPickFolder}>
          {t('upload.pickFolder')}
        </button>
      </div>
    </div>
  );
}

function QueueRow({ row, onRetry, onCancel, onRemove }: { row: UploadRow; onRetry(): void; onCancel(): void; onRemove(): void }): ReactNode {
  const { t, locale } = useOfficeText();
  const percent = rowPercent(row);
  const status =
    row.state === 'uploading'
      ? t('upload.status.uploading', { percent })
      : t(row.state === 'queued' ? 'upload.status.queued' : row.state === 'done' ? 'upload.status.done' : row.state === 'failed' ? 'upload.status.failed' : 'upload.status.cancelled');
  const showBar = row.state === 'uploading' || row.state === 'queued' || row.state === 'done' || (row.state === 'failed' && !row.refused);
  return (
    <li className="upload-row" data-state={row.state} data-refused={row.refused || undefined} data-id="upload-row">
      <FileBadge kind={row.kind} name={row.name} />
      <div className="upload-row-main">
        <div className="upload-row-head">
          <span className="upload-row-name">{row.name}</span>
          <span className="upload-row-size">{fileSize(locale, row.size)}</span>
          <span className="upload-row-status">{status}</span>
        </div>
        {showBar && (
          <span className="upload-row-bar" aria-hidden="true">
            <span style={{ width: `${row.state === 'done' ? 100 : percent}%` }} />
          </span>
        )}
        {row.state === 'failed' && <span className="upload-row-error">{t(errorLine(row.error), { max: MAX_MB })}</span>}
      </div>
      {retryable(row) && (
        <button type="button" className="upload-warn-button" onClick={onRetry} aria-label={t('upload.retryName', { name: row.name })}>
          {t('upload.retry')}
        </button>
      )}
      {(row.state === 'uploading' || row.state === 'queued') && (
        <button type="button" className="upload-ghost" onClick={onCancel} aria-label={t('upload.cancelName', { name: row.name })}>
          {t('upload.cancel')}
        </button>
      )}
      {row.state === 'failed' && !retryable(row) && (
        <button type="button" className="upload-ghost" onClick={onRemove} aria-label={t('upload.dropName', { name: row.name })}>
          {t('upload.drop.one')}
        </button>
      )}
      {row.state === 'done' && row.stored && (
        <a className="upload-open" href={`/d/${encodeURIComponent(row.stored.documentId)}`} aria-label={t('upload.openName', { name: row.name })}>
          {t('upload.open')}
        </a>
      )}
      {row.state === 'cancelled' && (
        <button type="button" className="upload-ghost" onClick={onRetry}>
          {t('upload.again')}
        </button>
      )}
    </li>
  );
}

/** How many files a drag carries, when the browser tells (0 when it does not). */
function draggedCount(event: DragEvent): number {
  return [...event.dataTransfer.items].filter((item) => item.kind === 'file').length;
}

export function UploadScreen(): ReactNode {
  const { t } = useOfficeText();
  const target = useUploadTarget();
  const queue = useUploadQueue(target);
  const [dragging, setDragging] = useState<number | null>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const uploadedIds = queue.rows.flatMap((row) => (row.stored ? [row.stored.id] : []));
  const busy = queue.rows.some((row) => row.state === 'queued' || row.state === 'uploading');
  const reading = useProcessing(busy ? [] : uploadedIds);

  // A folder picker is not a standard attribute React knows: set on the element.
  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, []);

  const addFiles = useCallback((list: FileList | null) => {
    if (list && list.length > 0) queue.add([...list]);
  }, [queue]);

  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    setDragging(null);
    addFiles(event.dataTransfer.files);
  };

  const done = queue.rows.filter((row) => row.state === 'done').length;
  const failed = queue.rows.filter((row) => row.state === 'failed').length;
  const running = queue.rows.filter((row) => row.state === 'queued' || row.state === 'uploading').length;
  const percent = overallPercent(queue.rows);
  const sub = queue.rows.length === 0 ? t('upload.sub.empty') : running > 0 ? t('upload.sub.running', { count: running }) : failed > 0 ? t('upload.sub.done') : t('upload.sub.allDone');

  return (
    <AppShell
      screen="C03"
      rail="create"
      veil="strong"
      breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('office.crumb.personal'), href: SHELL_PATHS.mine }, { label: t('upload.title') }]}
      className="upload-shell"
    >
      <div
        className="upload-screen"
        data-id="upload-screen"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(draggedCount(event));
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragging(null);
        }}
        onDrop={onDrop}
      >
        <header className="upload-head">
          <h1 className="upload-title">{t('upload.title')}</h1>
          <span className="upload-lead">{t('upload.lead')}</span>
        </header>
        <input ref={filesInput} type="file" multiple accept=".docx,.xlsx,.pptx,.pdf,.md,.markdown" className="upload-input" aria-label={t('upload.input')} onChange={(event) => {
          addFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }} />
        <input ref={folderInput} type="file" multiple className="upload-input" aria-label={t('upload.inputFolder')} onChange={(event) => {
          addFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }} />

        <section className="upload-panel upload-drop" aria-label={t('upload.drop')}>
          <DropArea
            rows={queue.rows}
            dragging={dragging}
            reading={reading}
            onPick={() => filesInput.current?.click()}
            onPickFolder={() => folderInput.current?.click()}
            onCancelAll={queue.cancelAll}
            onRetry={queue.retry}
          />
        </section>

        <section className="upload-panel upload-queue" aria-label={t('upload.queue')}>
          <div className="upload-queue-head">
            <span className="upload-count">{t('upload.count', { total: queue.rows.length, done, failed })}</span>
            <span className="upload-spacer" />
            <button type="button" className="upload-ghost" onClick={() => filesInput.current?.click()} data-id="upload-more">
              {t('upload.more')}
            </button>
            <button type="button" className="upload-ghost" onClick={queue.cancelAll} disabled={running === 0}>
              {t('upload.cancelAll')}
            </button>
          </div>
          <div className="upload-overall" role="progressbar" aria-label={t('upload.overall')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="upload-overall-sub">{sub}</span>
          <ul className="upload-rows">
            {queue.rows.map((row) => (
              <QueueRow key={row.key} row={row} onRetry={() => queue.retry(row.key)} onCancel={() => queue.cancel(row.key)} onRemove={() => queue.remove(row.key)} />
            ))}
          </ul>
          <a href={SHELL_PATHS.imports} className="upload-details" data-id="upload-details">
            <Icon name="lines" size={18} className="upload-details-icon" />
            <span>{t('upload.details')}</span>
            <Icon name="chevron-right" size={18} />
          </a>
        </section>
      </div>
    </AppShell>
  );
}
