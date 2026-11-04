import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import { STAGE_ART } from './art';
import './stage-cards.css';

export interface StageCard {
  id: string;
  href: string;
  title: string;
  /** Second line(s); `\n` breaks the line. */
  sub?: string;
  icon: IconName;
  /** The centre card: violet glass with a bright rim. */
  highlight?: boolean;
  /** A reading progress bar, 0–100. */
  progress?: number;
  /** A warning line in amber, e.g. "● Đã 45 ngày". */
  warning?: string;
  /** Icon in the warning colour (an item that needs attention). */
  iconTone?: 'warn';
}

interface StageCardsProps {
  cards: readonly StageCard[];
  /** `full`: the dock of C09 (964×307, with the neon stage glass and arc); `mini`: the DesignSystem tile. */
  size?: 'full' | 'mini';
  /** The chevron link under the dock (full size), e.g. to "Của tôi". */
  more?: { href: string; label: string };
  className?: string;
}

interface Tilt {
  rx: number;
  ry: number;
  rz: number;
  origin: string;
  marginTop: number;
}

/** The fan of tilted cards of C09 (5 cards) and of the DesignSystem tile (3 cards), copied from the boards. */
const FANS: Record<'full' | 'mini', Record<number, readonly Tilt[]>> = {
  full: {
    5: [
      { rx: -6, ry: 16, rz: -1.5, origin: 'right center', marginTop: 26 },
      { rx: -6, ry: 8, rz: -0.7, origin: 'right center', marginTop: 12 },
      { rx: -10, ry: 0, rz: 0, origin: 'center', marginTop: 0 },
      { rx: -6, ry: -8, rz: 0.7, origin: 'left center', marginTop: 12 },
      { rx: -6, ry: -16, rz: 1.5, origin: 'left center', marginTop: 26 },
    ],
  },
  mini: {
    3: [
      { rx: 10, ry: 24, rz: -3, origin: 'right center', marginTop: 14 },
      { rx: 8, ry: 0, rz: 0, origin: 'center bottom', marginTop: 0 },
      { rx: 10, ry: -24, rz: 3, origin: 'left center', marginTop: 14 },
    ],
  },
};

const FLAT: Tilt = { rx: 0, ry: 0, rz: 0, origin: 'center', marginTop: 0 };

function tiltStyle(tilt: Tilt): CSSProperties {
  return {
    transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) rotateZ(${tilt.rz}deg)`,
    transformOrigin: tilt.origin,
    marginTop: tilt.marginTop,
  };
}

/** The neon stage with glass cards tilted in 3D (`perspective()` in `transform`) of board C09. */
export function StageCards({ cards, size = 'full', more, className }: StageCardsProps): ReactNode {
  const mini = size === 'mini';
  const fan = FANS[size][cards.length];
  return (
    <div className={className ? `kf-stage ${className}` : 'kf-stage'} data-size={size}>
      {!mini && (
        <>
          <div className="kf-stage-glass" aria-hidden="true" />
          <svg className="kf-stage-arc" aria-hidden="true" width="888" height="236" viewBox="0 0 888 236">
            <path d="M0 112 Q444 -6 888 112" fill="none" strokeWidth="1.6" />
          </svg>
        </>
      )}
      <img className="kf-stage-platform" src={STAGE_ART} alt="" aria-hidden="true" />
      <div className="kf-stage-cards">
        {cards.map((card, index) => (
          <a
            key={card.id}
            href={card.href}
            className="kf-stage-card"
            data-highlight={card.highlight || undefined}
            data-icon-tone={card.iconTone}
            data-id={`stage-card-${card.id}`}
            style={tiltStyle(fan?.[index] ?? FLAT)}
          >
            <Icon name={card.icon} size={mini ? (card.highlight ? 22 : 20) : card.highlight ? 28 : 22} className="kf-stage-icon" />
            <span className="kf-stage-title">{card.title}</span>
            {card.sub && <span className="kf-stage-sub">{card.sub}</span>}
            {card.progress !== undefined && (
              <span className="kf-stage-progress">
                <span className="kf-stage-track">
                  <span className="kf-stage-bar" style={{ width: `${card.progress}%` }} />
                </span>
                <span>{card.progress}%</span>
              </span>
            )}
            {card.warning && <span className="kf-stage-warning">{card.warning}</span>}
          </a>
        ))}
      </div>
      {more && !mini && (
        <a href={more.href} aria-label={more.label} className="kf-stage-more" data-id="stage-more">
          <Icon name="chevron" size={26} />
        </a>
      )}
    </div>
  );
}
