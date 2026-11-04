/**
 * The moving parts of the Space screen (board C10): the collections to pick from, and the documents of the picked one
 * with their origin labels and read progress, filtered by origin and optionally sorted with unfinished ones first.
 */
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import type { DocumentSummary, SpaceCollection, SpacePermissions } from '../api/content-api';
import { SHELL_PATHS } from '../layout/app-shell';
import { OriginTag } from '../ui/origin-tag';
import { Skeleton } from '../ui/skeleton';
import { cardKind, originOf, progressText } from './space-labels';
import { useSpaceText } from './space-messages';
import { spaceName, tintStyle } from './space-panels';

export type OriginFilter = 'all' | 'official' | 'community';
const FILTERS: readonly OriginFilter[] = ['all', 'official', 'community'];

/** The documents a filter keeps, in the collection's order, or with the ones being read (1–99%) first when sorted. */
export function visibleDocuments(docs: readonly DocumentSummary[], filter: OriginFilter, inProgressFirst: boolean): DocumentSummary[] {
  const kept = docs.filter((doc) => filter === 'all' || doc.origin === filter);
  if (!inProgressFirst) return kept;
  const reading = (doc: DocumentSummary): boolean => doc.readProgress !== null && doc.readProgress > 0 && doc.readProgress < 100;
  return [...kept.filter(reading), ...kept.filter((doc) => !reading(doc))];
}

export function CollectionGrid({ collections, selectedId, onSelect }: { collections: readonly SpaceCollection[]; selectedId: string | null; onSelect(id: string): void }): ReactNode {
  const { t, locale } = useSpaceText();
  return (
    <section className="space-collections" aria-labelledby="space-collections-title" data-id="space-collections">
      <h2 id="space-collections-title" className="space-section-title">
        {t('space.collections')}
      </h2>
      <div className="space-collection-grid">
        {collections.map((collection) => {
          const selected = collection.id === selectedId;
          return (
            <button
              key={collection.id}
              type="button"
              className="space-collection"
              style={tintStyle(collection)}
              aria-pressed={selected}
              onClick={() => onSelect(collection.id)}
              data-id={`space-collection-${collection.id}`}
            >
              <span className="space-collection-art" aria-hidden="true">
                <img src={collection.art} alt="" />
              </span>
              <span className="space-collection-text">
                <span className="space-collection-name">{spaceName(locale, collection)}</span>
                <span className="space-collection-meta">{t('space.documentCount', { count: collection.documentCount })}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DocumentCard({ doc }: { doc: DocumentSummary }): ReactNode {
  const { t } = useSpaceText();
  const progress = progressText(t, doc.readProgress);
  const percent = Math.min(100, Math.max(0, doc.readProgress ?? 0));
  return (
    <a href={`/d/${encodeURIComponent(doc.id)}`} className="space-doc" data-id={`space-doc-${doc.id}`}>
      <span className="space-doc-top">
        <OriginTag origin={originOf(doc)} variant="inline" className="space-doc-origin" />
        <span className="space-doc-kind">{cardKind(t, doc)}</span>
      </span>
      <span className="space-doc-title">{doc.title}</span>
      {progress !== null && (
        <span className="space-doc-progress">
          <span className="space-progress-track" role="img" aria-label={t('progress.label', { percent: Math.round(percent) })}>
            <span className="space-progress-fill" style={{ width: `${percent}%` } as CSSProperties} />
          </span>
          {progress}
        </span>
      )}
    </a>
  );
}

interface DocumentPanelProps {
  /** The collection's name, or the Space's when it has no collections (the personal Space's files). */
  title: string;
  documents: readonly DocumentSummary[];
  permissions: SpacePermissions;
}

export function DocumentPanel({ title, documents, permissions }: DocumentPanelProps): ReactNode {
  const { t } = useSpaceText();
  const [filter, setFilter] = useState<OriginFilter>('all');
  const [inProgressFirst, setInProgressFirst] = useState(false);
  const shown = useMemo(() => visibleDocuments(documents, filter, inProgressFirst), [documents, filter, inProgressFirst]);
  return (
    <section className="space-docs" aria-labelledby="space-docs-title" data-id="space-docs">
      <h2 id="space-docs-title" className="space-docs-title">
        {title} <span className="space-docs-count">· {t('space.documentCount', { count: documents.length })}</span>
      </h2>
      {documents.length > 0 && (
        <div className="space-docs-tools">
          <div role="group" aria-label={t('space.filter')} className="space-filters" data-id="space-filters">
            {FILTERS.map((id) => (
              <button key={id} type="button" className="space-pill" aria-pressed={filter === id} onClick={() => setFilter(id)} data-id={`space-filter-${id}`}>
                {t(`space.filter.${id}`)}
              </button>
            ))}
          </div>
          <button type="button" className="space-sort" aria-pressed={inProgressFirst} onClick={() => setInProgressFirst((on) => !on)} data-id="space-sort">
            {t('space.sortInProgress')}
          </button>
        </div>
      )}
      {documents.length === 0 ? (
        <div className="space-empty" data-id="space-empty">
          <span className="space-empty-ring" aria-hidden="true">
            +
          </span>
          <span className="space-empty-title">{t('space.empty.title')}</span>
          <span className="space-empty-text">{t('space.empty.text')}</span>
          {permissions.canCreate && (
            <a className="space-empty-action" href={SHELL_PATHS.mine} data-id="space-empty-create">
              {t('space.empty.action')}
            </a>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="space-filtered-empty">{t('space.filteredEmpty')}</p>
      ) : (
        <ul className="space-doc-grid">
          {shown.map((doc) => (
            <li key={doc.id}>
              <DocumentCard doc={doc} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The board's loading state: the shapes of the collections and the documents, and "Đang mở Space…". */
export function SpaceLoading(): ReactNode {
  const { t } = useSpaceText();
  return (
    <div aria-busy="true" aria-label={t('space.loadingLabel')} data-id="space-loading">
      <div className="space-loading-hero">
        <Skeleton width={180} height={180} circle tone="glow" />
        <div className="space-loading-lines">
          <Skeleton width={130} height={22} radius={9} tone="glow" />
          <Skeleton width={190} height={38} radius={10} tone="glow" />
          <Skeleton width={160} height={14} radius={7} tone="glow" />
          <Skeleton height={44} radius={22} tone="glow" />
        </div>
      </div>
      <section className="space-collections">
        <span className="space-section-title">{t('space.collections')}</span>
        <div className="space-collection-grid">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} height={110} radius={22} tone="glow" />
          ))}
        </div>
      </section>
      <section className="space-docs">
        <div className="space-doc-grid">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <Skeleton key={key} height={118} radius={20} tone="glow" />
          ))}
        </div>
        <p className="space-loading-text" role="status">
          {t('space.loading')}
        </p>
      </section>
    </div>
  );
}
