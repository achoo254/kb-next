/**
 * The reader (board C11) at /d/:id: table of contents, the text by passage (each with its anchor), the document's
 * comments, and the right column (AI, backlinks, related, versions). Pure 2D over the strong veil (Z02). States:
 * loading, normal, no access, hidden by an admin, offline (no answer), plus the offline banner when the connection
 * drops while reading the loaded copy.
 */
import { Fragment, type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type DocumentView, fetchDocument, readErrorOf } from '../api/content-api';
import { brand } from '../brand';
import { useI18n } from '../i18n/i18n';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { useDevice } from '../layout/device';
import { journeyPath } from '../layout/shell-paths';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Icon } from '../ui/icon';
import { OriginTag } from '../ui/origin-tag';
import { Skeleton } from '../ui/skeleton';
import { ErrorPanel } from './error-screen';
import { COMMENTS_ANCHOR, ReaderComments } from './reader-comments';
import { OfficeView } from './office-view';
import { ReaderMarkdown } from './reader-markdown';
import { shortDate, useReaderText } from './reader-messages';
import { useReading } from './reader-progress';
import { type PassageSelection, type ReaderAi, type ReaderTask, ReaderAiCard, SelectionToolbar, usePassageSelection, useReaderAi } from './reader-ai';
import { AiPanel, Backlinks, KeyHints, ReaderActions, RelatedDocuments, Versions } from './reader-side';
import { originOf } from './space-labels';
import { TabletActions, TabletLinks, TocButton, TocDrawer } from './reader-tablet';
import { ReaderPhone } from './reader-phone';
import { spaceName } from './space-panels';
import './reader-screen.css';

export type ReaderFailure = 'not-found' | 'no-access' | 'hidden' | 'offline' | 'server';
export type ReaderLoad = { status: 'loading' } | { status: 'ready'; view: DocumentView; loadedAt: number } | { status: 'failed'; error: ReaderFailure };

export function readerLoadError(error: unknown): ReaderFailure {
  const code = readErrorOf(error);
  if (code) return code;
  if (error instanceof ApiError && error.code === NETWORK_ERROR) return 'offline';
  return 'server';
}

function useDocument(id: string): { load: ReaderLoad; reload(): Promise<void> } {
  const { locale } = useI18n();
  const key = `${id}|${locale}`;
  // The answer for the document and language asked; anything else (another document, a retry) shows as loading.
  const [result, setResult] = useState<{ key: string; load: ReaderLoad } | null>(null);
  const request = useCallback(async (): Promise<ReaderLoad> => {
    try {
      const view = await fetchDocument(id, locale);
      // A journey is run on its own path (Flow), not read as a text.
      if (view.document.type === 'journey') {
        window.location.replace(journeyPath(id));
        return { status: 'loading' };
      }
      return { status: 'ready', view, loadedAt: Date.now() };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('document load failed', error);
      return { status: 'failed', error: readerLoadError(error) };
    }
  }, [id, locale]);
  useEffect(() => {
    let current = true;
    void request().then((load) => {
      if (current) setResult({ key, load });
    });
    return () => {
      current = false;
    };
  }, [request, key]);
  const reload = useCallback(async () => {
    setResult(null);
    setResult({ key, load: await request() });
  }, [request, key]);
  return { load: result?.key === key ? result.load : { status: 'loading' }, reload };
}

/** Whether the browser has lost its connection (the offline banner of a loaded document). */
function useOffline(): boolean {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  useEffect(() => {
    const update = (): void => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return offline;
}

export function ReaderLoading(): ReactNode {
  const { t } = useReaderText();
  return (
    <div className="reader-loading" aria-busy="true" aria-label={t('reader.loading')} data-id="reader-loading">
      <Skeleton width="40%" height={22} radius={8} tone="glow" />
      <Skeleton width="70%" height={42} radius={8} tone="glow" />
      <Skeleton width="90%" height={16} radius={8} tone="glow" />
      <Skeleton width="84%" height={16} radius={8} tone="glow" />
      <Skeleton height={120} radius={18} tone="glow" />
      <Skeleton width="92%" height={16} radius={8} tone="glow" />
      <Skeleton width="76%" height={16} radius={8} tone="glow" />
      <Skeleton width="88%" height={16} radius={8} tone="glow" />
    </div>
  );
}

export function ReaderFailed({ error, onRetry }: { error: ReaderFailure; onRetry(): Promise<void> }): ReactNode {
  const { t } = useReaderText();
  if (error === 'hidden') {
    return (
      <EmptyState
        art="vault-lock"
        title={t('reader.hidden.title')}
        description={t('reader.hidden.text')}
        action={{ label: t('reader.hidden.action'), href: SHELL_PATHS.universe }}
        className="reader-state reader-state-hidden"
        dataId="reader-hidden"
      />
    );
  }
  if (error === 'offline') {
    return (
      <EmptyState
        art="planet-offline"
        title={t('reader.offline.title')}
        description={t('reader.offline.text')}
        action={{ label: t('reader.offline.action'), onClick: () => void onRetry() }}
        tone="accent"
        className="reader-state"
        dataId="reader-offline"
      />
    );
  }
  return <ErrorPanel kind={error === 'no-access' ? 'forbidden' : error} onRetry={onRetry} className="reader-error" />;
}

function TableOfContents({ view, current, onGo }: { view: DocumentView; current: string | null; onGo(anchor: string): void }): ReactNode {
  const { t } = useReaderText();
  const entries = [...view.toc.map((entry) => ({ anchor: entry.anchor, label: entry.title ?? t('reader.overview'), level: entry.level })), { anchor: COMMENTS_ANCHOR, label: t('reader.comments'), level: 2 }];
  const listRef = useRef<HTMLOListElement>(null);
  // Keep the lit entry in view inside the list (it scrolls on its own); only the list moves, never the page.
  useEffect(() => {
    const list = listRef.current;
    const lit = list?.querySelector<HTMLElement>('a[aria-current="location"]');
    if (!list || !lit) return;
    const top = lit.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + lit.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + lit.offsetHeight - list.clientHeight;
  }, [current]);
  return (
    <ol ref={listRef} className="reader-toc-list">
      {entries.map((entry) => (
        <li key={entry.anchor} data-level={entry.level}>
          <a
            href={`#${encodeURIComponent(entry.anchor)}`}
            aria-current={entry.anchor === current ? 'location' : undefined}
            onClick={(event) => {
              event.preventDefault();
              onGo(entry.anchor);
            }}
          >
            {entry.label}
          </a>
        </li>
      ))}
    </ol>
  );
}

function DocumentMeta({ view }: { view: DocumentView }): ReactNode {
  const { t, locale } = useReaderText();
  const doc = view.document;
  const others = view.translations.filter((tr) => tr.lang !== doc.lang).map((tr) => tr.lang.toUpperCase());
  const meta = [t('reader.minutes', { count: doc.readingMinutes }), doc.lang.toUpperCase(), ...others.map((lang) => t('reader.hasLang', { lang })), t('reader.updated', { date: shortDate(locale, doc.updatedAt) })];
  return (
    <div className="reader-meta" data-id="reader-meta">
      <OriginTag origin={originOf(doc)} className="reader-origin" />
      {doc.reviewedBy && (
        <Badge variant="pill" tone="success" className="reader-reviewed">
          {t('reader.reviewedBy', { name: doc.reviewedBy })}
        </Badge>
      )}
      {doc.aiTranslated && (
        <Badge variant="pill" tone="accent" icon="translate">
          {t('reader.aiTranslated')}
        </Badge>
      )}
      <span className="reader-meta-text">{meta.join(' · ')}</span>
    </div>
  );
}

interface ArticleProps {
  view: DocumentView;
  offline: boolean;
  articleRef: RefObject<HTMLElement | null>;
  selection: PassageSelection | null;
  ai: ReaderAi;
}

function ReaderArticle({ view, offline, articleRef, selection, ai, tablet }: ArticleProps & { tablet: boolean }): ReactNode {
  const { t, locale } = useReaderText();
  const levels = new Map(view.toc.map((entry) => [entry.anchor, entry.level]));
  const wikilinks = useMemo(() => new Map(view.wikilinks.map((link) => [link.title, link.id])), [view.wikilinks]);
  const documentId = view.document.id;
  const asked = ai.asked;
  const pressed = selection && asked?.about === 'selection' && asked.anchor === selection.anchor && asked.text === selection.text ? asked.task : null;
  return (
    <article ref={articleRef} className="reader-article" data-id="reader-article">
      <DocumentMeta view={view} />
      <h1 className="reader-title">{view.document.title}</h1>
      {!view.translationAvailable && (
        <div className="reader-translate" data-id="reader-translate">
          <span>{t('reader.translateNote', { lang: locale.toUpperCase() })}</span>
          <Button variant="glass" size="md" icon="translate" href={`/d/${encodeURIComponent(documentId)}/translate?to=${locale}`} dataId="reader-translate-ai">
            {t('reader.translate')}
          </Button>
        </div>
      )}
      {view.file && <OfficeView documentId={documentId} file={view.file} offline={offline} />}
      {view.chunks.map((chunk) => {
        const Heading = levels.get(chunk.anchor) === 3 ? 'h3' : 'h2';
        return (
          <Fragment key={chunk.anchor}>
            <section id={chunk.anchor} className="reader-passage" data-overview={chunk.heading === null || undefined} aria-label={chunk.heading ?? t('reader.overview')}>
              {chunk.heading !== null && <Heading className="reader-heading">{chunk.heading}</Heading>}
              <ReaderMarkdown markdown={chunk.markdown} wikilinks={wikilinks} />
              {selection?.anchor === chunk.anchor && !offline && (
                <SelectionToolbar
                  selection={selection}
                  documentId={documentId}
                  pressed={pressed}
                  onAsk={(task) => ai.ask({ task, about: 'selection', anchor: selection.anchor, text: selection.text })}
                />
              )}
            </section>
            {asked?.anchor === chunk.anchor && <ReaderAiCard ai={ai} />}
          </Fragment>
        );
      })}
      {tablet && <TabletLinks view={view} />}
      <ReaderComments documentId={documentId} offline={offline} />
    </article>
  );
}

/** The text the side panel's AI buttons read: the current passage, or the whole document. */
export function sideAsk(view: DocumentView, current: string | null, task: ReaderTask, overview: string): Parameters<ReaderAi['ask']>[0] | null {
  const chunks = view.chunks;
  const first = chunks[0];
  if (!first) return null;
  if (task === 'summarize') return { task, about: 'document', anchor: first.anchor, text: chunks.map((chunk) => [chunk.heading, chunk.markdown].filter(Boolean).join('\n\n')).join('\n\n') };
  const chunk = chunks.find((c) => c.anchor === current) ?? chunks.at(-1) ?? first;
  return { task, about: 'passage', anchor: chunk.anchor, text: chunk.markdown, heading: chunk.heading ?? overview };
}

function ReaderBody({ view, loadedAt, tablet }: { view: DocumentView; loadedAt: number; tablet: boolean }): ReactNode {
  const { t } = useReaderText();
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const offline = useOffline();
  const panelRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const passages = useMemo(() => view.chunks.map((chunk) => chunk.anchor), [view]);
  const { current, goTo } = useReading(panelRef, {
    documentId: view.document.id,
    passages,
    trailing: COMMENTS_ANCHOR,
    readAnchor: view.document.readAnchor,
    track: view.document.readProgress !== null,
  });
  const ai = useReaderAi(view.document.id);
  const selection = usePassageSelection(articleRef);
  const sidePressed = ai.asked && ai.asked.about !== 'selection' ? ai.asked.task : null;
  const time = new Date(loadedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  const panel = (
    <div ref={panelRef} className="reader-panel" data-id="reader-panel">
      {offline && (
        <div className="reader-offline" role="status" data-id="reader-offline-banner">
          <Icon name="offline" size={16} />
          {t('reader.offlineBanner', { time })}
        </div>
      )}
      <ReaderArticle view={view} offline={offline} articleRef={articleRef} selection={selection} ai={ai} tablet={tablet} />
    </div>
  );
  if (tablet) {
    // T02: the text in one wide panel, the contents in a drawer, the actions in a column on the right
    return (
      <>
        <TocButton open={drawer} onOpen={() => setDrawer(true)} />
        {panel}
        <TabletActions id={view.document.id} canShare={view.document.canShare ?? false} />
        <TocDrawer open={drawer} onClose={closeDrawer}>
          <TableOfContents
            view={view}
            current={current}
            onGo={(anchor) => {
              setDrawer(false);
              goTo(anchor);
            }}
          />
        </TocDrawer>
      </>
    );
  }
  return (
    <>
      <nav className="reader-toc" aria-labelledby="reader-toc-title" data-id="reader-toc">
        <span id="reader-toc-title" className="reader-toc-title">
          {t('reader.toc')}
        </span>
        <TableOfContents view={view} current={current} onGo={goTo} />
      </nav>
      {panel}
      <aside className="reader-side" aria-label={view.document.title} data-id="reader-side">
        <ReaderActions id={view.document.id} canShare={view.document.canShare ?? false} />
        <AiPanel
          offline={offline}
          keys={ai.keys}
          pressed={sidePressed}
          onAsk={(task) => {
            const next = sideAsk(view, current, task, t('reader.overview'));
            if (next) ai.ask(next);
          }}
        />
        <Backlinks links={view.backlinks} />
        <RelatedDocuments related={view.related} />
        <Versions view={view} />
        <KeyHints />
      </aside>
    </>
  );
}

export function ReaderScreen({ id }: { id: string }): ReactNode {
  const { t, locale } = useReaderText();
  const { load, reload } = useDocument(id);
  const device = useDevice();
  const view = load.status === 'ready' ? load.view : null;
  const tablet = device === 'tablet';

  const breadcrumb: BreadcrumbItem[] = [{ label: 'Universe', href: SHELL_PATHS.universe }];
  if (view) {
    const { space, collection, title } = view.document;
    const spaceHref = `/s/${encodeURIComponent(space.slug)}`;
    breadcrumb.push({ label: spaceName(locale, space), href: spaceHref });
    if (collection) breadcrumb.push({ label: spaceName(locale, collection), href: `${spaceHref}?c=${encodeURIComponent(collection.id)}` });
    breadcrumb.push({ label: title });
  }

  useEffect(() => {
    if (view) document.title = `${view.document.title} · ${brand.appName}`;
  }, [view]);

  if (device === 'phone') return <ReaderPhone id={id} load={load} onRetry={reload} />;

  return (
    <AppShell
      screen="C11"
      view="docs"
      veil="strong"
      stars={false}
      breadcrumb={breadcrumb}
      spaceHref={view ? `/s/${encodeURIComponent(view.document.space.slug)}` : undefined}
      docHref={`/d/${encodeURIComponent(id)}`}
      tabletBoard="reader"
      className="reader-shell"
    >
      <div className="reader-screen" data-id="reader-screen" data-state={load.status === 'failed' ? load.error : load.status}>
        {load.status === 'ready' ? (
          <ReaderBody view={load.view} loadedAt={load.loadedAt} tablet={tablet} />
        ) : (
          <>
            <nav className="reader-toc" aria-label={t('reader.toc')}>
              <span className="reader-toc-title">{t('reader.toc')}</span>
              {load.status === 'loading' && (
                <div className="reader-toc-loading" aria-hidden="true">
                  <Skeleton width="80%" height={14} radius={8} tone="glow" />
                  <Skeleton width="65%" height={14} radius={8} tone="glow" />
                  <Skeleton width="72%" height={14} radius={8} tone="glow" />
                </div>
              )}
            </nav>
            <div className="reader-panel">{load.status === 'loading' ? <ReaderLoading /> : <ReaderFailed error={load.error} onRetry={reload} />}</div>
          </>
        )}
      </div>
    </AppShell>
  );
}
