import type { CSSProperties, ReactNode } from 'react';
import './motion.css';
import './effects.css';

/** A drifting violet-and-cyan nebula filling its positioned parent (DesignSystem "Nebula", Interaction). */
export function Nebula({ className }: { className?: string }): ReactNode {
  return <span className={className ? `kf-nebula ${className}` : 'kf-nebula'} aria-hidden="true" />;
}

interface Particle {
  x: number;
  y: number;
  r: number;
  delay: number;
}

/** Twinkling particles spread over the parent by the boards' formula (x, y in %). */
export function particles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({ x: (i * 37) % 100, y: (i * 53 + 11) % 100, r: i % 3 === 0 ? 3 : 2, delay: (i % 6) * 0.4 }));
}

interface ParticleFieldProps {
  count?: number;
  className?: string;
}

/** Twinkling star particles over the positioned parent (DesignSystem "Particle", Interaction). */
export function ParticleField({ count = 14, className }: ParticleFieldProps): ReactNode {
  return (
    <span className={className ? `kf-particles ${className}` : 'kf-particles'} aria-hidden="true">
      {particles(count).map((p, index) => {
        const style: CSSProperties = { left: `${p.x}%`, top: `${p.y}%`, width: p.r, height: p.r, animationDelay: `${p.delay}s` };
        return <span key={index} style={style} />;
      })}
    </span>
  );
}
