/**
 * The Import Center (board C16, `/import`): every file the account uploaded, newest first, with the six steps of its
 * processing (upload, OCR, structure, chunks, Jev's sorting, index) as the server reports them, polled while any
 * runs; a failure says what went wrong and how to fix it, with "Thử lại". Files dropped here upload first (their
 * "Tải lên" step shows the upload's progress). On the right: the drop zone, where new files go (Space and
 * Collection), and Jev's suggestion for the latest file, applied on "Dùng".
 */
import { type CSSProperties, type DragEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type SpaceListItem, fetchSpaces } from '../api/content-api';
import {
  type FileKind,
  MAX_UPLOAD_BYTES,
  type ProcessingStep,
  STEP_NAMES,
  type StepState,
  type Upload,
  answerSuggestions,
  cancelProcessing,
  fetchUploads,
  retryProcessing,
} from '../api/files-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { ORB_ART } from '../ui/art';
import { Icon } from '../ui/icon';
import { FileBadge } from './file-badge';
import { type OfficeMessageKey, clockTime, fileSize, useOfficeText } from './office-messages';
import { spaceName } from './space-panels';
import { errorLine } from './upload-queue';
import { type UploadRow, rowPercent, useUploadQueue } from './upload-queue';
import './import-screen.css';

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
const POLL_MS = 2500;

/** `cancel`: stopped by its owner (counted under "Tất cả" only, as the board does). */
export type ItemKind = 'done' | 'run' | 'err' | 'wait' | 'cancel';
export const FILTERS = ['all', 'run', 'err', 'done', 'wait'] as const;
export type Filter = (typeof FILTERS)[number];

export interface ImportItem {
  key: string;
  /** The server's file, once uploaded. */
  fileId: string | null;
  name: string;
  kind: FileKind | null;
  size: number;
  /** "Networking › Địa chỉ", "Vũ trụ của bạn". */
  place: string;
  state: ItemKind;
  percent: number | null;
  steps: ProcessingStep[];
  /** A failure's title and how to fix it. */
  failure: { title: OfficeMessageKey; fix: OfficeMessageKey } | null;
  retryAt: string | null;
  /** Pages OCR could not read well (left out of the index). */
  lowQuality: { pages: number[]; hint: OfficeMessageKey } | null;
  /** The browser upload behind a row still sending (cancel, retry here). */
  local: UploadRow | null;
}

/** The title of each extraction error code (docs/text-extraction.md); any other reads as `fail.other`. */
const FAILURE_TITLE: Readonly<Record<string, OfficeMessageKey>> = {
  'too-large': 'fail.too-large',
  encrypted: 'fail.encrypted',
  corrupt: 'fail.corrupt',
  'unsupported-type': 'fail.unsupported-type',
  'file-missing': 'fail.file-missing',
  'no-document': 'fail.no-document',
  'tika-unavailable': 'fail.tika-unavailable',
  timeout: 'fail.timeout',
  internal: 'fail.internal',
};

/** Percent of a file's steps done (skipped ones aside), as the board's "Đang chạy · 60%". */
export function stepsPercent(steps: readonly ProcessingStep[]): number {
  const counted = steps.filter((s) => s.state !== 'skipped');
  if (counted.length === 0) return 0;
  return Math.round((counted.filter((s) => s.state === 'done').length / counted.length) * 100);
}

/** What C16 shows of a server upload. */
export function itemOfUpload(upload: Upload, place: string): ImportItem {
  const processing = upload.processing;
  const base = { key: upload.fileId, fileId: upload.fileId, name: upload.name, kind: upload.kind, size: upload.size, place, local: null, retryAt: null, lowQuality: null };
  if (!processing) {
    return { ...base, state: 'err', percent: null, steps: STEP_NAMES.map((step) => ({ step, state: step === 'upload' ? 'done' : 'pending' })), failure: { title: 'fail.other', fix: 'import.notQueued' } };
  }
  const low = processing.steps.find((s) => s.step === 'ocr')?.detail?.lowQualityPages ?? [];
  const lowQuality = low.length > 0 ? { pages: low.map((p) => p.page), hint: `hint.${low[0]?.hint ?? 'rescan'}` as const } : null;
  const code = processing.error?.code ?? '';
  const failed: ItemKind = code === 'cancelled' ? 'cancel' : 'err';
  const state: ItemKind = processing.status === 'done' ? 'done' : processing.status === 'failed' ? failed : processing.status === 'running' ? 'run' : 'wait';
  const failure = state === 'err' ? { title: FAILURE_TITLE[code] ?? 'fail.other', fix: `hint.${processing.error?.hint ?? 'retry-later'}` as const } : null;
  return {
    ...base,
    state,
    percent: state === 'run' ? stepsPercent(processing.steps) : null,
    steps: processing.steps,
    failure,
    retryAt: processing.status === 'waiting' ? processing.nextAttemptAt : null,
    lowQuality,
  };
}

/** What C16 shows of a file still uploading from this browser (or refused before it got there). */
export function itemOfLocal(row: UploadRow, place: string): ImportItem {
  const failed = row.state === 'failed' || row.state === 'cancelled';
  const state: ItemKind = row.state === 'cancelled' ? 'cancel' : failed ? 'err' : row.state === 'queued' ? 'wait' : 'run';
  return {
    key: row.key,
    fileId: null,
    name: row.name,
    kind: row.kind,
    size: row.size,
    place,
    state,
    percent: row.state === 'uploading' ? rowPercent(row) : null,
    steps: STEP_NAMES.map((step): ProcessingStep => ({ step, state: step === 'upload' ? (failed ? 'failed' : row.state === 'uploading' ? 'running' : 'pending') : 'pending' })),
    failure: row.state === 'failed' ? { title: 'fail.other', fix: errorLine(row.error) } : null,
    retryAt: null,
    lowQuality: null,
    local: row,
  };
}

/** The board's overall ring: steps done over steps to do, every file together. */
export function overallSteps(items: readonly ImportItem[]): number {
  let done = 0;
  let total = 0;
  for (const item of items) {
    for (const step of item.steps) {
      if (step.state === 'skipped') continue;
      total++;
      if (step.state === 'done') done++;
    }
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

type ListState = { status: 'loading' } | { status: 'ready'; uploads: Upload[]; stale: boolean } | { status: 'failed'; offline: boolean };

/** The account's uploads, polled while any is being processed (or `busy`: uploads still sending from here). */
function useUploads(busy: boolean): { state: ListState; reload(): void } {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    fetchUploads().then(
      (uploads) => live && setState({ status: 'ready', uploads, stale: false }),
      (error: unknown) => {
        if (!live) return;
        const offline = error instanceof ApiError && error.code === NETWORK_ERROR;
        setState((current) => (current.status === 'ready' ? { ...current, stale: true } : { status: 'failed', offline }));
      },
    );
    return () => {
      live = false;
    };
  }, [tick]);
  const running = state.status === 'ready' && state.uploads.some((u) => !u.processing || ['queued', 'running', 'waiting'].includes(u.processing.status));
  useEffect(() => {
    if (!running && !busy) return;
    const timer = setTimeout(reload, POLL_MS);
    return () => clearTimeout(timer);
  }, [running, busy, state, reload]);
  return { state, reload };
}

const NODE_MARK: Record<StepState, string> = { done: '✓', skipped: '–', failed: '!', running: '', pending: '' };

function Steps({ item }: { item: ImportItem }): ReactNode {
  const { t } = useOfficeText();
  return (
    <ol className="import-steps" aria-label={t('import.steps', { name: item.name })}>
      {item.steps.map((step, index) => {
        const previous = index > 0 ? item.steps[index - 1] : undefined;
        const prevDone = previous?.state === 'done' || previous?.state === 'skipped';
        const name = t(`import.step.${step.step}`);
        return (
          <li key={step.step} className="import-step" data-first={index === 0 || undefined}>
            {index > 0 && <span className="import-wire" data-from={previous?.state} data-to={step.state} data-lit={(prevDone && step.state !== 'pending') || undefined} aria-hidden="true" />}
            <span className="import-step-body">
              <span className="import-node" data-state={step.state} aria-hidden="true">
                {NODE_MARK[step.state]}
              </span>
              <span className="import-step-name" data-state={step.state}>
                {step.state === 'skipped' ? t('import.step.skipped', { name }) : name}
                <span className="kf-visually-hidden"> · {t(`import.step.state.${step.state}`)}</span>
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface CardProps {
  item: ImportItem;
  onRetry(item: ImportItem): void;
  onCancel(item: ImportItem): void;
}

function ImportCard({ item, onRetry, onCancel }: CardProps): ReactNode {
  const { t, locale } = useOfficeText();
  const status =
    item.state === 'run' ? (item.percent !== null ? t('import.status.runPct', { percent: item.percent }) : t('import.status.run')) : t(`import.status.${item.state}`);
  return (
    <article className="import-card" data-state={item.state} data-id="import-card">
      <div className="import-card-head">
        <FileBadge kind={item.kind} name={item.name} size={38} />
        <div className="import-card-title">
          <div className="import-card-name">{item.name}</div>
          <div className="import-card-place">{t('import.place', { size: fileSize(locale, item.size), place: item.place })}</div>
        </div>
        <span className="import-pill" data-state={item.state}>
          {item.state === 'run' && <span className="import-pill-spin" aria-hidden="true" />}
          {status}
        </span>
        {(item.state === 'err' || item.state === 'cancel') && (item.fileId !== null || (item.local !== null && !item.local.refused)) && (
          <button type="button" className="import-warn-button" onClick={() => onRetry(item)}>
            {t('import.retry')}
          </button>
        )}
        {(item.state === 'run' || item.state === 'wait') && (
          <button type="button" className="import-round" aria-label={t('import.cancelName', { name: item.name })} onClick={() => onCancel(item)}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      <Steps item={item} />
      {item.state === 'run' && item.percent !== null && (
        <div className="import-bar" aria-hidden="true">
          <span style={{ width: `${item.percent}%` }} />
        </div>
      )}
      {item.retryAt && <div className="import-note">{t('import.status.retryAt', { time: clockTime(item.retryAt) })}</div>}
      {item.failure && (
        <div className="import-alert" role="alert">
          <b>{t(item.failure.title)}</b> {t(item.failure.fix, { max: MAX_MB })}
        </div>
      )}
      {item.lowQuality && <div className="import-note import-note-warn">{t('import.lowQuality', { pages: item.lowQuality.pages.join(', '), fix: t(item.lowQuality.hint) })}</div>}
    </article>
  );
}

interface Destination {
  space: string;
  collection: string;
}

function placeOf(locale: 'vi' | 'en', upload: Upload, personalName: string): string {
  const space = upload.space.kind === 'personal' ? personalName : spaceName(locale, upload.space);
  return upload.collection ? `${space} › ${spaceName(locale, upload.collection)}` : space;
}

interface SuggestionProps {
  upload: Upload;
  onApplied(destination: Destination): void;
}

/** Jev's suggestion for the latest file (C16 "Jev gợi ý"): the Collection and the tags, applied on "Dùng". */
function SuggestionRow({ upload, onApplied }: SuggestionProps): ReactNode {
  const { t, locale } = useOfficeText();
  const suggestions = upload.suggestions;
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [state, setState] = useState<'idle' | 'sending' | 'taken' | 'failed'>('idle');
  if (!suggestions) return null;
  const target = suggestions.collection;
  const place = target ? `${spaceName(locale, target.space)} › ${spaceName(locale, target)}` : null;
  const probability = target ? target.probability.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  const accept = async (): Promise<void> => {
    setState('sending');
    try {
      await answerSuggestions(upload.fileId, { action: 'accept', collection: target !== null, tags: suggestions.tags.map((tag) => tag.tag).filter((tag) => !off.has(tag)) });
      setState('taken');
      if (target) onApplied({ space: target.space.slug, collection: target.collectionId });
    } catch {
      setState('failed');
    }
  };
  return (
    <div className="import-sug-wrap" data-id="import-suggestion">
      <div className="import-sug" title={t('import.sugFor', { name: upload.name })}>
        <Icon name="sparkle" size={14} />
        <span className="import-sug-text">{place ? t('import.sug', { place, probability }) : t('import.sugFor', { name: upload.name })}</span>
        <button type="button" className="import-sug-button" onClick={() => void accept()} disabled={state === 'sending' || state === 'taken'}>
          {state === 'taken' ? t('import.sugTaken') : t('import.sugUse')}
        </button>
      </div>
      {suggestions.tags.length > 0 && (
        <div className="import-sug-tags" role="group" aria-label={t('import.sugTags')}>
          {suggestions.tags.map(({ tag }) => {
            const on = !off.has(tag);
            return (
              <button
                key={tag}
                type="button"
                className="import-tag"
                aria-pressed={on}
                onClick={() =>
                  setOff((current) => {
                    const next = new Set(current);
                    if (next.has(tag)) next.delete(tag);
                    else next.add(tag);
                    return next;
                  })
                }
              >
                {on ? `✓ ${tag}` : `+ ${tag}`}
              </button>
            );
          })}
        </div>
      )}
      {state === 'failed' && (
        <p className="import-note import-note-warn" role="alert">
          {t('import.sugFailed')}
        </p>
      )}
    </div>
  );
}

function useSpaces(): SpaceListItem[] {
  const [spaces, setSpaces] = useState<SpaceListItem[]>([]);
  useEffect(() => {
    let live = true;
    fetchSpaces().then(
      (list) => live && setSpaces(list),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return spaces;
}

export function ImportScreen(): ReactNode {
  const { t, locale } = useOfficeText();
  const spaces = useSpaces();
  const [destination, setDestination] = useState<Destination>({ space: '', collection: '' });
  const target = useMemo(() => ({ space: destination.space || undefined, collection: destination.collection || undefined }), [destination]);
  const [filter, setFilter] = useState<Filter>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const reloadRef = useRef<() => void>(() => undefined);
  const queue = useUploadQueue(target, () => reloadRef.current());
  const sending = queue.rows.some((row) => row.state === 'queued' || row.state === 'uploading');
  const { state, reload } = useUploads(sending);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  const personal = spaces.find((space) => space.kind === 'personal');
  const placeLabel = useCallback((spaceSlug: string, collectionId: string): string => {
    const space = spaces.find((s) => s.slug === spaceSlug) ?? (spaceSlug ? undefined : personal);
    const spaceLabel = !space || space.kind === 'personal' ? t('office.crumb.personal') : spaceName(locale, space);
    const collection = space?.collections.find((c) => c.id === collectionId);
    return collection ? `${spaceLabel} › ${spaceName(locale, collection)}` : spaceLabel;
  }, [spaces, personal, t, locale]);

  const uploads = useMemo(() => (state.status === 'ready' ? state.uploads : []), [state]);
  const items = useMemo(() => {
    const local = queue.rows.filter((row) => row.state !== 'done').map((row) => itemOfLocal(row, placeLabel(destination.space, destination.collection)));
    return [...local, ...uploads.map((upload) => itemOfUpload(upload, placeOf(locale, upload, t('office.crumb.personal'))))];
  }, [queue.rows, uploads, placeLabel, destination, locale, t]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, run: 0, err: 0, done: 0, wait: 0 };
    for (const item of items) if (item.state !== 'cancel') c[item.state]++;
    return c;
  }, [items]);
  const shown = filter === 'all' ? items : items.filter((item) => item.state === filter);
  const percent = overallSteps(items);
  const pendingSuggestion = uploads.find((u) => u.suggestions?.status === 'pending' && (u.suggestions.collection !== null || u.suggestions.tags.length > 0));

  const retry = (item: ImportItem): void => {
    if (item.local) queue.retry(item.local.key);
    else if (item.fileId) void retryProcessing(item.fileId).then(reload, reload);
  };
  const cancel = (item: ImportItem): void => {
    if (item.local) queue.cancel(item.local.key);
    else if (item.fileId) void cancelProcessing(item.fileId).then(reload, reload);
  };
  const cancelRunning = (): void => {
    for (const item of items) if (item.state === 'run' || item.state === 'wait') cancel(item);
  };
  const retryFailed = (): void => {
    for (const item of items) if (item.state === 'err') retry(item);
  };
  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) queue.add([...event.dataTransfer.files]);
  };
  const selectedSpace = spaces.find((s) => s.slug === destination.space) ?? personal;

  return (
    <AppShell
      screen="C16"
      rail="mine"
      veil="strong"
      breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('office.crumb.mine'), href: SHELL_PATHS.mine }, { label: t('office.crumb.imports') }]}
      className="import-shell"
    >
      <div className="import-screen" data-id="import-screen" data-state={state.status} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <header className="import-head">
          <div className="import-ring" role="img" aria-label={t('import.ring', { percent })} style={{ '--import-deg': `${Math.round(percent * 3.6)}deg` } as CSSProperties}>
            <span>{percent}%</span>
          </div>
          <div className="import-head-text">
            <h1 className="import-title">{t('import.title')}</h1>
            <div className="import-summary">{t('import.summary', { total: counts.all, done: counts.done, running: counts.run, failed: counts.err, waiting: counts.wait })}</div>
          </div>
          <button type="button" className="import-warn-button import-head-button" onClick={retryFailed} disabled={counts.err === 0}>
            {t('import.retryFailed')}
          </button>
          <button type="button" className="import-soft-button import-head-button" onClick={cancelRunning} disabled={counts.run + counts.wait === 0}>
            {t('import.cancelRunning')}
          </button>
        </header>

        <div className="import-filters" role="group" aria-label={t('import.filters')}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className="import-filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t('import.filterCount', { name: t(`import.filter.${f}`), count: counts[f] })}
            </button>
          ))}
        </div>

        <div className="import-list" data-id="import-list">
          {state.status === 'loading' && items.length === 0 && (
            <p className="import-empty" role="status">
              {t('import.loading')}
            </p>
          )}
          {state.status === 'failed' && items.length === 0 && (
            <div className="import-empty" role="alert">
              <span className="import-empty-title">{state.offline ? t('import.offline') : t('import.failedLoad')}</span>
              <button type="button" className="import-soft-button" onClick={reload}>
                {t('import.reload')}
              </button>
            </div>
          )}
          {state.status === 'ready' && state.stale && <p className="import-note">{t('import.offline')}</p>}
          {state.status === 'ready' && items.length === 0 && (
            <div className="import-empty">
              <span className="import-empty-title">{t('import.empty.title')}</span>
              <span>{t('import.empty.text')}</span>
            </div>
          )}
          {items.length > 0 && shown.length === 0 && (
            <div className="import-empty">
              <span className="import-empty-title">{t('import.none.title')}</span>
              <span>{t('import.none.text')}</span>
            </div>
          )}
          {shown.map((item) => (
            <ImportCard key={item.key} item={item} onRetry={retry} onCancel={cancel} />
          ))}
        </div>

        <aside className="import-aside">
          <label className="import-drop" data-id="import-drop">
            <span className="import-drop-art">
              <img src={ORB_ART} alt="" aria-hidden="true" />
              <Icon name="upload" size={24} strokeWidth={2.2} className="import-drop-icon" />
            </span>
            <span className="import-drop-title">{t('import.drop')}</span>
            <span className="import-drop-kinds">{t('import.dropKinds', { max: MAX_MB })}</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".docx,.xlsx,.pptx,.pdf,.md,.markdown"
              className="import-drop-input"
              aria-label={t('import.dropInput')}
              onChange={(event) => {
                const files = event.currentTarget.files;
                if (files && files.length > 0) queue.add([...files]);
                event.currentTarget.value = '';
              }}
            />
          </label>

          <section className="import-dest">
            <h2 className="import-dest-title">{t('import.dest')}</h2>
            {pendingSuggestion && <SuggestionRow key={pendingSuggestion.fileId} upload={pendingSuggestion} onApplied={(next) => {
              setDestination(next);
              reload();
            }} />}
            <label className="import-field">
              {t('import.space')}
              <select value={destination.space} onChange={(event) => setDestination({ space: event.currentTarget.value, collection: '' })}>
                <option value="">{t('import.personal')}</option>
                {spaces
                  .filter((space) => space.kind === 'public')
                  .map((space) => (
                    <option key={space.slug} value={space.slug}>
                      {spaceName(locale, space)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="import-field">
              {t('import.collection')}
              <select value={destination.collection} onChange={(event) => setDestination({ ...destination, collection: event.currentTarget.value })}>
                <option value="">{t('import.noCollection')}</option>
                {(selectedSpace?.collections ?? []).map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {spaceName(locale, collection)}
                  </option>
                ))}
              </select>
            </label>
            <p className="import-dest-note">
              {t('import.destNote')}
              <a href={SHELL_PATHS.mine}>{t('import.destNoteLink')}</a>.
            </p>
          </section>

          <section className="import-info">
            <b>{t('import.indexNoteTitle')}</b> {t('import.indexNote')}
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
