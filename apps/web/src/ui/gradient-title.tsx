import type { ReactNode } from 'react';
import './gradient-title.css';

interface GradientTitleProps {
  children: ReactNode;
  as?: 'h1' | 'h2' | 'div' | 'span';
  /** Font size in px (the boards use 32–42). */
  size?: number;
  className?: string;
}

/** The hero title of KIT §9: Inter 700 with the sky-to-lavender gradient. */
export function GradientTitle({ children, as: Tag = 'h1', size = 40, className }: GradientTitleProps): ReactNode {
  return (
    <Tag className={className ? `kf-gradient-title ${className}` : 'kf-gradient-title'} style={{ fontSize: size }}>
      {children}
    </Tag>
  );
}
