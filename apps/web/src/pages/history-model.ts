/** How C17 tells each event: its sentence, who did it, its avatar, tag and filter, and the default comparison. */
import type { HistoryEvent } from '../api/history-api';
import type { Locale } from '../i18n/i18n';
import type { HistoryMessageKey } from './history-messages';
import type { ScreenTranslate } from './space-messages';

export type HistoryFilter = 'all' | 'content' | 'review' | 'visibility';
export const HISTORY_FILTERS: readonly HistoryFilter[] = ['all', 'content', 'review', 'visibility'];

type T = ScreenTranslate<HistoryMessageKey>;

export function filterOf(event: HistoryEvent): Exclude<HistoryFilter, 'all'> {
  return event.kind === 'version' ? 'content' : event.kind;
}

export function shown(events: readonly HistoryEvent[], filter: HistoryFilter): HistoryEvent[] {
  return filter === 'all' ? [...events] : events.filter((e) => filterOf(e) === filter);
}

/** The event's sentence ("Cập nhật qua API · AI tạo", "Duyệt phiên bản v4", "Hiện lại bài trong Universe"). */
export function eventText(t: T, event: HistoryEvent): string {
  if (event.kind === 'visibility') return event.hidden ? t('history.visibility.hidden', { name: event.actor?.name ?? t('history.unknown') }) : t('history.visibility.shown');
  if (event.kind === 'review') {
    switch (event.action) {
      case 'approved':
        return t('history.review.approved', { version: event.version ?? '?' });
      case 'published':
        return t('history.review.published', { version: event.version ?? '?' });
      case 'submitted':
        return t('history.review.submitted', { version: event.version ?? '?' });
      case 'changes_requested':
      case 'rejected': {
        const action = t(event.action === 'rejected' ? 'history.review.rejected' : 'history.review.changes');
        return event.reason ? t('history.review.reason', { action, reason: event.reason }) : action;
      }
    }
  }
  if (event.via === 'import') return t('history.version.imported');
  if (event.via === 'translation') return t('history.version.translated');
  let action = event.restoredFrom !== null ? t('history.version.restored', { version: event.restoredFrom }) : event.version === 1 ? t('history.version.created') : event.proposal ? t('history.version.proposal') : t('history.version.updated');
  if (event.via === 'api') action = t('history.version.api', { action });
  if (event.aiMade) action = t('history.version.ai', { action });
  return event.summary ? t('history.version.summary', { action, summary: event.summary }) : action;
}

/** "Đạt · Quản trị", "Đạt · API". */
export function whoText(t: T, event: HistoryEvent): string {
  const name = event.actor?.name ?? t('history.unknown');
  const role = event.kind === 'version' && event.via === 'api' ? t('history.role.api') : t(`history.role.${event.actor?.role ?? 'member'}`);
  return t('history.who', { name, role });
}

export type AvatarTone = 'ai' | 'admin' | 'member';

/** The round avatar: "AI" for text written by AI, else the first letter, coloured by role. */
export function avatarOf(event: HistoryEvent): { letters: string; tone: AvatarTone } {
  if (event.kind === 'version' && event.aiMade) return { letters: 'AI', tone: 'ai' };
  const letter = Array.from(event.actor?.name?.trim() ?? '')[0]?.toLocaleUpperCase() ?? '·';
  return { letters: letter, tone: event.actor?.role ?? 'member' };
}

export type TagTone = 'warn' | 'success';

export function tagOf(event: HistoryEvent): { key: HistoryMessageKey; tone: TagTone } | null {
  if (event.kind === 'visibility') return event.hidden ? { key: 'history.tag.hidden', tone: 'warn' } : null;
  if (event.kind !== 'review') return null;
  if (event.action === 'approved') return { key: 'history.tag.approved', tone: 'success' };
  if (event.action === 'published') return { key: 'history.tag.published', tone: 'success' };
  if (event.action === 'changes_requested') return { key: 'history.tag.changes', tone: 'warn' };
  if (event.action === 'rejected') return { key: 'history.tag.rejected', tone: 'warn' };
  return null;
}

/** The versions compared when the screen opens: the one before the current, and the current. */
export function defaultPair(events: readonly HistoryEvent[]): [number, number] | null {
  const versions = [...new Set(events.flatMap((e) => (e.kind === 'version' ? [e.version] : [])))].sort((a, b) => a - b);
  const last = versions.at(-1);
  if (last === undefined) return null;
  return [versions.at(-2) ?? last, last];
}

/** Picking a version keeps the newer pick and drops the older (board C17); the pair is always in order. */
export function pickVersion(pair: [number, number], version: number): [number, number] {
  if (pair.includes(version)) return pair;
  const kept = pair[1];
  return kept < version ? [kept, version] : [version, kept];
}

/** "03/11 21:40" in Asia/Saigon. */
export function eventTime(locale: Locale, iso: string): string {
  const parts = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}/${part('month')} ${part('hour')}:${part('minute')}`;
}
