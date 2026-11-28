/**
 * The read tools (scope `kb:read`): search, get_document, list_spaces, recent. Each runs the same src/access/ reads as
 * the web routes (api/search-routes.ts, content-routes.ts) for the caller's viewer, so a tool shows exactly what the
 * account reads on the web: published texts, its own private ones, nothing in a Space an admin hid.
 */
import { z } from 'zod';
import { findLatestVersion, hasReadableContent, listChunks, listSpaces } from '../access/content';
import { listRecentDocuments, listTranslationsOf } from '../access/reading';
import { MAX_QUERY_LENGTH } from '../access/search';
import { pickTexts } from '../api/content-views';
import { openDocument } from '../api/request-context';
import { mergeResults } from '../api/search-routes';
import { type SourceState, layeredSearch, textKey } from '../search/layered-search';
import { findPersonalSpace } from '../access/spaces-write';
import { APP_NAME, type DocumentView, READ_ONLY, SCOPE_READ, SLUG, type ToolContext, ToolError, defineTool, documentIdOf, documentUrl, documentViews, spaceUrl } from './tool-kit';

/** Longest passage excerpt a search result carries. */
const EXCERPT_CHARS = 600;
const MAX_SEARCH_RESULTS = 30;
const MAX_RECENT = 20;

const excerpt = (text: string): string => (text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS - 1)}…` : text);

/**
 * The Spaces a search looks in: `mine` the user's own private Space (none yet: nothing), `library` every shared Space
 * the user reads, `all` no limit; a named Space narrows any of them.
 */
async function searchSpaceIds(ctx: ToolContext, scope: 'mine' | 'library' | 'all', slug: string | undefined): Promise<string[] | undefined> {
  const { db, viewer } = ctx;
  const readable = await listSpaces(db, viewer);
  let ids: string[] | undefined;
  if (scope === 'mine') {
    const own = await findPersonalSpace(db, viewer.userId);
    ids = own ? [own.id] : [];
  } else if (scope === 'library') {
    ids = readable.filter((s) => s.kind === 'public').map((s) => s.id);
  }
  if (!slug) return ids;
  const space = readable.find((s) => s.slug === slug);
  if (!space) throw new ToolError('space_not_found', `No Space "${slug}" the user can read; see list_spaces.`);
  return ids === undefined || ids.includes(space.id) ? [space.id] : [];
}

export interface SearchResultView extends DocumentView {
  heading: string | null;
  excerpt: string;
  passage_url: string;
  match: ReturnType<typeof mergeResults>[number]['match'];
}

/**
 * One result per text, best first, in `spaceIds` (undefined: any Space; empty: none), only texts of `authorId` when
 * given. Shared by search and save_note's similar notes.
 */
export async function searchResults(
  ctx: ToolContext,
  query: string,
  spaceIds: string[] | undefined,
  limit: number,
  meaning: boolean,
  authorId?: string,
): Promise<{ keyword: SourceState; meaning: SourceState; results: SearchResultView[] }> {
  if (spaceIds?.length === 0) return { keyword: 'skipped', meaning: 'skipped', results: [] };
  const found = await layeredSearch(ctx.search, ctx.viewer, query, { spaceIds }, { allVariants: true, meaning });
  const merged = mergeResults(found.keywordFound, found.meaningFound)
    .filter((f) => authorId === undefined || f.doc.authorId === authorId)
    .slice(0, limit);
  const views = new Map((await documentViews(ctx, merged.map((f) => f.doc))).map((v) => [v.id, v]));
  const results = merged.flatMap((f) => {
    const view = views.get(f.doc.id);
    if (!view) return [];
    return [{ ...view, heading: f.chunk.heading, excerpt: excerpt(f.chunk.text), passage_url: `${view.url}#${f.chunk.anchor}`, match: f.match }];
  });
  return { keyword: found.keyword.state, meaning: found.meaning, results };
}

const search = defineTool({
  name: 'search',
  title: `Search the ${APP_NAME}`,
  description:
    `Search the documents the user can read on the ${APP_NAME}, their private ones included, by keywords and by meaning. One result per text, best first, each with the passage that matched and the url to cite. To recall what the user saved for themselves, search scope "mine" first.`,
  scope: SCOPE_READ,
  annotations: READ_ONLY,
  input: z.strictObject({
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH).describe('What to look for, in Vietnamese or English.'),
    scope: z
      .enum(['all', 'mine', 'library'])
      .optional()
      .default('all')
      .describe("`mine`: only the user's own private Space (their notes and memory); `library`: only the shared Spaces; `all`: both."),
    space: z.string().regex(SLUG).optional().describe('Only this Space (its slug, from list_spaces).'),
    limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional().default(10),
    mode: z.enum(['all', 'keyword']).optional().default('all').describe('`keyword` skips the search by meaning (faster).'),
  }),
  async run(ctx, input) {
    const spaceIds = await searchSpaceIds(ctx, input.scope, input.space);
    const results = await searchResults(ctx, input.query, spaceIds, input.limit, input.mode === 'all');
    return { query: input.query, scope: input.scope, keyword: results.keyword, meaning: results.meaning, results: results.results };
  },
});

const getDocument = defineTool({
  name: 'get_document',
  title: 'Read a document',
  description: 'Read one document the user can read: its Markdown, title, Space, translations and url. Takes the id or the kb link from search or recent.',
  scope: SCOPE_READ,
  annotations: READ_ONLY,
  input: z.strictObject({ id: z.string().trim().min(1).max(500).describe('The document id, or its link (…/d/<id>).') }),
  async run(ctx, input) {
    const { db, viewer } = ctx;
    const doc = await openDocument(db, viewer, documentIdOf(input.id));
    const [latest, translations, [view]] = await Promise.all([
      findLatestVersion(db, viewer, doc.id),
      listTranslationsOf(db, viewer, [textKey(doc)]),
      documentViews(ctx, [doc]),
    ]);
    if (!view) throw new ToolError('not_found', 'The document is not available.');
    // A stored file (an Office document, a PDF) has no Markdown version: its extracted text is in its passages.
    const markdown = latest?.markdown ?? ((await listChunks(db, viewer, doc.id)) ?? []).map((c) => c.text).join('\n\n');
    return {
      ...view,
      source_url: doc.sourceUrl,
      tags: doc.tags,
      markdown,
      translations: translations.filter((t) => t.id !== doc.id).map((t) => ({ id: t.id, lang: t.lang, url: documentUrl(ctx.config, t.id) })),
    };
  },
});

const listSpacesTool = defineTool({
  name: 'list_spaces',
  title: 'List Spaces',
  description: "List the Spaces the user can read (public Spaces with texts, and the user's own private Space), with how many texts each holds.",
  scope: SCOPE_READ,
  annotations: READ_ONLY,
  input: z.strictObject({}),
  async run(ctx) {
    const spaces = (await listSpaces(ctx.db, ctx.viewer)).filter(hasReadableContent);
    return {
      spaces: spaces.map((s) => ({
        slug: s.slug,
        name_vi: s.nameVi,
        name_en: s.nameEn,
        kind: s.kind,
        url: spaceUrl(ctx.config, s.slug),
        document_count: s.documentCount,
        updated_at: s.latestAt?.toISOString() ?? null,
      })),
    };
  },
});

const recent = defineTool({
  name: 'recent',
  title: 'Recently changed documents',
  description: 'The documents the user can read that changed most recently (their own private ones included), one per text, newest first.',
  scope: SCOPE_READ,
  annotations: READ_ONLY,
  input: z.strictObject({ limit: z.number().int().min(1).max(MAX_RECENT).optional().default(8) }),
  async run(ctx, input) {
    // Translations change together: read more rows than asked, then keep one per text (as GET /api/recent does).
    const rows = await listRecentDocuments(ctx.db, ctx.viewer, input.limit * 4);
    const picked = pickTexts(rows, ctx.lang).slice(0, input.limit);
    return { documents: await documentViews(ctx, picked.map((p) => p.doc)) };
  },
});

export const READ_TOOLS = [search, getDocument, listSpacesTool, recent];
