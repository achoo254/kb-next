import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import './tabs.css';

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  /** Accessible name of the tab list. */
  label: string;
  items: readonly TabItem[];
  value: string;
  onChange(id: string): void;
  /** `pill`: rounded pills in a bg2 track (DesignSystem); `segment`: equal-width outlined segments (Interaction). */
  variant?: 'pill' | 'segment';
  /** id prefix of the tab panels each tab controls (`${panelIdPrefix}-${item.id}`), when the panels exist. */
  panelIdPrefix?: string;
  className?: string;
  dataId?: string;
}

/** A tab list (WAI-ARIA tabs): one tab stop, arrow keys, Home and End move the selection. */
export function Tabs({ label, items, value, onChange, variant = 'pill', panelIdPrefix, className, dataId }: TabsProps): ReactNode {
  const listRef = useRef<HTMLDivElement>(null);

  function move(event: KeyboardEvent<HTMLButtonElement>): void {
    const index = items.findIndex((item) => item.id === value);
    const last = items.length - 1;
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: last }[event.key];
    if (next === undefined || items.length === 0) return;
    event.preventDefault();
    const target = items[(next + items.length) % items.length];
    if (!target) return;
    onChange(target.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${target.id}"]`)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={className ? `kf-tabs ${className}` : 'kf-tabs'}
      data-variant={variant}
      data-id={dataId}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="kf-tab"
            data-tab={item.id}
            data-id={dataId ? `${dataId}-${item.id}` : undefined}
            aria-selected={selected}
            aria-controls={panelIdPrefix ? `${panelIdPrefix}-${item.id}` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={move}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
