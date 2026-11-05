/**
 * The reading API (apps/server/src/api/content-routes.ts, me-routes.ts) as typed calls: the account (/api/me,
 * S03 onboarding), the Universe (C09: /api/spaces, /api/recent), a Space (C10) and the reader (C11). Each answer is
 * checked against its schema here, so a screen only ever sees the documented shape; a mismatch throws
 * ApiError(BAD_RESPONSE).
 *
 * Errors (ApiError.code): `sign-in-required` (401) for /api/me, progress and posting without a session; `not-found`
 * (404), `no-access` (403: someone else's personal Space, or a private/pending document) and `hidden` (403: a
 * document an admin took off the Universe) for Spaces and documents; `invalid-body`, `unknown-space`,
 * `unknown-anchor` (400) for bad input; `comments-closed` (403) when posting on an unpublished document;
 * `rate-limited` (429); `network` when the request got no answer (offline).
 */
import * as z from 'zod/mini';
import { FILE_KINDS } from './files-api';
import { ApiError, getJson } from './api-client';

export const LANGS = ['vi', 'en'] as const;
export const THEMES = ['dark', 'light', 'system'] as const;
export const DOCUMENT_TYPES = ['lab', 'note', 'process', 'office', 'web', 'journey'] as const;
/** Origin label (plan rule 6): Chính thức, Cộng đồng, Của bạn · riêng tư; "Chờ duyệt" comes from `status`. */
export const DOCUMENT_ORIGINS = ['official', 'community', 'own'] as const;
export const DOCUMENT_STATUSES = ['draft', 'private', 'pending', 'changes_requested', 'rejected', 'approved'] as const;
/** The error codes of a Space or document that cannot be opened, each with its own screen (C10, C11, X02). */
export const READ_ERRORS = ['not-found', 'no-access', 'hidden'] as const;

const Lang = z.enum(LANGS);
export type Lang = z.infer<typeof Lang>;
export type Theme = (typeof THEMES)[number];
export type ReadError = (typeof READ_ERRORS)[number];
/** ISO 8601 time with offset, as the server sends dates. */
const Time = z.iso.datetime({ offset: true });

const MeSchema = z.object({
  name: z.nullable(z.string()),
  email: z.nullable(z.string()),
  picture: z.nullable(z.string()),
  lang: Lang,
  theme: z.enum(THEMES),
  role: z.enum(['member', 'reviewer']),
  isAdmin: z.boolean(),
  /** null until the account finishes or skips onboarding (S03): show it on the first visit to /u. */
  onboardedAt: z.nullable(Time),
  /** Slugs of the Spaces picked during onboarding. */
  interests: z.array(z.string()),
});
export type Me = z.infer<typeof MeSchema>;

/** A crystal caption ("8 lab", "5 tuần"), chosen by Jev among counts the viewer may read; short in both languages. */
const CaptionSchema = z.object({ vi: z.string(), en: z.string() });
export type Caption = z.infer<typeof CaptionSchema>;

export const SpaceBriefSchema = z.object({ slug: z.string(), nameVi: z.string(), nameEn: z.string(), tint: z.string(), glow: z.string() });
export type SpaceBrief = z.infer<typeof SpaceBriefSchema>;

/** A Space as a crystal: C09's Universe, C10's header and its related Spaces. */
const SpaceCardSchema = z.extend(SpaceBriefSchema, {
  /** Image under the web's public folder (/art/crystal-*.webp). */
  art: z.string(),
  /** `personal`: the reader's own Space ("Vũ trụ của bạn"). */
  kind: z.enum(['public', 'personal']),
  caption: CaptionSchema,
  /** Texts the viewer may read (a text and its translations count once). */
  documentCount: z.number(),
  collectionCount: z.number(),
});
export type SpaceCard = z.infer<typeof SpaceCardSchema>;

export const CollectionBriefSchema = z.object({ id: z.string(), nameVi: z.string(), nameEn: z.string() });
export type CollectionBrief = z.infer<typeof CollectionBriefSchema>;

/** C09: a crystal with the names of its collections (the focus card). */
const SpaceListItemSchema = z.extend(SpaceCardSchema, { collections: z.array(CollectionBriefSchema) });
export type SpaceListItem = z.infer<typeof SpaceListItemSchema>;

/** A document in a list (C10 rows, recent cards, links, related): one per text, in the reader's language. */
export const DocumentSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  origin: z.enum(DOCUMENT_ORIGINS),
  /** Anything but `approved` is only ever shown to its author (or an admin): `pending` is "Chờ duyệt". */
  status: z.enum(DOCUMENT_STATUSES),
  lang: Lang,
  /** An AI translation: marked as such, never a separate origin. */
  aiTranslated: z.boolean(),
  updatedAt: Time,
  authorName: z.nullable(z.string()),
  /** Every language the reader can read this text in, this one included. */
  translations: z.array(Lang),
  collectionId: z.nullable(z.string()),
  space: SpaceBriefSchema,
  /** How far the signed-in reader got, 0–100 (0: "Chưa đọc", 100: "Đã đọc"); null for a guest. */
  readProgress: z.nullable(z.number()),
});
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

const SpacesSchema = z.object({ spaces: z.array(SpaceListItemSchema) });

/** How related an entry is, 0–100: computed in code from links, place and shared words (not a model). */
const Relevance = z.number();

/** C10 "Thành viên & quyền": `admin` "Quản trị", `reviewer` "Người duyệt", `member` "Thành viên", `owner` of a personal Space. */
export const MEMBER_ROLES = ['owner', 'admin', 'reviewer', 'member'] as const;
const SpaceMemberSchema = z.object({
  name: z.nullable(z.string()),
  picture: z.nullable(z.string()),
  role: z.enum(MEMBER_ROLES),
  /** Published texts of the Space they wrote. */
  documentCount: z.number(),
});
export type SpaceMember = z.infer<typeof SpaceMemberSchema>;

/** What the viewer may do in a Space (all false for a guest). */
const SpacePermissionsSchema = z.object({ canCreate: z.boolean(), canReview: z.boolean(), canAdmin: z.boolean() });
export type SpacePermissions = z.infer<typeof SpacePermissionsSchema>;

const SpaceCollectionSchema = z.extend(CollectionBriefSchema, {
  tint: z.string(),
  glow: z.string(),
  /** The collection's crystal, or the Space's when it has none of its own. */
  art: z.string(),
  documentCount: z.number(),
  documents: z.array(DocumentSummarySchema),
});
export type SpaceCollection = z.infer<typeof SpaceCollectionSchema>;

const SpaceDetailSchema = z.object({
  /** The Space with its one-line description (under its name), in both languages; null when not written yet. */
  space: z.extend(SpaceCardSchema, { descriptionVi: z.nullable(z.string()), descriptionEn: z.nullable(z.string()) }),
  /** Owner and admins first, then reviewers, then members by how much they wrote. */
  members: z.array(SpaceMemberSchema),
  permissions: SpacePermissionsSchema,
  /** In the Space's order; a collection may be empty (C10 "Bộ sưu tập này còn trống"). */
  collections: z.array(SpaceCollectionSchema),
  /** Documents outside any collection (the personal Space's files). */
  uncollected: z.array(DocumentSummarySchema),
  /** C10 "Space liên quan": Spaces linked to this one, else the next ones of the Universe. */
  related: z.array(z.extend(SpaceCardSchema, { relevance: Relevance })),
});
export type SpaceDetail = z.infer<typeof SpaceDetailSchema>;

const LinkedDocumentSchema = z.object({
  /** `relation`: a labelled edge (a path's step, `label` "bước 1"); `wikilink`: a [[link]] in the text. */
  kind: z.enum(['wikilink', 'relation']),
  label: z.nullable(z.string()),
  document: DocumentSummarySchema,
});
export type LinkedDocument = z.infer<typeof LinkedDocumentSchema>;

const TocEntrySchema = z.object({
  /** Same as the chunk's anchor: `#anchor` scrolls to it. */
  anchor: z.string(),
  /** null: the overview before the first heading (label it "Tổng quan" / "Overview"). */
  title: z.nullable(z.string()),
  level: z.union([z.literal(2), z.literal(3)]),
});
export type TocEntry = z.infer<typeof TocEntrySchema>;

const ReaderDocumentSchema = z.extend(DocumentSummarySchema, {
  sourceUrl: z.nullable(z.string()),
  createdAt: Time,
  readingMinutes: z.number(),
  /** Who approved it last ("Đã duyệt bởi Đạt"); null when nobody did. */
  reviewedBy: z.nullable(z.string()),
  /** When it was approved last ("Linh duyệt 03/11"); null when never. */
  reviewedAt: z.optional(z.nullable(Time)),
  /** The passage the signed-in reader read last: scroll there to resume; null for a guest or not started. */
  readAnchor: z.nullable(z.string()),
  collection: z.nullable(CollectionBriefSchema),
  space: z.extend(SpaceBriefSchema, { art: z.string(), kind: z.enum(['public', 'personal']) }),
  /** Its tags (C04 "Thẻ"). */
  tags: z.optional(z.array(z.string())),
  /** The viewer manages its share link (its author or an admin, C18). */
  canShare: z.optional(z.boolean()),
});

const DocumentSchema = z.object({
  /** The language asked for. */
  lang: Lang,
  /** false: no text in `lang` yet; `document` is the original and the reader offers "Dịch bằng AI" (phase 7). */
  translationAvailable: z.boolean(),
  document: ReaderDocumentSchema,
  /** Every readable language version of this text, the shown one included. */
  translations: z.array(z.object({ id: z.string(), lang: Lang, aiTranslated: z.boolean() })),
  toc: z.array(TocEntrySchema),
  /** The text in order: Markdown of each section, without its heading line (`heading` holds it). */
  chunks: z.array(z.object({ anchor: z.string(), heading: z.nullable(z.string()), markdown: z.string() })),
  /** Readable documents linking here. */
  backlinks: z.array(LinkedDocumentSchema),
  /** Readable documents this one links to. */
  outgoing: z.array(LinkedDocumentSchema),
  /** `[[ ]]` titles written in the text and the readable document each links; any other title stays plain text. */
  wikilinks: z.array(z.object({ title: z.string(), id: z.string() })),
  /** C11 "Liên quan": texts of the same Space or linked to this one, most related first, at most 5. */
  related: z.array(z.extend(DocumentSummarySchema, { relevance: Relevance })),
  /** Newest first. */
  versions: z.array(z.object({ version: z.number(), editorName: z.nullable(z.string()), createdAt: Time })),
  /**
   * The stored file of an Office document's current version (null for a text; absent from answers recorded before
   * files existed). `editable`: the reader may save a new version and the editor opens its kind.
   */
  file: z.optional(
    z.nullable(z.object({ id: z.string(), name: z.string(), kind: z.enum(FILE_KINDS), size: z.number(), version: z.number(), savedAt: Time, editable: z.boolean() })),
  ),
});
export type DocumentView = z.infer<typeof DocumentSchema>;
export type DocumentFile = NonNullable<DocumentView['file']>;
export type ReaderDocument = DocumentView['document'];

const RecentSchema = z.object({ documents: z.array(DocumentSummarySchema) });

const ProgressSchema = z.object({ progress: z.number(), anchor: z.nullable(z.string()) });
export type ReadingProgress = z.infer<typeof ProgressSchema>;

/** Longest comment the server takes. */
export const MAX_COMMENT_CHARS = 2000;

const CommentSchema = z.object({
  id: z.string(),
  /** The passage it is about; null for the whole document. */
  anchor: z.nullable(z.string()),
  /** Plain text as typed: render as text, never as HTML. */
  body: z.string(),
  createdAt: Time,
  updatedAt: Time,
  author: z.object({ name: z.nullable(z.string()), picture: z.nullable(z.string()), role: z.enum(['admin', 'reviewer', 'member']) }),
  /** Written by the viewer. */
  mine: z.boolean(),
});
export type DocumentComment = z.infer<typeof CommentSchema>;

const CommentsSchema = z.object({
  /** false: the document is not published, so there is no discussion and no composer. */
  open: z.boolean(),
  /** Oldest first (the latest 200). */
  comments: z.array(CommentSchema),
});
export type DocumentComments = z.infer<typeof CommentsSchema>;

const withLang = (path: string, lang: Lang | undefined): string => (lang ? `${path}?lang=${lang}` : path);

/** The signed-in account; ApiError `sign-in-required` without a session. */
export function fetchMe(): Promise<Me> {
  return getJson(MeSchema, '/api/me');
}

/** Changes the account's language and/or theme (C19); answers the updated account. */
export function updateMe(change: { lang?: Lang; theme?: Theme }): Promise<Me> {
  return getJson(MeSchema, '/api/me', { method: 'PATCH', body: JSON.stringify(change) });
}

/** Finishes onboarding (S03): reading language and the slugs of the Spaces picked (may be none, when skipped). */
export function completeOnboarding(choice: { lang: Lang; interests: string[] }): Promise<Me> {
  return getJson(MeSchema, '/api/me/onboarding', { method: 'POST', body: JSON.stringify(choice) });
}

/** C09: the Spaces the viewer can see, in Universe order. */
export async function fetchSpaces(): Promise<SpaceListItem[]> {
  return (await getJson(SpacesSchema, '/api/spaces')).spaces;
}

/** C10: a Space by slug. `lang`: language of the texts (default: the account's). */
export function fetchSpace(slug: string, lang?: Lang): Promise<SpaceDetail> {
  return getJson(SpaceDetailSchema, withLang(`/api/spaces/${encodeURIComponent(slug)}`, lang));
}

/** C11: a document in `lang` when it has that version (default: the account's language). */
export function fetchDocument(id: string, lang?: Lang): Promise<DocumentView> {
  return getJson(DocumentSchema, withLang(`/api/documents/${encodeURIComponent(id)}`, lang));
}

/** C09 "Gần đây": the most recently updated readable texts (at most 8). */
export async function fetchRecent(lang?: Lang): Promise<DocumentSummary[]> {
  return (await getJson(RecentSchema, withLang('/api/recent', lang))).documents;
}

function isReadError(code: string): code is ReadError {
  return (READ_ERRORS as readonly string[]).includes(code);
}

/**
 * Records how far the signed-in reader got in a document (0–100; the server keeps the furthest) and the passage
 * read last. Answers what is stored.
 */
export function saveReadingProgress(id: string, progress: number, anchor: string | null): Promise<ReadingProgress> {
  return getJson(ProgressSchema, `/api/documents/${encodeURIComponent(id)}/progress`, { method: 'PUT', body: JSON.stringify({ progress, anchor }) });
}

/** C11 "Bình luận" of a document (empty and closed unless it is published). */
export function fetchComments(id: string): Promise<DocumentComments> {
  return getJson(CommentsSchema, `/api/documents/${encodeURIComponent(id)}/comments`);
}

/** Posts a comment (1–MAX_COMMENT_CHARS characters after trimming), optionally on a passage; answers it. */
export function postComment(id: string, body: string, anchor: string | null = null): Promise<DocumentComment> {
  return getJson(CommentSchema, `/api/documents/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify({ body, anchor }) });
}

/** The screen state for a Space or document that could not be loaded, or null for another error. */
export function readErrorOf(error: unknown): ReadError | null {
  return error instanceof ApiError && isReadError(error.code) ? error.code : null;
}
