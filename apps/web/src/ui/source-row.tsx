import type { ReactNode } from 'react';
import { Badge } from './badge';
import { Icon } from './icon';
import './source-row.css';

interface SourceRowProps {
  title: string;
  /** Section and origin, e.g. "§ DORA 4 bước · Chính thức". */
  meta?: string;
  /** The version tag (v4) or a short origin tag. */
  tag?: string;
  href: string;
  /** `md`: with document icon and meta line (C09 AI panel); `sm`: one line, 44px (DesignSystem). */
  size?: 'md' | 'sm';
  className?: string;
  dataId?: string;
}

/** A cited source under an AI answer, linking to the document at the cited version (KIT §7). */
export function SourceRow({ title, meta, tag, href, size = 'md', className, dataId }: SourceRowProps): ReactNode {
  return (
    <a href={href} className={className ? `kf-source ${className}` : 'kf-source'} data-size={size} data-id={dataId}>
      {size === 'md' && <Icon name="docs" size={18} strokeWidth={1.8} />}
      <span className="kf-source-text">
        <span className="kf-source-title">{title}</span>
        {meta && size === 'md' && <span className="kf-source-meta">{meta}</span>}
      </span>
      {tag && <Badge variant="tag">{tag}</Badge>}
    </a>
  );
}
