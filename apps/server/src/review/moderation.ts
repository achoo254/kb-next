/**
 * What the review lifecycle does around src/access/review.ts, shared by the web session routes (C06, C08, A01, A02)
 * and the admin API (token): where a text goes, sending it for review (with Jev's pre-review and a word to the
 * admins), an admin's verdict, hiding and showing, editing a published text's details, and the shapes the API
 * answers with. Every change enqueues the document for search sync and tells whoever it concerns (C20).
 */
import { saveDocument } from '../access/authoring';
import type { CollectionRow, DocumentRow, SpaceRow } from '../access/content';
import { findLatestVersion } from '../access/content';
import { findDocumentsByIds, listCollectionsOf, spacesById, userNames } from '../access/reading';
import {
  type AdminViewer,
  type Placement,
  type PublishedEntry,
  type QueueEntry,
  type ReviewDecision,
  decideReview,
  findForAdmin,
  renameDocument,
  recordPreReview,
  setHidden,
  setPlacementAndTags,
  submitForReview,
  withdrawSubmission,
} from '../access/review';
import { findCollectionById, spaceForWriting } from '../access/spaces-write';
import { isUuid } from '../access/ids';
import type { Viewer } from '../access/viewer';
import { bodyOf } from '../authoring/markdown-text';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { HttpError } from '../http-error';
import type { JevJudge } from '../jev/jev-client';
import { adminUserIds, clearSubmittedNotices, nameOf, notifyAfter, unreadSubmittedNotice } from '../notifications/notification-store';
import { safeErrorText } from '../log-error';
import type { IndexSync } from '../search/index-sync';
import type { MeiliClient } from '../search/meili-client';
import { type CollectionBrief, type SpaceBrief, collectionBrief, spaceBrief } from '../api/content-views';
import { preReview } from './pre-review';

type UserViewer = Extract<Viewer, { kind: 'user' }>;
type Lang = 'vi' | 'en';

export interface ModerationDeps {
  config: ServerConfig;
  db: Db;
  now: () => Date;
  sync: IndexSync | null;
  jev: JevJudge | null;
  meili: MeiliClient | null;
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

export interface SubmitResponse {
  status: 'pending';
  /** Its place among the texts waiting (C06 "Vị trí 3 trong hàng"). */
  queuePosition: number;
  submittedAt: string;
  /** Whether Jev's pre-review ran (its scores are for admins only). */
  preReviewed: boolean;
}

/** The answer of a submission that did not go through. */
function refuseSubmit(kind: string, status?: string): never {
  switch (kind) {
    case 'not-found':
      throw new HttpError(404, 'not-found');
    case 'no-access':
      throw new HttpError(403, 'no-access');
    case 'title-required':
      throw new HttpError(400, 'title-required');
    case 'body-required':
      throw new HttpError(400, 'body-required');
    default:
      throw new HttpError(409, status === 'pending' ? 'already-pending' : 'not-submittable');
  }
}

/**
 * Sends the author's text for review: the access rule, then Jev's pre-review (bounded; failing or off leaves the
 * scores out), a word to every admin, and the search sync.
 */
export async function submitText(deps: ModerationDeps, viewer: UserViewer, id: string, input: { placement?: Placement; tags?: string[] }): Promise<SubmitResponse> {
  const { db, now } = deps;
  const at = now();
  const result = await submitForReview(db, viewer, id, input, at);
  if (result.kind !== 'submitted') refuseSubmit(result.kind, 'status' in result ? result.status : undefined);
  deps.sync?.enqueue([id]);
  // The submission has committed: nothing after this turns it into a failed request.
  const scores = await preReview({ db, jev: deps.jev, meili: deps.meili }, viewer, result.doc);
  if (scores) await recordPreReview(db, result.eventId, scores).catch((error: unknown) => console.error('pre-review record failed', safeErrorText(error)));
  await notifyAfter(
    db,
    async () => {
      // An admin who has not read the notice of this text's previous submission gets no second one.
      const told = await unreadSubmittedNotice(db, id);
      const admins = (await adminUserIds(db, deps.config.adminSubs)).filter((adminId) => adminId !== viewer.userId && !told.has(adminId));
      if (admins.length === 0) return [];
      const by = await nameOf(db, viewer.userId);
      return admins.map((userId) => ({ userId, documentId: id, payload: { kind: 'review' as const, title: result.doc.title, action: 'submitted' as const, reason: null, by } }));
    },
    now(),
  );
  return { status: 'pending', queuePosition: result.queuePosition, submittedAt: at.toISOString(), preReviewed: scores !== null };
}

/** Takes the author's text out of the queue; the admins' unread notices of it go too. */
export async function withdrawText(deps: ModerationDeps, viewer: UserViewer, id: string): Promise<DocumentRow> {
  const { db } = deps;
  const result = await withdrawSubmission(db, viewer, id);
  if (result.kind === 'not-found') throw new HttpError(404, 'not-found');
  if (result.kind === 'no-access') throw new HttpError(403, 'no-access');
  if (result.kind === 'not-pending') throw new HttpError(409, 'not-pending');
  deps.sync?.enqueue([result.doc.id]);
  await clearSubmittedNotices(db, result.doc.id).catch((error: unknown) => console.error('notice cleanup failed', safeErrorText(error)));
  return result.doc;
}

/** An admin's verdict, told to the author with its reason. */
export async function decide(deps: ModerationDeps, admin: AdminViewer, id: string, decision: ReviewDecision, reason: string | null): Promise<DocumentRow> {
  const { db, now } = deps;
  const result = await decideReview(db, admin, id, decision, reason, now());
  if (result.kind === 'not-found') throw new HttpError(404, 'not-found');
  if (result.kind === 'not-pending') throw new HttpError(409, 'not-pending');
  deps.sync?.enqueue([id]);
  if (result.doc.authorId !== admin.userId) {
    await notifyAfter(
      db,
      async () => [
        {
          userId: result.doc.authorId,
          documentId: id,
          payload: { kind: 'review', title: result.doc.title, action: decision, reason: decision === 'approved' ? null : reason, by: await nameOf(db, admin.userId) },
        },
      ],
      now(),
    );
  }
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

export interface PreReviewView {
  onTopic: number | null;
  hasSources: number | null;
  duplicate: number | null;
  inappropriate: number | null;
  /** The published text it most likely repeats. */
  duplicateOf: { id: string; title: string } | null;
}

/** A text in the review queue, as A01 and GET /api/admin/review list it. */
export interface ReviewQueueItem {
  id: string;
  title: string;
  type: DocumentRow['type'];
  lang: Lang;
  origin: DocumentRow['origin'];
  authorName: string | null;
  submittedAt: string;
  updatedAt: string;
  space: SpaceBrief;
  collection: CollectionBrief | null;
  tags: string[];
  /** Jev's pre-review (admins only); null when Jev was off or failed. */
  preReview: PreReviewView | null;
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

export async function queueItems(db: Db, admin: AdminViewer, entries: readonly QueueEntry[]): Promise<ReviewQueueItem[]> {
  const places = await placesOf(
    db,
    entries.map((e) => e.doc),
  );
  const repeated = entries.flatMap((e) => (e.jev?.duplicateOf ? [e.jev.duplicateOf] : []));
  const titles = new Map((await findDocumentsByIds(db, admin, repeated)).map((d) => [d.id, d.title]));
  return entries.flatMap(({ doc, submittedAt, jev }) => {
    const space = places.spaces.get(doc.spaceId);
    if (!space) return [];
    const collection = doc.collectionId ? places.collections.get(doc.collectionId) : undefined;
    const duplicateTitle = jev?.duplicateOf ? titles.get(jev.duplicateOf) : undefined;
    return [
      {
        id: doc.id,
        title: doc.title,
        type: doc.type,
        lang: doc.lang,
        origin: doc.origin,
        authorName: places.authors.get(doc.authorId) ?? null,
        submittedAt: submittedAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        space: spaceBrief(space),
        collection: collection ? collectionBrief(collection) : null,
        tags: doc.tags,
        preReview: jev
          ? {
              onTopic: jev.onTopic ?? null,
              hasSources: jev.hasSources ?? null,
              duplicate: jev.duplicate ?? null,
              inappropriate: jev.inappropriate ?? null,
              duplicateOf: jev.duplicateOf && duplicateTitle ? { id: jev.duplicateOf, title: duplicateTitle } : null,
            }
          : null,
      },
    ];
  });
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
