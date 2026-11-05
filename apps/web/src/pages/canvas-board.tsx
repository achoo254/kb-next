/**
 * The drawing of a Canvas (board C15): the dotted infinite board, the connections (glowing lines from card to card),
 * the cards of each kind, the action bar over the picked card, the minimap and the zoom pill. Pointer and keyboard
 * handling live in canvas-screen.tsx; this only draws and reports.
 */
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { Card, CanvasDocument } from '../api/canvas-api';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/icon';
import { copilotHref } from './copilot-links';
import { type CanvasState, KIND_LOOK, type KindLook, OFFICE_LOOK, cardHeight, hostOf } from './canvas-model';
import type { CanvasMessageKey } from './canvas-messages';
import { kindLabel, originOf } from './space-labels';
import { type ScreenTranslate, useSpaceText } from './space-messages';

export interface BoardView {
  x: number;
  y: number;
  zoom: number;
}

/** The minimap draws the board at this scale (board C15: 0.13). */
const MINI_SCALE = 0.13;
/** Grid spacing at 100%. */
const GRID = 28;

const token = (name: string): string => `var(${name})`;

/** How a card looks: its kind's, or an office file's for a document card of a file. */
function lookOf(card: Card, doc: CanvasDocument | undefined): Pick<KindLook, 'icon' | 'tint' | 'rim' | 'line'> {
  return card.kind === 'document' && doc?.type === 'office' ? OFFICE_LOOK : KIND_LOOK[card.kind];
}

/** A lab document with headings shows its preview (the orb and its first two sections). */
export function hasPreview(card: Card, doc: CanvasDocument | undefined): boolean {
  return card.kind === 'document' && doc?.type === 'lab' && doc.headings.length > 0;
}

/** The middle of a card on the board, where its connections meet it. */
export function cardCentre(card: Card, doc: CanvasDocument | undefined): { x: number; y: number } {
  return { x: card.x + card.w / 2, y: card.y + cardHeight(card, hasPreview(card, doc)) / 2 };
}

/** The colour of a connection: the card that is not a document gives it, else the one it starts from. */
export function connectionColour(from: Card, to: Card, documents: Readonly<Record<string, CanvasDocument>>): string {
  const doc = (card: Card): CanvasDocument | undefined => (card.documentId ? documents[card.documentId] : undefined);
  const source = from.kind === 'document' && to.kind !== 'document' ? to : from;
  return token(lookOf(source, doc(source)).line);
}

interface CardTexts {
  kind: string;
  title: string;
  sub: string | null;
}

function useCardTexts(): (card: Card, doc: CanvasDocument | undefined) => CardTexts {
  const { t: appT } = useI18n();
  const space = useSpaceText();
  return (card, doc) => cardTexts(card, doc, appT, space.t);
}

/** The label, title and small line of a card. */
function cardTexts(card: Card, doc: CanvasDocument | undefined, appT: ReturnType<typeof useI18n>['t'], spaceT: ReturnType<typeof useSpaceText>['t']): CardTexts {
  if (card.kind === 'document') {
    if (!doc) return { kind: '', title: '', sub: null };
    const origin = originOf(doc);
    const kind = doc.type === 'office' ? '' : kindLabel(spaceT, { type: doc.type, title: doc.title });
    return {
      kind: origin === 'official' ? `${kind} · ${appT('origin.official')}` : kind,
      title: doc.title,
      sub: hasPreview(card, doc) || origin === 'official' ? null : appT(`origin.${origin}`),
    };
  }
  return { kind: '', title: card.title, sub: card.kind === 'link' && card.url ? hostOf(card.url) : (card.body ?? null) };
}

interface CanvasBoardProps {
  t: ScreenTranslate<CanvasMessageKey>;
  state: CanvasState;
  documents: Readonly<Record<string, CanvasDocument>>;
  view: BoardView;
  selected: string | null;
  /** The card a connection starts from (the "Nối" tool). */
  connectFrom: string | null;
  /** The card being dragged and where it is now (not yet a change of the board). */
  dragging: { id: string; x: number; y: number } | null;
  panning: boolean;
  onBackgroundDown(event: PointerEvent<HTMLDivElement>): void;
  onCardDown(event: PointerEvent<HTMLButtonElement>, card: Card): void;
  onCardKey(event: KeyboardEvent<HTMLButtonElement>, card: Card): void;
  onCardDoubleClick(card: Card): void;
  onEdit(card: Card): void;
  onDelete(card: Card): void;
}

export function CanvasBoard(props: CanvasBoardProps): ReactNode {
  const { t, state, documents, view, selected, connectFrom, dragging, panning, onBackgroundDown } = props;
  const texts = useCardTexts();
  const placed = state.cards.map((card) => (dragging && dragging.id === card.id ? { ...card, x: dragging.x, y: dragging.y } : card));
  const byId = new Map(placed.map((c) => [c.id, c]));
  const docOf = (card: Card): CanvasDocument | undefined => (card.documentId ? documents[card.documentId] : undefined);
  const picked = selected && !dragging ? byId.get(selected) : undefined;
  const gridSize = Math.round(GRID * view.zoom);

  return (
    <>
      {/* Dragging the background pans; the keyboard zooms with the pill or +/−, and moves cards with the arrows. */}
      <div
        className="canvas-grid"
        data-panning={panning}
        style={{ backgroundSize: `${gridSize}px ${gridSize}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        onPointerDown={onBackgroundDown}
        data-id="canvas-grid"
      />
      <div className="canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }} data-id="canvas-world">
        <svg className="canvas-links" width="1" height="1" aria-hidden="true">
          <defs>
            {state.connections.map((c) => {
              const from = byId.get(c.from);
              const to = byId.get(c.to);
              if (!from || !to) return null;
              const a = cardCentre(from, docOf(from));
              const b = cardCentre(to, docOf(to));
              const colour = connectionColour(from, to, documents);
              return (
                <linearGradient key={c.id} id={`canvas-link-${c.id}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                  <stop offset="0" stopColor={colour} />
                  <stop offset="0.5" className="canvas-link-mid" />
                  <stop offset="1" stopColor={colour} />
                </linearGradient>
              );
            })}
          </defs>
          {state.connections.map((c, i) => {
            const from = byId.get(c.from);
            const to = byId.get(c.to);
            if (!from || !to) return null;
            const a = cardCentre(from, docOf(from));
            const b = cardCentre(to, docOf(to));
            const style = { '--link-colour': connectionColour(from, to, documents) } as CSSProperties;
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            return (
              <g key={c.id} className="canvas-link" style={style} data-id={`canvas-link-${c.from}-${c.to}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={`url(#canvas-link-${c.id})`} />
                <circle
                  r={3.5}
                  className="canvas-link-dot"
                  style={{
                    offsetPath: `path('M${Math.round(a.x)} ${Math.round(a.y)} L${Math.round(b.x)} ${Math.round(b.y)}')`,
                    animationDuration: `${Math.max(3, Math.round(length / 60))}s`,
                    animationDelay: `${-i * 0.9}s`,
                  }}
                />
              </g>
            );
          })}
        </svg>

        <div role="group" aria-label={t('canvas.cards')} className="canvas-cards">
          {placed.map((card) => {
            const doc = docOf(card);
            const look = lookOf(card, doc);
            const text = texts(card, doc);
            const kind = card.kind === 'document' ? text.kind || t(doc ? 'canvas.kind.office' : 'canvas.kind.document') : t(KIND_LOOK[card.kind].label);
            const title = card.kind === 'document' && !doc ? t('canvas.unreadable') : text.title || t('canvas.untitled');
            const style = {
              left: card.x,
              top: card.y,
              width: card.w,
              '--card-tint': token(look.tint),
              '--card-rim': token(look.rim),
            } as CSSProperties;
            return (
              <button
                key={card.id}
                type="button"
                className="canvas-card"
                data-kind={card.kind}
                data-selected={card.id === selected}
                data-connecting={card.id === connectFrom}
                data-size={hasPreview(card, doc) ? 'lg' : card.kind === 'answer' || card.kind === 'risk' || card.kind === 'link' || card.kind === 'note' ? 'sm' : 'md'}
                style={style}
                aria-pressed={card.id === selected}
                aria-label={t('canvas.card', { kind, title })}
                onPointerDown={(event) => props.onCardDown(event, card)}
                onKeyDown={(event) => props.onCardKey(event, card)}
                onDoubleClick={() => props.onCardDoubleClick(card)}
                data-id={`canvas-card-${card.id}`}
              >
                <span className="canvas-card-kind">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d={look.icon} />
                  </svg>
                  {kind}
                </span>
                <span className="canvas-card-title">{title}</span>
                {hasPreview(card, doc) && doc && (
                  <span className="canvas-card-preview" aria-hidden="true">
                    <span className="canvas-card-orb" />
                    <span className="canvas-card-sections">
                      {doc.headings.map((heading) => (
                        <span key={heading}>{heading}</span>
                      ))}
                    </span>
                  </span>
                )}
                {card.kind === 'diagram' && card.steps && card.steps.length > 0 && (
                  <span className="canvas-card-steps" style={{ gridTemplateColumns: `repeat(${card.steps.length}, minmax(0, 1fr))` }}>
                    {card.steps.map((step, i) => (
                      <span key={`${i}-${step}`}>{step}</span>
                    ))}
                  </span>
                )}
                {text.sub && <span className="canvas-card-sub">{text.sub}</span>}
              </button>
            );
          })}
        </div>

        {picked && <CardActions t={t} card={picked} doc={docOf(picked)} onEdit={props.onEdit} onDelete={props.onDelete} />}
      </div>
    </>
  );
}

function CardActions({ t, card, doc, onEdit, onDelete }: { t: ScreenTranslate<CanvasMessageKey>; card: Card; doc: CanvasDocument | undefined; onEdit(card: Card): void; onDelete(card: Card): void }): ReactNode {
  return (
    <div role="toolbar" aria-label={t('canvas.actions')} className="canvas-actions" style={{ left: card.x, top: card.y - 62 }} data-id="canvas-actions">
      {card.kind === 'document' && card.documentId && doc ? (
        <>
          <a className="canvas-action canvas-action-main" href={copilotHref(undefined, { scope: { kind: 'document', id: card.documentId }, from: card.documentId })}>
            <Icon name="sparkles" size={14} />
            {t('canvas.askAi')}
          </a>
          <a className="canvas-action" href={`/d/${encodeURIComponent(card.documentId)}`}>
            {t('canvas.open')}
          </a>
          <button type="button" className="canvas-action" aria-disabled="true" title={t('canvas.soon')}>
            {t('canvas.addToPath')}
          </button>
        </>
      ) : (
        <>
          {card.kind === 'link' && card.url && (
            <a className="canvas-action canvas-action-main" href={card.url} target="_blank" rel="noopener noreferrer">
              <Icon name="link" size={14} />
              {t('canvas.openLink')}
            </a>
          )}
          <button type="button" className="canvas-action" onClick={() => onEdit(card)}>
            {t('canvas.edit')}
          </button>
          <button type="button" className="canvas-action" onClick={() => onDelete(card)}>
            {t('canvas.delete')}
          </button>
        </>
      )}
    </div>
  );
}

interface MinimapProps {
  t: ScreenTranslate<CanvasMessageKey>;
  state: CanvasState;
  documents: Readonly<Record<string, CanvasDocument>>;
  view: BoardView;
}

export function CanvasMinimap({ t, state, documents, view }: MinimapProps): ReactNode {
  return (
    <div className="canvas-minimap canvas-glass" role="img" aria-label={t('canvas.minimap')} data-id="canvas-minimap">
      {state.cards.map((card) => {
        const doc = card.documentId ? documents[card.documentId] : undefined;
        const colour = token(lookOf(card, doc).rim);
        return (
          <span
            key={card.id}
            className="canvas-minimap-card"
            style={{
              left: 10 + card.x * MINI_SCALE,
              top: 6 + card.y * MINI_SCALE,
              width: Math.max(8, card.w * MINI_SCALE),
              height: Math.max(6, cardHeight(card, hasPreview(card, doc)) * MINI_SCALE),
              background: colour,
              boxShadow: `0 0 6px ${colour}`,
            }}
          />
        );
      })}
      <span
        className="canvas-minimap-view"
        style={{ left: 10 - (view.x * MINI_SCALE) / view.zoom, top: 6 - (view.y * MINI_SCALE) / view.zoom, width: 180 / view.zoom, height: 112 / view.zoom }}
      />
    </div>
  );
}
