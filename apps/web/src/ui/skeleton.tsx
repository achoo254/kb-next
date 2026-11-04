import type { CSSProperties, ReactNode } from 'react';
import './skeleton.css';

interface SkeletonProps {
  /** Width in px or any CSS length (e.g. `70%`); full width by default. */
  width?: number | string;
  height: number;
  /** Corner radius in px; `circle` makes it round. */
  radius?: number;
  circle?: boolean;
  /**
   * Shimmer colours: `surface` the theme's bg2 and border (DesignSystem), `glow` the violet glow of X01,
   * `soft` the border and surface of X03.
   */
  tone?: 'surface' | 'glow' | 'soft';
  className?: string;
}

/** A placeholder of the size of the content it stands for. Decorative: put `aria-busy` on the loading region. */
export function Skeleton({ width, height, radius, circle = false, tone = 'surface', className }: SkeletonProps): ReactNode {
  const style: CSSProperties = { width, height, borderRadius: circle ? '50%' : radius };
  return <span className={className ? `kf-skeleton ${className}` : 'kf-skeleton'} data-tone={tone} style={style} aria-hidden="true" />;
}
