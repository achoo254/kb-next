import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { DocumentView } from '../api/content-api';
import { PhoneShell } from '../layout/phone-shell';
import { SHELL_PATHS } from '../layout/shell-paths';
import { Icon } from '../ui/icon';
import { RimPanel, SheetHandle } from '../ui/rim-panel';
import { OfficeView } from './office-view';
import { usePhoneText } from './phone-messages';
import { PhoneOrigin } from './phone-origin';
import { ReaderAiCard, type ReaderTask, useReaderAi } from './reader-ai';
import { COMMENTS_ANCHOR } from './reader-comments';
import { ReaderMarkdown } from './reader-markdown';
import { useReaderText } from './reader-messages';
import { type ReaderLoad, ReaderFailed, ReaderLoading, sideAsk } from './reader-screen';
import { orderBacklinks } from './reader-side';
import { originOf } from './space-labels';
import { spaceName } from './space-panels';
import './reader-phone.css';

/**
 * The reader on a phone (board M05): the open files as tabs, the text at the window's width with its sections, the
 * texts that mention it, and two floating buttons for the AI (explain, summarise) and the contents, each in a sheet.
 * Office files open read-only (Z02: no Office editing on a phone).
 */

/** The files opened in this tab, latest first: the tabs at the top of the phone reader. */
const OPEN_FILES_KEY = 'kb-open-files';
const OPEN_FILES_MAX = 2;

interface OpenFile {
  id: string;
  title: string;
  office: boolean;
}

function isOpenFile(value: unknown): value is OpenFile {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && typeof entry.title === 'string' && typeof entry.office === 'boolean';
}

function readOpenFiles(): OpenFile[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(OPEN_FILES_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isOpenFile) : [];
  } catch {
    return [];
  }
}

/** `file` first, then the other files opened before it (at most OPEN_FILES_MAX). */
function withOpenFile(file: OpenFile): OpenFile[] {
  return [file, ...readOpenFiles().filter((entry) => entry.id !== file.id)].slice(0, OPEN_FILES_MAX);
}

/** The open files with this text first; the list is kept for the next text opened in this tab. */
function useOpenFiles(view: DocumentView | null): OpenFile[] {
  const files = useMemo(() => (view ? withOpenFile({ id: view.document.id, title: view.document.title, office: view.file !== null && view.file !== undefined }) : []), [view]);
  useEffect(() => {
    if (files.length === 0) return;
    try {
      sessionStorage.setItem(OPEN_FILES_KEY, JSON.stringify(files));
    } catch {
      // storage full or blocked: the tabs simply show the current file
    }
  }, [files]);
  return files;
}

type Sheet = 'none' | 'toc' | 'ai';

function PhoneArticle({ view, onSheet }: { view: DocumentView; onSheet(sheet: Sheet): void }): ReactNode {
  const { t } = usePhoneText();
  const reader = useReaderText();
  const doc = view.document;
  const wikilinks = useMemo(() => new Map(view.wikilinks.map((link) => [link.title, link.id])), [view.wikilinks]);
  const backlinks = orderBacklinks(view.backlinks);
  const editableFile = view.file?.editable === true;
  return (
    <article className="phone-reader-page" data-id="reader-article">
      <div className="phone-reader-hero" aria-hidden="true">
        <span data-layer="3" />
        <span data-layer="2" />
        <span data-layer="1" />
      </div>
      <div className="phone-reader-tags">
        <PhoneOrigin origin={originOf(doc)} />
        <span className="phone-reader-path">{[spaceName(reader.locale, doc.space), doc.collection ? spaceName(reader.locale, doc.collection) : null].filter(Boolean).join(' › ')}</span>
      </div>
      <h1 className="phone-reader-title">{doc.title}</h1>
      {view.file && (
        <>
          <OfficeView documentId={doc.id} file={view.file} offline={false} readOnly />
          {editableFile && <p className="phone-limit">{t('limit.office')}</p>}
        </>
      )}
      {view.chunks.map((chunk) => (
        <section key={chunk.anchor} id={chunk.anchor} className="phone-reader-passage" aria-label={chunk.heading ?? reader.t('reader.overview')}>
          {chunk.heading !== null && <h2 className="phone-reader-heading">{chunk.heading}</h2>}
          <ReaderMarkdown markdown={chunk.markdown} wikilinks={wikilinks} />
        </section>
      ))}
      {backlinks.length > 0 && (
        <section className="phone-reader-links" aria-labelledby="phone-reader-mentions">
          <h2 id="phone-reader-mentions" className="phone-reader-links-title">
            {t('reader.mentions')} <span>· {backlinks.length}</span>
          </h2>
          {backlinks.map((link) => (
            <a key={link.document.id} className="phone-reader-link" href={`/d/${encodeURIComponent(link.document.id)}`}>
              <span className="phone-reader-link-dot" style={{ background: link.document.space.glow }} aria-hidden="true" />
              <span className="phone-reader-link-text">
                <b>{link.document.title}</b>
                {link.label && <span>{link.label}</span>}
              </span>
              <PhoneOrigin origin={originOf(link.document)} />
            </a>
          ))}
        </section>
      )}
      {view.wikilinks.length > 0 && <p className="phone-reader-to">{t('reader.linksTo', { titles: view.wikilinks.map((link) => link.title).join(' · ') })}</p>}
      <div className="phone-reader-fabs">
        <button type="button" className="phone-fab" onClick={() => onSheet('ai')} data-id="reader-ai-open">
          <Icon name="sparkles" size={16} />
          {t('reader.ai')}
        </button>
        <button type="button" className="phone-fab" onClick={() => onSheet('toc')} data-id="reader-toc-open">
          <Icon name="lines" size={16} />
          {t('toc.open')}
        </button>
      </div>
    </article>
  );
}

function TocSheet({ view, onClose }: { view: DocumentView; onClose(): void }): ReactNode {
  const { t } = usePhoneText();
  const reader = useReaderText();
  const entries = [...view.toc.map((entry) => ({ anchor: entry.anchor, label: entry.title ?? reader.t('reader.overview') })), { anchor: COMMENTS_ANCHOR, label: reader.t('reader.comments') }];
  return (
    <>
      <button type="button" className="phone-scrim" aria-label={t('toc.close')} tabIndex={-1} onClick={onClose} />
      <RimPanel variant="sheet" as="aside" className="phone-reader-sheet" label={t('toc.title')} dataId="reader-toc-sheet">
        <SheetHandle label={t('toc.close')} onPress={onClose} />
        <h2 className="phone-reader-sheet-title">{t('toc.title')}</h2>
        {entries
          .filter((entry) => entry.anchor !== COMMENTS_ANCHOR || document.getElementById(COMMENTS_ANCHOR))
          .map((entry) => (
            <button
              key={entry.anchor}
              type="button"
              className="phone-toc-entry"
              onClick={() => {
                onClose();
                document.getElementById(entry.anchor)?.scrollIntoView({ block: 'start' });
              }}
            >
              <span aria-hidden="true" />
              {entry.label}
            </button>
          ))}
      </RimPanel>
    </>
  );
}

function AiSheet({ view, onClose }: { view: DocumentView; onClose(): void }): ReactNode {
  const { t } = usePhoneText();
  const reader = useReaderText();
  const ai = useReaderAi(view.document.id);
  const [task, setTask] = useState<ReaderTask | null>(null);
  const tasks: Array<{ id: ReaderTask; label: string }> = [
    { id: 'explain', label: reader.t('reader.ai.explain') },
    { id: 'summarize', label: reader.t('reader.ai.summarize') },
  ];
  return (
    <>
      <button type="button" className="phone-scrim" aria-label={t('copilot.close')} tabIndex={-1} onClick={onClose} />
      <RimPanel variant="sheet" as="aside" className="phone-reader-sheet" label={t('reader.ai')} dataId="reader-ai-sheet">
        <SheetHandle label={t('copilot.close')} onPress={onClose} />
        <div className="phone-ai-tabs" role="group" aria-label={reader.t('reader.ai.title')}>
          {tasks.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={task === entry.id}
              className="phone-ai-tab"
              onClick={() => {
                const next = sideAsk(view, null, entry.id, reader.t('reader.overview'));
                if (!next) return;
                setTask(entry.id);
                ai.ask(next);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {ai.asked && <ReaderAiCard ai={ai} />}
      </RimPanel>
    </>
  );
}

function OpenFileTabs({ files, current }: { files: readonly OpenFile[]; current: string }): ReactNode {
  const { t } = usePhoneText();
  return (
    <nav className="phone-reader-tabs" aria-label={t('reader.files')}>
      {files.map((file) => (
        <a key={file.id} href={`/d/${encodeURIComponent(file.id)}`} aria-current={file.id === current ? 'page' : undefined} className="phone-reader-tab">
          <span className="phone-reader-tab-icon" data-office={file.office || undefined} aria-hidden="true">
            {file.office ? 'W' : 'L'}
          </span>
          <span className="phone-reader-tab-name">{file.title}</span>
        </a>
      ))}
    </nav>
  );
}

/** /d/:id on a phone (board M05) in every state of the document's load. */
export function ReaderPhone({ id, load, onRetry }: { id: string; load: ReaderLoad; onRetry(): Promise<void> }): ReactNode {
  const { t } = usePhoneText();
  const view = load.status === 'ready' ? load.view : null;
  const files = useOpenFiles(view);
  const [sheet, setSheet] = useState<Sheet>('none');
  const close = (): void => setSheet('none');
  const office = view?.file !== null && view?.file !== undefined;
  const own = view?.document.origin === 'own';
  return (
    <PhoneShell screen="M05" stars={false}>
      <div className="phone-reader" data-id="reader-screen" data-state={load.status === 'failed' ? load.error : load.status}>
        <div className="phone-reader-top">
          <a className="phone-round" href={SHELL_PATHS.universe} aria-label={t('reader.back')}>
            <Icon name="chevron-left" size={20} />
          </a>
          <OpenFileTabs files={files.length > 0 ? files : view ? [{ id, title: view.document.title, office }] : []} current={id} />
          {view &&
            (office ? (
              <button type="button" className="phone-edit" disabled title={t('limit.office')} data-id="reader-edit">
                {t('reader.edit')}
              </button>
            ) : (
              <a className="phone-edit" href={own ? `/d/${encodeURIComponent(id)}/edit` : SHELL_PATHS.mine} data-id="reader-edit">
                {t('reader.edit')}
              </a>
            ))}
        </div>
        <div className="phone-reader-scroll">
          {load.status === 'ready' && <PhoneArticle view={load.view} onSheet={setSheet} />}
          {load.status === 'loading' && <ReaderLoading />}
          {load.status === 'failed' && <ReaderFailed error={load.error} onRetry={onRetry} />}
        </div>
        {view && sheet === 'toc' && <TocSheet view={view} onClose={close} />}
        {view && sheet === 'ai' && <AiSheet view={view} onClose={close} />}
      </div>
    </PhoneShell>
  );
}
