/**
 * What a Canvas (C15) is while being edited, as plain functions: its cards and connections, the undo/redo history
 * (⌘Z / ⇧⌘Z, board Interaction), and how each kind of card looks (its label, icon, colours as kit tokens and the
 * height its connections meet it at).
 */
import { type Card, type CardKind, CARD_MAX_WIDTH, CARD_MIN_WIDTH, type Connection, MAX_CARDS } from '../api/canvas-api';
import type { CanvasMessageKey } from './canvas-messages';

export interface CanvasState {
  title: string;
  cards: Card[];
  connections: Connection[];
}

/** The steps that can be undone, the board now, and the steps undone that can be redone. */
export interface History {
  past: CanvasState[];
  present: CanvasState;
  future: CanvasState[];
}

/** How many steps back ⌘Z reaches. */
export const HISTORY_LIMIT = 100;

export function startHistory(state: CanvasState): History {
  return { past: [], present: state, future: [] };
}

/** A change made: undoable, and it clears what was undone. Nothing changes when `next` is the board as it is. */
export function commit(history: History, next: CanvasState): History {
  if (next === history.present) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undo(history: History): History {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}

/** An id unused by the cards and connections of `state` (`c1`, `c2`… for cards, `k1`… for connections). */
export function freshId(state: CanvasState, prefix: 'c' | 'k'): string {
  const taken = new Set([...state.cards.map((c) => c.id), ...state.connections.map((c) => c.id)]);
  let n = state.cards.length + state.connections.length + 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function addCard(state: CanvasState, card: Card): CanvasState {
  if (state.cards.length >= MAX_CARDS) return state;
  return { ...state, cards: [...state.cards, card] };
}

export function updateCard(state: CanvasState, id: string, change: Partial<Omit<Card, 'id'>>): CanvasState {
  if (!state.cards.some((c) => c.id === id)) return state;
  return { ...state, cards: state.cards.map((c) => (c.id === id ? { ...c, ...change, w: clampWidth(change.w ?? c.w) } : c)) };
}

export function moveCard(state: CanvasState, id: string, x: number, y: number): CanvasState {
  const card = state.cards.find((c) => c.id === id);
  if (!card || (card.x === x && card.y === y)) return state;
  return updateCard(state, id, { x, y });
}

/** Removes a card and its connections. */
export function removeCard(state: CanvasState, id: string): CanvasState {
  return { ...state, cards: state.cards.filter((c) => c.id !== id), connections: state.connections.filter((c) => c.from !== id && c.to !== id) };
}

export function areConnected(state: Pick<CanvasState, 'connections'>, a: string, b: string): boolean {
  return state.connections.some((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a));
}

/** Connects two different cards once (either way round counts as the same connection). */
export function connect(state: CanvasState, from: string, to: string): CanvasState {
  const ids = new Set(state.cards.map((c) => c.id));
  if (from === to || !ids.has(from) || !ids.has(to) || areConnected(state, from, to)) return state;
  return { ...state, connections: [...state.connections, { id: freshId(state, 'k'), from, to }] };
}

export function disconnect(state: CanvasState, connectionId: string): CanvasState {
  if (!state.connections.some((c) => c.id === connectionId)) return state;
  return { ...state, connections: state.connections.filter((c) => c.id !== connectionId) };
}

function clampWidth(w: number): number {
  return Math.min(CARD_MAX_WIDTH, Math.max(CARD_MIN_WIDTH, Math.round(w)));
}

export interface KindLook {
  label: CanvasMessageKey;
  /** The SVG path of its icon (board C15). */
  icon: string;
  /** Kit tokens: the label's tint, the rim and glow colour, and the colour of the connections it starts. */
  tint: string;
  rim: string;
  line: string;
}

/** Board C15's card looks. A document's label is its kind and origin instead of `label`. */
export const KIND_LOOK: Record<CardKind, KindLook> = {
  document: { label: 'canvas.kind.document', icon: 'M6 3h8l4 4v14H6z', tint: '--violet-300', rim: '--violet-500', line: '--violet-400' },
  note: { label: 'canvas.kind.note', icon: 'M4 4h16v12l-4 4H4zM16 16v4', tint: '--violet-200', rim: '--violet-400', line: '--violet-400' },
  idea: {
    label: 'canvas.kind.idea',
    icon: 'M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.7.6-1 1.4-1 2.5H9c0-1.1-.3-1.9-1-2.5A6 6 0 0 1 12 3z',
    tint: '--amber-200',
    rim: '--amber-500',
    line: '--amber-500',
  },
  risk: { label: 'canvas.kind.risk', icon: 'M12 3l10 18H2zM12 10v4M12 17v.5', tint: '--amber-300', rim: '--amber-500', line: '--amber-500' },
  answer: { label: 'canvas.kind.answer', icon: 'M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z', tint: '--dark-success-text', rim: '--emerald-500', line: '--orbit-tint-obs' },
  diagram: { label: 'canvas.kind.diagram', icon: 'M5 4h6v5H5zM13 15h6v5h-6zM8 9v4h8v2', tint: '--cyan-200', rim: '--cyan-500', line: '--cyan-400' },
  link: {
    label: 'canvas.kind.link',
    icon: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    tint: '--cyan-200',
    rim: '--cyan-400',
    line: '--cyan-400',
  },
};

/** An office file's card reads like the board's "Tệp Office" card. */
export const OFFICE_LOOK: Pick<KindLook, 'icon' | 'tint' | 'rim' | 'line'> = { icon: 'M6 3h8l4 4v14H6zM14 3v4h4', tint: '--violet-200', rim: '--violet-400', line: '--violet-400' };

/** Where connections meet a card: its middle, from the board's heights per kind (a lab document with its preview is taller). */
export function cardHeight(card: Card, preview: boolean): number {
  switch (card.kind) {
    case 'document':
      return preview ? 210 : 110;
    case 'risk':
      return 90;
    case 'link':
    case 'note':
      return 100;
    default:
      return 120;
  }
}

/** The host of a link card's address ("datatracker.ietf.org"), or the address itself when it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
