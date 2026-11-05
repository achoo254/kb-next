/**
 * The `canvases` table (C15): an account's own boards, read and written only by their owner. A save carries the
 * client's change counter (`rev`); one older than what is stored is refused (`stale`), so a slow request or a second
 * tab never puts back an earlier state.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { canvases } from '../db/schema';
import { isUuid } from '../access/ids';
import { type CanvasData, EMPTY_CANVAS, type StoredCanvas, readStored } from './canvas-data';

export interface CanvasRow {
  id: string;
  title: string;
  stored: StoredCanvas;
  createdAt: Date;
  updatedAt: Date;
}

const columns = { id: canvases.id, title: canvases.title, data: canvases.data, createdAt: canvases.createdAt, updatedAt: canvases.updatedAt };

function toRow(row: { id: string; title: string; data: unknown; createdAt: Date; updatedAt: Date }): CanvasRow {
  return { id: row.id, title: row.title, stored: readStored(row.data), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

/** The owner's canvases, most recently changed first; only those of `spaceId` when given. */
export async function listCanvases(db: Db, ownerId: string, spaceId?: string): Promise<CanvasRow[]> {
  const rows = await db
    .select(columns)
    .from(canvases)
    .where(and(eq(canvases.ownerId, ownerId), spaceId ? sql`${canvases.data}->>'spaceId' = ${spaceId}` : undefined))
    .orderBy(desc(canvases.updatedAt), desc(canvases.id));
  return rows.map(toRow);
}

export async function createCanvas(db: Db, ownerId: string, title: string, spaceId: string | null, at: Date): Promise<CanvasRow> {
  const stored: StoredCanvas = { spaceId, canvas: EMPTY_CANVAS };
  const [row] = await db.insert(canvases).values({ ownerId, title, data: stored, createdAt: at, updatedAt: at }).returning(columns);
  if (!row) throw new Error('canvas insert returned nothing');
  return toRow(row);
}

/** One of the owner's canvases; null for someone else's (never told apart from a missing one) or a bad id. */
export async function findCanvas(db: Db, ownerId: string, id: string): Promise<CanvasRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select(columns)
    .from(canvases)
    .where(and(eq(canvases.id, id), eq(canvases.ownerId, ownerId)));
  return row ? toRow(row) : null;
}

export type SaveResult = { kind: 'saved'; updatedAt: Date } | { kind: 'stale'; rev: number } | { kind: 'not-found' };

/** Writes the title and canvas when `canvas.rev` is not older than the stored one; the Space stays as it was. */
export async function saveCanvas(db: Db, ownerId: string, id: string, title: string, canvas: CanvasData, at: Date): Promise<SaveResult> {
  const current = await findCanvas(db, ownerId, id);
  if (!current) return { kind: 'not-found' };
  const stored: StoredCanvas = { spaceId: current.stored.spaceId, canvas };
  const [row] = await db
    .update(canvases)
    .set({ title, data: stored, updatedAt: at })
    // Checked in the same statement, so two saves racing cannot both pass with the older one last.
    .where(and(eq(canvases.id, id), eq(canvases.ownerId, ownerId), sql`coalesce((${canvases.data}->'canvas'->>'rev')::bigint, 0) <= ${canvas.rev}`))
    .returning({ updatedAt: canvases.updatedAt });
  if (row) return { kind: 'saved', updatedAt: row.updatedAt };
  const latest = await findCanvas(db, ownerId, id);
  return latest ? { kind: 'stale', rev: latest.stored.canvas.rev } : { kind: 'not-found' };
}

export async function deleteCanvas(db: Db, ownerId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const removed = await db
    .delete(canvases)
    .where(and(eq(canvases.id, id), eq(canvases.ownerId, ownerId)))
    .returning({ id: canvases.id });
  return removed.length > 0;
}
