import { type CSSProperties, type ReactNode, useId, useState } from 'react';
import type { SpaceKind } from './art';
import './orbit-field.css';

export interface OrbitPath {
  /** SVG path of the ellipse (also the path the dots run on). */
  d: string;
  /** Stroke width of the sharp line (1.6 main ring, 1.2 side ellipses). */
  width?: number;
  /** `h`: the horizontal violet gradient (default); `v`: the vertical one of C09's tilted ellipse. */
  gradient?: 'h' | 'v';
}

/** A spot where the orbits take a crystal's colour, fading out from its centre. */
export interface OrbitTint {
  cx: number;
  cy: number;
  space: SpaceKind;
  /** The Space's own orbit colour (its glow from the API), over the kind's token. */
  color?: string;
}

/** A glowing dot running along an orbit. */
export interface OrbitDot {
  /** Index in `orbits`. */
  orbit: number;
  size: number;
  tone: 'sky' | 'violet' | 'lavender' | 'cyan';
  /** Seconds per lap. */
  duration: number;
  /** Start offset in seconds (negative starts mid-lap). */
  delay: number;
  reverse?: boolean;
}

interface OrbitFieldProps {
  width: number;
  height: number;
  orbits: readonly OrbitPath[];
  /** x range of the horizontal gradient, y range of the vertical one (user space). */
  gradientX: readonly [number, number];
  gradientY?: readonly [number, number];
  tints?: readonly OrbitTint[];
  /** Radius of each tint spot (125 in C09, 52 on the DesignSystem tile). */
  tintRadius?: number;
  dots?: readonly OrbitDot[];
  /** Dotted guide ellipses behind the orbits (C09). */
  guides?: readonly string[];
  /** Faint lines from the centre to each crystal (C09). */
  spokes?: readonly string[];
  /** `scene`: C09 gradient; `tile`: the shorter gradient of the DesignSystem and Interaction tiles. */
  variant?: 'scene' | 'tile';
  className?: string;
}

const SCENE_STOPS: ReadonlyArray<readonly [number, string, number]> = [
  [0, '--violet-700', 0.15],
  [0.2, '--violet-600', 0.6],
  [0.45, '--violet-400', 0.95],
  [0.6, '--violet-300', 1],
  [0.85, '--indigo-400', 0.85],
  [1, '--indigo-500', 0.4],
];
const TILE_STOPS: ReadonlyArray<readonly [number, string, number]> = [
  [0, '--violet-700', 0.2],
  [0.3, '--violet-600', 0.7],
  [0.55, '--violet-400', 1],
  [0.7, '--violet-300', 1],
  [1, '--indigo-400', 0.6],
];
const VERTICAL_STOPS: ReadonlyArray<readonly [number, string, number]> = [
  [0, '--violet-500', 0.55],
  [0.5, '--violet-300', 0.95],
  [1, '--violet-400', 0.7],
];

function stops(list: ReadonlyArray<readonly [number, string, number]>): ReactNode {
  return list.map(([offset, token, opacity]) => <stop key={offset} offset={offset} style={{ stopColor: `var(${token})`, stopOpacity: opacity }} />);
}

/** Whether the browser can run dots along a path; without it the orbits stay still and the dots are left out. */
export function supportsOffsetPath(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('offset-path', 'path("M0 0")');
}

/**
 * The orbit field of C09: thin gradient ellipses with a soft bloom, the colour of a crystal where an orbit passes near
 * it, and glowing dots running along the orbits (CSS offset-path). Decorative: hidden from assistive technology.
 */
export function OrbitField({
  width,
  height,
  orbits,
  gradientX,
  gradientY = [0, height],
  tints = [],
  tintRadius = 125,
  dots = [],
  guides = [],
  spokes = [],
  variant = 'scene',
  className,
}: OrbitFieldProps): ReactNode {
  const id = useId();
  const [canRunDots] = useState(supportsOffsetPath);
  const ids = { h: `${id}-h`, v: `${id}-v`, bloom: `${id}-bloom`, fade: `${id}-fade` };
  const tintGroup = (tint: OrbitTint, index: number): ReactNode => (
    <g key={index} mask={`url(#${id}-tint-${index})`} fill="none" className="kf-orbit-tint" data-space={tint.space} style={tint.color ? { stroke: tint.color } : undefined}>
      <g strokeWidth={6} opacity={0.7} filter={`url(#${ids.bloom})`}>
        {orbits.map((orbit) => (
          <path key={orbit.d} d={orbit.d} />
        ))}
      </g>
      <g strokeWidth={1.6}>
        {orbits.map((orbit) => (
          <path key={orbit.d} d={orbit.d} />
        ))}
      </g>
    </g>
  );

  return (
    <div className={className ? `kf-orbit ${className}` : 'kf-orbit'} style={{ width, height }} aria-hidden="true">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="kf-orbit-svg">
        <defs>
          <linearGradient id={ids.h} gradientUnits="userSpaceOnUse" x1={gradientX[0]} y1="0" x2={gradientX[1]} y2="0">
            {stops(variant === 'tile' ? TILE_STOPS : SCENE_STOPS)}
          </linearGradient>
          <linearGradient id={ids.v} gradientUnits="userSpaceOnUse" x1="0" y1={gradientY[0]} x2="0" y2={gradientY[1]}>
            {stops(VERTICAL_STOPS)}
          </linearGradient>
          <filter id={ids.bloom} x="-10%" y="-20%" width="120%" height="140%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
          <radialGradient id={ids.fade}>
            <stop offset="0" style={{ stopColor: 'var(--white)' }} />
            <stop offset=".45" style={{ stopColor: 'var(--white)', stopOpacity: 0.85 }} />
            <stop offset="1" style={{ stopColor: 'var(--white)', stopOpacity: 0 }} />
          </radialGradient>
          {tints.map((tint, index) => (
            <mask key={index} id={`${id}-tint-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
              <circle cx={tint.cx} cy={tint.cy} r={tintRadius} fill={`url(#${ids.fade})`} />
            </mask>
          ))}
        </defs>
        {spokes.length > 0 && (
          <g className="kf-orbit-spokes" strokeWidth={1} fill="none">
            {spokes.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        )}
        {guides.length > 0 && (
          <g className="kf-orbit-guides" fill="none" strokeWidth={1} strokeDasharray="1.5 7" strokeLinecap="round" opacity={0.4}>
            {guides.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        )}
        <g className="kf-orbit-bloom" fill="none" strokeWidth={5} opacity={0.5} filter={`url(#${ids.bloom})`}>
          {orbits.map((orbit) => (
            <path key={orbit.d} d={orbit.d} />
          ))}
        </g>
        <g fill="none">
          {orbits.map((orbit) => (
            <path key={orbit.d} d={orbit.d} stroke={`url(#${orbit.gradient === 'v' ? ids.v : ids.h})`} strokeWidth={orbit.width ?? 1.6} />
          ))}
        </g>
        {tints.map(tintGroup)}
      </svg>
      {canRunDots &&
        dots.map((dot, index) => {
          const path = orbits[dot.orbit]?.d;
          if (!path) return null;
          const style: CSSProperties = {
            width: dot.size,
            height: dot.size,
            offsetPath: `path('${path}')`,
            animationDuration: `${dot.duration}s`,
            animationDelay: `${dot.delay}s`,
            animationDirection: dot.reverse ? 'reverse' : undefined,
          };
          return <span key={index} className="kf-orbit-dot" data-tone={dot.tone} style={style} />;
        })}
    </div>
  );
}
