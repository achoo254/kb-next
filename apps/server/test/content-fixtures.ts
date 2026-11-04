/** Rows for access and search tests, written straight to the database (tests may; app code goes through access/). */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../src/db/client';
import { chunks, documents, links, spaces, users } from '../src/db/schema';

type DocumentInsert = typeof documents.$inferInsert;

export async function createUser(db: Db, sub: string = `test:${randomUUID()}`): Promise<string> {
  const [row] = await db.insert(users).values({ sub, createdAt: new Date() }).returning({ id: users.id });
  if (!row) throw new Error('no user row');
  return row.id;
}

export async function createSpace(db: Db, slug: string = `space-${randomUUID()}`, ownerId: string | null = null): Promise<string> {
  const [row] = await db
    .insert(spaces)
    .values({
      slug,
      nameVi: slug,
      nameEn: slug,
      tint: '#C4B5FD',
      glow: '#8B5CF6',
      art: '/art/crystal-networking.webp',
      kind: ownerId ? 'personal' : 'public',
      ownerId,
      unitVi: 'bài',
      unitEn: 'articles',
    })
    .returning({ id: spaces.id });
  if (!row) throw new Error('no space row');
  return row.id;
}

export interface DocumentFixture extends Partial<DocumentInsert> {
  spaceId: string;
  authorId: string;
  /** Chunk texts; anchors are `c0`, `c1`… */
  texts?: string[];
}

export async function createDocument(db: Db, fixture: DocumentFixture): Promise<string> {
  const { texts = [], ...values } = fixture;
  const [row] = await db
    .insert(documents)
    .values({ title: 'Untitled', type: 'note', lang: 'vi', origin: 'community', status: 'approved', ...values })
    .returning({ id: documents.id });
  if (!row) throw new Error('no document row');
  if (texts.length > 0) {
    await db.insert(chunks).values(texts.map((text, position) => ({ documentId: row.id, anchor: `c${position}`, position, text })));
  }
  return row.id;
}

export async function updateDocument(db: Db, id: string, values: Partial<DocumentInsert>): Promise<void> {
  await db.update(documents).set(values).where(eq(documents.id, id));
}

export async function createLink(db: Db, sourceId: string, targetId: string): Promise<void> {
  await db.insert(links).values({ sourceId, targetId, kind: 'wikilink' });
}
