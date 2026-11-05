/**
 * The create ring (board C01, `/create`, opened by the lens rail's "+"): nine things to create around the orb, in
 * four groups, and the panel on the right describing the one under the pointer or keyboard focus. A note opens the
 * editor (/new), a journey the journey builder with a new draft (/journey/new, C07), Canvas its list (/canvas), an
 * Office file the upload (/upload, C03), bulk import the Import Center (/import, C16); "Space cá nhân" and "Collection"
 * open their form in the panel. What a later phase brings (URL, templates) stays on the ring, marked "Sắp có", and
 * does nothing. Escape closes a form, then the ring (back to the page that opened it).
 */
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { AppShell } from '../layout/app-shell';
import { useDevice } from '../layout/device';
import { CreatePhone } from './create-phone';
import { CRYSTAL_ART, ORB_ART } from '../ui/art';
import { Icon } from '../ui/icon';
import { CREATE_OPTIONS, CREATE_PANES, type CreateOption, GROUP_CRYSTAL, type GroupId, type OptionId, type PaneId, ringPlace } from './create-options';
import { CollectionPane, SpacePane, usePlaces } from './create-panes';
import { type CreateMessageKey, useCreateText } from './create-messages';
import './create-menu.css';

/** Where closing the ring goes: back to the page of this app that opened it, else the Universe. */
export function leaveCreate(): void {
  const referrer = document.referrer ? new URL(document.referrer, window.location.href) : null;
  if (referrer && referrer.origin === window.location.origin && referrer.pathname !== window.location.pathname && window.history.length > 1) window.history.back();
  else window.location.assign('/u');
}

const GROUP_LABEL: Record<GroupId, CreateMessageKey> = {
  content: 'create.group.content',
  organise: 'create.group.organise',
  import: 'create.group.import',
  journey: 'create.group.journey',
};

const GROUPS: readonly GroupId[] = ['content', 'organise', 'import', 'journey'];

function nameKey(id: OptionId): CreateMessageKey {
  return `create.${id}.name`;
}

interface OptionProps {
  option: CreateOption;
  index: number;
  on: boolean;
  open: boolean;
  onHover(): void;
  onPick(pane: PaneId): void;
}

/** One crystal of the ring: a link, a button opening its form, or a "Sắp có" button that does nothing. */
function RingOption({ option, index, on, open, onHover, onPick }: OptionProps): ReactNode {
  const { t } = useCreateText();
  const place = ringPlace(index);
  const style: CSSProperties = { left: place.x - 62, top: place.y - 62, animationDelay: `${index * 0.04}s` };
  const label = t('create.optionLabel', { name: t(nameKey(option.id)), group: t(GROUP_LABEL[option.group]) });
  const face = (
    <>
      <img src={CRYSTAL_ART[GROUP_CRYSTAL[option.group]]} alt="" className="create-option-art" />
      <span className="create-option-core" aria-hidden="true" />
      <span className="create-option-ring" aria-hidden="true" />
      <span className="create-option-face">
        <Icon name={option.icon} size={24} className="create-option-icon" />
        <span className="create-option-name">{t(nameKey(option.id))}</span>
        <span className="create-option-group">{t(GROUP_LABEL[option.group])}</span>
      </span>
    </>
  );
  const common = {
    className: 'create-option',
    'data-on': on || undefined,
    'data-group': option.group,
    'data-id': `create-${option.id}`,
    onMouseEnter: onHover,
    onFocus: onHover,
  };
  return (
    <div className="create-option-slot" style={style}>
      <div className="create-option-float" style={{ animationDelay: `${(index % 5) * 0.6}s` }}>
        {option.action.kind === 'link' ? (
          <a {...common} href={option.action.href} aria-label={label}>
            {face}
          </a>
        ) : option.action.kind === 'pane' ? (
          <button {...common} type="button" aria-label={label} aria-expanded={open} onClick={() => option.action.kind === 'pane' && onPick(option.action.pane)}>
            {face}
          </button>
        ) : (
          <button {...common} type="button" aria-label={`${label} · ${t('create.soon')}`} aria-disabled="true" data-later="true">
            {face}
          </button>
        )}
      </div>
    </div>
  );
}

/** The description of the option under the pointer (the panel's default content). */
function OptionHint({ option }: { option: CreateOption }): ReactNode {
  const { t } = useCreateText();
  return (
    <div className="create-hint" key={option.id} data-group={option.group} data-id="create-hint">
      <span className="create-hint-crystal">
        <img src={CRYSTAL_ART[GROUP_CRYSTAL[option.group]]} alt="" />
        <span className="create-hint-core" aria-hidden="true" />
        <Icon name={option.icon} size={44} strokeWidth={2} className="create-hint-icon" />
      </span>
      <span className="create-hint-name">{t(nameKey(option.id))}</span>
      <span className="create-hint-sub">{t(`create.${option.id}.sub`)}</span>
      <span className="create-hint-text">{t(`create.${option.id}.text`)}</span>
      {option.action.kind === 'later' && (
        <span className="create-hint-soon" data-id="create-soon">
          {t('create.soonWhy', { when: t(`create.when.${option.action.when}`) })}
        </span>
      )}
      <span className="create-hint-foot">{t('create.hoverHint')}</span>
    </div>
  );
}

/** /create: the phone bloom (M02) on a phone, the ring (C01) elsewhere. */
export function CreateMenu(): ReactNode {
  return useDevice() === 'phone' ? <CreatePhone /> : <CreateRing />;
}

function CreateRing(): ReactNode {
  const { t } = useCreateText();
  const [hover, setHover] = useState<OptionId>('note');
  const [pane, setPane] = useState<PaneId>('hint');
  const places = usePlaces(pane !== 'hint');
  const hovered = CREATE_OPTIONS.find((option) => option.id === hover) ?? CREATE_OPTIONS[0];

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (pane !== 'hint') setPane('hint');
      else leaveCreate();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pane]);

  const close = (event: { preventDefault(): void }): void => {
    event.preventDefault();
    leaveCreate();
  };

  return (
    <AppShell screen="C01" rail="create" className="create-shell">
      <div className="create-screen" data-id="create-screen" data-pane={pane}>
        <svg className="create-orbits" aria-hidden="true" width="1440" height="900" viewBox="0 0 1440 900">
          <defs>
            <linearGradient id="create-ring" gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="860" y2="0">
              <stop offset="0" className="create-stop-1" />
              <stop offset=".45" className="create-stop-2" />
              <stop offset=".6" className="create-stop-3" />
              <stop offset="1" className="create-stop-4" />
            </linearGradient>
            <filter id="create-bloom" x="-10%" y="-20%" width="120%" height="140%">
              <feGaussianBlur stdDeviation="3.5" />
            </filter>
          </defs>
          <g className="create-ellipses">
            <g className="create-bloom" filter="url(#create-bloom)">
              <path d="M1000 470 A420 150 -18 1 1 160 470 A420 150 -18 1 1 1000 470" />
              <path d="M960 470 A380 120 24 1 1 200 470 A380 120 24 1 1 960 470" />
            </g>
            <g className="create-line">
              <path d="M1000 470 A420 150 -18 1 1 160 470 A420 150 -18 1 1 1000 470" />
              <path d="M960 470 A380 120 24 1 1 200 470 A380 120 24 1 1 960 470" />
            </g>
          </g>
          <circle className="create-circle-bloom" cx="580" cy="470" r="262" filter="url(#create-bloom)" />
          <circle className="create-circle" cx="580" cy="470" r="262" />
          <circle className="create-circle-dots" cx="580" cy="470" r="300" />
        </svg>
        {CREATE_OPTIONS.map((option, index) => {
          const on = option.id === hover || (option.action.kind === 'pane' && option.action.pane === pane);
          return <span key={option.id} className="create-spoke" data-group={option.group} data-on={on || undefined} style={{ transform: `rotate(${ringPlace(index).angle}deg)` }} aria-hidden="true" />;
        })}
        <span className="create-dot create-dot-1" aria-hidden="true" />
        <span className="create-dot create-dot-2" aria-hidden="true" />
        <span className="create-dot create-dot-3" aria-hidden="true" />

        <div className="create-hero">
          <span className="create-kicker">{t('create.kicker')}</span>
          <h1 className="create-title">{t('create.title')}</h1>
          <p className="create-lead">{t('create.lead')}</p>
        </div>

        <nav aria-label={t('create.options')} className="create-ring" data-id="create-ring">
          {CREATE_OPTIONS.map((option, index) => (
            <RingOption
              key={option.id}
              option={option}
              index={index}
              on={option.id === hover || (option.action.kind === 'pane' && option.action.pane === pane)}
              open={option.action.kind === 'pane' && option.action.pane === pane}
              onHover={() => setHover(option.id)}
              onPick={(next) => {
                setHover(option.id);
                setPane(next);
              }}
            />
          ))}
        </nav>

        <a href="/u" className="create-orb" aria-label={t('create.closeOrb')} onClick={close} data-id="create-orb">
          <img src={ORB_ART} alt="" className="create-orb-art" />
          <span className="create-orb-core" aria-hidden="true" />
          <span className="create-orb-face">
            <Icon name="close" size={34} strokeWidth={2.2} className="create-orb-x" />
            <span className="create-orb-label">{t('create.orb')}</span>
            <span className="create-orb-close">{t('create.close')}</span>
          </span>
        </a>

        <div role="list" aria-label={t('create.groups')} className="create-legend">
          {GROUPS.map((group) => (
            <span role="listitem" key={group} className="create-legend-item" data-group={group}>
              <span className="create-legend-dot" aria-hidden="true" />
              {t(GROUP_LABEL[group])}
            </span>
          ))}
        </div>

        <section aria-label={t('create.details')} className="create-panel" data-id="create-panel">
          <div className="create-panel-head">
            <span className="create-panel-title">{t(CREATE_PANES[pane])}</span>
            <a href="/u" className="create-panel-close" aria-label={t('create.closePanel')} onClick={close} data-id="create-close">
              <Icon name="close" size={18} strokeWidth={2.4} />
            </a>
          </div>
          {pane === 'hint' && <OptionHint option={hovered} />}
          {pane === 'space' && <SpacePane places={places} onCancel={() => setPane('hint')} onCollection={() => setPane('collection')} />}
          {pane === 'collection' && <CollectionPane places={places} onCancel={() => setPane('hint')} />}
        </section>
      </div>
    </AppShell>
  );
}
