import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import { CRYSTAL_ART, SPACE_ICON, type SpaceKind } from './art';
import './crystal.css';

interface CrystalProps {
  /** Which Space: picks the crystal art, its tint and default icon. */
  space: SpaceKind;
  name: string;
  /** What it holds, e.g. "8 lab"; shown under the name (full size) and always in the accessible name. */
  count?: string;
  icon?: IconName;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  /** `full`: the 140px crystal of C09; `mini`: the 76px sample of DesignSystem. */
  size?: 'full' | 'mini';
  /** Another crystal has the focus: this one fades. */
  dimmed?: boolean;
  /** This crystal has the focus: it glows white. */
  focused?: boolean;
  /** Seconds of delay of the float animation, so neighbours do not bob together. */
  floatDelay?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * A Space as a crystal (board C09): the AI-drawn crystal, a dark radial core behind the label so it stays readable,
 * the icon in the crystal's light tint with a glow of its deep tint.
 */
export function Crystal({
  space,
  name,
  count,
  icon,
  href,
  onClick,
  size = 'full',
  dimmed = false,
  focused = false,
  floatDelay = 0,
  className,
  style,
}: CrystalProps): ReactNode {
  const mini = size === 'mini';
  const label = count ? `${name} · ${count}` : name;
  const body = (
    <>
      <img className="kf-crystal-art" src={CRYSTAL_ART[space]} alt="" />
      <span className="kf-crystal-core" aria-hidden="true" />
      <span className="kf-crystal-label">
        <Icon name={icon ?? SPACE_ICON[space]} size={mini ? 16 : 28} className="kf-crystal-icon" />
        <span className="kf-crystal-name">{name}</span>
        {count && !mini && <span className="kf-crystal-count">{count}</span>}
      </span>
    </>
  );
  const shared = {
    className: 'kf-crystal',
    'aria-label': label,
    'data-space': space,
    'data-size': size,
    'data-dimmed': dimmed || undefined,
    'data-focused': focused || undefined,
    'data-id': `crystal-${space}`,
  };
  return (
    <div className={className ? `kf-crystal-float ${className}` : 'kf-crystal-float'} data-size={size} style={{ ...style, animationDelay: `${floatDelay}s` }}>
      {href !== undefined ? (
        <a href={href} onClick={onClick} {...shared}>
          {body}
        </a>
      ) : (
        <button type="button" onClick={onClick} {...shared}>
          {body}
        </button>
      )}
    </div>
  );
}
