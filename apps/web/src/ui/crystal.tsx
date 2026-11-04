import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import { CRYSTAL_ART, SPACE_ICON, type SpaceKind, crystalSrcSet } from './art';
import './crystal.css';

interface CrystalProps {
  /** Which Space: picks the default icon, and the art and tint when the Space's own are not given. */
  space: SpaceKind;
  /** The Space's own crystal image (the API's `art`), over the kind's. */
  art?: string;
  /** The Space's light tint (icon) and deep tint (glow) from its data, over the kind's tokens. */
  tint?: string;
  glow?: string;
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
  art,
  tint,
  glow,
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
  const src = art ?? CRYSTAL_ART[space];
  const body = (
    <>
      {/* 168px full, 96px mini (crystal.css) */}
      <img className="kf-crystal-art" src={src} srcSet={crystalSrcSet(src)} sizes={mini ? '96px' : '168px'} alt="" />
      <span className="kf-crystal-core" aria-hidden="true" />
      <span className="kf-crystal-label">
        <Icon name={icon ?? SPACE_ICON[space]} size={mini ? 16 : 28} className="kf-crystal-icon" />
        <span className="kf-crystal-name">{name}</span>
        {count && !mini && <span className="kf-crystal-count">{count}</span>}
      </span>
    </>
  );
  // Custom properties of the Space's own colours (CSSProperties has no index for `--*` names).
  const colours = { ...(tint ? { '--tint': tint } : {}), ...(glow ? { '--glow': glow } : {}) } as CSSProperties;
  const shared = {
    className: 'kf-crystal',
    style: tint || glow ? colours : undefined,
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
