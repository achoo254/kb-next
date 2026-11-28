/** The two switches of /memory: pause memory, and also remember sensitive topics (off by default). */
import type { ReactNode } from 'react';
import type { MemorySettings } from '../api/memory-api';
import type { MemoryMessageKey, MemoryTranslate } from './memory-messages';

const SWITCHES: ReadonlyArray<{ key: keyof MemorySettings; title: MemoryMessageKey; sub: MemoryMessageKey }> = [
  { key: 'paused', title: 'memory.paused', sub: 'memory.paused.sub' },
  { key: 'sensitive', title: 'memory.sensitive', sub: 'memory.sensitive.sub' },
];

interface MemorySwitchesProps {
  settings: MemorySettings;
  t: MemoryTranslate;
  onChange(change: Partial<MemorySettings>): void;
}

export function MemorySwitches({ settings, t, onChange }: MemorySwitchesProps): ReactNode {
  return (
    <section className="memory-switches" aria-label={t('memory.switches')} data-id="memory-switches">
      {SWITCHES.map(({ key, title, sub }) => {
        const titleId = `memory-switch-${key}-title`;
        const subId = `memory-switch-${key}-sub`;
        return (
          <div key={key} className="memory-switch-row">
            <div className="memory-switch-text">
              <span id={titleId} className="memory-switch-title">
                {t(title)}
              </span>
              <span id={subId} className="memory-muted">
                {t(sub)}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings[key]}
              aria-labelledby={titleId}
              aria-describedby={subId}
              className="memory-switch"
              onClick={() => onChange({ [key]: !settings[key] })}
              data-id={`memory-switch-${key}`}
            >
              <span className="memory-knob" />
            </button>
          </div>
        );
      })}
    </section>
  );
}
