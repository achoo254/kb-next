/**
 * The Graph API (apps/server/src/api/graph-routes.ts) as typed calls: a Space's graph (C13), Jev's suggested edges for
 * one node, and drawing or erasing a "related" edge. Answers are checked against their schemas here.
 *
 * Errors (ApiError.code): `not-found` (404), `no-access` (403) for a Space or document that cannot be opened;
 * `jev-off` (503) when the server has no Jev, `jev-failed` (502) when Jev did not answer; `not-allowed` (403) for an
 * edge the account may not draw or erase, `exists` (409) for two documents already linked, `same-document` (400);
 * `rate-limited` (429); `network` offline.
 */
import * as z from 'zod/mini';
import { getJson, apiFetch } from './api-client';
import { DOCUMENT_ORIGINS, DOCUMENT_STATUSES, DOCUMENT_TYPES, type Lang } from './content-api';

export const EDGE_TYPES = ['leads-to', 'prerequisite', 'related'] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

const GraphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  origin: z.enum(DOCUMENT_ORIGINS),
  status: z.enum(DOCUMENT_STATUSES),
  spaceSlug: z.string(),
  /** One line on what it is (null: nothing to show). */
  summary: z.nullable(z.string()),
  /** Other nodes it is linked with: the node's size. */
  degree: z.number(),
  backlinks: z.number(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

const GraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.enum(EDGE_TYPES),
  /** A "related" edge's own label; null: the type names it. */
  label: z.nullable(z.string()),
  /** A user-made edge this account may erase. */
  removable: z.boolean(),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

const GraphSpaceSchema = z.object({
  slug: z.string(),
  nameVi: z.string(),
  nameEn: z.string(),
  tint: z.string(),
  glow: z.string(),
  kind: z.enum(['public', 'personal']),
});
export type GraphSpace = z.infer<typeof GraphSpaceSchema>;

const GraphSchema = z.object({
  space: z.object({ slug: z.string(), nameVi: z.string(), nameEn: z.string(), tint: z.string(), glow: z.string() }),
  /** The Spaces of the nodes (filter chips): the graph's own first. */
  spaces: z.array(GraphSpaceSchema),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  /** Whether Jev can suggest edges on this server. */
  suggestions: z.boolean(),
});
export type Graph = z.infer<typeof GraphSchema>;

const SuggestionsSchema = z.object({
  suggestions: z.array(z.object({ id: z.string(), title: z.string(), spaceSlug: z.string(), relevance: z.number() })),
});
export type EdgeSuggestion = z.infer<typeof SuggestionsSchema>['suggestions'][number];

const withLang = (params: Record<string, string>, lang: Lang | undefined): string => new URLSearchParams({ ...params, ...(lang ? { lang } : {}) }).toString();

/** C13: the graph of a Space, nodes in the reader's language. */
export function fetchGraph(space: string, lang?: Lang): Promise<Graph> {
  return getJson(GraphSchema, `/api/graph?${withLang({ space }, lang)}`);
}

/** Jev's suggested edges for one node (at most 3, best first); never drawn until the user accepts one. */
export async function fetchEdgeSuggestions(documentId: string, lang?: Lang): Promise<EdgeSuggestion[]> {
  return (await getJson(SuggestionsSchema, `/api/graph/suggestions?${withLang({ document: documentId }, lang)}`)).suggestions;
}

/** Draws a "related" edge between two documents; answers the edge as the graph shows it. */
export async function addEdge(sourceId: string, targetId: string, label: string | null = null): Promise<GraphEdge> {
  return (await getJson(z.object({ edge: GraphEdgeSchema }), '/api/graph/edges', { method: 'POST', body: JSON.stringify({ sourceId, targetId, label }) })).edge;
}

export async function removeEdge(id: string): Promise<void> {
  await apiFetch(`/api/graph/edges/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
