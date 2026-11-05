/**
 * What a Canvas (C15) holds, checked at the API boundary and again when read back: cards (a document, a note, an
 * idea, a risk, an AI answer, a diagram, a web link) at board coordinates, and the connections between them. `rev`
 * counts the client's changes, so a late save never overwrites a newer one (src/canvas/canvas-store.ts).
 */
import { z } from 'zod';
import { isUuid } from '../access/ids';

export const CARD_KINDS = ['document', 'note', 'idea', 'risk', 'answer', 'diagram', 'link'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const MAX_CARDS = 200;
export const MAX_CONNECTIONS = 400;
export const MAX_CANVAS_TITLE = 120;
/** How far from the origin a card may sit, in board px (an "infinite" board with a bound). */
const MAX_COORD = 50_000;

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const Coord = z.number().finite().min(-MAX_COORD).max(MAX_COORD);

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export const CardSchema = z
  .strictObject({
    id: Id,
    kind: z.enum(CARD_KINDS),
    x: Coord,
    y: Coord,
    w: z.number().int().min(160).max(480),
    title: z.string().max(200),
    body: z.string().max(1000).optional(),
    /** A diagram's boxes ("D", "O", "R", "A"). */
    steps: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
    documentId: z.string().refine(isUuid).optional(),
    url: z.string().max(500).refine(isWebUrl).optional(),
  })
  .refine((card) => (card.kind === 'document') === (card.documentId !== undefined), { message: 'a document card names its document' })
  .refine((card) => (card.kind === 'link') === (card.url !== undefined), { message: 'a link card has its url' });
export type Card = z.infer<typeof CardSchema>;

export const ConnectionSchema = z.strictObject({ id: Id, from: Id, to: Id });
export type Connection = z.infer<typeof ConnectionSchema>;

export const CanvasDataSchema = z
  .strictObject({
    rev: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    cards: z.array(CardSchema).max(MAX_CARDS),
    connections: z.array(ConnectionSchema).max(MAX_CONNECTIONS),
  })
  .superRefine((data, ctx) => {
    const cards = new Set(data.cards.map((c) => c.id));
    if (cards.size !== data.cards.length) ctx.addIssue({ code: 'custom', message: 'duplicate card id' });
    const pairs = new Set<string>();
    for (const c of data.connections) {
      if (c.from === c.to || !cards.has(c.from) || !cards.has(c.to)) ctx.addIssue({ code: 'custom', message: 'connection between unknown cards' });
      const pair = [c.from, c.to].sort().join('|');
      if (pairs.has(pair)) ctx.addIssue({ code: 'custom', message: 'duplicate connection' });
      pairs.add(pair);
    }
  });
export type CanvasData = z.infer<typeof CanvasDataSchema>;

export const EMPTY_CANVAS: CanvasData = { rev: 0, cards: [], connections: [] };

/** What `canvases.data` stores: the client's canvas and the Space it belongs to (set by the server only). */
export type StoredCanvas = {
  spaceId: string | null;
  canvas: CanvasData;
};

const StoredSchema = z.object({ spaceId: z.string().refine(isUuid).nullable(), canvas: CanvasDataSchema });

/** A stored canvas read back; a row that no longer parses (never written by this code) reads as an empty one. */
export function readStored(raw: unknown): StoredCanvas {
  const parsed = StoredSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.error('canvas data unreadable, shown empty');
  const spaceId = typeof raw === 'object' && raw !== null && 'spaceId' in raw && typeof raw.spaceId === 'string' && isUuid(raw.spaceId) ? raw.spaceId : null;
  return { spaceId, canvas: EMPTY_CANVAS };
}
