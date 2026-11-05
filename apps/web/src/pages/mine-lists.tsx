/** The other tabs of C08: what the account opened lately, its favourites, and its trash (30 days, then gone). */
import type { ReactNode } from 'react';
import type { FavoriteDocument, MyDocument, RecentDocument, TrashedDocument } from '../api/authoring-api';
import { ILLUSTRATIONS } from '../ui/art';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { ago, daysLeft } from './mine-model';
import { type MineMessageKey, useMineText } from './mine-messages';

const ORIGIN_LABEL: Record<MyDocument['origin'], MineMessageKey> = { official: 'mine.origin.official', community: 'mine.origin.community', own: 'mine.origin.own' };

function OriginPill({ origin }: { origin: MyDocument['origin'] }): ReactNode {
  const { t } = useMineText();
  return (
    <span className="mine-origin" data-origin={origin}>
      {t(ORIGIN_LABEL[origin])}
    </span>
  );
}

function docHref(doc: Pick<MyDocument, 'id'>): string {
  return `/d/${encodeURIComponent(doc.id)}`;
}

function StarButton({ doc, onStar }: { doc: MyDocument; onStar(doc: MyDocument): void }): ReactNode {
  const { t } = useMineText();
  return (
    <button type="button" className="mine-star" aria-pressed={doc.favorite} aria-label={doc.favorite ? t('mine.star.remove') : t('mine.star.add')} onClick={() => onStar(doc)}>
      <Icon name="favorite" size={18} />
    </button>
  );
}

export function RecentView({ docs, now, onStar }: { docs: readonly RecentDocument[]; now: number; onStar(doc: MyDocument): void }): ReactNode {
  const { t, locale } = useMineText();
  return (
    <div className="mine-tab-body" data-id="mine-recent">
      <span className="mine-lead">{t('mine.recent.lead')}</span>
      {docs.length === 0 ? (
        <p className="mine-empty-line" data-id="mine-recent-empty">
          {t('mine.recent.empty')}
        </p>
      ) : (
        <ul className="mine-grid mine-grid-3">
          {docs.map((doc) => (
            <li key={doc.id} className="mine-card">
              <div className="mine-card-head">
                <img src={ILLUSTRATIONS['doc-planet']} alt="" aria-hidden="true" className="mine-card-art" />
                <StarButton doc={doc} onStar={onStar} />
              </div>
              <a href={docHref(doc)} className="mine-card-title">
                {doc.title}
              </a>
              <span className="mine-card-meta">
                <OriginPill origin={doc.origin} />
                {ago(locale, doc.at, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FavoritesView({ docs, onStar }: { docs: readonly FavoriteDocument[]; onStar(doc: MyDocument): void }): ReactNode {
  const { t } = useMineText();
  return (
    <div className="mine-tab-body" data-id="mine-favorites">
      <span className="mine-lead">{t('mine.favorites.lead')}</span>
      {docs.length === 0 ? (
        <p className="mine-empty-line mine-empty-gap" data-id="mine-favorites-empty">
          {t('mine.favorites.empty')}
        </p>
      ) : (
        <ul className="mine-grid mine-grid-4">
          {docs.map((doc) => (
            <li key={doc.id} className="mine-card mine-card-centred">
              <img src={ILLUSTRATIONS['doc-planet']} alt="" aria-hidden="true" className="mine-fav-art" />
              <a href={docHref(doc)} className="mine-card-title">
                {doc.title}
              </a>
              <span className="mine-card-meta">{t(ORIGIN_LABEL[doc.origin])}</span>
              <Button variant="ghost" size="sm" onClick={() => onStar(doc)}>
                {t('mine.star.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface TrashProps {
  docs: readonly TrashedDocument[];
  /** The "now" of "Xoá 3 ngày trước · còn 27 ngày". */
  now: number;
  onRestore(doc: TrashedDocument): void;
  onPurge(doc: TrashedDocument): void;
  onEmpty(): void;
}

/** Days left at most 3: the line turns amber (about to go). */
const SOON_DAYS = 3;

export function TrashView({ docs, now, onRestore, onPurge, onEmpty }: TrashProps): ReactNode {
  const { t, locale } = useMineText();
  return (
    <div className="mine-tab-body" data-id="mine-trash">
      <div className="mine-trash-head">
        <span className="mine-lead">{t('mine.trash.lead')}</span>
        <Button variant="ghost" size="md" className="mine-action-warn" onClick={onEmpty} disabled={docs.length === 0} dataId="mine-trash-empty-all">
          {t('mine.trash.emptyAll')}
        </Button>
      </div>
      {docs.length === 0 ? (
        <div className="mine-trash-empty" data-id="mine-trash-empty">
          <img src={ILLUSTRATIONS['doc-planet']} alt="" aria-hidden="true" />
          <span>{t('mine.trash.empty')}</span>
        </div>
      ) : (
        <ul className="mine-trash-list">
          {docs.map((doc) => {
            const left = daysLeft(doc, now);
            return (
              <li key={doc.id} className="mine-trash-row" data-id={`mine-trash-${doc.id}`}>
                <img src={ILLUSTRATIONS['doc-planet']} alt="" aria-hidden="true" className="mine-trash-art" />
                <span className="mine-row-text">
                  <span className="mine-row-title">{doc.title}</span>
                  <span className="mine-trash-when" data-soon={left <= SOON_DAYS || undefined}>
                    {t('mine.trash.row', { when: ago(locale, doc.deletedAt, now, 'day'), days: left })}
                  </span>
                </span>
                <Button variant="rim" size="md" onClick={() => onRestore(doc)} dataId={`mine-restore-${doc.id}`}>
                  {t('mine.trash.restore')}
                </Button>
                <Button variant="ghost" size="md" className="mine-action-warn" onClick={() => onPurge(doc)} dataId={`mine-purge-${doc.id}`}>
                  {t('mine.trash.purge')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
