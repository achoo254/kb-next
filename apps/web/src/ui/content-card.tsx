import type { ReactNode } from 'react';
import { type ContentOrigin, OriginTag } from './origin-tag';
import { Planet } from './planet';
import './motion.css';
import './content-card.css';

interface CardBase {
  href: string;
  /** A small note at the bottom (counts, kind). */
  note?: string;
  className?: string;
  dataId?: string;
}

interface DocCardProps extends CardBase {
  title: string;
  origin: ContentOrigin;
  /** Kind, size and languages, e.g. "Lab · 4 bước DORA · VI · EN". */
  meta?: string;
  /** A preview strip under the meta line. */
  children?: ReactNode;
}

function classes(base: string, extra?: string): string {
  return extra ? `kf-content-card ${base} ${extra}` : `kf-content-card ${base}`;
}

/** A document card (DesignSystem "Thẻ tài liệu"): origin, title, meta, preview. */
export function DocCard({ href, title, origin, meta, note, children, className, dataId }: DocCardProps): ReactNode {
  return (
    <a href={href} className={classes('kf-doc-card', className)} data-id={dataId}>
      <OriginTag origin={origin} variant="inline" />
      <span className="kf-card-title">{title}</span>
      {meta && <span className="kf-card-meta">{meta}</span>}
      {children}
      {note && <span className="kf-card-note">{note}</span>}
    </a>
  );
}

interface SpaceCardProps extends CardBase {
  name: string;
  meta?: string;
}

/** A Space as a planet card (DesignSystem "Thẻ Space"). */
export function SpaceCard({ href, name, meta, note, className, dataId }: SpaceCardProps): ReactNode {
  return (
    <a href={href} className={classes('kf-space-card', className)} data-id={dataId}>
      <Planet size={84} glow="bright">
        {name}
      </Planet>
      {meta && <span className="kf-card-meta">{meta}</span>}
      {note && <span className="kf-card-note">{note}</span>}
    </a>
  );
}

interface CollectionCardProps extends CardBase {
  title: string;
}

/** A Collection as a moon with a satellite on its orbit (DesignSystem "Thẻ Collection"). */
export function CollectionCard({ href, title, note, className, dataId }: CollectionCardProps): ReactNode {
  return (
    <a href={href} className={classes('kf-collection-card', className)} data-id={dataId}>
      <span className="kf-moon" aria-hidden="true">
        <span className="kf-moon-orbit">
          <span className="kf-moon-satellite" />
        </span>
        <Planet size={32} tone="moon" glow="none" className="kf-moon-body" />
      </span>
      <span className="kf-card-name">{title}</span>
      {note && <span className="kf-card-note">{note}</span>}
    </a>
  );
}
