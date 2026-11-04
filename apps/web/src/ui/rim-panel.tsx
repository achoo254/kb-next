import type { ReactNode } from 'react';
import './rim-panel.css';

/**
 * The panel looks of the kit:
 * - `rim`: KIT §7, dark interior with a lavender rim glowing inward (AI panel, side panels, sheets);
 * - `soft`: the lighter rim of the X01/X03 cards;
 * - `well`: the inset well inside a rim card (samples, list rows);
 * - `vis`: the state thumbnail of an X03 card;
 * - `glass`: the theme surface of the DesignSystem board (frosted, thin border);
 * - `solid`: an opaque surface card (DesignSystem cards and dialogs).
 */
export type RimPanelVariant = 'rim' | 'soft' | 'well' | 'vis' | 'glass' | 'solid';

/** Corner radius: 28 panel, 26 section, 22 card, 20 small card, 16 well. */
export type RimPanelRadius = 'panel' | 'section' | 'card' | 'small' | 'well';

interface RimPanelProps {
  as?: 'section' | 'div' | 'aside' | 'article' | 'figure';
  variant?: RimPanelVariant;
  radius?: RimPanelRadius;
  /** Border tone of a well or solid card that reports a state (warn, success…). */
  tone?: 'warn' | 'success' | 'danger' | 'accent';
  /** Accessible name of a landmark section. */
  label?: string;
  className?: string;
  dataId?: string;
  children?: ReactNode;
}

/** A panel of the kit; layout (padding, gap, grid) comes from `className`, the look from `variant`. */
export function RimPanel({ as: Tag = 'section', variant = 'rim', radius = 'panel', tone, label, className, dataId, children }: RimPanelProps): ReactNode {
  const classes = ['kf-panel', className].filter(Boolean).join(' ');
  return (
    <Tag className={classes} data-variant={variant} data-radius={radius} data-tone={tone} aria-label={label} data-id={dataId}>
      {children}
    </Tag>
  );
}
