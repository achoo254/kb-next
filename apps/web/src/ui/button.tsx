import type { MouseEventHandler, ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import './button.css';

/**
 * The button looks of the boards:
 * - `primary`: flat primary fill (DesignSystem), `ghost`: thin border, transparent;
 * - `rim`: the main button of KIT §10, dark violet with a glowing lavender rim (same as the active view pill);
 * - `glass`: the secondary frosted button; `outline`: the lavender outline on a dark well (X03);
 * - `subtle`: a bg2 fill (small inline actions, the DesignSystem disabled sample);
 * - `warn`: solid warning fill (destructive confirm of DesignSystem);
 * - `accent`: solid cyan fill with dark text, `danger-solid`: solid red fill with white text (X01 reconnect and
 *   confirm-delete);
 * - `glow`: a tone-coloured glowing fill (violet: the rim button of X01/X03), `ring`: a tone-coloured ring on a dark
 *   fill (X01);
 * - `danger`: the red outline of a destructive trigger (X01);
 * - `trigger`: a tone-ringed button on a well, usually with a tone `dot` (X01 toast triggers).
 */
export type ButtonVariant =
  | 'primary'
  | 'ghost'
  | 'rim'
  | 'glass'
  | 'outline'
  | 'subtle'
  | 'warn'
  | 'accent'
  | 'danger-solid'
  | 'glow'
  | 'ring'
  | 'danger'
  | 'trigger';
export type ButtonTone = 'violet' | 'accent' | 'warn' | 'success' | 'danger';
/**
 * Height: xs 30 · sm 36 · md 40 · lg 44 (touch target) · xl 46 · xxl 50. As on the boards, a link button (`href`) is
 * content-box: its rim adds to the height.
 */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  /** Colour of `glow` and `ring` buttons. */
  tone?: ButtonTone;
  size?: ButtonSize;
  /** A leading icon. */
  icon?: IconName;
  /** A leading tone dot (X01 toast triggers). */
  dot?: boolean;
  /** Renders a link instead of a button. */
  href?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  /** For icon-only buttons. */
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-pressed'?: boolean;
  /** Stretches to the width of its row. */
  block?: boolean;
  className?: string;
  dataId?: string;
}

const ICON_SIZE: Record<ButtonSize, number> = { xs: 14, sm: 14, md: 16, lg: 16, xl: 16, xxl: 18 };

/** A button of the kit (a link when `href` is set). */
export function Button({
  children,
  variant = 'primary',
  tone = 'violet',
  size = 'lg',
  icon,
  dot = false,
  href,
  type = 'button',
  disabled = false,
  onClick,
  block = false,
  className,
  dataId,
  ...aria
}: ButtonProps): ReactNode {
  const classes = ['kf-btn', block && 'kf-btn-block', className].filter(Boolean).join(' ');
  const content = (
    <>
      {dot && <span className="kf-btn-dot" aria-hidden="true" />}
      {icon && <Icon name={icon} size={ICON_SIZE[size]} />}
      {children}
    </>
  );
  const shared = { className: classes, 'data-variant': variant, 'data-tone': tone, 'data-size': size, 'data-id': dataId, ...aria };
  if (href !== undefined && !disabled) {
    return (
      <a href={href} onClick={onClick} {...shared}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} disabled={disabled} onClick={onClick} {...shared}>
      {content}
    </button>
  );
}
