/**
 * "Vũ trụ của tôi" of C08: the account's texts as planets on three rings (being written, in review, published; refused
 * ones in a box), or as a list; the panel of the picked planet; and the empty own universe (S05's three ways to start).
 */
import type { ReactNode } from 'react';
import type { Locale } from '../i18n/i18n';
import { useI18n } from '../i18n/i18n';
import { CRYSTAL_ART, ILLUSTRATIONS } from '../ui/art';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { StageCards } from '../ui/stage-cards';
import { Tooltip } from '../ui/tooltip';
import { type ItemStatus, type MineItem, ORBIT_CENTRE, RINGS, ago, orbitLayout } from './mine-model';
import { type MineMessageKey, useMineText } from './mine-messages';
import type { ScreenTranslate } from './space-messages';
import { kindLabel } from './space-labels';
import { useSpaceText } from './space-messages';
import { spaceName } from './space-panels';
import { SHELL_PATHS } from '../layout/shell-paths';
import { createCards } from './universe-states';

type Translate = ScreenTranslate<MineMessageKey>;

/** The crystal of each kind of planet (the board's art: notes violet, Office green, journeys cyan, canvases blue). */
const PLANET_ART: Record<MineItem['type'], string> = {
  note: CRYSTAL_ART.networking,
  office: CRYSTAL_ART.observability,
  journey: CRYSTAL_ART.linux,
  canvas: CRYSTAL_ART.kubernetes,
};

export function statusLabel(t: Translate, item: Pick<MineItem, 'status' | 'origin'>): string {
  if (item.status === 'approved' && item.origin === 'community') return t('mine.status.approvedCommunity');
  return t(`mine.status.${item.status}`);
}

export function StatusPill({ status, children }: { status: ItemStatus; children: ReactNode }): ReactNode {
  return (
    <span className="mine-pill" data-status={status}>
      {children}
    </span>
  );
}

interface PlanetsProps {
  items: readonly MineItem[];
  selected: string | null;
  onPick(key: string): void;
  /** The personal Space has texts: its crystal sits in the middle; else the dashed "Hành tinh đầu tiên". */
  centre: 'crystal' | 'first';
}

const RING_LABEL: Record<1 | 2 | 3, MineMessageKey> = { 1: 'mine.ring.writing', 2: 'mine.ring.review', 3: 'mine.ring.public' };

/** The orbits (board default view). */
export function OrbitView({ items, selected, onPick, centre }: PlanetsProps): ReactNode {
  const { t } = useMineText();
  return (
    <div className="mine-orbit" data-id="mine-orbit">
      {([1, 2, 3] as const).map((ring) => {
        const { rx, ry } = RINGS[ring];
        return (
          <span key={ring} className="mine-ring-wrap">
            <span className="mine-ring" data-ring={ring} aria-hidden="true" style={{ left: ORBIT_CENTRE.x - rx, top: ORBIT_CENTRE.y - ry, width: rx * 2, height: ry * 2 }} />
            <span className="mine-ring-label" style={{ left: ORBIT_CENTRE.x - 40, top: ORBIT_CENTRE.y - ry - 16 }}>
              {t(RING_LABEL[ring])}
            </span>
          </span>
        );
      })}
      {centre === 'crystal' ? (
        <>
          <img src={CRYSTAL_ART.personal} alt="" aria-hidden="true" className="mine-centre" />
          <span className="mine-centre-label">
            <span>{t('mine.centre')}</span>
          </span>
        </>
      ) : (
        <a href={SHELL_PATHS.create} className="mine-first" aria-label={t('mine.firstLabel')} data-id="mine-first">
          <Icon name="plus" size={26} strokeWidth={2.2} />
          <span>{t('mine.first')}</span>
        </a>
      )}
      <div className="mine-refused" aria-hidden="true">
        <span>{t('mine.refused')}</span>
      </div>
      {orbitLayout(items).map(({ item, x, y, size }) => {
        const status = statusLabel(t, item);
        return (
          <button
            key={item.key}
            type="button"
            className="mine-planet"
            data-status={item.status}
            data-type={item.type}
            data-selected={item.key === selected || undefined}
            aria-pressed={item.key === selected}
            aria-label={t('mine.planet', { title: item.title, status })}
            style={{ left: x, top: y, width: size, height: size }}
            onClick={() => onPick(item.key)}
            data-id={`mine-planet-${item.key}`}
          >
            <img src={PLANET_ART[item.type]} alt="" aria-hidden="true" className="mine-planet-art" />
            <span className="mine-planet-ring" aria-hidden="true" />
            {item.status === 'private' && <Icon name="lock" size={16} strokeWidth={2.4} className="mine-planet-mark" />}
            {item.status === 'hidden' && <Icon name="eye-off" size={16} className="mine-planet-mark" />}
            {item.favorite && <Icon name="favorite" size={16} className="mine-planet-star" />}
            <span className="mine-planet-name">{item.title}</span>
          </button>
        );
      })}
      {items.length === 0 && <p className="mine-no-match">{t('mine.noMatch')}</p>}
    </div>
  );
}

/** The same texts as rows (Danh sách). */
export function ListView({ items, selected, onPick, now }: Omit<PlanetsProps, 'centre'> & { now: number }): ReactNode {
  const { t, locale } = useMineText();
  const space = useSpaceText();
  if (items.length === 0) return <p className="mine-empty-line">{t('mine.noMatchList')}</p>;
  return (
    <ul className="mine-list" data-id="mine-list">
      {items.map((item) => (
        <li key={item.key}>
          <button type="button" className="mine-row" data-selected={item.key === selected || undefined} aria-pressed={item.key === selected} onClick={() => onPick(item.key)}>
            <img src={ILLUSTRATIONS['doc-planet']} alt="" aria-hidden="true" className="mine-row-art" data-status={item.status} />
            <span className="mine-row-text">
              <span className="mine-row-title">{item.title}</span>
              <span className="mine-row-meta">{t('mine.edited', { kind: kindOf(t, space.t, item), when: ago(locale, item.updatedAt, now) })}</span>
            </span>
            <StatusPill status={item.status}>{statusLabel(t, item)}</StatusPill>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function kindOf(t: Translate, spaceT: ReturnType<typeof useSpaceText>['t'], item: MineItem): string {
  return item.docType === null ? t('mine.kind.canvas') : kindLabel(spaceT, { type: item.docType, title: item.title });
}

/** "Networking › Web", "Vũ trụ của bạn"; "—" when the canvas belongs to no Space. */
export function whereOf(locale: Locale, item: MineItem, none: string): string {
  if (!item.space) return none;
  const space = spaceName(locale, item.space);
  return item.collection ? `${space} › ${locale === 'vi' ? item.collection.nameVi : item.collection.nameEn}` : space;
}

/** The empty own universe (S05's "vũ trụ riêng còn trống", moved here): the first planet and three ways to start. */
export function EmptyUniverse({ hasSpace }: { hasSpace: boolean }): ReactNode {
  const { t } = useMineText();
  const app = useI18n();
  return (
    <div className="mine-empty-universe" data-id="mine-empty-universe" data-space={hasSpace ? 'empty' : 'none'}>
      <a href={SHELL_PATHS.create} className="mine-first mine-first-alone" aria-label={t('mine.firstLabel')} data-id="mine-first">
        <Icon name="plus" size={30} strokeWidth={2.2} />
        <span>{t('mine.first')}</span>
      </a>
      <span className="mine-empty-title">{t('mine.empty.title')}</span>
      <span className="mine-empty-text">{hasSpace ? t('mine.empty.noDocs') : t('mine.empty.noSpace')}</span>
      <StageCards cards={createCards(app.t)} className="mine-empty-stage" />
    </div>
  );
}

interface DetailProps {
  item: MineItem;
  /** The "now" of "sửa hôm qua". */
  now: number;
  onStar(item: MineItem): void;
  onTrash(item: MineItem): void;
}

type Action = { kind: 'link'; label: MineMessageKey; href: string } | { kind: 'later'; label: MineMessageKey };

/** What can be done with a text at each step (the board's buttons; review and sharing arrive with phase 11). */
export function actionsOf(item: MineItem): Action[] {
  if (item.kind === 'canvas') return [{ kind: 'link', label: 'mine.action.open', href: item.href }];
  const edit = item.docType === 'office' ? item.href : `${item.href}/edit`;
  const editLabel: MineMessageKey = item.docType === 'office' ? 'mine.action.open' : 'mine.action.edit';
  switch (item.status) {
    case 'draft':
    case 'private':
      return [
        { kind: 'link', label: editLabel, href: edit },
        { kind: 'later', label: 'mine.action.submit' },
      ];
    case 'pending':
      return [
        { kind: 'link', label: 'mine.action.preview', href: item.href },
        { kind: 'later', label: 'mine.action.withdraw' },
      ];
    case 'changes':
    case 'rejected':
      return [{ kind: 'link', label: item.docType === 'office' ? 'mine.action.open' : 'mine.action.resubmit', href: edit }];
    case 'approved':
      return [
        { kind: 'later', label: 'mine.action.share' },
        { kind: 'link', label: 'mine.action.open', href: item.href },
        { kind: 'later', label: 'mine.action.unpublish' },
      ];
    case 'hidden':
      return [{ kind: 'link', label: 'mine.action.open', href: item.href }];
  }
}

/** The picked planet: what it is, where it stands in review and why, where it lives, and what to do with it. */
export function Detail({ item, now, onStar, onTrash }: DetailProps): ReactNode {
  const { t, locale } = useMineText();
  const space = useSpaceText();
  const review = item.review && (item.review.action === 'changes_requested' || item.review.action === 'rejected') && item.review.reason ? item.review : null;
  const published = item.status === 'approved' || item.status === 'hidden';
  return (
    <div className="mine-detail" key={item.key} data-id="mine-detail" data-status={item.status}>
      <div className="mine-detail-head">
        <img src={ILLUSTRATIONS['doc-planet']} alt="" aria-hidden="true" className="mine-detail-art" data-status={item.status} />
        <div className="mine-detail-title">
          <span className="mine-detail-name">{item.title}</span>
          <span className="mine-detail-meta">{t('mine.edited', { kind: kindOf(t, space.t, item), when: ago(locale, item.updatedAt, now) })}</span>
        </div>
        {item.kind === 'document' && (
          <button type="button" className="mine-star" aria-pressed={item.favorite} aria-label={item.favorite ? t('mine.star.remove') : t('mine.star.add')} onClick={() => onStar(item)} data-id="mine-detail-star">
            <Icon name="favorite" size={18} />
          </button>
        )}
      </div>
      <StatusPill status={item.status}>{statusLabel(t, item)}</StatusPill>
      <span className="mine-detail-desc">{item.kind === 'canvas' ? t('mine.desc.canvas') : t(`mine.desc.${item.status}`)}</span>
      {review?.reason && (
        <div className="mine-reason" data-id="mine-reason">
          <span className="mine-reason-head">{t('mine.reason')}</span>
          <span>{review.by ? t('mine.reasonText', { reason: review.reason, by: review.by }) : t('mine.reasonAnonymous', { reason: review.reason })}</span>
        </div>
      )}
      <div className="mine-facts">
        <div className="mine-fact">
          <div className="mine-fact-label">{t('mine.where')}</div>
          <div className="mine-fact-value">{whereOf(locale, item, t('mine.none'))}</div>
        </div>
        <div className="mine-fact">
          <div className="mine-fact-label">{t('mine.opens')}</div>
          <div className="mine-fact-value">{t('mine.none')}</div>
        </div>
      </div>
      <div className="mine-detail-fill" />
      <div className="mine-actions">
        {actionsOf(item).map((action, index) =>
          action.kind === 'link' ? (
            <Button key={action.label} variant={index === 0 ? 'primary' : 'ghost'} size="lg" href={action.href} className="mine-action" dataId={`mine-action-${action.label.slice('mine.action.'.length)}`}>
              {t(action.label)}
            </Button>
          ) : (
            <Tooltip key={action.label} text={t('mine.soon')}>
              {(describedBy) => (
                <Button variant={index === 0 ? 'primary' : 'ghost'} size="lg" disabled className="mine-action" aria-describedby={describedBy}>
                  {t(action.label)}
                </Button>
              )}
            </Tooltip>
          ),
        )}
        {item.kind === 'document' &&
          (published ? (
            <Tooltip text={t('mine.publishedTrash')}>
              {(describedBy) => (
                <Button variant="ghost" size="lg" disabled className="mine-action mine-action-warn" aria-describedby={describedBy}>
                  {t('mine.action.trash')}
                </Button>
              )}
            </Tooltip>
          ) : (
            <Button variant="ghost" size="lg" className="mine-action mine-action-warn" onClick={() => onTrash(item)} dataId="mine-action-trash">
              {t('mine.action.trash')}
            </Button>
          ))}
      </div>
    </div>
  );
}
