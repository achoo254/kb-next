import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../api/graph-api';
import { WORLD, layoutGraph, nodeRadius, spaceSpots } from './graph-layout';
import { NO_FILTER, neighboursOf, nodeInDirection, passesFilter, readingPath, startingNode, visibleNodeIds } from './graph-model';

function node(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, title: id, type: 'lab', origin: 'official', status: 'approved', spaceSlug: 'networking', summary: null, degree: 1, backlinks: 0, ...extra };
}

function edge(source: string, target: string, type: GraphEdge['type'] = 'related'): GraphEdge {
  return { id: `${source}-${target}`, source, target, type, label: null, removable: false };
}

// Board C13's DHCP: Subnet is needed before it, it leads to ARP, ARP leads to DNS.
const EDGES = [edge('subnet', 'dhcp', 'prerequisite'), edge('dhcp', 'arp', 'leads-to'), edge('arp', 'dns', 'leads-to'), edge('journey', 'dhcp', 'leads-to'), edge('spoof', 'dhcp')];
const ALL = new Set(['subnet', 'dhcp', 'arp', 'dns', 'journey', 'spoof']);

describe('filters', () => {
  it('drops the Spaces switched off and keeps one source', () => {
    const nodes = [node('a'), node('b', { origin: 'community' }), node('c', { origin: 'own', spaceSlug: 'personal-x' })];
    expect([...visibleNodeIds({ nodes }, NO_FILTER)]).toEqual(['a', 'b', 'c']);
    expect([...visibleNodeIds({ nodes }, { off: new Set(['personal-x']), source: 'all' })]).toEqual(['a', 'b']);
    expect([...visibleNodeIds({ nodes }, { off: new Set(), source: 'community' })]).toEqual(['b']);
    expect(passesFilter(node('d', { origin: 'own' }), { off: new Set(), source: 'own' })).toBe(true);
    expect(visibleNodeIds({ nodes }, { off: new Set(['personal-x']), source: 'own' }).size).toBe(0);
  });
});

describe('neighbours and paths', () => {
  it("says how each neighbour relates from the picked node's side", () => {
    expect(neighboursOf('dhcp', EDGES, ALL).map((n) => [n.id, n.relation])).toEqual([
      ['subnet', 'needed-before'],
      ['arp', 'leads-to'],
      ['journey', 'from'],
      ['spoof', 'related'],
    ]);
    expect(neighboursOf('dhcp', EDGES, new Set(['dhcp', 'arp'])).map((n) => n.id)).toEqual(['arp']);
  });

  it('reads the path the board shows: what comes before, the node, where it leads, one step further', () => {
    expect(readingPath('dhcp', EDGES, ALL)).toEqual(['subnet', 'dhcp', 'arp', 'dns']);
    expect(readingPath('spoof', EDGES, ALL)).toEqual(['spoof']);
    expect(readingPath('dhcp', EDGES, new Set(['dhcp', 'arp']))).toEqual(['dhcp', 'arp']);
  });

  it("starts a newcomer at the graph's own Space's most linked node", () => {
    const nodes = [node('a', { degree: 2 }), node('b', { degree: 5 }), node('c', { degree: 9, spaceSlug: 'linux' })];
    expect(startingNode(nodes, 'networking', new Set(['a', 'b', 'c']))?.id).toBe('b');
    expect(startingNode(nodes, 'networking', new Set(['c']))).toBeNull();
  });
});

describe('keyboard moves', () => {
  const positions = new Map([
    ['m', { x: 100, y: 100 }],
    ['right', { x: 200, y: 110 }],
    ['far-right', { x: 400, y: 100 }],
    ['down', { x: 90, y: 220 }],
    ['diagonal', { x: 180, y: 180 }],
  ]);
  const ids = [...positions.keys()];

  it('moves to the nearest node within 60° of the arrow, nowhere at the edge', () => {
    expect(nodeInDirection('m', 'right', positions, ids)).toBe('right');
    expect(nodeInDirection('m', 'down', positions, ids)).toBe('down');
    expect(nodeInDirection('m', 'left', positions, ids)).toBeNull();
    expect(nodeInDirection('m', 'up', positions, ids)).toBeNull();
    expect(nodeInDirection('right', 'right', positions, ids)).toBe('far-right');
  });
});

describe('layout', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, space: i < 3 ? 'networking' : 'linux', degree: i }));
  const edges = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'c', target: 'd' },
    { source: 'd', target: 'e' },
  ];
  const spots = spaceSpots(
    [
      { slug: 'networking', personal: false },
      { slug: 'linux', personal: false },
    ],
    'networking',
  );

  it('lands the same graph in the same place every time, inside the stage', () => {
    const first = layoutGraph(nodes, edges, spots);
    const again = layoutGraph(nodes, edges, spots);
    expect([...again.values()]).toEqual([...first.values()]);
    for (const p of first.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(WORLD.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(WORLD.height);
    }
    // The graph's own Space keeps to the left, the other one to the right (board C13).
    const x = (id: string): number => first.get(id)?.x ?? 0;
    expect((x('a') + x('b') + x('c')) / 3).toBeLessThan((x('d') + x('e')) / 2);
  });

  it('centres a graph of one Space instead of leaving the right side empty', () => {
    // Seen on prod 05/11/2026: Networking alone sat in the left half of the stage.
    const one = ['a', 'b', 'c'].map((id) => ({ id, space: 'networking', degree: 1 }));
    const placed = [...layoutGraph(one, [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }], spaceSpots([{ slug: 'networking', personal: false }], 'networking')).values()];
    const xs = placed.map((p) => p.x);
    const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(Math.abs(middle - WORLD.width / 2)).toBeLessThan(5);
  });

  it("centres one public Space with the reader's own beside it", () => {
    const nodes = [...['a', 'b', 'c'].map((id) => ({ id, space: 'networking', degree: 1 })), { id: 'p', space: 'personal-x', degree: 1 }];
    const spots2 = spaceSpots(
      [
        { slug: 'networking', personal: false },
        { slug: 'personal-x', personal: true },
      ],
      'networking',
    );
    const placed = [...layoutGraph(nodes, [{ source: 'a', target: 'b' }, { source: 'b', target: 'p' }], spots2).values()];
    const xs = placed.map((p) => p.x);
    const ys = placed.map((p) => p.y);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - WORLD.width / 2)).toBeLessThan(5);
    expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - (WORLD.height + 0) / 2)).toBeLessThan(80);
  });

  it('sizes nodes by their links, up to a cap', () => {
    expect(nodeRadius(0)).toBe(12);
    expect(nodeRadius(6)).toBe(36);
    expect(nodeRadius(20)).toBe(40);
    expect(layoutGraph([], [], spots).size).toBe(0);
  });

  it('gives the reader’s own Space the spot under the graph’s own', () => {
    const own = spaceSpots(
      [
        { slug: 'networking', personal: false },
        { slug: 'personal-x', personal: true },
      ],
      'networking',
    );
    expect(own.get('personal-x')?.y).toBeGreaterThan(own.get('networking')?.y ?? 0);
  });
});
