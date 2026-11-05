import { describe, expect, it } from 'vitest';
import type { Card } from '../api/canvas-api';
import { nextRev } from './canvas-autosave';
import { HISTORY_LIMIT, addCard, cardHeight, commit, connect, disconnect, freshId, hostOf, moveCard, redo, removeCard, startHistory, undo, updateCard } from './canvas-model';

const card = (id: string, extra: Partial<Card> = {}): Card => ({ id, kind: 'note', x: 0, y: 0, w: 220, title: id, ...extra });
const BOARD = { title: 'Bảng', cards: [card('a'), card('b'), card('c')], connections: [{ id: 'k1', from: 'a', to: 'b' }] };

describe('history', () => {
  it('undoes and redoes changes, and a new change clears what was undone', () => {
    let h = startHistory(BOARD);
    h = commit(h, moveCard(h.present, 'a', 10, 20));
    h = commit(h, removeCard(h.present, 'c'));
    expect(h.present.cards.map((c) => c.id)).toEqual(['a', 'b']);
    h = undo(h);
    expect(h.present.cards.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    h = undo(h);
    expect(h.present).toBe(BOARD);
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present.cards[0]).toMatchObject({ x: 10, y: 20 });
    h = commit(h, updateCard(h.present, 'b', { title: 'B' }));
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
  });

  it('keeps no-op changes out and remembers at most HISTORY_LIMIT steps', () => {
    let h = startHistory(BOARD);
    expect(commit(h, moveCard(h.present, 'a', 0, 0))).toBe(h);
    for (let i = 1; i <= HISTORY_LIMIT + 5; i += 1) h = commit(h, moveCard(h.present, 'a', i, 0));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('cards and connections', () => {
  it('connects two cards once either way round, never a card to itself or an unknown one', () => {
    expect(connect(BOARD, 'b', 'a')).toBe(BOARD);
    expect(connect(BOARD, 'a', 'a')).toBe(BOARD);
    expect(connect(BOARD, 'a', 'zz')).toBe(BOARD);
    const joined = connect(BOARD, 'a', 'c');
    expect(joined.connections.at(-1)).toMatchObject({ from: 'a', to: 'c' });
    expect(disconnect(joined, joined.connections.at(-1)?.id ?? '').connections).toEqual(BOARD.connections);
  });

  it('removes a card with its connections, and keeps widths in range', () => {
    expect(removeCard(BOARD, 'a').connections).toEqual([]);
    expect(updateCard(BOARD, 'a', { w: 5000 }).cards[0]?.w).toBe(480);
    expect(updateCard(BOARD, 'a', { w: 10 }).cards[0]?.w).toBe(160);
    expect(updateCard(BOARD, 'zz', { title: 'x' })).toBe(BOARD);
  });

  it('gives fresh ids and stops adding at the limit', () => {
    expect(freshId(BOARD, 'c')).toBe('c5');
    expect(freshId({ ...BOARD, cards: [card('c3')] }, 'c')).toBe('c4');
    const full = { ...BOARD, cards: Array.from({ length: 200 }, (_, i) => card(`x${i}`)) };
    expect(addCard(full, card('one-more'))).toBe(full);
  });

  it("meets connections at the board's card heights, and names a link by its host", () => {
    expect(cardHeight(card('d', { kind: 'document' }), true)).toBe(210);
    expect(cardHeight(card('d', { kind: 'document' }), false)).toBe(110);
    expect(cardHeight(card('r', { kind: 'risk' }), false)).toBe(90);
    expect(hostOf('https://datatracker.ietf.org/doc/html/rfc2131')).toBe('datatracker.ietf.org');
    expect(hostOf('not a url')).toBe('not a url');
  });
});

describe('change counter', () => {
  it('always grows and never falls behind the clock', () => {
    expect(nextRev(5, 3)).toBe(6);
    expect(nextRev(5, 1000)).toBe(1000);
  });
});
