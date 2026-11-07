/**
 * How a document reads in a list (C10 cards, C11 backlinks and related rows): its origin label, its kind, its read
 * progress, how related it is. One place for both screens so a card and a link say the same thing.
 */
import type { DocumentSummary, Lang } from '../api/content-api';
import type { Locale } from '../i18n/i18n';
import type { ContentOrigin } from '../ui/origin-tag';
import type { ScreenTranslate, SpaceMessageKey } from './space-messages';

/**
 * The origin label (plan rule 6): where it comes from; a text that is not published reads as private (texts left
 * waiting from the review gate, removed 07/11/2026, included).
 */
export function originOf(doc: Pick<DocumentSummary, 'origin' | 'status'>): ContentOrigin {
  if (doc.status !== 'approved' || doc.origin === 'own') return 'private';
  return doc.origin;
}

const OFFICE_KIND: ReadonlyArray<readonly [RegExp, SpaceMessageKey]> = [
  [/\.docx?$/i, 'kind.officeWord'],
  [/\.(xlsx?|csv)$/i, 'kind.officeExcel'],
  [/\.pptx?$/i, 'kind.officePowerPoint'],
  [/\.pdf$/i, 'kind.officePdf'],
];

/** "Lab", "Ghi chú", "Tệp Excel" (an office file by its extension), "Lối đi". */
export function kindLabel(t: ScreenTranslate<SpaceMessageKey>, doc: Pick<DocumentSummary, 'type' | 'title'>): string {
  if (doc.type === 'office') {
    const match = OFFICE_KIND.find(([pattern]) => pattern.test(doc.title));
    return t(match ? match[1] : 'kind.office');
  }
  return t(`kind.${doc.type}`);
}

/** The kind line of a C10 card: a published community piece names its author ("Ghi chú · Minh"). */
export function cardKind(t: ScreenTranslate<SpaceMessageKey>, doc: DocumentSummary): string {
  const kind = kindLabel(t, doc);
  return doc.origin === 'community' && doc.status === 'approved' && doc.authorName ? `${kind} · ${doc.authorName}` : kind;
}

/** "Chưa đọc", "72%", "Đã đọc"; null for a guest (no progress kept). */
export function progressText(t: ScreenTranslate<SpaceMessageKey>, progress: number | null): string | null {
  if (progress === null) return null;
  if (progress <= 0) return t('progress.unread');
  if (progress >= 100) return t('progress.done');
  return t('progress.percent', { percent: Math.round(progress) });
}

/** A relevance of 0–100 as the boards write it: 0,92 in Vietnamese, 0.92 in English. */
export function relevanceText(locale: Locale, relevance: number): string {
  const share = Math.min(100, Math.max(0, relevance)) / 100;
  return share.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Languages as the boards list them: "VI · EN". */
export function langList(langs: readonly Lang[]): string {
  return langs.map((lang) => lang.toUpperCase()).join(' · ');
}

/** The languages any of the documents can be read in, in the app's order (vi, en). */
export function languagesOf(docs: readonly DocumentSummary[]): Lang[] {
  const seen = new Set(docs.flatMap((doc) => doc.translations));
  return (['vi', 'en'] as const).filter((lang) => seen.has(lang));
}
