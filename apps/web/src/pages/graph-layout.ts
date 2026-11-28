/**
 * Where the nodes of the Graph (C13) sit: a d3-force layout run to rest before the first paint, so the same graph
 * always lands in the same place (d3-force's random source is a fixed-seed LCG, and the starting points are derived
 * from the node order). Each Space pulls its nodes toward its own spot of the board: the graph's Space on the left,
 * the reader's own Space below it, the other Spaces around the right, as board C13 draws them.
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';

/** The world the graph is drawn in (board px): the board's panel area, zoomed and panned as one. */
export const WORLD = { width: 1040, height: 620 } as const;
const MARGIN_X = 70;
const MARGIN_TOP = 50;
/** Room under the lowest nodes for their names. */
const MARGIN_BOTTOM = 40;

/**
 * Where each Space's nodes gather and how hard they are pulled there: the graph's own Space spreads over the left
 * two thirds, the reader's own Space and the others keep to their spot (board C13).
 */
export interface SpaceSpot {
  x: number;
  y: number;
  pull: number;
}
const FOCUS_SPOT: SpaceSpot = { x: 380, y: 300, pull: 0.035 };
const PERSONAL_SPOT: SpaceSpot = { x: 170, y: 560, pull: 0.3 };
const OTHER_SPOTS: ReadonlyArray<Omit<SpaceSpot, 'pull'>> = [
  { x: 920, y: 190 },
  { x: 970, y: 470 },
  { x: 790, y: 540 },
  { x: 770, y: 110 },
  { x: 640, y: 590 },
  { x: 650, y: 70 },
];
const OTHER_PULL = 0.22;
const TICKS = 320;
/**
 * More Spaces than the board's spots (the real Universe has a dozen): the graph's Space sits in the middle and every
 * other Space gets an even share of an ellipse around it, instead of piling onto the board's six spots.
 */
const RING_FOCUS: SpaceSpot = { x: WORLD.width / 2, y: WORLD.height / 2, pull: 0.06 };
const RING = { rx: 430, ry: 250 } as const;
/** Room above a ring: that many Spaces wrap the Space filter onto three rows over the top of the stage. */
const RING_MARGIN_TOP = 140;
/** The smallest node once a large graph is scaled down to fit: still a target a pointer can hit. */
const MIN_RADIUS = 8;

export interface LayoutNode {
  id: string;
  space: string;
  degree: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  r: number;
}

/** A node's radius: the more links, the bigger (board C13: 12 + 4 per link), up to a cap. */
export function nodeRadius(degree: number): number {
  return Math.min(40, 12 + degree * 4);
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
  spot: SpaceSpot;
}

/** Each Space's spot: the focus first, the personal one, then the others in the order given. */
export function spaceSpots(spaces: ReadonlyArray<{ slug: string; personal: boolean }>, focus: string): Map<string, SpaceSpot> {
  const others = spaces.filter((space) => space.slug !== focus && !space.personal).length;
  if (others > OTHER_SPOTS.length) return ringSpots(spaces, focus);
  const spots = new Map<string, SpaceSpot>();
  let next = 0;
  for (const space of spaces) {
    if (space.slug === focus) spots.set(space.slug, FOCUS_SPOT);
    else if (space.personal) spots.set(space.slug, PERSONAL_SPOT);
    else {
      const ring = Math.floor(next / OTHER_SPOTS.length);
      const base = OTHER_SPOTS[next % OTHER_SPOTS.length] ?? FOCUS_SPOT;
      // More Spaces than spots: the next round sits a little inward.
      spots.set(space.slug, { x: base.x - ring * 60, y: base.y + (ring % 2 === 0 ? 1 : -1) * ring * 40, pull: OTHER_PULL });
      next += 1;
    }
  }
  return spots;
}

/** The focus in the middle, the other Spaces (the reader's own last) evenly round an ellipse, starting top left. */
function ringSpots(spaces: ReadonlyArray<{ slug: string; personal: boolean }>, focus: string): Map<string, SpaceSpot> {
  const spots = new Map<string, SpaceSpot>([[focus, RING_FOCUS]]);
  const around = [...spaces.filter((s) => s.slug !== focus && !s.personal), ...spaces.filter((s) => s.slug !== focus && s.personal)];
  around.forEach((space, i) => {
    const angle = -0.75 * Math.PI + (2 * Math.PI * i) / around.length;
    spots.set(space.slug, {
      x: RING_FOCUS.x + RING.rx * Math.cos(angle),
      y: RING_FOCUS.y + RING.ry * Math.sin(angle),
      pull: space.personal ? PERSONAL_SPOT.pull : OTHER_PULL,
    });
  });
  return spots;
}

/**
 * Lays the graph out and fits it to WORLD (scaled down when it would not fit, never up). Same input, same output.
 * A graph of one Space only is centred: the spots keep the right side for other Spaces, which would stay empty.
 */
export function layoutGraph(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  spots: ReadonlyMap<string, SpaceSpot>,
): Map<string, PlacedNode> {
  const counts = new Map<string, number>();
  const sim: SimNode[] = nodes.map((node) => {
    const spot = spots.get(node.space) ?? FOCUS_SPOT;
    const i = counts.get(node.space) ?? 0;
    counts.set(node.space, i + 1);
    // A sunflower around the Space's spot: distinct, deterministic starting points.
    const angle = i * 2.399963;
    const radius = 26 * Math.sqrt(i + 0.5);
    return { id: node.id, r: nodeRadius(node.degree), spot, x: spot.x + radius * Math.cos(angle), y: spot.y + radius * Math.sin(angle) };
  });
  const known = new Set(sim.map((n) => n.id));
  const links: Array<SimulationLinkDatum<SimNode>> = edges.filter((e) => known.has(e.source) && known.has(e.target)).map((e) => ({ source: e.source, target: e.target }));

  const simulation = forceSimulation(sim)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((n) => n.id)
        .distance(120)
        .strength(0.35),
    )
    .force('charge', forceManyBody<SimNode>().strength(-340))
    .force(
      'collide',
      forceCollide<SimNode>((n) => n.r + 24),
    )
    .force(
      'x',
      forceX<SimNode>((n) => n.spot.x).strength((n) => n.spot.pull),
    )
    .force(
      'y',
      forceY<SimNode>((n) => n.spot.y).strength((n) => n.spot.pull),
    )
    .stop();
  simulation.tick(TICKS);

  // Centred when the graph shows one public Space (with or without the reader's own): the board's left/right split is
  // for several Spaces, and with one it left the cluster in a corner of the stage (seen on prod 06/11/2026).
  // The ring is drawn round the middle, so it is centred too.
  const shared = new Set(nodes.filter((n) => spots.get(n.space) !== PERSONAL_SPOT).map((n) => n.space));
  const ring = [...spots.values()].includes(RING_FOCUS);
  return fit(sim, shared.size <= 1 || ring, ring ? RING_MARGIN_TOP : MARGIN_TOP);
}

/**
 * The positions scaled (down only) and moved to sit inside WORLD with room for the names; `centre` puts them in the
 * middle of the room instead of near where the forces left them. The nodes shrink with the positions (not below
 * MIN_RADIUS): scaling the gaps alone piled the nodes of a large graph onto each other (seen on prod 28/11/2026).
 */
function fit(sim: readonly SimNode[], centre: boolean, marginTop: number): Map<string, PlacedNode> {
  const placed = new Map<string, PlacedNode>();
  if (sim.length === 0) return placed;
  const xs = sim.map((n) => n.x ?? 0);
  const ys = sim.map((n) => n.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const room = { w: WORLD.width - 2 * MARGIN_X, h: WORLD.height - marginTop - MARGIN_BOTTOM };
  const scale = Math.min(1, room.w / Math.max(1, maxX - minX), room.h / Math.max(1, maxY - minY));
  // Inside the room when it fits as is; else centred in it.
  const shiftX = (value: number): number => {
    const width = (maxX - minX) * scale;
    const kept = Math.min(Math.max(minX, MARGIN_X), MARGIN_X + room.w - width);
    const left = width <= room.w ? (centre ? MARGIN_X + (room.w - width) / 2 : kept) : MARGIN_X;
    return left + (value - minX) * scale;
  };
  const shiftY = (value: number): number => {
    const height = (maxY - minY) * scale;
    const kept = Math.min(Math.max(minY, marginTop), marginTop + room.h - height);
    const top = height <= room.h ? (centre ? marginTop + (room.h - height) / 2 : kept) : marginTop;
    return top + (value - minY) * scale;
  };
  for (const n of sim) placed.set(n.id, { id: n.id, x: Math.round(shiftX(n.x ?? 0)), y: Math.round(shiftY(n.y ?? 0)), r: Math.max(Math.min(n.r, MIN_RADIUS), Math.round(n.r * scale)) });
  return placed;
}
