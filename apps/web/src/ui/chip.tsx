import type { ReactNode } from 'react';
import './chip.css';

/**
 * Small labels of the boards:
 * - `tag`: a topic tag (DesignSystem `dhcp`); `code`: a short code in Space Grotesk (`VI · EN`, keys);
 * - `note`: a bordered note on the surface (DesignSystem principles);
 * - `board`: a glowing link to a board or screen (X03 `S03`, `C09`);
 * - `scope`: a dark chip on a violet bar (Interaction Copilot scopes);
 * - `key`: a keyboard key on a violet fill (Interaction shortcuts).
 */
export type ChipVariant = 'tag' | 'code' | 'note' | 'board' | 'scope' | 'key';

interface ChipProps {
  children: ReactNode;
  variant?: ChipVariant;
  /** Renders a link. */
  href?: string;
  className?: string;
  dataId?: string;
}

export function Chip({ children, variant = 'tag', href, className, dataId }: ChipProps): ReactNode {
  const classes = className ? `kf-chip ${className}` : 'kf-chip';
  if (href !== undefined) {
    return (
      <a className={classes} data-variant={variant} href={href} data-id={dataId}>
        {children}
      </a>
    );
  }
  return (
    <span className={classes} data-variant={variant} data-id={dataId}>
      {children}
    </span>
  );
}
