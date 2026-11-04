import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Every read of `documents`, `documentVersions`, `chunks` and `links` goes through `src/access/` (the one place that
 * knows who may see what); `src/access/no-bypass.test.ts` fails when another module imports them.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const uiLang = pgEnum('ui_lang', ['vi', 'en']);
export const uiTheme = pgEnum('ui_theme', ['dark', 'light', 'system']);
/** Admins are not a role: they are the IdP subs listed in the server config (ADMIN_SUBS). */
export const userRole = pgEnum('user_role', ['member', 'reviewer']);

/**
 * An account of the hoandat.com IdP that signed in here: its `sub`, and the name, email and picture its userinfo
 * gave at the latest sign-in (scope `openid profile email`), shown in the account menu. The three are null for an
 * account whose userinfo gave none. `lang` and `theme` are the account's settings (C19).
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  sub: text('sub').notNull().unique(),
  name: text('name'),
  email: text('email'),
  picture: text('picture'),
  lang: uiLang('lang').notNull().default('vi'),
  theme: uiTheme('theme').notNull().default('system'),
  role: userRole('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  /** When the account finished or skipped the first-visit steps (S03); null until then. */
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  /** Slugs of the Spaces the account picked as its interests during onboarding (S03), in the order picked. */
  interests: text('interests').array().notNull().default(sql`'{}'::text[]`),
});

/**
 * Web sessions. `id` is the sha256 of the opaque cookie token, never the token itself. `idp_sid` is the IdP session
 * the sign-in came from (the ID token's `sid`), so the IdP's back-channel logout can end exactly these sessions;
 * null when the IdP sent none.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    idpSid: text('idp_sid'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId), index('sessions_idp_sid_idx').on(table.idpSid)],
);

export const spaceKind = pgEnum('space_kind', ['public', 'personal']);

/**
 * A Space: one crystal of the Universe (C09). Topics are data, not code. `tint` and `glow` are the crystal's two
 * colours (#rrggbb), `art` its image under the web's public folder. `unitVi`/`unitEn` name what the Space counts
 * ("lab", "bài tập", "tuần"…), as the crystal's caption shows. A personal Space belongs to one account.
 */
export const spaces = pgTable(
  'spaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    nameVi: text('name_vi').notNull(),
    nameEn: text('name_en').notNull(),
    tint: text('tint').notNull(),
    glow: text('glow').notNull(),
    art: text('art').notNull(),
    kind: spaceKind('kind').notNull().default('public'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    unitVi: text('unit_vi').notNull(),
    unitEn: text('unit_en').notNull(),
    /** One line on what the Space is about (C10, under its name); null until someone writes it. */
    descriptionVi: text('description_vi'),
    descriptionEn: text('description_en'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    check('spaces_personal_has_owner', sql`(${table.kind} = 'personal') = (${table.ownerId} is not null)`),
    index('spaces_owner_id_idx').on(table.ownerId),
  ],
);

export const captionSource = pgEnum('caption_source', ['jev', 'fallback', 'seed']);

/**
 * The caption under a Space's crystal (C09), as Jev chose it among code-built candidates, cached per Space and
 * `signature` (a hash of the per-type counts and labels the candidates came from): it is chosen again only when
 * those change. `fallback` rows record that Jev failed for that signature, so it is retried only after `retryAfter`;
 * `seed` rows are the mock's captions written by the dev/E2E seed (KB_SEED=mock).
 * `inputTokens` is what the Jev call that chose it billed (0 for a fallback).
 */
export const spaceCaptions = pgTable(
  'space_captions',
  {
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    signature: text('signature').notNull(),
    captionVi: text('caption_vi').notNull(),
    captionEn: text('caption_en').notNull(),
    source: captionSource('source').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    retryAfter: timestamp('retry_after', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.spaceId, table.signature] })],
);

/** A collection inside a Space (C10's left rail), in `sortOrder`. */
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    nameVi: text('name_vi').notNull(),
    nameEn: text('name_en').notNull(),
    tint: text('tint').notNull(),
    glow: text('glow').notNull(),
    art: text('art'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index('collections_space_id_idx').on(table.spaceId)],
);

export const documentType = pgEnum('document_type', ['lab', 'note', 'process', 'office', 'web', 'journey']);
/** `official`: published by the KnowFlow team, AI-made or not ("Chính thức"); `community`: by a member, reviewed;
 * `own`: the author's own. Whether a text is an AI translation is `aiTranslated`, not an origin. */
export const documentOrigin = pgEnum('document_origin', ['official', 'community', 'own']);
export const documentStatus = pgEnum('document_status', ['draft', 'private', 'pending', 'changes_requested', 'rejected', 'approved']);
export const DOCUMENT_STATUSES = documentStatus.enumValues;

/**
 * A document. `status` is the step it is at; `hidden` (admins only) takes an approved document off the public
 * Universe. Others see a document only when it is approved and not hidden (src/access/visibility.ts). Translations
 * of one text share `translationGroupId`. `deletedAt` set: in the author's trash for 30 days, invisible elsewhere.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id),
    collectionId: uuid('collection_id').references(() => collections.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    type: documentType('type').notNull(),
    lang: uiLang('lang').notNull(),
    translationGroupId: uuid('translation_group_id'),
    aiTranslated: boolean('ai_translated').notNull().default(false),
    origin: documentOrigin('origin').notNull(),
    status: documentStatus('status').notNull().default('draft'),
    hidden: boolean('hidden').notNull().default(false),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    sourceUrl: text('source_url'),
    contentHash: text('content_hash'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('documents_space_id_idx').on(table.spaceId),
    index('documents_collection_id_idx').on(table.collectionId),
    index('documents_author_id_idx').on(table.authorId),
    index('documents_status_hidden_idx').on(table.status, table.hidden),
    index('documents_translation_group_id_idx').on(table.translationGroupId),
  ],
);

/**
 * Stored files: `storageKey` is the random name on the server's disk (the original name is only metadata), with
 * the owner and the document it belongs to.
 */
export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storageKey: text('storage_key').notNull().unique(),
    originalName: text('original_name').notNull(),
    mime: text('mime').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [index('files_owner_id_idx').on(table.ownerId), index('files_document_id_idx').on(table.documentId)],
);

/** Each saved version of a document (C17): markdown, or a stored file (Office). `version` counts from 1. */
export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    markdown: text('markdown'),
    fileId: uuid('file_id').references(() => files.id),
    editorId: uuid('editor_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    unique('document_versions_document_version_unique').on(table.documentId, table.version),
    check('document_versions_has_content', sql`${table.markdown} is not null or ${table.fileId} is not null`),
  ],
);

/** The searchable passages of a document, in `position`; citations point at `anchor` (unique per document). */
export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    anchor: text('anchor').notNull(),
    position: integer('position').notNull(),
    heading: text('heading'),
    text: text('text').notNull(),
  },
  (table) => [unique('chunks_document_anchor_unique').on(table.documentId, table.anchor), index('chunks_document_position_idx').on(table.documentId, table.position)],
);

export const linkKind = pgEnum('link_kind', ['wikilink', 'relation']);

/** `[[ ]]` links written in a document (read both ways) and labelled edges of the Graph (C13). */
export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    kind: linkKind('kind').notNull(),
    label: text('label'),
    createdAt: createdAt(),
  },
  (table) => [unique('links_source_target_kind_unique').on(table.sourceId, table.targetId, table.kind), index('links_target_id_idx').on(table.targetId)],
);

export const reviewAction = pgEnum('review_action', ['submitted', 'approved', 'changes_requested', 'rejected']);

/** The review trail of a document; `jevScores` are the pre-review scores shown to admins (A01), never a verdict. */
export const reviewEvents = pgTable(
  'review_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id),
    action: reviewAction('action').notNull(),
    reason: text('reason'),
    jevScores: jsonb('jev_scores').$type<Record<string, number>>(),
    createdAt: createdAt(),
  },
  (table) => [index('review_events_document_id_idx').on(table.documentId)],
);

/** Share links (C18): only the sha256 of the token is stored. */
export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('share_links_document_id_idx').on(table.documentId)],
);

/** Access log of a share link: when it was opened, and by which account when signed in. */
export const shareLinkVisits = pgTable(
  'share_link_visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shareLinkId: uuid('share_link_id')
      .notNull()
      .references(() => shareLinks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('share_link_visits_share_link_id_idx').on(table.shareLinkId)],
);

/** Saved documents of an account (C08). */
export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.documentId] })],
);

/** The inbox of an account (C20). `kind` names the event; `payload` holds what its message needs. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('notifications_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

/**
 * How far an account has read a document (C10 "72%", C11): the furthest `progress` (0–100) reached and the anchor
 * of the passage read last, to resume there.
 */
export const readingProgress = pgTable(
  'reading_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    progress: integer('progress').notNull(),
    anchor: text('anchor'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.documentId] }),
    check('reading_progress_range', sql`${table.progress} between 0 and 100`),
    index('reading_progress_document_id_idx').on(table.documentId),
  ],
);

/** Comments on a document (C11), optionally on one passage (`anchor`). */
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    anchor: text('anchor'),
    body: text('body').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('comments_document_id_idx').on(table.documentId)],
);

export const aiProvider = pgEnum('ai_provider', ['openai', 'gemini', 'anthropic']);
/**
 * `ok`: the provider accepted it at the last check or use; `invalid`: rejected (wrong, revoked, missing permission);
 * `quota`: the account behind it has no credit left; `unreadable`: it no longer decrypts (the secret file changed).
 */
export const userKeyStatus = pgEnum('user_key_status', ['ok', 'invalid', 'quota', 'unreadable']);

/**
 * A user's own AI key ("Key riêng", src/user-keys/): AES-256-GCM with a fresh random 96-bit `nonce` (base64) per
 * save and AAD = userId + provider; `ciphertext` (base64) carries the GCM tag at its end. Only `last4` is ever shown.
 */
export const userKeys = pgTable(
  'user_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: aiProvider('provider').notNull(),
    ciphertext: text('ciphertext').notNull(),
    nonce: text('nonce').notNull(),
    last4: text('last4').notNull(),
    status: userKeyStatus('status').notNull().default('ok'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  },
  (table) => [unique('user_keys_user_provider_unique').on(table.userId, table.provider)],
);

/** Which of its keys an account wants the Copilot to use, and the model; null fields never happen (row or none). */
export const userKeyPrefs = pgTable('user_key_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: aiProvider('provider').notNull(),
  model: text('model').notNull(),
});

export const copilotTask = pgEnum('copilot_task', ['answer', 'explain', 'summarize']);
export type CopilotScopeKind = 'universe' | 'space' | 'collection' | 'document';

/** A cited passage as the `sources` event of POST /api/ask sent it. */
export interface CopilotSourceRecord {
  n: number;
  documentId: string;
  anchor: string;
  title: string;
  section: string | null;
  spaceName: string;
  collectionName: string | null;
  origin: (typeof documentOrigin.enumValues)[number];
  status: (typeof documentStatus.enumValues)[number];
}

/**
 * A question answered by the Copilot (C14 history): what was asked, in which scope, the answer as streamed, the
 * passages it cited (`sources`, as the `sources` event sent them) and Jev's check of each citation (null when Jev
 * did not check). Only answered questions are kept; only the asker reads them.
 */
export const copilotQuestions = pgTable(
  'copilot_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    task: copilotTask('task').notNull().default('answer'),
    question: text('question').notNull(),
    selection: text('selection'),
    scope: jsonb('scope').$type<{ kind: CopilotScopeKind; id: string | null }>().notNull(),
    answer: text('answer').notNull(),
    sources: jsonb('sources').$type<CopilotSourceRecord[]>().notNull(),
    citations: jsonb('citations').$type<Array<{ n: number; supported: boolean }>>(),
    provider: aiProvider('provider').notNull(),
    model: text('model').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('copilot_questions_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

/** Admin API tokens (A03): only the sha256 is stored; shown once at creation; revocable. */
export const adminTokens = pgTable('admin_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  label: text('label').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/** A Canvas board (C15): its nodes and edges as JSON. */
export const canvases = pgTable(
  'canvases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('canvases_owner_id_idx').on(table.ownerId)],
);

/** A knowledge journey (C07, Flow): an ordered path through documents. */
export const journeys = pgTable(
  'journeys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('journeys_owner_id_idx').on(table.ownerId)],
);

export const journeySteps = pgTable(
  'journey_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    journeyId: uuid('journey_id')
      .notNull()
      .references(() => journeys.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    note: text('note'),
  },
  (table) => [unique('journey_steps_journey_position_unique').on(table.journeyId, table.position)],
);

/** Audit trail (C19): who did what to which record. `detail` never holds secrets or document text. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [index('audit_log_created_at_idx').on(table.createdAt), index('audit_log_actor_id_idx').on(table.actorId)],
);

/**
 * Jev usage per day (Asia/Saigon) and feature (`purpose` of the call: `space-caption`, `search-documents`,
 * `search-passages`): calls, failed calls and tokens, for the daily AI cost report to Tiểu Đệ. Search has no cap on
 * Jev requests; this is how a rise in cost is seen.
 */
export const jevUsageDaily = pgTable(
  'jev_usage_daily',
  {
    day: date('day', { mode: 'string' }).notNull(),
    purpose: text('purpose').notNull(),
    calls: integer('calls').notNull().default(0),
    failedCalls: integer('failed_calls').notNull().default(0),
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.purpose] })],
);
