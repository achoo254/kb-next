/**
 * The knowledge graph of a Space (C13): GET /api/graph?space=<slug> gives its nodes (the documents the viewer may
 * read in the Space, then those they link to, one per text in the reader's language) and edges (the `links` table:
 * `[[ ]]` links of the texts and labelled "related" edges); GET /api/graph/suggestions?document=<id> asks Jev which
 * unlinked documents of the same Space relate to one node (top 3, never linked on its own); POST /api/graph/edges
 * draws a "related" edge the user accepted or chose, DELETE /api/graph/edges/:id erases one. Reads go through
 * src/access/ like every other route.
 */
import express, { type Router } from 'express';
import { z } from 'zod';
import { type DocumentRow, type LinkRow, listDocuments, listLinks } from '../access/content';
import { addRelation, findReadableLink, firstPassages, graphDocuments, linkBetween, mayLink, removeRelation } from '../access/graph';
import { headingsOf, linksTouching } from '../access/participation';
import { spaceAccess, spacesById } from '../access/reading';
import type { Viewer } from '../access/viewer';
import { HttpError } from '../http-error';
import type { JevJudge } from '../jev/jev-client';
import { scoreRelatedness } from '../jev/relatedness';
import { safeErrorText } from '../log-error';
import { type BilingualSummary, excerpt } from '../search/document-summaries';
import { perAccountLimit, signedIn } from './account-limit';
import { type Lang, type SpaceBrief, pickTexts, spaceBrief } from './content-views';
import { neighbours, relevance, termsOf } from './relevance';
import { type RequestContextDeps, openDocument, readerOf } from './request-context';
import { parseBody, parseQuery } from './validate';

/** How an edge reads (C13 legend): `leads-to` "dẫn tới", `prerequisite` "cần trước", `related` "liên quan". */
export type EdgeType = 'leads-to' | 'prerequisite' | 'related';

/** Relation labels that say one text leads to the other (a journey's steps too); kept as written in the data. */
const LEADS_TO = /^(dẫn tới|leads to|(bước|step) \d+)$/iu;
const PREREQUISITE = /^(cần trước|prerequisite)$/iu;
/** The plain "related" label, which the edge's type already says. */
const RELATED = /^(liên quan|related)$/iu;

export const MAX_EDGE_LABEL = 40;
/** Suggestions shown for a node, best first. */
export const SUGGESTIONS = 3;
/** Unlinked documents of the Space Jev rates for a node, the most related in code first. */
const SUGGESTION_CANDIDATES = 20;
/** One line under a node's name in the panel. */
const SUMMARY_CHARS = 140;

export interface GraphNode {
  id: string;
  title: string;
  type: DocumentRow['type'];
  origin: DocumentRow['origin'];
  status: DocumentRow['status'];
  spaceSlug: string;
  /** One line on what it is: the curated summary of an imported text, else the start of its first passage. */
  summary: string | null;
  /** Other nodes it is linked with (either direction). */
  degree: number;
  /** Nodes that link to it. */
  backlinks: number;
}

export interface GraphEdge {
  /** The link behind the edge (a pair linked more than once shows its most telling link). */
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  /** A "related" edge's own label; null: the type says it all. */
  label: string | null;
  /** A user-made "related" edge the viewer may erase. */
  removable: boolean;
}

export interface GraphResponse {
  space: SpaceBrief;
  /** The Spaces of the nodes (the filter chips): the graph's own first, then by how many nodes, by name; the reader's own last. */
  spaces: Array<SpaceBrief & { kind: 'public' | 'personal' }>;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Whether Jev can suggest edges on this server. */
  suggestions: boolean;
}

export interface SuggestionsResponse {
  suggestions: Array<{ id: string; title: string; spaceSlug: string; relevance: number }>;
}

const GraphQuery = z.object({ space: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/), lang: z.enum(['vi', 'en']).optional() });
const SuggestionQuery = z.object({ document: z.string().min(1).max(64), lang: z.enum(['vi', 'en']).optional() });
const EdgeBody = z.strictObject({
  sourceId: z.string().min(1).max(64),
  targetId: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(MAX_EDGE_LABEL).nullable().optional(),
});

export interface GraphRoutesOptions extends RequestContextDeps {
  jev: JevJudge | null;
  summaries: ReadonlyMap<string, BilingualSummary>;
}

export function edgeType(link: Pick<LinkRow, 'kind' | 'label'>): EdgeType {
  if (link.kind !== 'relation' || link.label === null) return 'related';
  if (LEADS_TO.test(link.label)) return 'leads-to';
  if (PREREQUISITE.test(link.label)) return 'prerequisite';
  return 'related';
}

/** Which of two links between the same pair the edge shows: a typed relation, then any relation, then a written link. */
function rank(link: LinkRow): number {
  const type = edgeType(link);
  if (type !== 'related') return 0;
  return link.kind === 'relation' ? 1 : 2;
}

/**
 * The edges between `nodes` from their links: each link's ends mapped to the text's node (a link to a translation
 * reaches the text shown), one edge per pair, no loops.
 */
export function graphEdges(viewer: Viewer, links: readonly LinkRow[], nodeOf: ReadonlyMap<string, DocumentRow>): GraphEdge[] {
  const chosen = new Map<string, { link: LinkRow; source: DocumentRow; target: DocumentRow }>();
  for (const link of links) {
    const source = nodeOf.get(link.sourceId);
    const target = nodeOf.get(link.targetId);
    if (!source || !target || source.id === target.id) continue;
    const key = [source.id, target.id].sort().join('|');
    const current = chosen.get(key);
    if (!current || rank(link) < rank(current.link)) chosen.set(key, { link, source, target });
  }
  return [...chosen.values()].map(({ link, source, target }) => {
    const type = edgeType(link);
    return {
      id: link.id,
      source: source.id,
      target: target.id,
      type,
      label: type === 'related' && link.kind === 'relation' && link.label !== null && !RELATED.test(link.label) ? link.label : null,
      removable: link.kind === 'relation' && mayLink(viewer, source, target),
    };
  });
}

/** The first sentence of a text when it is a sentence of some length, else the text. */
export function firstSentence(text: string): string {
  const end = /[.!?](\s|$)/.exec(text);
  return end && end.index >= 20 ? text.slice(0, end.index + 1) : text;
}

/**
 * One line on a document (the node panel): the curated summary of an imported text, else the first sentence of its
 * first passage, cut at a word.
 */
function summaryOf(doc: DocumentRow, lang: Lang, summaries: ReadonlyMap<string, BilingualSummary>, passage: string | undefined): string | null {
  const curated = doc.translationGroupId ? summaries.get(doc.translationGroupId)?.[lang].summary : undefined;
  const source = curated ?? (passage ? firstSentence(excerpt(passage.split(/\n\s*\n/)[0] ?? '', SUMMARY_CHARS)) : undefined);
  return source ? excerpt(source, SUMMARY_CHARS) : null;
}

export function graphRoutes({ config, db, now, jev, summaries }: GraphRoutesOptions): Router {
  const router = express.Router();
  const reader = (req: Parameters<typeof readerOf>[0]) => readerOf(req, { config, db, now });
  const auth = signedIn(config, db, now);
  // Each suggestion is a Jev call; edges are writes.
  const suggestLimit = perAccountLimit(12);
  const edgeLimit = perAccountLimit(30);

  router.get('/api/graph', async (req, res) => {
    const { viewer, lang } = await reader(req);
    const { space: slug } = parseQuery(GraphQuery, req.query);
    const access = await spaceAccess(db, viewer, slug);
    if (access.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (access.kind === 'no-access') throw new HttpError(403, 'no-access');
    const { space } = access;

    const graph = await graphDocuments(db, viewer, space.id);
    const texts = pickTexts(graph.documents, lang);
    // Every document of a text (any language) stands for the node of that text.
    const keyOf = (d: DocumentRow): string => d.translationGroupId ?? d.id;
    const shown = new Map(texts.map(({ doc }) => [keyOf(doc), doc]));
    const nodeOf = new Map<string, DocumentRow>();
    for (const d of graph.documents) {
      const node = shown.get(keyOf(d));
      if (node) nodeOf.set(d.id, node);
    }
    const edges = graphEdges(viewer, graph.links, nodeOf);

    const near = new Map<string, Set<string>>();
    const linkers = new Map<string, Set<string>>();
    const addTo = (map: Map<string, Set<string>>, key: string, value: string): void => {
      const set = map.get(key);
      if (set) set.add(value);
      else map.set(key, new Set([value]));
    };
    for (const e of edges) {
      addTo(near, e.source, e.target);
      addTo(near, e.target, e.source);
    }
    for (const link of graph.links) {
      const source = nodeOf.get(link.sourceId);
      const target = nodeOf.get(link.targetId);
      if (source && target && source.id !== target.id) addTo(linkers, target.id, source.id);
    }

    const nodesShown = texts.map((t) => t.doc);
    const passages = await firstPassages(
      db,
      viewer,
      nodesShown.map((d) => d.id),
    );
    const spaceRows = await spacesById(db, [...new Set(nodesShown.map((d) => d.spaceId))]);
    const slugOf = new Map(spaceRows.map((s) => [s.id, s.slug]));
    const nodes: GraphNode[] = nodesShown.flatMap((doc) => {
      const spaceSlug = slugOf.get(doc.spaceId);
      if (!spaceSlug) return [];
      return [
        {
          id: doc.id,
          title: doc.title,
          type: doc.type,
          origin: doc.origin,
          status: doc.status,
          spaceSlug,
          summary: summaryOf(doc, lang, summaries, passages.get(doc.id)),
          degree: near.get(doc.id)?.size ?? 0,
          backlinks: linkers.get(doc.id)?.size ?? 0,
        },
      ];
    });
    const counts = new Map<string, number>();
    for (const n of nodes) counts.set(n.spaceSlug, (counts.get(n.spaceSlug) ?? 0) + 1);
    const spaces = spaceRows
      .filter((s) => counts.has(s.slug))
      .sort((a, b) => {
        const own = Number(b.id === space.id) - Number(a.id === space.id);
        const personal = Number(a.kind === 'personal') - Number(b.kind === 'personal');
        return own || personal || (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0) || a.nameVi.localeCompare(b.nameVi, 'vi');
      })
      .map((s) => ({ ...spaceBrief(s), kind: s.kind }));
    const body: GraphResponse = { space: spaceBrief(space), spaces, nodes, edges, suggestions: jev !== null };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/api/graph/suggestions', auth, suggestLimit, async (req, res) => {
    const { viewer, lang } = await reader(req);
    const query = parseQuery(SuggestionQuery, req.query);
    const doc = await openDocument(db, viewer, query.document);
    if (!jev) throw new HttpError(503, 'jev-off');

    const linkedIds = new Set(((await listLinks(db, viewer, doc.id)) ?? []).flatMap((l) => [l.sourceId, l.targetId]));
    const ownKey = doc.translationGroupId ?? doc.id;
    const sameSpace = await listDocuments(db, viewer, { spaceId: doc.spaceId });
    // A text is linked when any of its language versions is.
    const linkedKeys = new Set(sameSpace.filter((d) => linkedIds.has(d.id)).map((d) => d.translationGroupId ?? d.id));
    const candidates = pickTexts(
      sameSpace.filter((d) => {
        const key = d.translationGroupId ?? d.id;
        return key !== ownKey && !linkedKeys.has(key) && mayLink(viewer, doc, d);
      }),
      lang,
    ).map((p) => p.doc);
    if (candidates.length === 0) {
      res.set('Cache-Control', 'no-store').json({ suggestions: [] } satisfies SuggestionsResponse);
      return;
    }

    const ids = [doc.id, ...candidates.map((c) => c.id)];
    const [headings, pairs, passages] = await Promise.all([headingsOf(db, viewer, ids), linksTouching(db, viewer, ids), firstPassages(db, viewer, ids)]);
    const graph = neighbours(pairs);
    const features = (d: DocumentRow) => ({ id: d.id, spaceId: d.spaceId, collectionId: d.collectionId, terms: termsOf([d.title, ...(headings.get(d.id) ?? [])]) });
    const own = features(doc);
    const offered = candidates
      .map((c, order) => ({ doc: c, order, score: relevance(own, features(c), graph) }))
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, SUGGESTION_CANDIDATES)
      .map((c) => c.doc);
    const item = (d: DocumentRow) => ({ id: d.id, title: d.title, text: summaryOf(d, lang, summaries, passages.get(d.id)) ?? '' });
    let scored: Awaited<ReturnType<typeof scoreRelatedness>>;
    try {
      scored = await scoreRelatedness(
        jev,
        'graph-suggest',
        [item(doc), ...offered.map(item)],
        offered.map((c) => [doc.id, c.id] as const),
      );
    } catch (error) {
      console.warn('graph suggestions unavailable', safeErrorText(error));
      throw new HttpError(502, 'jev-failed');
    }
    const byId = new Map(offered.map((d) => [d.id, d]));
    const spaceRows = await spacesById(db, [doc.spaceId]);
    const spaceSlug = spaceRows[0]?.slug ?? '';
    const body: SuggestionsResponse = {
      suggestions: scored.pairs.slice(0, SUGGESTIONS).flatMap((p) => {
        const found = byId.get(p.b);
        return found ? [{ id: found.id, title: found.title, spaceSlug, relevance: p.relevance }] : [];
      }),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/api/graph/edges', auth, edgeLimit, async (req, res) => {
    const { viewer } = await reader(req);
    const body = parseBody(EdgeBody, req.body);
    const first = await openDocument(db, viewer, body.sourceId);
    const second = await openDocument(db, viewer, body.targetId);
    if ((first.translationGroupId ?? first.id) === (second.translationGroupId ?? second.id)) throw new HttpError(400, 'same-document');
    if (!mayLink(viewer, first, second)) throw new HttpError(403, 'not-allowed');
    if (await linkBetween(db, first.id, second.id)) throw new HttpError(409, 'exists');
    // Stored from the viewer's own text: the edge shows only to those who may read it.
    const ownsFirst = viewer.kind === 'user' && first.authorId === viewer.userId;
    const ownsSecond = viewer.kind === 'user' && second.authorId === viewer.userId;
    const [source, target] = !ownsFirst && ownsSecond ? [second, first] : [first, second];
    const link = await addRelation(db, source.id, target.id, body.label ?? null, now());
    const [edge] = graphEdges(
      viewer,
      [link],
      new Map([
        [source.id, source],
        [target.id, target],
      ]),
    );
    if (!edge) throw new Error('new edge missing');
    res.status(201).json({ edge });
  });

  router.delete('/api/graph/edges/:id', auth, edgeLimit, async (req, res) => {
    const { viewer } = await reader(req);
    const id = req.params.id;
    const found = typeof id === 'string' ? await findReadableLink(db, viewer, id) : null;
    if (!found) throw new HttpError(404, 'not-found');
    if (found.link.kind !== 'relation' || !mayLink(viewer, found.source, found.target)) throw new HttpError(403, 'not-allowed');
    await removeRelation(db, found.link.id);
    res.status(204).end();
  });

  return router;
}
