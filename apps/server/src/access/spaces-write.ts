/**
 * Creating Spaces and Collections. A member owns one personal Space ("Vũ trụ của bạn", only they see it) and makes
 * Collections in it; public Spaces are made by admins (through the API), who may add Collections anywhere. Where a
 * new document may go: a public Space, or the writer's own personal Space.
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { collections, spaces } from '../db/schema';
import type { CollectionRow, SpaceRow } from './content';
import { isUuid } from './ids';
import type { Viewer } from './viewer';

type UserViewer = Extract<Viewer, { kind: 'user' }>;

/** The crystal of every personal Space (board C09 "Vũ trụ của bạn"). */
export const PERSONAL_SPACE_LOOK = {
  nameVi: 'Vũ trụ của bạn',
  nameEn: 'Your universe',
  tint: '#F9A8D4',
  glow: '#EC4899',
  art: '/art/crystal-personal.webp',
  unitVi: 'tệp',
  unitEn: 'files',
  descriptionVi: 'Tệp và ghi chú riêng của bạn, chỉ bạn thấy.',
  descriptionEn: 'Your own files and notes, visible only to you.',
} as const;

/** The slug of an account's personal Space. */
export function personalSlug(userId: string): string {
  return `personal-${userId}`;
}

export async function findPersonalSpace(db: Db, userId: string): Promise<SpaceRow | null> {
  const [row] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.kind, 'personal'), eq(spaces.ownerId, userId)))
    .limit(1);
  return row ?? null;
}

/** The account's personal Space, made on first use; `created` says whether this call made it. */
export async function ensurePersonalSpace(db: Db, viewer: UserViewer): Promise<{ space: SpaceRow; created: boolean }> {
  const existing = await findPersonalSpace(db, viewer.userId);
  if (existing) return { space: existing, created: false };
  const [row] = await db
    .insert(spaces)
    .values({ slug: personalSlug(viewer.userId), kind: 'personal', ownerId: viewer.userId, sortOrder: 1_000, ...PERSONAL_SPACE_LOOK })
    // Two first notes at once: the second finds the Space the first made.
    .onConflictDoNothing({ target: spaces.slug })
    .returning();
  if (row) return { space: row, created: true };
  const raced = await findPersonalSpace(db, viewer.userId);
  if (!raced) throw new Error('personal Space neither inserted nor found');
  return { space: raced, created: false };
}

export interface NewPublicSpace {
  slug: string;
  nameVi: string;
  nameEn: string;
  tint: string;
  glow: string;
  art: string;
  unitVi: string;
  unitEn: string;
  descriptionVi: string | null;
  descriptionEn: string | null;
}

/** A public Space (admins only; the caller checks). Null when the slug is taken. */
export async function createPublicSpace(db: Db, input: NewPublicSpace): Promise<SpaceRow | null> {
  const [row] = await db
    .insert(spaces)
    .values({ ...input, kind: 'public', ownerId: null, sortOrder: 500 })
    .onConflictDoNothing({ target: spaces.slug })
    .returning();
  return row ?? null;
}

export type SpaceForWriting = { kind: 'ok'; space: SpaceRow } | { kind: 'not-found' } | { kind: 'no-access' };

/** A Space `viewer` may put a new document in: any public Space, or their own personal one. */
export async function spaceForWriting(db: Db, viewer: UserViewer, slug: string): Promise<SpaceForWriting> {
  const [space] = await db.select().from(spaces).where(eq(spaces.slug, slug));
  if (!space) return { kind: 'not-found' };
  if (space.kind === 'personal' && space.ownerId !== viewer.userId) return { kind: 'no-access' };
  return { kind: 'ok', space };
}

/** A Collection of `spaceId`, or null. */
export async function collectionIn(db: Db, spaceId: string, collectionId: string): Promise<CollectionRow | null> {
  if (!isUuid(collectionId)) return null;
  const [row] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.spaceId, spaceId)));
  return row ?? null;
}

/** A Collection by its id alone, or null. */
export async function findCollectionById(db: Db, collectionId: string): Promise<CollectionRow | null> {
  if (!isUuid(collectionId)) return null;
  const [row] = await db.select().from(collections).where(eq(collections.id, collectionId));
  return row ?? null;
}

/** Whether `viewer` may add Collections to `space`: its owner (personal), or an admin. */
export function mayAddCollection(viewer: UserViewer, space: SpaceRow): boolean {
  return viewer.isAdmin || (space.kind === 'personal' && space.ownerId === viewer.userId);
}

export async function createCollection(db: Db, space: SpaceRow, input: { nameVi: string; nameEn: string }): Promise<CollectionRow> {
  const [row] = await db
    .insert(collections)
    .values({ spaceId: space.id, nameVi: input.nameVi, nameEn: input.nameEn, tint: space.tint, glow: space.glow, sortOrder: 1_000 })
    .returning();
  if (!row) throw new Error('collection insert returned nothing');
  return row;
}
