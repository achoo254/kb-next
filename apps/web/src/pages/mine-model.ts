/**
 * "Của tôi" (board C08) without React: the account's documents and canvases as one list of items, the type and status
 * filters, the orbits of "Vũ trụ của tôi" (draft, private, published), the planet picked first, and the "x ngày
 * trước" of edits and deletions.
 */
import type { MyDocument, TrashedDocument } from '../api/authoring-api';
import type { CanvasListItem } from '../api/canvas-api';
import type { CollectionBrief, DocumentSummary, SpaceBrief } from '../api/content-api';
import type { Locale } from '../i18n/i18n';

export const MINE_TABS = ['universe', 'recent', 'favorites', 'trash'] as const;
export type MineTab = (typeof MINE_TABS)[number];

/** The board's type filter: written texts (notes, labs, processes, web pages), Office files, journeys, canvases. */
export const TYPE_FILTERS = ['all', 'note', 'office', 'journey', 'canvas'] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];
export type ItemType = Exclude<TypeFilter, 'all'>;

/**
 * Where a text stands, as C08 tells them apart: `approved` is published, `hidden` a published text an admin took off
 * the Universe. Texts left from the review gate (`pending`, `changes_requested`, `rejected`) are private.
 */
export const STATUS_FILTERS = ['all', 'draft', 'private', 'approved', 'hidden'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export type ItemStatus = Exclude<StatusFilter, 'all'>;

export interface MineItem {
  /** Unique across documents and canvases. */
  key: string;
  id: string;
  kind: 'document' | 'canvas';
  title: string;
  type: ItemType;
  /** The document's own type (its kind label), null for a canvas. */
  docType: DocumentSummary['type'] | null;
  status: ItemStatus;
  updatedAt: string;
  favorite: boolean;
  origin: DocumentSummary['origin'] | null;
  space: SpaceBrief | null;
  collection: CollectionBrief | null;
  /** Where "Mở" goes. */
  href: string;
}

export function itemTypeOf(type: DocumentSummary['type']): ItemType {
  if (type === 'office') return 'office';
  if (type === 'journey') return 'journey';
  return 'note';
}

export function itemStatusOf(doc: Pick<MyDocument, 'status' | 'hidden'>): ItemStatus {
  switch (doc.status) {
    case 'approved':
      return doc.hidden ? 'hidden' : 'approved';
    case 'draft':
      return 'draft';
    default:
      return 'private';
  }
}

export function documentItem(doc: MyDocument): MineItem {
  return {
    key: doc.id,
    id: doc.id,
    kind: 'document',
    title: doc.title,
    type: itemTypeOf(doc.type),
    docType: doc.type,
    status: itemStatusOf(doc),
    updatedAt: doc.updatedAt,
    favorite: doc.favorite,
    origin: doc.origin,
    space: doc.space,
    collection: doc.collection,
    href: `/d/${encodeURIComponent(doc.id)}`,
  };
}

/** A canvas: always the account's own and private (C15 shows it to its owner only). */
export function canvasItem(canvas: CanvasListItem, spaces: readonly SpaceBrief[]): MineItem {
  return {
    key: `canvas:${canvas.id}`,
    id: canvas.id,
    kind: 'canvas',
    title: canvas.title,
    type: 'canvas',
    docType: null,
    status: 'private',
    updatedAt: canvas.updatedAt,
    favorite: false,
    origin: null,
    space: spaces.find((space) => space.slug === canvas.spaceSlug) ?? null,
    collection: null,
    href: `/canvas/${encodeURIComponent(canvas.id)}`,
  };
}

/** The account's documents (as the API orders them, last changed first), then its canvases. */
export function mineItems(docs: readonly MyDocument[], canvases: readonly CanvasListItem[], spaces: readonly SpaceBrief[]): MineItem[] {
  return [...docs.map(documentItem), ...canvases.map((canvas) => canvasItem(canvas, spaces))];
}

export interface Filters {
  type: TypeFilter;
  status: StatusFilter;
}

export const NO_FILTER: Filters = { type: 'all', status: 'all' };

export function matches(item: Pick<MineItem, 'type' | 'status'>, filters: Filters): boolean {
  return (filters.type === 'all' || item.type === filters.type) && (filters.status === 'all' || item.status === filters.status);
}

/** A document of another list (recent, favourites, trash) under the same filters. */
export function documentMatches(doc: Pick<MyDocument, 'type' | 'status' | 'hidden'>, filters: Filters): boolean {
  return matches({ type: itemTypeOf(doc.type), status: itemStatusOf(doc) }, filters);
}

/** The ring of a status: 1 being written (ĐANG SOẠN), 2 private (RIÊNG TƯ), 3 published (ĐÃ CÔNG KHAI). */
export function ringOf(status: ItemStatus): 1 | 2 | 3 {
  switch (status) {
    case 'draft':
      return 1;
    case 'private':
      return 2;
    case 'approved':
    case 'hidden':
      return 3;
  }
}

/** The centre of the orbits and the half-axes of each ring, in the board's px of the panel. */
export const ORBIT_CENTRE = { x: 486, y: 278 } as const;
export const RINGS: Readonly<Record<1 | 2 | 3, { rx: number; ry: number }>> = { 1: { rx: 150, ry: 92 }, 2: { rx: 270, ry: 160 }, 3: { rx: 400, ry: 240 } };
const PLANET = 46;

export interface PlacedPlanet {
  item: MineItem;
  x: number;
  y: number;
  size: number;
}

/** Where each planet sits: spread evenly around its ring from a turn of 35° per ring. */
export function orbitLayout(items: readonly MineItem[]): PlacedPlanet[] {
  const placed: PlacedPlanet[] = [];
  for (const ring of [1, 2, 3] as const) {
    const on = items.filter((item) => ringOf(item.status) === ring);
    const { rx, ry } = RINGS[ring];
    on.forEach((item, index) => {
      const angle = ((ring * 35 + (index * 360) / on.length) * Math.PI) / 180;
      placed.push({ item, x: Math.round(ORBIT_CENTRE.x + rx * Math.cos(angle) - PLANET / 2), y: Math.round(ORBIT_CENTRE.y + ry * Math.sin(angle) - PLANET / 2), size: PLANET });
    });
  }
  return placed;
}

/** The planet shown first: the last changed. */
export function firstPick(items: readonly MineItem[]): string | null {
  return items[0]?.key ?? null;
}

/** Whether the account's own universe is empty: no personal Space, or one without any document. */
export function personalUniverseEmpty(docs: readonly Pick<MyDocument, 'space'>[], personalSlug: string | null): boolean {
  return personalSlug === null || !docs.some((doc) => doc.space.slug === personalSlug);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days left before a trashed document is deleted for good (at least 0). */
export function daysLeft(doc: Pick<TrashedDocument, 'purgeAt'>, now: number): number {
  return Math.max(0, Math.ceil((new Date(doc.purgeAt).getTime() - now) / DAY_MS));
}

/** "hôm qua", "2 ngày trước", "tuần trước", "1 giờ trước": how long ago, from `now`, to follow "sửa" or "Xoá". */
export function ago(locale: Locale, iso: string, now: number, unit: 'week' | 'day' = 'week'): string {
  const text = relative(locale, iso, now, unit);
  return text.charAt(0).toLocaleLowerCase(locale) + text.slice(1);
}

/** `day`: never in weeks (a deletion counts down in days: "Xoá 27 ngày trước · còn 3 ngày"). */
function relative(locale: Locale, iso: string, now: number, largest: 'week' | 'day'): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { numeric: 'auto' });
  const steps: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 86400],
    ['month', 30 * 86400],
    ['week', 7 * 86400],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (largest === 'day' && (unit === 'week' || unit === 'month' || unit === 'year')) continue;
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  }
  return format.format(0, 'minute');
}
