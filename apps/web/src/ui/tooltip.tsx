import { type ReactNode, useId } from 'react';
import './tooltip.css';

interface TooltipProps {
  /** The tooltip text (also the trigger's description). */
  text: string;
  /** Renders the trigger; spread the given id into its `aria-describedby`. */
  children(describedBy: string): ReactNode;
  className?: string;
}

/** A tooltip over its trigger, shown on hover and keyboard focus (X01). */
export function Tooltip({ text, children, className }: TooltipProps): ReactNode {
  const id = useId();
  return (
    <span className={className ? `kf-tooltip-wrap ${className}` : 'kf-tooltip-wrap'}>
      {children(id)}
      <span id={id} role="tooltip" className="kf-tooltip">
        {text}
      </span>
    </span>
  );
}
