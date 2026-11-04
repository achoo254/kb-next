import type { ReactNode } from 'react';
import './state-switch.css';

export interface StateOption {
  id: string;
  label: string;
}

interface StateSwitchProps {
  /** What the switch picks, e.g. "Trạng thái" (the group's accessible name). */
  label: string;
  options: readonly StateOption[];
  value: string;
  onChange(id: string): void;
  className?: string;
  dataId?: string;
}

/**
 * The state switch of the mock boards (loading, empty, error, offline…): a group of toggle buttons that shows one
 * real state of a screen at a time. Screens use it on kit pages and in dev tools; each option is a real state.
 */
export function StateSwitch({ label, options, value, onChange, className, dataId }: StateSwitchProps): ReactNode {
  return (
    <div role="group" aria-label={label} className={className ? `kf-state-switch ${className}` : 'kf-state-switch'} data-id={dataId}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="kf-state-option"
          aria-pressed={option.id === value}
          data-id={dataId ? `${dataId}-${option.id}` : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
