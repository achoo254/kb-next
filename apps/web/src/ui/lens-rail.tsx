import { type CSSProperties, type ReactNode, useId } from 'react';
import { Icon, type IconName } from './icon';
import './lens-rail.css';

export interface LensRailItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  /** `create` is the square "+" button (C01). */
  kind?: 'link' | 'create';
  /** Extra space under the item in px, to group the rail like C09 (6 under Universe, 22 under Graph, 8 under +). */
  spaceAfter?: number;
}

interface LensRailAccount {
  /** Accessible name, e.g. "Tài khoản của Đạt". */
  label: string;
  /** The letter in the avatar. */
  initial: string;
  href: string;
}

interface LensRailProps {
  /** Accessible name of the nav. */
  label: string;
  items: readonly LensRailItem[];
  /** The section on screen: its icon sits in the filled violet circle. */
  activeId?: string;
  /** The avatar, outside the lens below it (full size only). */
  account?: LensRailAccount;
  /** `full`: the 96×760 rail of the screens; `mini`: the 100×260 sample of the DesignSystem board. */
  size?: 'full' | 'mini';
  className?: string;
}

/** The left edge of the lens (KIT §6), in the 96×760 box. */
const LENS_EDGE = 'M4 0 C54 110 80 250 80 395 C80 540 56 650 0 735';
const LENS_SHAPE = `M0 0 L4 0 C54 110 80 250 80 395 C80 540 56 650 0 735 Z`;

/** The rim gradient stops of KIT §6: [offset, palette token, opacity]. */
const RIM_STOPS: ReadonlyArray<readonly [number, string, number]> = [
  [0, '--violet-400', 0],
  [0.18, '--violet-500', 0.55],
  [0.42, '--purple-200', 0.95],
  [0.55, '--white', 1],
  [0.72, '--violet-300', 0.8],
  [0.9, '--violet-600', 0.45],
  [1, '--violet-600', 0],
];
const SHEEN_STOPS: ReadonlyArray<readonly [number, string, number]> = [
  [0, '--violet-300', 0],
  [0.35, '--violet-300', 0.22],
  [0.55, '--violet-50', 0.38],
  [0.8, '--violet-400', 0.18],
  [1, '--violet-400', 0],
];

function stops(list: ReadonlyArray<readonly [number, string, number]>): ReactNode {
  return list.map(([offset, token, opacity]) => (
    <stop key={offset} offset={offset} style={{ stopColor: `var(${token})`, stopOpacity: opacity }} />
  ));
}

/**
 * The lens rail of KIT §6: a glass half-lens on the left edge with a glowing gradient rim, the section icons centred
 * in it and the avatar outside below the lens.
 */
export function LensRail({ label, items, activeId, account, size = 'full', className }: LensRailProps): ReactNode {
  const id = useId();
  const rimId = `${id}-rim`;
  const sheenId = `${id}-sheen`;
  const blurId = `${id}-blur`;
  const mini = size === 'mini';
  return (
    <div className={className ? `kf-rail ${className}` : 'kf-rail'} data-size={size}>
      {!mini && <div className="kf-rail-glass" aria-hidden="true" />}
      <svg
        className="kf-rail-rim"
        aria-hidden="true"
        width={mini ? 100 : 96}
        height={mini ? 260 : 760}
        viewBox="0 0 96 760"
        preserveAspectRatio={mini ? 'none' : undefined}
      >
        <defs>
          <linearGradient id={rimId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="735">
            {stops(RIM_STOPS)}
          </linearGradient>
          <linearGradient id={sheenId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="735">
            {stops(SHEEN_STOPS)}
          </linearGradient>
          <filter id={blurId} x="-50%" y="-10%" width="200%" height="120%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        {mini ? (
          <path className="kf-rail-fill" d={LENS_SHAPE} />
        ) : (
          <path d={LENS_EDGE} fill="none" stroke={`url(#${sheenId})`} strokeWidth="16" filter={`url(#${blurId})`} transform="translate(-6 0)" />
        )}
        <path d={LENS_EDGE} fill="none" stroke={`url(#${rimId})`} strokeWidth="5" filter={`url(#${blurId})`} opacity=".9" />
        <path d={LENS_EDGE} fill="none" stroke={`url(#${rimId})`} strokeWidth="1.6" />
      </svg>
      <nav aria-label={label} className="kf-rail-items">
        {items.map((item) => {
          const style: CSSProperties | undefined = item.spaceAfter && !mini ? { marginBottom: item.spaceAfter } : undefined;
          return (
            <a
              key={item.id}
              href={item.href}
              aria-label={item.label}
              aria-current={item.id === activeId ? 'page' : undefined}
              className="kf-rail-item"
              data-kind={item.kind ?? 'link'}
              data-id={`rail-${item.id}`}
              style={style}
            >
              <Icon name={item.icon} size={mini ? 18 : 21} />
            </a>
          );
        })}
      </nav>
      {account && !mini && (
        <a href={account.href} aria-label={account.label} className="kf-rail-avatar" data-id="rail-account">
          {account.initial}
        </a>
      )}
    </div>
  );
}
