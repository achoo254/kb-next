import type { ReactNode } from 'react';
import { Icon } from './icon';
import './ai-avatar.css';

/** The AI assistant's avatar of the AI panel (KIT §7): a sparkle in a glowing violet orb. 50px or 36px. */
export function AiAvatar({ size = 'md' }: { size?: 'md' | 'sm' }): ReactNode {
  return (
    <span className="kf-ai-avatar" data-size={size} aria-hidden="true">
      <Icon name={size === 'sm' ? 'sparkle' : 'sparkles'} size={size === 'sm' ? 18 : 24} />
    </span>
  );
}
