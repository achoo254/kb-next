/**
 * The drawing of the Graph (board C13): edges in SVG (gradient "dẫn tới", dashed "cần trước", faint "liên quan"),
 * nodes as orb buttons sized by their links and tinted by their Space (solid rim: official, dashed: community or
 * yours), zoom and pan (buttons, wheel, dragging the background, +/− keys), the minimap, and keyboard moves between
 * nodes with the arrow keys (one node in the tab order at a time).
 */
import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import type { GraphEdge, GraphNode } from '../api/graph-api';
import { toBoardPx } from '../layout/board-zoom';
import { WORLD, type PlacedNode } from './graph-layout';
import { type Direction, nodeInDirection } from './graph-model';
import type { GraphMessageKey } from './graph-messages';
import type { ScreenTranslate } from './space-messages';

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.2;
const PAN_STEP = 80;
/** The minimap draws the world at this scale (board C13: 1040×620 → about 180×108). */
const MINI_SCALE = 0.17;

export interface View {
  zoom: number;
  x: number;
  y: number;
}

export const FIT_VIEW: View = { zoom: 1, x: 0, y: 0 };

export function zoomed(view: View, step: number): View {
  return { ...view, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((view.zoom + step) * 10) / 10)) };
}

export interface SpaceColours {
  tint: string;
  glow: string;
  name: string;
}

interface GraphViewProps {
  t: ScreenTranslate<GraphMessageKey>;
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  positions: ReadonlyMap<string, PlacedNode>;
  visible: ReadonlySet<string>;
  selected: string | null;
  colours: ReadonlyMap<string, SpaceColours>;
  view: View;
  onView(view: View): void;
  onSelect(id: string | null): void;
  /** The filters, legend and states drawn over the stage. */
  children?: ReactNode;
}

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

function edgeText(t: ScreenTranslate<GraphMessageKey>, edge: GraphEdge): string {
  return edge.label ?? t(`graph.rel.${edge.type}`);
}

export function GraphView({ t, nodes, edges, positions, visible, selected, colours, view, onView, onSelect, children }: GraphViewProps): ReactNode {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<{ x: number; y: number; view: View; pointer: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const shown = nodes.filter((n) => visible.has(n.id));
  const shownEdges = edges.filter((e) => visible.has(e.source) && visible.has(e.target));
  const near = new Set<string>();
  if (selected) {
    near.add(selected);
    for (const e of shownEdges) {
      if (e.source === selected) near.add(e.target);
      if (e.target === selected) near.add(e.source);
    }
  }
  // The node in the tab order: the one last focused, else the picked one, else the first shown.
  const tabStop = (focusId && visible.has(focusId) ? focusId : null) ?? (selected && visible.has(selected) ? selected : null) ?? shown[0]?.id ?? null;

  // Wheel zoom over the stage (not passive: the page must not scroll meanwhile).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      onView(zoomed(view, event.deltaY < 0 ? 0.1 : -0.1));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [view, onView]);

  function onNodeKey(event: KeyboardEvent<HTMLButtonElement>, id: string): void {
    const direction = ARROWS[event.key];
    if (direction) {
      event.preventDefault();
      const next = nodeInDirection(id, direction, positions, shown.map((n) => n.id));
      if (next) {
        setFocusId(next);
        nodeRefs.current.get(next)?.focus();
      }
      return;
    }
    if (event.key === 'Escape') onSelect(null);
    else if (zoomKey(event.key)) event.preventDefault();
  }

  /** +/−/0 on a node zoom (in, out, back to fit); true when the key was one of them. */
  function zoomKey(key: string): boolean {
    if (key === '+' || key === '=') onView(zoomed(view, ZOOM_STEP));
    else if (key === '-' || key === '_') onView(zoomed(view, -ZOOM_STEP));
    else if (key === '0') onView(FIT_VIEW);
    else return false;
    return true;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    const target = event.target instanceof Element ? event.target : null;
    if (event.button !== 0 || target?.closest('.graph-node, .graph-edge-hit')) return;
    drag.current = { x: event.clientX, y: event.clientY, view, pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    onView({ ...start.view, x: start.view.x + toBoardPx(event.clientX - start.x), y: start.view.y + toBoardPx(event.clientY - start.y) });
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const start = drag.current;
    drag.current = null;
    // A click on the empty background (no drag) clears the selection.
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) onSelect(null);
  }

  // The part of the world in view, for the minimap (board C13's formula, transform origin at the world's centre).
  const cx = WORLD.width / 2;
  const cy = WORLD.height / 2;
  const vx = cx + (0 - view.x - cx) / view.zoom;
  const vy = cy + (0 - view.y - cy) / view.zoom;
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const x0 = clamp(vx, 0, WORLD.width);
  const y0 = clamp(vy, 0, WORLD.height);
  const x1 = clamp(vx + WORLD.width / view.zoom, 0, WORLD.width);
  const y1 = clamp(vy + WORLD.height / view.zoom, 0, WORLD.height);
  const hoveredEdge = shownEdges.find((e) => e.id === hovered);

  return (
    // Dragging the background pans; on the keyboard, the nodes take arrows and +/−/0, the buttons do the rest.
    <div className="graph-stage" ref={stageRef} data-id="graph-stage">
      <div
        className="graph-world-clip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="graph-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }} data-id="graph-world">
          <svg className="graph-edges" width={WORLD.width} height={WORLD.height} viewBox={`0 0 ${WORLD.width} ${WORLD.height}`} aria-hidden="true">
            <defs>
              {shownEdges.map((edge) => {
                const a = positions.get(edge.source);
                const b = positions.get(edge.target);
                if (!a || !b) return null;
                const from = colours.get(nodes.find((n) => n.id === edge.source)?.spaceSlug ?? '');
                const to = colours.get(nodes.find((n) => n.id === edge.target)?.spaceSlug ?? '');
                return (
                  <linearGradient key={edge.id} id={`graph-edge-${edge.id}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                    {edge.type === 'leads-to' ? (
                      <>
                        <stop offset="0" stopColor={from?.tint} />
                        <stop offset="1" stopColor={to?.tint} />
                      </>
                    ) : (
                      <>
                        <stop offset="0" className="graph-related-stop graph-related-stop-end" />
                        <stop offset="0.5" className="graph-related-stop" />
                        <stop offset="1" className="graph-related-stop graph-related-stop-end" />
                      </>
                    )}
                  </linearGradient>
                );
              })}
            </defs>
            {shownEdges.map((edge) => {
              const a = positions.get(edge.source);
              const b = positions.get(edge.target);
              if (!a || !b) return null;
              const touches = selected !== null && (edge.source === selected || edge.target === selected);
              const glow = colours.get(nodes.find((n) => n.id === edge.target)?.spaceSlug ?? '')?.glow;
              const style = { '--edge-glow': glow } as CSSProperties;
              return (
                <g key={edge.id} className="graph-edge" data-type={edge.type} data-dim={selected !== null && !touches} data-on={touches} style={style}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="graph-edge-line" stroke={edge.type === 'prerequisite' ? undefined : `url(#graph-edge-${edge.id})`} />
                  {edge.type === 'leads-to' && <circle r={3.5} className="graph-edge-dot" style={{ offsetPath: `path('M${a.x} ${a.y} L${b.x} ${b.y}')`, animationDuration: `${Math.max(2.2, Math.hypot(b.x - a.x, b.y - a.y) / 70).toFixed(1)}s` }} />}
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="graph-edge-hit" onPointerEnter={() => setHovered(edge.id)} onPointerLeave={() => setHovered(null)} />
                </g>
              );
            })}
          </svg>

          {hoveredEdge && <EdgeLabel edge={hoveredEdge} positions={positions} text={edgeText(t, hoveredEdge)} />}

          <div role="group" aria-label={t('graph.nodes')} className="graph-nodes">
            {shown.map((node) => {
              const p = positions.get(node.id);
              if (!p) return null;
              const colour = colours.get(node.spaceSlug);
              const isSelected = node.id === selected;
              const style = {
                left: p.x - p.r,
                top: p.y - p.r,
                width: p.r * 2,
                '--node-tint': colour?.tint,
                '--node-glow': colour?.glow,
              } as CSSProperties;
              return (
                <div key={node.id} className="graph-node" data-selected={isSelected} data-dim={selected !== null && !near.has(node.id)} style={style}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) nodeRefs.current.set(node.id, el);
                      else nodeRefs.current.delete(node.id);
                    }}
                    className="graph-node-orb"
                    data-official={node.origin === 'official'}
                    style={{ width: p.r * 2, height: p.r * 2 }}
                    tabIndex={node.id === tabStop ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-label={t('graph.node', { title: node.title, space: colour?.name ?? '', degree: node.degree })}
                    onClick={() => onSelect(node.id)}
                    onFocus={() => setFocusId(node.id)}
                    onKeyDown={(event) => onNodeKey(event, node.id)}
                    data-id={`graph-node-${node.id}`}
                  />
                  <span className="graph-node-name" aria-hidden="true">
                    {node.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {children}

      <div role="group" aria-label={t('graph.zoom')} className="graph-zoom" data-id="graph-zoom">
        <button type="button" className="graph-zoom-key" aria-label={t('graph.zoomIn')} onClick={() => onView(zoomed(view, ZOOM_STEP))}>
          +
        </button>
        <button type="button" className="graph-zoom-arrow" aria-label={t('graph.panUp')} onClick={() => onView({ ...view, y: view.y + PAN_STEP })}>
          ↑
        </button>
        <button type="button" className="graph-zoom-key" aria-label={t('graph.zoomOut')} onClick={() => onView(zoomed(view, -ZOOM_STEP))}>
          −
        </button>
        <button type="button" className="graph-zoom-arrow" aria-label={t('graph.panLeft')} onClick={() => onView({ ...view, x: view.x + PAN_STEP })}>
          ←
        </button>
        <button type="button" className="graph-zoom-fit" aria-label={t('graph.fit')} onClick={() => onView(FIT_VIEW)}>
          {t('graph.fitShort')}
        </button>
        <button type="button" className="graph-zoom-arrow" aria-label={t('graph.panRight')} onClick={() => onView({ ...view, x: view.x - PAN_STEP })}>
          →
        </button>
        <span className="graph-zoom-level">
          <span data-id="graph-zoom-level">{t('graph.zoomLevel', { percent: Math.round(view.zoom * 100) })}</span>
          <button type="button" className="graph-zoom-arrow graph-zoom-down" aria-label={t('graph.panDown')} onClick={() => onView({ ...view, y: view.y - PAN_STEP })}>
            ↓
          </button>
        </span>
      </div>

      <div className="graph-minimap" role="img" aria-label={t('graph.minimap')} data-id="graph-minimap">
        {nodes.map((node) => {
          const p = positions.get(node.id);
          if (!p) return null;
          return (
            <span
              key={node.id}
              className="graph-minimap-dot"
              data-dim={!visible.has(node.id)}
              style={{ left: p.x * MINI_SCALE, top: p.y * MINI_SCALE, background: colours.get(node.spaceSlug)?.tint }}
            />
          );
        })}
        <span
          className="graph-minimap-view"
          style={{ left: x0 * MINI_SCALE, top: y0 * MINI_SCALE, width: Math.max(6, (x1 - x0) * MINI_SCALE), height: Math.max(6, (y1 - y0) * MINI_SCALE) }}
        />
      </div>
    </div>
  );
}

function EdgeLabel({ edge, positions, text }: { edge: GraphEdge; positions: ReadonlyMap<string, PlacedNode>; text: string }): ReactNode {
  const a = positions.get(edge.source);
  const b = positions.get(edge.target);
  if (!a || !b) return null;
  return (
    <span className="graph-edge-label" style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 }} data-id="graph-edge-label">
      {text}
    </span>
  );
}
