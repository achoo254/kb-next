/**
 * What the MCP tools share: who calls (an account of kb acting through its own access token), how a tool is declared
 * (its scope, a zod input checked at the boundary, the JSON Schema clients read), how it fails (`ToolError`, a code the
 * model can act on) and how a document is described (always with its canonical `url`, for source cards).
 */
import { z } from 'zod';
import brandConfig from '../../../../brand.config.json';
import type { DocumentRow, SpaceRow } from '../access/content';
import { spacesById, userNames } from '../access/reading';
import type { Viewer } from '../access/viewer';
import { isPublic } from '../access/visibility';
import type { Lang } from '../api/content-views';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import type { IndexSync } from '../search/index-sync';
import type { LayeredSearchDeps } from '../search/layered-search';
import type { ConfirmTokens } from './confirm-token';

/** The product's name (brand.config.json), in tool texts and the server's info. */
export const APP_NAME = brandConfig.appName;

export const SCOPE_READ = 'kb:read';
export const SCOPE_WRITE = 'kb:write';
export const KB_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const;
export type KbScope = (typeof KB_SCOPES)[number];

export type UserViewer = Extract<Viewer, { kind: 'user' }>;

/** One tool call: the caller and what the tools run on. */
export interface ToolContext {
  db: Db;
  config: ServerConfig;
  now: () => Date;
  /** The IdP subject of the token (confirm tokens are bound to it). */
  subject: string;
  viewer: UserViewer;
  /** The account's language: which translation of a text to show first. */
  lang: Lang;
  search: LayeredSearchDeps;
  sync: IndexSync | null;
  confirm: ConfirmTokens;
}

/** A failure the model can read and act on: `{error: {code, message}}` in a tool result marked `isError`. */
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  scope: KbScope;
  annotations: ToolAnnotations;
  inputSchema: Record<string, unknown>;
  /** Checks `args` against the tool's input, then runs it; throws ToolError (or HttpError from src/access/ callers). */
  call(ctx: ToolContext, args: unknown): Promise<Record<string, unknown>>;
}

export function defineTool<S extends z.ZodType>(def: {
  name: string;
  title: string;
  description: string;
  scope: KbScope;
  annotations: ToolAnnotations;
  input: S;
  run(ctx: ToolContext, input: z.infer<S>): Promise<Record<string, unknown>>;
}): McpTool {
  const { input, run, ...meta } = def;
  return {
    ...meta,
    inputSchema: { ...z.toJSONSchema(input, { io: 'input' }) },
    async call(ctx, args) {
      const parsed = input.safeParse(args ?? {});
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`);
        throw new ToolError('invalid_arguments', issues.join('; '));
      }
      return run(ctx, parsed.data);
    },
  };
}

/** A Space slug as tools take it. */
export const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** A document id from an id or a kb link (`…/d/<id>`, with or without `#anchor`). */
export function documentIdOf(value: string): string {
  const match = UUID.exec(value);
  if (!match) throw new ToolError('invalid_arguments', 'id: give the document id or its kb link (…/d/<id>)');
  return match[0].toLowerCase();
}

export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const documentUrl = (config: ServerConfig, id: string): string => `${config.publicOrigin}/d/${id}`;
export const spaceUrl = (config: ServerConfig, slug: string): string => `${config.publicOrigin}/s/${slug}`;

export interface SpaceView {
  slug: string;
  name: string;
  kind: SpaceRow['kind'];
  url: string;
}

export function spaceView(config: ServerConfig, space: SpaceRow, lang: Lang): SpaceView {
  return { slug: space.slug, name: lang === 'en' ? space.nameEn : space.nameVi, kind: space.kind, url: spaceUrl(config, space.slug) };
}

/** How a document is described in every tool answer. `visibility`: public (everyone reads it) or private. */
export interface DocumentView {
  id: string;
  title: string;
  url: string;
  lang: Lang;
  type: DocumentRow['type'];
  visibility: 'public' | 'private';
  status: DocumentRow['status'];
  updated_at: string;
  author: string | null;
  space: SpaceView;
}

/** Views of readable documents (already read through src/access/ for the caller), in their order. */
export async function documentViews(ctx: ToolContext, docs: readonly DocumentRow[]): Promise<DocumentView[]> {
  const [spaceRows, authors] = await Promise.all([
    spacesById(ctx.db, [...new Set(docs.map((d) => d.spaceId))]),
    userNames(
      ctx.db,
      docs.map((d) => d.authorId),
    ),
  ]);
  const spaces = new Map(spaceRows.map((s) => [s.id, s]));
  return docs.flatMap((doc) => {
    const space = spaces.get(doc.spaceId);
    if (!space) return [];
    return [
      {
        id: doc.id,
        title: doc.title,
        url: documentUrl(ctx.config, doc.id),
        lang: doc.lang,
        type: doc.type,
        visibility: isPublic(doc) ? 'public' : 'private',
        status: doc.status,
        updated_at: doc.updatedAt.toISOString(),
        author: authors.get(doc.authorId) ?? null,
        space: spaceView(ctx.config, space, ctx.lang),
      },
    ];
  });
}
