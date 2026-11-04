/**
 * The orbits of the Universe as numbers for the 3D scene, read from the SVG paths of the 2D scene
 * (layout/universe-scene.tsx) so both draw the same ellipses: `M x0 y0 A rx ry rotation 1 1 x1 y1 …`, where the two
 * points are opposite ends of the ellipse. Timing helpers follow the CSS animations of the 2D scene, so the 3D scene
 * takes over where the 2D one is.
 */
export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Rotation in radians (SVG degrees, clockwise on screen). */
  rotation: number;
}

const ARC = /^M\s*(-?[\d.]+)\s+(-?[\d.]+)\s+A\s*([\d.]+)\s+([\d.]+)\s+(-?[\d.]+)\s+[01]\s+[01]\s+(-?[\d.]+)\s+(-?[\d.]+)/;

export function parseEllipse(d: string): Ellipse {
  const match = ARC.exec(d.trim());
  if (!match) throw new Error(`not an ellipse path: ${d}`);
  const [x0, y0, rx, ry, degrees, x1, y1] = match.slice(1).map(Number) as [number, number, number, number, number, number, number];
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx, ry, rotation: (degrees * Math.PI) / 180 };
}

/**
 * The point at `angle` (radians from the path's start point, growing in the SVG sweep direction: clockwise on screen),
 * in board pixels (y down).
 */
export function pointOn(ellipse: Ellipse, angle: number): { x: number; y: number } {
  const ex = ellipse.rx * Math.cos(angle);
  const ey = ellipse.ry * Math.sin(angle);
  const cos = Math.cos(ellipse.rotation);
  const sin = Math.sin(ellipse.rotation);
  return { x: ellipse.cx + ex * cos - ey * sin, y: ellipse.cy + ex * sin + ey * cos };
}

/** Cumulative length of an ellipse at evenly spaced angles, to move along it at even speed like CSS `offset-path`. */
export interface ArcTable {
  ellipse: Ellipse;
  /** lengths[i]: length from the start to angle 2π·i/steps; the last entry is the whole lap. */
  lengths: Float64Array;
}

export function arcTable(ellipse: Ellipse, steps = 720): ArcTable {
  const lengths = new Float64Array(steps + 1);
  let previous = pointOn(ellipse, 0);
  for (let i = 1; i <= steps; i += 1) {
    const point = pointOn(ellipse, (i / steps) * 2 * Math.PI);
    lengths[i] = (lengths[i - 1] ?? 0) + Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  return { ellipse, lengths };
}

/** The point `progress` (0–1) of the way along the lap, measured by length. */
export function pointAtProgress(table: ArcTable, progress: number): { x: number; y: number } {
  const { lengths } = table;
  const steps = lengths.length - 1;
  const wanted = (((progress % 1) + 1) % 1) * (lengths[steps] ?? 0);
  let lo = 0;
  let hi = steps;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((lengths[mid] ?? 0) < wanted) lo = mid;
    else hi = mid;
  }
  const start = lengths[lo] ?? 0;
  const span = (lengths[hi] ?? start) - start;
  const k = span > 0 ? (wanted - start) / span : 0;
  return pointOn(table.ellipse, ((lo + k) / steps) * 2 * Math.PI);
}

/** How far round its lap a dot is after `seconds` (CSS animation timing: `delay` may be negative), 0–1. */
export function lapProgress(seconds: number, duration: number, delay: number, reverse = false): number {
  const progress = ((((seconds - delay) / duration) % 1) + 1) % 1;
  return reverse ? 1 - progress : progress;
}

/** The offset in px of the 2D float (`kf-float`: 0 → -10px → 0 over 6 s, ease-in-out) after `ms` of its own time. */
export function floatOffset(ms: number): number {
  if (ms < 0) return 0;
  const p = (ms % 6000) / 6000;
  const half = p < 0.5 ? p * 2 : (1 - p) * 2;
  // ease-in-out (cubic-bezier .42,0,.58,1) is close to smoothstep
  const eased = half * half * (3 - 2 * half);
  return -10 * eased;
}

/**
 * Depth of a point of the orbits: the orbits lie in planes tilted towards the viewer, so the part below the orb's
 * centre is nearer (in front of the orb) and the part above it is behind.
 */
export function depthAt(y: number, centreY: number): number {
  return (y - centreY) * 0.6;
}

/** The fade of a crystal's colour on the orbits (the radial mask of board C09): 1 at its centre, 0 at `radius`. */
export function tintWeight(distance: number, radius: number): number {
  const t = distance / radius;
  if (t >= 1) return 0;
  if (t <= 0.45) return 1 - (0.15 * t) / 0.45;
  return 0.85 * (1 - (t - 0.45) / 0.55);
}
