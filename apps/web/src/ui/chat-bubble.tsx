import type { ReactNode } from 'react';
import './chat-bubble.css';

interface ChatBubbleProps {
  /** `user`: the violet question bubble on the right; `ai`: the answer block. */
  from: 'user' | 'ai';
  /** `md`: the AI panel of C09; `sm`: the compact sample of DesignSystem. */
  size?: 'md' | 'sm';
  children: ReactNode;
  className?: string;
}

/** One message of the AI chat (KIT §7). */
export function ChatBubble({ from, size = 'md', children, className }: ChatBubbleProps): ReactNode {
  return (
    <div className={className ? `kf-bubble ${className}` : 'kf-bubble'} data-from={from} data-size={size}>
      {children}
    </div>
  );
}
