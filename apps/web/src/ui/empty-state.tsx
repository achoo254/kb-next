import type { MouseEventHandler, ReactNode } from 'react';
import { type StateArt, stateArtSrc } from './art';
import { Button, type ButtonTone } from './button';
import './empty-state.css';

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
}

interface EmptyStateProps {
  /** The AI-drawn art of the state (phase 2 table), never a CSS drawing. */
  art: StateArt;
  title: string;
  /** One sentence: why it is empty and what to do. */
  description?: string;
  /** The one action of the state (a glowing ring button in the tone). */
  action?: EmptyStateAction;
  /** Colour of the ring, the glow and the action. */
  tone?: ButtonTone;
  /** `card`: the 96px art of X01 with a dashed ring; `compact`: the 72px art of an X03 thumbnail. */
  size?: 'card' | 'compact';
  /** More actions or content under the text (compact states with two buttons). */
  children?: ReactNode;
  className?: string;
  dataId?: string;
}

/** An empty, error or no-access state: the art, one title, one sentence and one way forward. */
export function EmptyState({ art, title, description, action, tone = 'violet', size = 'card', children, className, dataId }: EmptyStateProps): ReactNode {
  return (
    <div className={className ? `kf-empty ${className}` : 'kf-empty'} data-tone={tone} data-size={size} data-id={dataId}>
      <div className="kf-empty-art" aria-hidden="true">
        {size === 'card' && <span className="kf-empty-ring" />}
        <img src={stateArtSrc(art)} alt="" />
      </div>
      {size === 'card' ? <span className="kf-empty-title">{title}</span> : <span className="kf-empty-text">{title}</span>}
      {description && <span className="kf-empty-text">{description}</span>}
      {action && (
        <Button variant="ring" tone={tone} size="lg" href={action.href} onClick={action.onClick} className="kf-empty-action" dataId={dataId ? `${dataId}-action` : undefined}>
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
