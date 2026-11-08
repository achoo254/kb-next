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
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Every read of `documents`, `documentVersions`, `chunks` and `links` goes through `src/access/` (the one place that
 * knows who may see what); `src/access/no-bypass.test.ts` fails when another module imports them.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const uiLang = pgEnum('ui_lang', ['vi', 'en']);
export const uiTheme = pgEnum('ui_theme', ['dark', 'light', 'system']);
/**
 * The workspace role an admin grants (C19): `member` reads, writes and publishes their own texts; `reviewer` is left
 * from the review gate (removed 07/11/2026) and acts as a member (src/access/roles.ts);
 * `admin` runs the workspace. The IdP subs in ADMIN_SUBS are admins whatever their row says (bootstrap admins: no
 * one demotes them from the app); src/access/roles.ts is the one place that resolves an account's role.
 */
export const userRole = pgEnum('user_role', ['member', 'reviewer', 'admin']);
export const USER_ROLES = userRole.enumValues;

/**
 * An account of the hoandat.com IdP that signed in here: its `sub`, and the name, email and picture its userinfo
 * gave at the latest sign-in (scope `openid profile email`), shown in the account menu. The three are null for an
 * account whose userinfo gave none. `lang`, `theme`, `reducedMotion` and `readerTextSize` are the account's settings
 * (H03; the text size is also set from the reader's A−/A+).
 * `removedAt`: an admin took the account out of the workspace (C19 "Gỡ"); it cannot sign in until restored.
 * `deletedAt`: the account deleted its data (H03); the row stays as a nameless tombstone (its `sub` replaced) so the
 * published texts it chose to leave and the audit trail keep an author, and the IdP account starts afresh next time.
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
  reducedMotion: boolean('reduced_motion').notNull().default(false),
  /** The reader's body text size in px (16, 17, 18 or 20; READER_TEXT_SIZES in api/me-routes.ts). */
  readerTextSize: smallint('reader_text_size').notNull().default(17),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
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
/** `official`: published by the KnowFlow team, AI-made or not ("Chính thức"); `community`: published by a member;
 * `own`: the author's own. Whether a text is an AI translation is `aiTranslated`, not an origin. */
export const documentOrigin = pgEnum('document_origin', ['official', 'community', 'own']);
/**
 * `approved` is published (its author's choice, or the admin API); `pending`, `changes_requested` and `rejected` are
 * left from the review gate (removed 07/11/2026): no longer reached, they read as private (src/access/review.ts).
 */
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
    /** Who moved it to the trash: the author, or an admin (then only an admin takes it out again). */
    deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
    /** The colour of the document's planet (C02 "Hành tinh của bài", C08), one of PLANET_COLOURS; null: the default. */
    planet: text('planet'),
    /** Tags of the document, as its author accepted them from Jev's suggestions (C16) or wrote them. */
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  },
  (table) => [
    index('documents_space_id_idx').on(table.spaceId),
    index('documents_collection_id_idx').on(table.collectionId),
    index('documents_author_id_idx').on(table.authorId),
    index('documents_status_hidden_idx').on(table.status, table.hidden),
    index('documents_translation_group_id_idx').on(table.translationGroupId),
    // The trash purge looks only at documents in the trash.
    index('documents_deleted_at_idx').on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
  ],
);

/** The planet colours a document may take (C02 "Hành tinh của bài"); the web maps each to its tokens. */
export const PLANET_COLOURS = ['violet', 'teal', 'cyan', 'amber', 'emerald', 'pink'] as const;

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

/**
 * How a version came to be: written in the editor (C02), sent through the admin API, imported, restored from an
 * earlier version (C17), or an AI translation (F04).
 */
export const versionVia = pgEnum('version_via', ['editor', 'api', 'import', 'restore', 'translation']);

/**
 * Each saved version of a document (C17): markdown, or a stored file (Office). `version` counts from 1. Saves from
 * the editor by the same person within two minutes of a version's `createdAt` update that version (`updatedAt` is its
 * last save) instead of adding one. `aiMade`: its text was written by AI; `summary`: the change in a few words, when
 * given; `restoredFrom`: the version a restore copied.
 */
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
    via: versionVia('via').notNull().default('editor'),
    aiMade: boolean('ai_made').notNull().default(false),
    summary: text('summary'),
    restoredFrom: integer('restored_from'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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

/**
 * `published`: the author published the text (from 07/11/2026, when publishing stopped needing an admin); the other
 * values are left from the review gate (old rows only).
 */
export const reviewAction = pgEnum('review_action', ['submitted', 'approved', 'changes_requested', 'rejected', 'published']);

/**
 * Jev's pre-review of a submitted text (review gate, removed 07/11/2026; old rows only), each 0–1, never a verdict: `onTopic` (fits its
 * Space), `hasSources` (cites or links where it comes from), `duplicate` (repeats `duplicateOf`, the closest existing
 * text among the search's top candidates), `inappropriate` (language unfit to publish). A judgment Jev could not make
 * is left out; no Jev (off or failing) leaves the whole record null.
 */
export interface JevPreReview {
  onTopic?: number;
  hasSources?: number;
  duplicate?: number;
  duplicateOf?: string | null;
  inappropriate?: number;
}

/**
 * The publishing trail of a document (C17 history, C18 share log): `published` rows as authors publish; the review
 * gate's rows (removed 07/11/2026) are kept for history.
 */
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
    jevScores: jsonb('jev_scores').$type<JevPreReview>(),
    createdAt: createdAt(),
  },
  (table) => [index('review_events_document_id_idx').on(table.documentId)],
);

/** What a share link lets a signed-in recipient do besides reading (C18 "Người có link được"). */
export const shareLinkAccess = pgEnum('share_link_access', ['view', 'remix']);
export const SHARE_LINK_ACCESS = shareLinkAccess.enumValues;
/** How long a share link lasts, as its owner picked it (C18 "Hạn link"); `expires_at` is when it ends. */
export const shareLinkExpiry = pgEnum('share_link_expiry', ['none', '7d', '30d']);

/**
 * Share links (C18): only the sha256 of the token is stored, with its last four characters to tell links apart; the
 * token itself is shown once, when made. One live link per document: making one revokes the others.
 */
export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    last4: text('last4').notNull().default(''),
    access: shareLinkAccess('access').notNull().default('view'),
    expiry: shareLinkExpiry('expiry').notNull().default('none'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('share_links_document_id_idx').on(table.documentId),
    // One live link per document, held by the database too (making a link revokes the others first).
    uniqueIndex('share_links_one_live_idx').on(table.documentId).where(sql`${table.revokedAt} is null`),
  ],
);

/** What happened to a share link: opened (by an account, or a guest when `userId` is null), made, changed, revoked. */
export const shareLinkEvent = pgEnum('share_link_event', ['opened', 'created', 'changed', 'revoked']);

/**
 * The access history of a share link (C18 "Lịch sử truy cập"): each opening, when and by which account (null: not
 * signed in), and what its owner did to it (`detail`: the expiry and access it was given). Never the token.
 */
export const shareLinkVisits = pgTable(
  'share_link_visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shareLinkId: uuid('share_link_id')
      .notNull()
      .references(() => shareLinks.id, { onDelete: 'cascade' }),
    kind: shareLinkEvent('kind').notNull().default('opened'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    detail: text('detail'),
    visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('share_link_visits_share_link_id_idx').on(table.shareLinkId),
    // The hourly cleanup of openings older than 90 days.
    index('share_link_visits_opened_at_idx').on(table.visitedAt).where(sql`${table.kind} = 'opened'`),
  ],
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

/**
 * The kinds of notification (C20): `mention` and `comment` on a text, `review` (left from the review gate, removed
 * 07/11/2026: a result, or a text waiting; no new ones), `stale` (an approved text of the account unchanged for 180
 * days), `permission` (an admin hid or showed a text of the account).
 */
export const NOTIFICATION_KINDS = ['mention', 'comment', 'review', 'stale', 'permission'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

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
  (table) => [
    index('notifications_user_id_created_at_idx').on(table.userId, table.createdAt),
    // The bell's count: unread rows of one account.
    index('notifications_unread_idx').on(table.userId).where(sql`${table.readAt} is null`),
  ],
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

/**
 * One viewing of a text's slides (C21): how far it went (`furthest`, 1-based) of how many slides (`total`). Nothing
 * about who viewed it (no account, no address). Kept PRESENT_VIEWS_KEEP_DAYS (src/retention.ts).
 */
export const presentViews = pgTable(
  'present_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    furthest: integer('furthest').notNull(),
    total: integer('total').notNull(),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('present_views_range', sql`${table.furthest} between 1 and ${table.total}`),
    index('present_views_document_viewed_idx').on(table.documentId, table.viewedAt),
    index('present_views_viewed_at_idx').on(table.viewedAt),
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
    /** The app's models the provider lists for this key (checked when saved); null: not known, all are offered. */
    models: jsonb('models').$type<string[]>(),
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

/**
 * Admin API tokens (A03): only the sha256 is stored; shown once at creation; revocable. `last4` is all that is ever
 * shown again ("kf_admin_••••7f2a"). A call acts as `createdBy`, and only while that account is still an admin.
 */
export const adminTokens = pgTable('admin_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  label: text('label').notNull(),
  last4: text('last4').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Calls to the admin API (A03 "Nhật ký gọi gần đây"): method, path (ids, never a token), the answer's status and
 * error code, the token used (null when none matched) and the document it created or changed with its title then.
 * Kept 30 days.
 */
export const adminApiCalls = pgTable(
  'admin_api_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenId: uuid('token_id').references(() => adminTokens.id, { onDelete: 'set null' }),
    method: text('method').notNull(),
    path: text('path').notNull(),
    status: integer('status').notNull(),
    error: text('error'),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    documentTitle: text('document_title'),
    createdAt: createdAt(),
  },
  (table) => [index('admin_api_calls_created_at_idx').on(table.createdAt)],
);

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

/** What a journey step asks of the learner: read a text, do a lab, answer a quiz ("ôn tập"), or read a note. */
export const journeyStepKind = pgEnum('journey_step_kind', ['read', 'lab', 'quiz', 'note']);
export const JOURNEY_STEP_KINDS = journeyStepKind.enumValues;

/**
 * The steps of a knowledge journey (C07, Flow). The journey itself is a document of type `journey`, so it shares the
 * read rule and the review lifecycle of every text; its steps are these rows, in `position` order. A step points at
 * the document it is about (`documentId`; null for a note step, or once that document is gone); `note` is the line
 * the run shows under the step (a note step's whole content); `minutes` is the author's estimate. Read and written
 * only through src/access/journeys.ts.
 */
export const journeySteps = pgTable(
  'journey_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    journeyId: uuid('journey_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: journeyStepKind('kind').notNull().default('read'),
    title: text('title').notNull(),
    minutes: integer('minutes').notNull().default(5),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    note: text('note'),
  },
  (table) => [
    unique('journey_steps_journey_position_unique').on(table.journeyId, table.position),
    check('journey_steps_minutes_range', sql`${table.minutes} between 1 and 240`),
    index('journey_steps_document_id_idx').on(table.documentId),
  ],
);

/**
 * The steps an account marked done on a journey's run (Flow "Xong"). A step whose document the account read to the
 * end (`readingProgress` at 100) counts as done as well, without a row here.
 */
export const journeyProgress = pgTable(
  'journey_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id')
      .notNull()
      .references(() => journeySteps.id, { onDelete: 'cascade' }),
    doneAt: timestamp('done_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.stepId] }), index('journey_progress_step_id_idx').on(table.stepId)],
);

/**
 * Audit trail (C19 "Nhật ký kiểm toán"): who did what to which record. `detail` never holds secrets or document
 * text. Actions are named in src/workspace/audit.ts (members, invites, tokens, sign-ins, data deletion) and
 * src/access/history.ts (hiding and showing a text).
 */
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

/** The role an invite link grants: never `admin`; `reviewer` is left from the review gate and reads as `member`. */
export const inviteRole = pgEnum('invite_role', ['member', 'reviewer']);

/**
 * Invite links (C19 "Mời bằng link"): like share links, only the sha256 of the token is stored, with its last four
 * characters; the token is shown once, when made. A link lets any number of hoandat accounts in until it expires
 * (`expiresAt`) or an admin revokes it; accepting it (signed in) raises the account to `role`, never lowers it.
 */
export const inviteLinks = pgTable(
  'invite_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    last4: text('last4').notNull(),
    role: inviteRole('role').notNull().default('member'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    acceptedCount: integer('accepted_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index('invite_links_created_at_idx').on(table.createdAt)],
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

export const extractStatus = pgEnum('extract_status', ['queued', 'running', 'waiting', 'done', 'failed']);

/** The steps of an uploaded file's processing, in the order C16 shows them. */
export const EXTRACT_STEPS = ['upload', 'ocr', 'structure', 'chunk', 'classify', 'index'] as const;
export type ExtractStepName = (typeof EXTRACT_STEPS)[number];
export type ExtractStepState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/**
 * What the reader can do about a problem (C16 shows it in the reader's language): `rescan` a page more clearly,
 * `export-text-pdf` from the source program instead of scanning, `remove-password`, `resave-file` (open and save
 * again), `convert-format` (to docx, xlsx, pptx, pdf or md), `smaller-file` (under 25 MB), `upload-again`,
 * `retry-later`.
 */
export type ExtractFixHint =
  | 'rescan'
  | 'export-text-pdf'
  | 'remove-password'
  | 'resave-file'
  | 'convert-format'
  | 'smaller-file'
  | 'upload-again'
  | 'retry-later';

/** A page whose OCR text was too poor to index: left out of the chunks, flagged on C16 with what to do. */
export interface LowQualityPage {
  page: number;
  /** 0–1, the page's quality score. */
  score: number;
  hint: ExtractFixHint;
}

/** What a finished step tells C16; each field belongs to the step that sets it. */
export interface ExtractStepDetail {
  /** ocr: pages of the file, pages sent to OCR, and the mean quality of the OCR pages (null when none). */
  pages?: number;
  ocrPages?: number[];
  quality?: number | null;
  lowQualityPages?: LowQualityPage[];
  /** structure: how the file was read (`pdf`, `office`, `markdown`). */
  format?: 'pdf' | 'office' | 'markdown';
  /** chunk and index: passages made / written. */
  chunks?: number;
  /** Why a step was skipped (`no-scanned-pages`, `jev-off`, `jev-failed`, `superseded`, `search-off`…). */
  reason?: string;
}

export interface ExtractStep {
  step: ExtractStepName;
  state: ExtractStepState;
  detail?: ExtractStepDetail;
}

/** Jev's suggestions for where an uploaded file goes (C16 "Jev gợi ý"), pending until the owner accepts them. */
export interface ExtractSuggestions {
  status: 'pending' | 'accepted' | 'dismissed';
  /** The Collection Jev chose among those of the owner's visible Spaces, with its probability; null: none fitted. */
  collection: { collectionId: string; spaceId: string; probability: number } | null;
  /** Candidate tags Jev judged fitting (probability ≥ 0.5), most likely first. */
  tags: Array<{ tag: string; probability: number }>;
}

/**
 * Text extraction of an uploaded file (src/extract/): one row per file, processed one file at a time by the server's
 * in-process queue, which picks up `queued` rows (and `waiting` ones whose `nextAttemptAt` has come) at start and
 * after each job. `steps` is the C16 pipeline, `attempts` the runs so far (3 at most), `errorCode` and `errorHint`
 * the last failure. Never holds the file's text.
 */
export const extractJobs = pgTable(
  'extract_jobs',
  {
    fileId: uuid('file_id')
      .primaryKey()
      .references(() => files.id, { onDelete: 'cascade' }),
    status: extractStatus('status').notNull().default('queued'),
    steps: jsonb('steps').$type<ExtractStep[]>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    errorCode: text('error_code'),
    errorHint: text('error_hint').$type<ExtractFixHint>(),
    suggestions: jsonb('suggestions').$type<ExtractSuggestions>(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [index('extract_jobs_status_idx').on(table.status, table.createdAt)],
);
