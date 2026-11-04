import type { DocumentSummary } from '../api/content-api';
import type { Translate } from '../i18n/i18n';
import { SHELL_PATHS } from '../layout/app-shell';
import type { StageCard } from '../ui/stage-cards';

/** A text not updated for this many days is "Cần cập nhật" on the stage. */
export const STALE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function documentHref(id: string): string {
  return `/d/${encodeURIComponent(id)}`;
}

/** Whole days since `iso`, never negative. */
export function daysSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY_MS));
}

/** The text to read on with: the most recent one the reader started and did not finish. */
export function continueReading(recent: readonly DocumentSummary[]): DocumentSummary | undefined {
  return recent.find((doc) => doc.readProgress !== null && doc.readProgress > 0 && doc.readProgress < 100);
}

/** The most recently updated text (after `skip`) that has not changed for STALE_DAYS. */
export function staleDocument(recent: readonly DocumentSummary[], now: number, skip?: DocumentSummary): DocumentSummary | undefined {
  return recent.find((doc) => doc !== skip && daysSince(doc.updatedAt, now) >= STALE_DAYS);
}

export interface DockInput {
  recent: readonly DocumentSummary[];
  /** How many texts relate to the one read on (C11 "Liên quan"); null while unknown. */
  relatedCount: number | null;
  now: number;
}

/**
 * The "Gần đây" stage of C09, five tilted cards from the reader's own data: read on (with progress), a text that
 * needs an update (days since its last change), the Knowledge Graph, the texts related to the one read on, and the AI.
 * Without a text in progress the first card is the latest text; without a stale one the second is the next latest.
 */
export function dockCards({ recent, relatedCount, now }: DockInput, t: Translate): StageCard[] {
  const reading = continueReading(recent);
  const first = reading ?? recent[0];
  const stale = staleDocument(recent, now, first);
  const second = stale ?? recent.find((doc) => doc !== first);
  const cards: StageCard[] = [];
  cards.push(
    first
      ? {
          id: 'continue',
          href: documentHref(first.id),
          title: reading ? t('universe.dock.continue') : t('universe.dock.latest'),
          sub: first.title,
          icon: 'bookmark',
          progress: reading?.readProgress ?? undefined,
        }
      : { id: 'continue', href: SHELL_PATHS.search, title: t('universe.dock.findFirst'), sub: t('universe.dock.findFirstSub'), icon: 'bookmark' },
  );
  cards.push(
    second
      ? {
          id: 'update',
          href: documentHref(second.id),
          title: stale ? t('universe.dock.stale') : t('universe.dock.latest'),
          sub: second.title,
          icon: stale ? 'warning' : 'docs',
          iconTone: stale ? 'warn' : undefined,
          warning: stale ? t('universe.dock.staleDays', { days: daysSince(stale.updatedAt, now) }) : undefined,
        }
      : { id: 'update', href: SHELL_PATHS.mine, title: t('universe.dock.mine'), sub: t('universe.dock.mineSub'), icon: 'docs' },
  );
  cards.push({ id: 'graph', href: SHELL_PATHS.graph, title: t('universe.dock.graph'), sub: t('universe.dock.graphSub'), icon: 'space-networking', highlight: true });
  cards.push({
    id: 'related',
    href: first ? `${documentHref(first.id)}#related` : SHELL_PATHS.graph,
    title: t('universe.dock.related'),
    sub: relatedCount === null ? t('universe.dock.relatedSub') : t('universe.dock.relatedCount', { count: relatedCount }),
    icon: 'orbit',
  });
  cards.push({ id: 'ask', href: SHELL_PATHS.copilot, title: t('universe.dock.ask'), sub: t('universe.dock.askSub'), icon: 'sparkles' });
  return cards;
}
