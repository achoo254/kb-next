/**
 * An Office document's file inside the reader (C11): its card (name, size, version, download) and, once opened,
 * the Office editor in an iframe from its own origin. The bytes come from GET /api/files/:id (kept in this browser
 * so the file opens offline later), or from the draft this browser holds. Saving puts the editor's file in IndexedDB
 * first, then sends it as the next version when online; a conflict sends the reader to H04.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentFile } from '../api/content-api';
import { EDITABLE_KINDS, type EditorConfig, MAX_UPLOAD_BYTES, fetchEditorConfig, fetchFileBytes } from '../api/files-api';
import { SHELL_PATHS } from '../layout/app-shell';
import { Icon } from '../ui/icon';
import { FileBadge } from './file-badge';
import { type EditorBridge, EditorTimeout, connectEditor, editorFrameUrl } from './office-editor-bridge';
import { type OfficeMessageKey, fileSize, syncReasonKey, useOfficeText } from './office-messages';
import { currentAccountId } from './office-account';
import { isEditorKind, keepDraft, keepServerCopy, markWarm, readEntry, touchEntry } from './office-store';
import { announce, syncEntry } from './office-sync';
import './office-view.css';

/** How long the editor may take to say it is ready (its first load is 16–24 MB). */
const READY_TIMEOUT_MS = 90_000;

let configLoad: Promise<EditorConfig> | null = null;

/** Forgets where the editor lives (tests switch it). */
export function forgetEditorConfig(): void {
  configLoad = null;
}

/** Where the editor lives (asked once per page). */
function editorConfig(): Promise<EditorConfig> {
  configLoad ??= fetchEditorConfig().catch((error: unknown) => {
    configLoad = null;
    throw error;
  });
  return configLoad;
}

type ViewState =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'open'; origin: string; bytes: ArrayBuffer; fromDraft: boolean }
  | { kind: 'failed'; message: OfficeMessageKey; detail?: string };

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'done'; message: OfficeMessageKey; detail?: string | null; conflict?: boolean };

/** The bytes to open: this browser's draft first, then the server's file (kept here), then a copy kept earlier. */
async function bytesToOpen(userId: string, documentId: string, file: DocumentFile, online: boolean): Promise<{ bytes: ArrayBuffer; fromDraft: boolean } | null> {
  const entry = await readEntry(userId, documentId);
  if (entry && entry.state !== 'synced') return { bytes: entry.bytes, fromDraft: true };
  if (online) {
    const bytes = await fetchFileBytes(file.id);
    if (isEditorKind(file.kind)) await keepServerCopy({ userId, documentId, fileId: file.id, name: file.name, kind: file.kind, bytes });
    return { bytes, fromDraft: false };
  }
  if (entry) {
    await touchEntry(userId, documentId);
    return { bytes: entry.bytes, fromDraft: false };
  }
  return null;
}

function EditorFrame({ state, file, editable, onSaved }: { state: Extract<ViewState, { kind: 'open' }>; file: DocumentFile; editable: boolean; onSaved(bytes: ArrayBuffer): Promise<void> }): ReactNode {
  const { t } = useOfficeText();
  const frame = useRef<HTMLIFrameElement>(null);
  const bridge = useRef<EditorBridge | null>(null);
  const [phase, setPhase] = useState<'starting' | 'ready' | 'failed'>('starting');
  const [problem, setProblem] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let opened = false;
    const timer = setTimeout(() => {
      if (!opened) {
        setPhase('failed');
        setProblem(t('officeView.editorTimeout'));
      }
    }, READY_TIMEOUT_MS);
    const connected = connectEditor(element, state.origin, (message) => {
      if (message.type === 'document:dirty-changed') setDirty(message.payload.dirty === true);
      if (message.type === 'document:error') setProblem(t('officeView.editorFailed', { message: message.payload.message ?? '' }));
      if (message.type !== 'document:ready' || opened) return;
      opened = true;
      // A copy, so the kept bytes stay whole whatever the editor does with what it receives.
      void connected.request('document:open-buffer', { fileName: file.name, buffer: state.bytes.slice(0), readonly: !editable }).then(
        (reply) => {
          clearTimeout(timer);
          if (reply.type === 'document:error') {
            setPhase('failed');
            setProblem(t('officeView.editorFailed', { message: reply.payload.message ?? '' }));
            return;
          }
          setPhase('ready');
          if (navigator.onLine && isEditorKind(file.kind)) markWarm(file.kind);
        },
        () => {
          setPhase('failed');
          setProblem(t('officeView.editorTimeout'));
        },
      );
    });
    bridge.current = connected;
    return () => {
      clearTimeout(timer);
      connected.dispose();
      bridge.current = null;
    };
  }, [state, file.name, file.kind, editable, t]);

  const save = async (): Promise<void> => {
    const connected = bridge.current;
    if (!connected) return;
    setSaving(true);
    try {
      const reply = await connected.request('document:save');
      const saved = reply.type === 'document:saved' ? reply.payload.file : undefined;
      if (!saved) throw new Error(reply.payload.message ?? 'no file');
      await onSaved(await saved.arrayBuffer());
      setDirty(reply.payload.dirty === true);
    } catch (error) {
      setProblem(error instanceof EditorTimeout ? t('officeView.editorTimeout') : t('officeView.editorFailed', { message: error instanceof Error ? error.message : '' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="office-editor" data-phase={phase} data-id="office-editor">
      <div className="office-editor-bar">
        <span className="office-editor-state" role="status">
          {phase === 'starting' ? t('officeView.loading') : problem ?? (dirty ? t('officeView.dirty') : state.fromDraft ? t('officeView.draftOpen') : '')}
        </span>
        {editable && (
          <button type="button" className="office-button office-button-rim" onClick={() => void save()} disabled={phase !== 'ready' || saving} data-id="office-save">
            {saving ? t('officeView.saving') : t('officeView.save')}
          </button>
        )}
      </div>
      <iframe ref={frame} className="office-frame" src={editorFrameUrl(state.origin, window.location.origin)} title={t('officeView.frame', { name: file.name })} />
    </div>
  );
}

/**
 * `readOnly`: the file opens for reading only, whatever the account may do (a phone, Z02: no Office editing; the
 * screen says why).
 */
export function OfficeView({ documentId, file, offline, readOnly = false }: { documentId: string; file: DocumentFile; offline: boolean; readOnly?: boolean }): ReactNode {
  const { t, locale } = useOfficeText();
  const [view, setView] = useState<ViewState>({ kind: 'closed' });
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const opensInEditor = EDITABLE_KINDS.has(file.kind);
  const editable = !readOnly && file.editable && opensInEditor;

  const open = useCallback(async () => {
    setView({ kind: 'loading' });
    try {
      const config = await editorConfig();
      if (!config.origin) {
        setView({ kind: 'failed', message: 'officeView.noEditor' });
        return;
      }
      // Drafts here belong to the signed-in account: none is opened (or kept) for anyone else.
      const userId = await currentAccountId();
      if (!userId) {
        setView({ kind: 'failed', message: 'officeView.signedOut' });
        return;
      }
      const found = await bytesToOpen(userId, documentId, file, navigator.onLine);
      if (!found) {
        setView({ kind: 'failed', message: 'officeView.offlineNoCopy' });
        return;
      }
      setView({ kind: 'open', origin: config.origin, ...found });
    } catch {
      setView({ kind: 'failed', message: navigator.onLine ? 'officeView.editorTimeout' : 'officeView.offlineNoCopy' });
    }
  }, [documentId, file]);

  const onSaved = useCallback(
    async (bytes: ArrayBuffer) => {
      if (!isEditorKind(file.kind)) return;
      const userId = await currentAccountId();
      if (!userId) {
        setSaveState({ kind: 'done', message: 'officeView.signedOut' });
        return;
      }
      const base = (await readEntry(userId, documentId))?.fileId ?? file.id;
      if ((await keepDraft({ userId, documentId, fileId: base, name: file.name, kind: file.kind, bytes })) === 'full') {
        setSaveState({ kind: 'done', message: 'officeView.full' });
        return;
      }
      announce();
      if (!navigator.onLine) {
        setSaveState({ kind: 'done', message: 'officeView.draft' });
        return;
      }
      setSaveState({ kind: 'saving' });
      const outcome = await syncEntry(documentId);
      if (outcome === 'synced') setSaveState({ kind: 'done', message: 'officeView.saved' });
      else if (outcome === 'conflict') setSaveState({ kind: 'done', message: 'officeView.conflict', conflict: true });
      else if (outcome === 'failed') setSaveState({ kind: 'done', message: 'officeView.failed', detail: (await readEntry(userId, documentId))?.error ?? null });
      else if (outcome === 'paused') setSaveState({ kind: 'done', message: 'officeView.signedOutDraft' });
      else setSaveState({ kind: 'done', message: 'officeView.draft' });
    },
    [documentId, file],
  );

  return (
    <section className="office-view" aria-label={t('officeView.region')} data-id="office-view" data-state={view.kind}>
      <div className="office-card">
        <FileBadge kind={file.kind} name={file.name} size={42} />
        <div className="office-card-text">
          <span className="office-card-name">{file.name}</span>
          <span className="office-card-meta">{t('officeView.meta', { size: fileSize(locale, file.size), version: file.version })}</span>
        </div>
        {opensInEditor && view.kind !== 'open' && (
          <button type="button" className="office-button office-button-rim" onClick={() => void open()} disabled={view.kind === 'loading'} data-id="office-open">
            {editable ? t('officeView.open') : t('officeView.view')}
          </button>
        )}
        {view.kind === 'open' && (
          <button type="button" className="office-button" onClick={() => setView({ kind: 'closed' })}>
            {t('officeView.close')}
          </button>
        )}
        {!offline && (
          <a className="office-button" href={`/api/files/${encodeURIComponent(file.id)}`} download={file.name}>
            <Icon name="arrow-up-right" size={14} />
            {t('officeView.download')}
          </a>
        )}
      </div>
      {!opensInEditor && <p className="office-note">{t('officeView.notKind')}</p>}
      {opensInEditor && !file.editable && view.kind === 'open' && <p className="office-note">{t('officeView.readOnly')}</p>}
      {view.kind === 'loading' && (
        <p className="office-note" role="status">
          {t('officeView.loading')}
        </p>
      )}
      {view.kind === 'failed' && (
        <p className="office-note office-note-warn" role="alert">
          {t(view.message)}
        </p>
      )}
      {saveState.kind === 'saving' && (
        <p className="office-note" role="status">
          {t('officeView.saving')}
        </p>
      )}
      {saveState.kind === 'done' && (
        <p className="office-note" data-tone={saveState.message === 'officeView.saved' ? 'ok' : saveState.message === 'officeView.draft' ? undefined : 'warn'} role="status" data-id="office-save-state">
          {t(saveState.message, { reason: t(syncReasonKey(saveState.detail ?? null), { max: Math.round(MAX_UPLOAD_BYTES / (1024 * 1024)) }) })}
          {saveState.conflict && (
            <>
              {' '}
              <a href={SHELL_PATHS.sync}>{t('officeView.conflictLink')}</a>
            </>
          )}
        </p>
      )}
      {view.kind === 'open' && <EditorFrame state={view} file={file} editable={editable} onSaved={onSaved} />}
    </section>
  );
}
