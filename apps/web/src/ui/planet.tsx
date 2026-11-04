import type { ReactNode } from 'react';
import './planet.css';

/**
 * Colour of a planet; `moon` is the pale Collection moon. `purple` and `cobalt` are the Collection and Document layer
 * orbs of the Interaction board.
 */
export type PlanetTone = 'violet' | 'cyan' | 'blue' | 'purple' | 'cobalt' | 'emerald' | 'amber' | 'moon';
/** `sphere`: the lit sphere of DesignSystem; `orb`: the flatter layer orb of Interaction (navy edge). */
export type PlanetShade = 'sphere' | 'orb';

interface PlanetProps {
  /** Diameter in px. */
  size: number;
  tone?: PlanetTone;
  /** Glow and shading strength: `bright` for a Space planet card, `soft` for small orbs. */
  glow?: 'bright' | 'soft' | 'none';
  shade?: PlanetShade;
  /** Text on the planet (a Space name). */
  children?: ReactNode;
  className?: string;
}

/** A shaded planet (DesignSystem cards and effects, Interaction layers): a lit radial sphere with a glow. */
export function Planet({ size, tone = 'violet', glow = 'soft', shade = 'sphere', children, className }: PlanetProps): ReactNode {
  return (
    <span
      className={className ? `kf-planet ${className}` : 'kf-planet'}
      data-tone={tone}
      data-glow={glow}
      data-shade={shade}
      style={{ width: size, height: size }}
      aria-hidden={children ? undefined : true}
    >
      {children}
    </span>
  );
}
