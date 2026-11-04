import type { ReactNode } from 'react';
import './planet.css';

/** Colour of a planet; `moon` is the pale Collection moon. */
export type PlanetTone = 'violet' | 'cyan' | 'blue' | 'emerald' | 'amber' | 'moon';

interface PlanetProps {
  /** Diameter in px. */
  size: number;
  tone?: PlanetTone;
  /** Glow and shading strength: `bright` for a Space planet card, `soft` for small orbs. */
  glow?: 'bright' | 'soft' | 'none';
  /** Text on the planet (a Space name). */
  children?: ReactNode;
  className?: string;
}

/** A shaded planet (DesignSystem cards and effects, Interaction layers): a lit radial sphere with a glow. */
export function Planet({ size, tone = 'violet', glow = 'soft', children, className }: PlanetProps): ReactNode {
  return (
    <span
      className={className ? `kf-planet ${className}` : 'kf-planet'}
      data-tone={tone}
      data-glow={glow}
      style={{ width: size, height: size }}
      aria-hidden={children ? undefined : true}
    >
      {children}
    </span>
  );
}
