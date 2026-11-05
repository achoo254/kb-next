/**
 * A Canvas (board C15) at /canvas/:id: an infinite board of cards (documents, notes, ideas, risks, AI answers,
 * diagrams, links) the owner drags around and connects, with undo/redo (⌘Z / ⇧⌘Z, Ctrl+Z / Ctrl+Y), autosave
 * (canvas-autosave.ts) and Jev's suggested connection, accepted by the owner. States: loading, the board, an empty
 * board, saving / not saved / offline / changed in another tab, and a canvas not found (someone else's reads the
 * same) or failing to load. /canvas lists the account's canvases (canvas-list.tsx).
 */
import { useDevice } from '../layout/device';
import { PhoneShell } from '../layout/phone-shell';
import { EmptyState } from '../ui/empty-state';
import { usePhoneText } from './phone-messages';
import { type KeyboardEvent, type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type Canvas, type CanvasDocument, type Card, type CanvasSuggestion, MAX_CARDS, fetchCanvas, fetchCanvasSuggestion } from '../api/canvas-api';
import type { DocumentSummary } from '../api/content-api';
import { toBoardPx } from '../layout/board-zoom';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { Icon } from '../ui/icon';
import { type SaveStatus, clearDraft, readDraft, useAutosave } from './canvas-autosave';
import { type BoardView, CanvasBoard, CanvasMinimap } from './canvas-board';
import { AddDialog, EditCardDialog } from './canvas-dialogs';
import { CanvasList } from './canvas-list';
import { type CanvasState, type History, KIND_LOOK, addCard, areConnected, commit, connect, disconnect, freshId, moveCard, redo, removeCard, startHistory, undo, updateCard } from './canvas-model';
import { type CanvasMessageKey, useCanvasText } from './canvas-messages';
import { ErrorPanel } from './error-screen';
import { relevanceText } from './space-labels';
import { spaceName } from './space-panels';
import type { ScreenTranslate } from './space-messages';
import './canvas-screen.css';

type Tool = 'select' | 'pan' | 'note' | 'idea' | 'connect' | 'document';

const TOOLS: ReadonlyArray<{ id: Tool; key: string; label: CanvasMessageKey; icon: string }> = [
  { id: 'select', key: 'v', label: 'canvas.tool.select', icon: 'M5 3l14 8-6 2-2 6z' },
  {
    id: 'pan',
    key: 'h',
    label: 'canvas.tool.pan',
    icon: 'M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-3 7-6 7s-5-2-6-5l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 13',
  },
  { id: 'note', key: 'n', label: 'canvas.tool.note', icon: 'M4 4h16v12l-4 4H4zM16 16v4' },
  { id: 'idea', key: 't', label: 'canvas.tool.idea', icon: 'M5 5h14M12 5v14' },
  { id: 'connect', key: 'l', label: 'canvas.tool.connect', icon: 'M5 19L19 5M14 5h5v5' },
  { id: 'document', key: '', label: 'canvas.tool.document', icon: 'M6 3h8l4 4v14H6zM12 11v6M9 14h6' },
];

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
/** How far an arrow key moves the picked card (Shift: further). */
const NUDGE = 10;
const NUDGE_FAR = 40;
/** The board's visible middle, where new cards land (board px). */
const VIEW_CENTRE = { x: 720, y: 450 };

type CanvasLoad =
  | { status: 'loading' }
  | { status: 'ready'; canvas: Canvas; start: CanvasState; rev: number; restored: boolean }
  | { status: 'failed'; error: 'not-found' | 'server' };

function useCanvas(id: string): { load: CanvasLoad; reload(): void } {
  const [result, setResult] = useState<{ id: string; load: CanvasLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    fetchCanvas(id).then(
      (canvas) => {
        if (!current) return;
        const draft = readDraft(id);
        const restored = draft !== null && draft.canvas.rev > canvas.canvas.rev;
        if (draft && !restored) clearDraft(id);
        const source = restored && draft ? { title: draft.title, ...draft.canvas } : { title: canvas.title, ...canvas.canvas };
        setResult({
          id,
          load: { status: 'ready', canvas, start: { title: source.title, cards: source.cards, connections: source.connections }, rev: source.rev, restored },
        });
      },
      (error: unknown) => {
        if (!current) return;
        if (!(error instanceof ApiError)) console.error('canvas load failed', error);
        setResult({ id, load: { status: 'failed', error: error instanceof ApiError && error.code === 'not-found' ? 'not-found' : 'server' } });
      },
    );
    return () => {
      current = false;
    };
  }, [id, attempt]);
  const reload = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);
  return { load: result?.id === id ? result.load : { status: 'loading' }, reload };
}

/** /canvas lists the account's canvases; /canvas/:id opens one. */
/** /canvas and /canvas/:id; a phone has no Canvas (Z02) and says so instead. */
export function CanvasRoute({ id }: { id: string }): ReactNode {
  const device = useDevice();
  if (device === 'phone') return <CanvasOnPhone />;
  return id ? <CanvasScreen id={id} /> : <CanvasList />;
}

function CanvasOnPhone(): ReactNode {
  const { t } = usePhoneText();
  return (
    <PhoneShell screen="C15">
      <div className="canvas-phone" data-id="canvas-phone">
        <EmptyState art="planet-offline" title={t('limit.canvasTitle')} description={t('limit.canvas')} action={{ label: t('limit.canvasBack'), href: SHELL_PATHS.universe }} />
      </div>
    </PhoneShell>
  );
}

export function CanvasScreen({ id }: { id: string }): ReactNode {
  const { t } = useCanvasText();
  const { load, reload } = useCanvas(id);
  if (load.status === 'ready') return <CanvasEditor key={`${id}-${load.rev}`} load={load} />;
  return (
    <AppShell screen="C15" rail="spaces" view="canvas" breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('canvas.crumbList') }]} veil="strong" className="canvas-shell">
      <div className="canvas-screen" data-id="canvas-screen" data-state={load.status === 'failed' ? load.error : 'loading'}>
        {load.status === 'loading' && (
          <p className="canvas-loading" role="status" data-id="canvas-loading">
            {t('canvas.loading')}
          </p>
        )}
        {load.status === 'failed' && (
          <div className="canvas-error">
            <ErrorPanel kind={load.error} onRetry={reload} backHref={SHELL_PATHS.canvas} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

type Drag =
  | { kind: 'card'; id: string; pointer: number; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { kind: 'pan'; pointer: number; sx: number; sy: number; ox: number; oy: number };

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** A short name of a card for Jev's suggestion: its kind when it is the only one of that kind, else its title. */
function shortName(t: ScreenTranslate<CanvasMessageKey>, card: Card, cards: readonly Card[], title: string): string {
  const unique = card.kind !== 'document' && cards.filter((c) => c.kind === card.kind).length === 1;
  if (unique) return t(KIND_LOOK[card.kind].label);
  return title.length > 24 ? `${title.slice(0, 23)}…` : title;
}

function CanvasEditor({ load }: { load: Extract<CanvasLoad, { status: 'ready' }> }): ReactNode {
  const { t, locale } = useCanvasText();
  const { canvas } = load;
  const [history, setHistory] = useState<History>(() => startHistory(load.start));
  const state = history.present;
  const { status, retry } = useAutosave({ id: canvas.id, state, rev: load.rev, unsaved: load.restored });
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [view, setView] = useState<BoardView>({ x: 0, y: 0, zoom: 1 });
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [suggestion, setSuggestion] = useState<CanvasSuggestion | null>(null);
  const [notice, setNotice] = useState<string | null>(load.restored ? t('canvas.save.restored') : null);
  const drag = useRef<Drag | null>(null);
  // Documents added here are known from the Space's list until the next load resolves them on the server.
  const [added, setAdded] = useState<Record<string, CanvasDocument>>({});
  const documents = useMemo(() => ({ ...canvas.documents, ...added }), [canvas.documents, added]);

  const change = useCallback((next: (s: CanvasState) => CanvasState) => setHistory((h) => commit(h, next(h.present))), []);
  const titleOf = useCallback(
    (card: Card): string => (card.documentId ? (documents[card.documentId]?.title ?? t('canvas.unreadable')) : card.title || t('canvas.untitled')),
    [documents, t],
  );

  // Jev's suggestion for the saved board, once when it opens (a Jev call each time would cost for nothing).
  useEffect(() => {
    if (load.start.cards.length < 2) return;
    let current = true;
    fetchCanvasSuggestion(canvas.id).then(
      (found) => {
        if (current) setSuggestion(found);
      },
      (error: unknown) => {
        // Jev off or failing: no suggestion, the board works as before.
        if (!(error instanceof ApiError)) console.error('canvas suggestion failed', error);
      },
    );
    return () => {
      current = false;
    };
  }, [canvas.id, load.start.cards.length]);

  const placeNew = useCallback(
    (kind: 'note' | 'idea' | 'document' | 'link', fields: Partial<Card>) => {
      if (state.cards.length >= MAX_CARDS) {
        setNotice(t('canvas.full', { count: MAX_CARDS }));
        return;
      }
      const w = kind === 'document' ? 260 : 220;
      const offset = (state.cards.length % 6) * 20;
      const card: Card = {
        id: freshId(state, 'c'),
        kind,
        x: Math.round((VIEW_CENTRE.x - view.x) / view.zoom - w / 2 + offset),
        y: Math.round((VIEW_CENTRE.y - view.y) / view.zoom - 60 + offset),
        w,
        title: '',
        ...fields,
      };
      change((s) => addCard(s, card));
      setSelected(card.id);
      setTool('select');
      if (kind === 'note' || kind === 'idea') setEditing(card.id);
    },
    [state, view, change, t],
  );

  const pickTool = useCallback(
    (next: Tool) => {
      setConnectFrom(null);
      if (next === 'note') placeNew('note', { title: t('canvas.newNote') });
      else if (next === 'idea') placeNew('idea', { title: t('canvas.newIdea') });
      else if (next === 'document') setAdding(true);
      else {
        setTool(next);
        if (next === 'connect' && selected) setConnectFrom(selected);
      }
    },
    [placeNew, selected, t],
  );

  const zoomBy = useCallback((step: number) => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((v.zoom + step) * 10) / 10)) })), []);

  // Shortcuts of the board (Interaction): ⌘Z / ⇧⌘Z, the tools' letters, Delete, Esc, +/−.
  useEffect(() => {
    if (editing || adding) return;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        if (key === 'z') {
          event.preventDefault();
          setHistory((h) => (event.shiftKey ? redo(h) : undo(h)));
        } else if (key === 'y') {
          event.preventDefault();
          setHistory(redo);
        }
        return;
      }
      if (event.altKey) return;
      if (key === 'escape') {
        setConnectFrom(null);
        setTool('select');
        setSelected(null);
      } else if ((key === 'delete' || key === 'backspace') && selected) {
        change((s) => removeCard(s, selected));
        setSelected(null);
      } else if (key === '+' || key === '=') zoomBy(0.1);
      else if (key === '-' || key === '_') zoomBy(-0.1);
      else if (key === '0') setView({ x: 0, y: 0, zoom: 1 });
      else {
        const found = TOOLS.find((tl) => tl.key !== '' && tl.key === key);
        if (!found) return;
        pickTool(found.id);
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, adding, selected, change, zoomBy, pickTool]);

  // Dragging: a card moves as one undoable change when released; the background pans the view.
  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent): void => {
      const d = drag.current;
      if (!d || d.pointer !== event.pointerId) return;
      const dx = toBoardPx(event.clientX - d.sx);
      const dy = toBoardPx(event.clientY - d.sy);
      if (d.kind === 'pan') {
        setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
        return;
      }
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      setDragging({ id: d.id, x: Math.round(d.ox + dx / view.zoom), y: Math.round(d.oy + dy / view.zoom) });
    };
    const onUp = (event: globalThis.PointerEvent): void => {
      const d = drag.current;
      if (!d || d.pointer !== event.pointerId) return;
      drag.current = null;
      setPanning(false);
      if (d.kind === 'card' && d.moved) {
        const x = Math.round(d.ox + toBoardPx(event.clientX - d.sx) / view.zoom);
        const y = Math.round(d.oy + toBoardPx(event.clientY - d.sy) / view.zoom);
        change((s) => moveCard(s, d.id, x, y));
      }
      setDragging(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [view.zoom, change]);

  function startPan(event: PointerEvent<HTMLElement>): void {
    drag.current = { kind: 'pan', pointer: event.pointerId, sx: event.clientX, sy: event.clientY, ox: view.x, oy: view.y };
    setPanning(true);
  }

  function onBackgroundDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    setSelected(null);
    setConnectFrom(null);
    startPan(event);
  }

  function pickCard(card: Card): boolean {
    if (tool !== 'connect') return false;
    if (!connectFrom) setConnectFrom(card.id);
    else {
      const from = connectFrom;
      change((s) => connect(s, from, card.id));
      setConnectFrom(null);
      setTool('select');
      setSelected(card.id);
    }
    return true;
  }

  function onCardDown(event: PointerEvent<HTMLButtonElement>, card: Card): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (tool === 'pan') {
      startPan(event);
      return;
    }
    if (pickCard(card)) return;
    setSelected(card.id);
    drag.current = { kind: 'card', id: card.id, pointer: event.pointerId, sx: event.clientX, sy: event.clientY, ox: card.x, oy: card.y, moved: false };
  }

  function onCardKey(event: KeyboardEvent<HTMLButtonElement>, card: Card): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (pickCard(card)) return;
      if (selected === card.id && event.key === 'Enter') setEditing(card.id);
      else setSelected(card.id);
      return;
    }
    const step = event.shiftKey ? NUDGE_FAR : NUDGE;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    setSelected(card.id);
    change((s) => moveCard(s, card.id, card.x + move[0], card.y + move[1]));
  }

  const editingCard = editing ? state.cards.find((c) => c.id === editing) : undefined;
  const space = canvas.space;
  const breadcrumb: BreadcrumbItem[] = [{ label: 'Universe', href: SHELL_PATHS.universe }];
  if (space) breadcrumb.push({ label: spaceName(locale, space), href: `/s/${encodeURIComponent(space.slug)}` });
  breadcrumb.push({ label: t('canvas.crumb', { title: state.title }) });
  const live = suggestion && !areConnected(state, suggestion.from, suggestion.to) ? suggestion : null;
  const suggestFrom = live ? state.cards.find((c) => c.id === live.from) : undefined;
  const suggestTo = live ? state.cards.find((c) => c.id === live.to) : undefined;
  const empty = state.cards.length === 0;
  const connectCard = connectFrom ? state.cards.find((c) => c.id === connectFrom) : undefined;

  return (
    <AppShell
      screen="C15"
      rail="spaces"
      view="canvas"
      breadcrumb={breadcrumb}
      crumbAction={<SaveState t={t} status={status} onRetry={retry} />}
      spaceHref={space ? `/s/${encodeURIComponent(space.slug)}` : undefined}
      veil="strong"
      className="canvas-shell"
    >
      <div className="canvas-screen" data-id="canvas-screen" data-state={empty ? 'empty' : 'ready'} data-save={status} data-tool={tool} aria-label={t('canvas.board', { title: state.title })} role="region">
        <CanvasBoard
          t={t}
          state={state}
          documents={documents}
          view={view}
          selected={selected}
          connectFrom={connectFrom}
          dragging={dragging}
          panning={panning || tool === 'pan'}
          onBackgroundDown={onBackgroundDown}
          onCardDown={onCardDown}
          onCardKey={onCardKey}
          onCardDoubleClick={(card) => setEditing(card.id)}
          onEdit={(card) => setEditing(card.id)}
          onDelete={(card) => {
            change((s) => removeCard(s, card.id));
            setSelected(null);
          }}
        />

        <p className="canvas-hint">{connectCard ? t('canvas.connectHint', { title: titleOf(connectCard) }) : tool === 'connect' ? t('canvas.connectStart') : t('canvas.hint')}</p>
        {notice && (
          <p className="canvas-notice" role="status" data-id="canvas-notice">
            {notice}
          </p>
        )}

        <div className="canvas-top">
          {space && (
            <a className="canvas-top-link" href={`/s/${encodeURIComponent(space.slug)}`}>
              {t('canvas.toSpace')}
            </a>
          )}
          {space && (
            <a className="canvas-top-link" href={`${SHELL_PATHS.graph}?${new URLSearchParams({ space: space.slug }).toString()}`}>
              {t('canvas.toGraph')}
            </a>
          )}
          <button type="button" className="canvas-top-link canvas-top-main" aria-disabled="true" title={t('canvas.soon')}>
            {t('canvas.share')}
          </button>
        </div>

        {live && suggestFrom && suggestTo && (
          <div className="canvas-suggest" role="status" data-id="canvas-suggest">
            <Icon name="sparkle" size={14} />
            <span className="canvas-suggest-text">
              {t('canvas.suggest', {
                a: shortName(t, suggestFrom, state.cards, titleOf(suggestFrom)),
                b: shortName(t, suggestTo, state.cards, titleOf(suggestTo)),
                score: relevanceText(locale, live.relevance),
              })}
            </span>
            <button
              type="button"
              className="canvas-suggest-accept"
              onClick={() => {
                change((s) => connect(s, live.from, live.to));
                setSuggestion(null);
              }}
              data-id="canvas-suggest-accept"
            >
              {t('canvas.suggest.accept')}
            </button>
            <button type="button" className="canvas-suggest-dismiss" aria-label={t('canvas.suggest.dismiss')} onClick={() => setSuggestion(null)} data-id="canvas-suggest-dismiss">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        <div role="toolbar" aria-label={t('canvas.tools')} aria-orientation="vertical" className="canvas-tools canvas-glass" data-id="canvas-tools">
          {TOOLS.map((tl) => (
            <button
              key={tl.id}
              type="button"
              className="canvas-tool"
              aria-label={t(tl.label)}
              title={t(tl.label)}
              aria-pressed={tool === tl.id}
              onClick={() => pickTool(tl.id)}
              data-id={`canvas-tool-${tl.id}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={tl.icon} />
              </svg>
            </button>
          ))}
          <span className="canvas-tools-rule" aria-hidden="true" />
          <button type="button" className="canvas-tool canvas-undo" aria-label={t('canvas.undo')} title={`${t('canvas.undo')} · ${t('canvas.redo')}`} disabled={history.past.length === 0} onClick={() => setHistory(undo)} data-id="canvas-undo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
          </button>
        </div>

        <CanvasMinimap t={t} state={state} documents={documents} view={view} />
        <div className="canvas-zoom canvas-glass" data-id="canvas-zoom">
          <button type="button" aria-label={t('canvas.zoomOut')} onClick={() => zoomBy(-0.1)}>
            −
          </button>
          <button type="button" className="canvas-zoom-level" aria-label={t('canvas.zoomReset')} onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>
            {t('canvas.zoomLevel', { percent: Math.round(view.zoom * 100) })}
          </button>
          <button type="button" aria-label={t('canvas.zoomIn')} onClick={() => zoomBy(0.1)}>
            +
          </button>
        </div>

        {empty && (
          <div className="canvas-empty" data-id="canvas-empty">
            <span className="canvas-empty-ring" aria-hidden="true" />
            <h2 className="canvas-empty-title">{t('canvas.empty.title')}</h2>
            <p className="canvas-empty-text">{t('canvas.empty.text')}</p>
            <div className="canvas-empty-actions">
              <button type="button" className="canvas-top-link canvas-top-main" onClick={() => pickTool('note')} data-id="canvas-empty-note">
                {t('canvas.empty.note')}
              </button>
              <button type="button" className="canvas-top-link" onClick={() => setAdding(true)} data-id="canvas-empty-document">
                {t('canvas.empty.document')}
              </button>
            </div>
          </div>
        )}

        {editingCard && (
          <EditCardDialog
            t={t}
            card={editingCard}
            shownTitle={titleOf(editingCard)}
            connections={state.connections}
            titleOf={(cardId) => {
              const other = state.cards.find((c) => c.id === cardId);
              return other ? titleOf(other) : '';
            }}
            onSave={(fields) => {
              change((s) => updateCard(s, editingCard.id, fields));
              setEditing(null);
            }}
            onDisconnect={(connectionId) => change((s) => disconnect(s, connectionId))}
            onDelete={() => {
              change((s) => removeCard(s, editingCard.id));
              setSelected(null);
              setEditing(null);
            }}
            onClose={() => setEditing(null)}
          />
        )}
        {adding && (
          <AddDialog
            t={t}
            space={space?.slug ?? null}
            onBoard={new Set(state.cards.flatMap((c) => (c.documentId ? [c.documentId] : [])))}
            onAddDocument={(doc: DocumentSummary) => {
              setAdded((known) => ({ ...known, [doc.id]: { title: doc.title, type: doc.type, origin: doc.origin, status: doc.status, headings: [] } }));
              placeNew('document', { documentId: doc.id, title: doc.title });
              setAdding(false);
            }}
            onAddLink={(url) => {
              placeNew('link', { url, title: url });
              setAdding(false);
            }}
            onClose={() => setAdding(false)}
          />
        )}
      </div>
    </AppShell>
  );
}

function SaveState({ t, status, onRetry }: { t: ScreenTranslate<CanvasMessageKey>; status: SaveStatus; onRetry(): void }): ReactNode {
  const text: Record<SaveStatus, CanvasMessageKey> = {
    saved: 'canvas.save.saved',
    pending: 'canvas.save.saving',
    saving: 'canvas.save.saving',
    failed: 'canvas.save.failed',
    offline: 'canvas.save.offline',
    stale: 'canvas.save.stale',
  };
  return (
    <span className="canvas-save" data-status={status} role="status" data-id="canvas-save">
      <span className="canvas-save-dot" aria-hidden="true" />
      {t(text[status])}
      {status === 'failed' && (
        <button type="button" className="canvas-save-action" onClick={onRetry} data-id="canvas-save-retry">
          {t('canvas.save.retry')}
        </button>
      )}
      {status === 'stale' && (
        <button type="button" className="canvas-save-action" onClick={() => window.location.reload()}>
          {t('canvas.save.reload')}
        </button>
      )}
    </span>
  );
}
