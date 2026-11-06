import { type CSSProperties, type ReactNode, useState } from 'react';
import { PHONE_BOARD_WIDTH, PhoneShell, usePhoneScale } from '../layout/phone-shell';
import { CRYSTAL_ART, type SpaceKind } from '../ui/art';
import { Icon, type IconName } from '../ui/icon';
import { CREATE_OPTIONS, type OptionId } from './create-options';
import { useCreateText } from './create-messages';
import { type PhoneMessageKey, usePhoneText } from './phone-messages';
import './create-phone.css';

/**
 * The create bloom on a phone (board M02): five crystals on an arc above the tab bar, whose "+" turns into "×". A phone
 * has no Canvas (Z02), so its crystal stays but only says so; "Từ URL" waits like on the desktop ring.
 */

interface PhoneOption {
  id: Extract<OptionId, 'note' | 'office' | 'journey' | 'canvas' | 'url'>;
  label: PhoneMessageKey;
  icon: IconName;
  crystal: SpaceKind;
  /** Degrees on the board's arc (0° = right, clockwise). */
  angle: number;
}

const PHONE_OPTIONS: readonly PhoneOption[] = [
  { id: 'note', label: 'create.note', icon: 'create-note', crystal: 'networking', angle: 200 },
  { id: 'office', label: 'create.office', icon: 'upload', crystal: 'linux', angle: 235 },
  { id: 'journey', label: 'create.journey', icon: 'journey', crystal: 'observability', angle: 270 },
  { id: 'canvas', label: 'create.canvas', icon: 'graph-tree', crystal: 'observability', angle: 305 },
  { id: 'url', label: 'create.url', icon: 'link', crystal: 'linux', angle: 340 },
];

/** The top-left of an option's 64px crystal on the 390×844 board: an arc of radius 150 round 163,700, 1.25 times taller. */
export function bloomPlace(angle: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: 163 + Math.round(150 * Math.cos(rad)), y: 700 + Math.round(150 * Math.sin(rad) * 1.25) };
}

function hrefOf(id: OptionId): string | null {
  const option = CREATE_OPTIONS.find((entry) => entry.id === id);
  return option?.action.kind === 'link' ? option.action.href : null;
}

export function CreatePhone(): ReactNode {
  const { t } = usePhoneText();
  const create = useCreateText();
  const [note, setNote] = useState<string | null>(null);
  const scale = usePhoneScale();
  return (
    <PhoneShell screen="M02" tab="create" createOpen>
      <div className="create-phone" data-id="create-screen">
        <div className="create-phone-head">
          <h1 className="create-phone-title">{t('create.title')}</h1>
          <p className="create-phone-sub">{t('create.sub')}</p>
        </div>
        {PHONE_OPTIONS.map((option) => {
          const { x, y } = bloomPlace(option.angle);
          // the arc keeps its middle on the screen's middle and narrows with a phone under 390px
          const fromMiddle = (x + 32 - PHONE_BOARD_WIDTH / 2) * scale - 32;
          const style = { '--from-middle': `${fromMiddle.toFixed(1)}px`, '--from-bottom': `${844 - y}px` } as CSSProperties;
          const href = option.id === 'canvas' ? null : hrefOf(option.id);
          const body = (
            <>
              <span className="create-phone-crystal" data-space={option.crystal}>
                <img src={CRYSTAL_ART[option.crystal]} alt="" aria-hidden="true" />
                <span className="create-phone-shade" aria-hidden="true" />
                <Icon name={option.icon} size={22} />
              </span>
              {t(option.label)}
            </>
          );
          if (href) {
            return (
              <a key={option.id} href={href} className="create-phone-option" style={style} data-id={`create-${option.id}`}>
                {body}
              </a>
            );
          }
          const why = option.id === 'canvas' ? t('limit.canvas') : create.t('create.soon');
          return (
            <button
              key={option.id}
              type="button"
              className="create-phone-option"
              style={style}
              aria-disabled="true"
              aria-describedby={note === option.id ? 'create-phone-note' : undefined}
              onClick={() => setNote(option.id)}
              data-id={`create-${option.id}`}
              title={why}
            >
              {body}
            </button>
          );
        })}
        {note && (
          <p id="create-phone-note" className="create-phone-note" role="status">
            {note === 'canvas' ? t('limit.canvas') : create.t('create.soon')}
          </p>
        )}
      </div>
    </PhoneShell>
  );
}
