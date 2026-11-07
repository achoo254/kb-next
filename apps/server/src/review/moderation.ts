/**
 * What the publishing lifecycle does around src/access/review.ts, shared by the web session routes (C04, C06, C08,
 * A02) and the admin API (token): where a text goes, the author publishing it or keeping it private, hiding and
 * showing, editing a published text's details, and the shapes the API answers with. Every change enqueues the
 * document for search sync; hiding and showing tell the author (C20).
 */
import { saveDocument } from '../access/authoring';
import type { CollectionRow, DocumentRow, SpaceRow } from '../access/content';
import { findLatestVersion } from '../access/content';
import { listCollectionsOf, spacesById, userNames } from '../access/reading';
import {
  type AdminViewer,
  type Placement,
  type PublishSettings,
  type PublishedEntry,
  findForAdmin,
  keepPrivate,
  publishDocument,
  renameDocument,
  setHidden,
  setPlacementAndTags,
} from '../access/review';
import { findCollectionById, spaceForWriting } from '../access/spaces-write';
import { isUuid } from '../access/ids';
import type { Viewer } from '../access/viewer';
import { bodyOf } from '../authoring/markdown-text';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { HttpError } from '../http-error';
import { clearSubmittedNotices, nameOf, notifyAfter } from '../notifications/notification-store';
import { safeErrorText } from '../log-error';
import type { IndexSync } from '../search/index-sync';
import { type CollectionBrief, type SpaceBrief, collectionBrief, spaceBrief } from '../api/content-views';

type UserViewer = Extract<Viewer, { kind: 'user' }>;
type Lang = 'vi' | 'en';

export interface ModerationDeps {
  config: ServerConfig;
  db: Db;
  now: () => Date;
  sync: IndexSync | null;
}

/** Where to put a text: a Collection (its id), or a Space (its slug), as the request names them. */
export interface PlacementRequest {
  space?: string;
  collection?: string;
}

/**
 * The Space and Collection a request names, checked: a Space the viewer may write in (`publicOnly`: a public one),
 * and a Collection of it. A `collection` that is not an id is read as a Space's slug (the admin API's sample sends
 * `"collection": "networking"`). Undefined when the request names neither; 404 `not-found` / 403 `no-access` for
 * the Space, 400 `unknown-collection`.
 */
export async function resolvePlacement(db: Db, viewer: UserViewer, request: PlacementRequest, publicOnly: boolean): Promise<Placement | undefined> {
  const collectionId = request.collection && isUuid(request.collection) ? request.collection : undefined;
  const slug = request.space ?? (request.collection && !collectionId ? request.collection : undefined);
  if (!slug && !collectionId) return undefined;
  const collection = collectionId ? await findCollectionById(db, collectionId) : null;
  if (collectionId && !collection) throw new HttpError(400, 'unknown-collection');
  const spaceSlug = slug ?? (collection ? (await spacesById(db, [collection.spaceId]))[0]?.slug : undefined);
  if (!spaceSlug) throw new HttpError(400, 'unknown-collection');
  const access = await spaceForWriting(db, viewer, spaceSlug);
  if (access.kind === 'not-found') throw new HttpError(404, 'not-found');
  if (access.kind === 'no-access') throw new HttpError(403, 'no-access');
  if (collection && collection.spaceId !== access.space.id) throw new HttpError(400, 'unknown-collection');
  if (publicOnly && access.space.kind !== 'public') throw new HttpError(403, 'no-access');
  return { spaceId: access.space.id, collectionId: collection?.id ?? null };
}

/** Tags as stored: trimmed, without repeats, in the order given. */
export function cleanTags(tags: readonly string[] | undefined): string[] | undefined {
  if (!tags) return undefined;
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
}

export interface PublishResponse {
  status: 'approved';
  /** An admin hid it earlier: published, but off the Universe until an admin shows it. */
  hidden: boolean;
  publishedAt: string;
}

/** Cleanup after a text left from the review gate changed step; never turns the author's change into a failure. */
async function dropWaitingNotices(db: Db, id: string, status: DocumentRow['status']): Promise<void> {
  if (status !== 'pending') return;
  await clearSubmittedNotices(db, id).catch((error: unknown) => console.error('notice cleanup failed', safeErrorText(error)));
}

/** Publishes the author's text at once (C04 "Đăng công khai"): the access rule, then the search sync. */
export async function publishText(deps: ModerationDeps, viewer: UserViewer, id: string, input: PublishSettings): Promise<PublishResponse> {
  const { db, now } = deps;
  const at = now();
  const result = await publishDocument(db, viewer, id, input, at);
  switch (result.kind) {
    case 'published':
      break;
    case 'not-found':
      throw new HttpError(404, 'not-found');
    case 'no-access':
      throw new HttpError(403, 'no-access');
    case 'title-required':
    case 'body-required':
      throw new HttpError(400, result.kind);
    case 'already-published':
      throw new HttpError(409, 'already-published');
  }
  deps.sync?.enqueue([id]);
  await dropWaitingNotices(db, id, result.was);
  return { status: 'approved', hidden: result.doc.hidden, publishedAt: at.toISOString() };
}

/** Keeps the author's text private (C04), unpublishing it when it was published. */
export async function keepTextPrivate(deps: ModerationDeps, viewer: UserViewer, id: string, input: PublishSettings): Promise<DocumentRow> {
  const result = await keepPrivate(deps.db, viewer, id, input, deps.now());
  if (result.kind === 'not-found') throw new HttpError(404, 'not-found');
  if (result.kind === 'no-access') throw new HttpError(403, 'no-access');
  deps.sync?.enqueue([result.doc.id]);
  await dropWaitingNotices(deps.db, result.doc.id, result.was);
  return result.doc;
}

/** What an admin may change on a published text (A02, PATCH /api/admin/posts/:id). */
export interface PostPatch extends PlacementRequest {
  hidden?: boolean;
  title?: string;
  tags?: string[];
}

/**
 * Applies a patch to a published text, all of it or nothing, in one transaction holding its row: the text must be
 * approved (409 `not-approved` before any change; 404 `not-found`); then placement and tags, the title (a new version,
 * as the editor saves; for a stored file only its name), and hidden or shown (told to the author once committed).
 */
export async function updatePost(deps: ModerationDeps, admin: AdminViewer, id: string, patch: PostPatch): Promise<DocumentRow> {
  const { db, now } = deps;
  // Reads only: an unknown Space or Collection is refused before anything is written.
  const placement = await resolvePlacement(db, admin, patch, true);
  const tags = cleanTags(patch.tags);
  const at = now();
  const { doc, hiddenChanged } = await db.transaction(async (tx) => {
    let current = await findForAdmin(tx, admin, id, true);
    if (!current) throw new HttpError(404, 'not-found');
    if (current.status !== 'approved') throw new HttpError(409, 'not-approved');
    if (placement || tags) current = (await setPlacementAndTags(tx, admin, id, { placement, tags })) ?? current;
    if (patch.title !== undefined && patch.title.trim() !== current.title) {
      const latest = await findLatestVersion(tx, admin, id);
      if (latest?.markdown != null) {
        const saved = await saveDocument(tx, admin, id, { title: patch.title, body: bodyOf(latest.markdown) }, at);
        if (saved.kind !== 'saved') throw new HttpError(409, saved.kind);
      } else {
        // A stored file (Office): its title is only metadata.
        await renameDocument(tx, admin, id, patch.title.trim());
      }
      current = (await findForAdmin(tx, admin, id)) ?? current;
    }
    let changed = false;
    if (patch.hidden !== undefined) {
      const hidden = await setHidden(tx, admin, id, patch.hidden, at);
      if (hidden.kind !== 'ok') throw new HttpError(409, 'not-approved');
      current = hidden.doc;
      changed = hidden.changed;
    }
    return { doc: current, hiddenChanged: changed };
  });
  deps.sync?.enqueue([id]);
  if (hiddenChanged && patch.hidden !== undefined && doc.authorId !== admin.userId) {
    const hidden = patch.hidden;
    await notifyAfter(db, async () => [{ userId: doc.authorId, documentId: id, payload: { kind: 'permission', title: doc.title, hidden, by: await nameOf(db, admin.userId) } }], now());
  }
  return doc;
}

/** A published text as A02 lists it. */
export interface PublishedItem {
  id: string;
  title: string;
  type: DocumentRow['type'];
  lang: Lang;
  origin: DocumentRow['origin'];
  hidden: boolean;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  opens: number;
  /** A version of it was written by AI. */
  aiMade: boolean;
  /** Languages of the text among the listed ones (a text and its translations). */
  translations: Lang[];
  /** With its crystal (A02 draws each text with its Space's crystal). */
  space: SpaceBrief & { art: string };
  collection: CollectionBrief | null;
  tags: string[];
}

async function placesOf(db: Db, docs: readonly DocumentRow[]): Promise<{ spaces: Map<string, SpaceRow>; collections: Map<string, CollectionRow>; authors: Map<string, string> }> {
  const spaceIds = [...new Set(docs.map((d) => d.spaceId))];
  const [spaces, collections, authors] = await Promise.all([
    spacesById(db, spaceIds),
    listCollectionsOf(db, spaceIds),
    userNames(
      db,
      docs.map((d) => d.authorId),
    ),
  ]);
  return { spaces: new Map(spaces.map((s) => [s.id, s])), collections: new Map(collections.map((c) => [c.id, c])), authors };
}

export async function publishedItems(db: Db, entries: readonly PublishedEntry[]): Promise<PublishedItem[]> {
  const places = await placesOf(
    db,
    entries.map((e) => e.doc),
  );
  const langs = new Map<string, Set<Lang>>();
  for (const { doc } of entries) {
    const key = doc.translationGroupId ?? doc.id;
    const set = langs.get(key) ?? new Set<Lang>();
    set.add(doc.lang);
    langs.set(key, set);
  }
  return entries.flatMap(({ doc, opens, aiMade }) => {
    const space = places.spaces.get(doc.spaceId);
    if (!space) return [];
    const collection = doc.collectionId ? places.collections.get(doc.collectionId) : undefined;
    const translations = [...(langs.get(doc.translationGroupId ?? doc.id) ?? new Set<Lang>([doc.lang]))].sort((a, b) => (a === 'vi' ? -1 : b === 'vi' ? 1 : 0));
    return [
      {
        id: doc.id,
        title: doc.title,
        type: doc.type,
        lang: doc.lang,
        origin: doc.origin,
        hidden: doc.hidden,
        authorName: places.authors.get(doc.authorId) ?? null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        opens,
        aiMade,
        translations,
        space: { ...spaceBrief(space), art: space.art },
        collection: collection ? collectionBrief(collection) : null,
        tags: doc.tags,
      },
    ];
  });
}
