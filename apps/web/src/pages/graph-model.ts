/**
 * What the Graph (C13) shows of its data, as plain functions: which nodes pass the filters, a node's neighbours and
 * how each relates to it, the reading path through a node, and the node an arrow key moves to.
 */
import type { EdgeType, Graph, GraphEdge, GraphNode } from '../api/graph-api';

/** The "Nguồn" filter: everything, official texts, community texts, or the reader's own. */
export type SourceFilter = 'all' | 'official' | 'community' | 'own';
export const SOURCE_FILTERS: readonly SourceFilter[] = ['all', 'official', 'community', 'own'];

export interface GraphFilter {
  /** Spaces switched off (their chips not pressed). */
  off: ReadonlySet<string>;
  source: SourceFilter;
}

export const NO_FILTER: GraphFilter = { off: new Set(), source: 'all' };

export function passesFilter(node: GraphNode, filter: GraphFilter): boolean {
  if (filter.off.has(node.spaceSlug)) return false;
  return filter.source === 'all' || node.origin === filter.source;
}

/** Ids of the nodes shown, in the graph's order. */
export function visibleNodeIds(graph: Pick<Graph, 'nodes'>, filter: GraphFilter): Set<string> {
  return new Set(graph.nodes.filter((n) => passesFilter(n, filter)).map((n) => n.id));
}

/** How a neighbour relates to the picked node, from the picked node's side (board C13 "Nối trực tiếp"). */
export type NeighbourRelation = EdgeType | 'from' | 'needed-before';

export interface Neighbour {
  id: string;
  edge: GraphEdge;
  relation: NeighbourRelation;
}

/** The shown neighbours of `id`, in the order of the edges. */
export function neighboursOf(id: string, edges: readonly GraphEdge[], visible: ReadonlySet<string>): Neighbour[] {
  return edges.flatMap((edge): Neighbour[] => {
    if (edge.source === id && visible.has(edge.target)) return [{ id: edge.target, edge, relation: edge.type }];
    if (edge.target === id && visible.has(edge.source)) {
      const relation: NeighbourRelation = edge.type === 'leads-to' ? 'from' : edge.type === 'prerequisite' ? 'needed-before' : 'related';
      return [{ id: edge.source, edge, relation }];
    }
    return [];
  });
}

/**
 * The reading path through `id` (board C13 "Khám phá liên quan"): what is needed before it, the node, what it leads
 * to, and one step further when it leads to a single text. Only shown nodes take part.
 */
export function readingPath(id: string, edges: readonly GraphEdge[], visible: ReadonlySet<string>): string[] {
  const before = edges.filter((e) => e.type === 'prerequisite' && e.target === id && visible.has(e.source)).map((e) => e.source);
  const next = edges.filter((e) => e.type === 'leads-to' && e.source === id && visible.has(e.target)).map((e) => e.target);
  const path = [...before, id, ...next];
  const only = next.length === 1 ? next[0] : undefined;
  if (only) {
    const further = edges.find((e) => e.type === 'leads-to' && e.source === only && visible.has(e.target) && !path.includes(e.target));
    if (further) path.push(further.target);
  }
  return [...new Set(path)];
}

/** Where a newcomer starts when no node is picked: the shown node of the graph's own Space with the most links. */
export function startingNode(nodes: readonly GraphNode[], space: string, visible: ReadonlySet<string>): GraphNode | null {
  let best: GraphNode | null = null;
  for (const node of nodes) {
    if (!visible.has(node.id) || node.spaceSlug !== space) continue;
    if (!best || node.degree > best.degree) best = node;
  }
  return best;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

const DIRECTION: Record<Direction, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/**
 * The node an arrow key moves the focus to: the nearest one within 60° of the arrow's direction (distance weighted
 * by how far off the direction it lies); null at the edge of the graph.
 */
export function nodeInDirection(
  from: string,
  direction: Direction,
  positions: ReadonlyMap<string, { x: number; y: number }>,
  candidates: Iterable<string>,
): string | null {
  const origin = positions.get(from);
  if (!origin) return null;
  const want = DIRECTION[direction];
  let best: { id: string; cost: number } | null = null;
  for (const id of candidates) {
    const p = positions.get(id);
    if (id === from || !p) continue;
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) continue;
    const along = (dx * want.x + dy * want.y) / distance;
    // cos 60° = 0.5
    if (along < 0.5) continue;
    const cost = distance * (2 - along);
    if (!best || cost < best.cost) best = { id, cost };
  }
  return best?.id ?? null;
}
