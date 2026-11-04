import type { ReactNode } from 'react';
import { BrandLogo } from './brand-logo';
import { type BackdropVeil, UniverseBackdrop } from '../ui/universe-backdrop';
import './screen-page.css';

/** The kit veils, plus `gate`: the even dark veil of the sign-in and error boards (S02, X02). */
export type ScreenVeil = BackdropVeil | 'gate';

interface ScreenPageProps {
  /** The mock board the screen is built from; read by the parity check (data-screen). */
  code: string;
  veil?: ScreenVeil;
  stars?: boolean;
  /** The buttons at the top right (S01: language and sign-in; S02/X02: back home). */
  actions?: ReactNode;
  /** `centered`: one card in the middle (placeholder screens); `board`: content placed at the board's coordinates. */
  layout?: 'centered' | 'board';
  /**
   * A board screen that lays itself out for narrow windows (its own media queries): it keeps 1:1 px instead of the
   * board frame's zoom (layout/board-zoom.ts). Other board screens get the frame, so they fit any window.
   */
  responsive?: boolean;
  className?: string;
  children?: ReactNode;
}

/** A screen without the signed-in chrome (S01, S02, X02, placeholders): the backdrop, the logo top-left, the content. */
export function ScreenPage({ code, veil = 'scene', stars = true, actions, layout = 'centered', responsive = false, className, children }: ScreenPageProps): ReactNode {
  const framed = layout === 'board' && !responsive;
  const classes = ['screen-page', veil === 'gate' && 'screen-page-gate', framed && 'board-frame', className].filter(Boolean).join(' ');
  return (
    <UniverseBackdrop veil={veil === 'gate' ? 'scene' : veil} stars={stars} className={classes}>
      <BrandLogo />
      {actions && <div className="screen-page-actions">{actions}</div>}
      <main id="content" className={layout === 'centered' ? 'screen' : framed ? 'screen-board board-frame-main' : 'screen-board'} data-screen={code} data-id={`screen-${code}`}>
        {children}
      </main>
    </UniverseBackdrop>
  );
}
