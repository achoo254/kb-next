/** API answers of "Của tôi" (C08) for the unit tests (the shapes of /api/me/documents, /recent, /favorites, /trash). */
import type { FavoriteDocument, MyDocument, RecentDocument, TrashedDocument } from '../api/authoring-api';
import type { SpaceListItem } from '../api/content-api';
import { space } from './universe-test-data';

export const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: 'var(--tint-net)', glow: 'var(--glow-net)' };
export const ME = { slug: 'personal-me', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: 'var(--tint-personal)', glow: 'var(--glow-personal)' };

/** /api/spaces with Networking and the reader's personal Space. */
export const MINE_SPACES: SpaceListItem[] = [space('networking', { nameVi: 'Networking', nameEn: 'Networking' }), space('personal-me', { kind: 'personal', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe' })];

export function myDoc(id: string, patch: Partial<MyDocument> = {}): MyDocument {
  return {
    id,
    title: id,
    type: 'note',
    origin: 'own',
    status: 'draft',
    lang: 'vi',
    aiTranslated: false,
    updatedAt: '2026-11-02T10:00:00.000Z',
    authorName: 'Chủ',
    translations: ['vi'],
    collectionId: null,
    space: ME,
    readProgress: null,
    planet: null,
    hidden: false,
    collection: null,
    favorite: false,
    review: null,
    ...patch,
  };
}

/** The texts of board C08, as /api/me/documents gives them (times around 03/11/2026 21:05 in Saigon). */
export const BOARD_DOCS: MyDocument[] = [
  myDoc('n1', { title: 'Máy mới xin IP thế nào', status: 'approved', origin: 'community', space: NET, collection: { id: 'c0', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' }, favorite: true }),
  myDoc('n2', { title: 'Ghi chú: swap trên Ubuntu', status: 'pending', origin: 'community', updatedAt: '2026-11-03T13:05:00.000Z' }),
  myDoc('n3', {
    title: 'TCP vs UDP bằng hình',
    status: 'changes_requested',
    space: NET,
    collection: { id: 'c1', nameVi: 'Web', nameEn: 'Web' },
    review: { action: 'changes_requested', reason: 'Thêm link RFC 793 cho phần bắt tay 3 bước nhé.', by: 'Linh', at: '2026-11-02T09:00:00.000Z' },
  }),
  myDoc('o1', { title: 'lab-notes.docx', type: 'office', status: 'private' }),
  myDoc('o3', { title: 'k8s-intro.pptx', type: 'office', status: 'approved', origin: 'community', hidden: true }),
  myDoc('n4', {
    title: 'Mẹo DNS cache',
    status: 'rejected',
    review: { action: 'rejected', reason: 'Nội dung nói về trình duyệt hơn là DNS.', by: 'Linh', at: '2026-10-30T09:00:00.000Z' },
  }),
];

export function recentOf(doc: MyDocument, at: string): RecentDocument {
  return { ...doc, at };
}

export function favoriteOf(doc: MyDocument): FavoriteDocument {
  return { ...doc, favorite: true, favoritedAt: '2026-11-03T10:00:00.000Z' };
}

export function trashedOf(doc: MyDocument, deletedAt: string, purgeAt: string): TrashedDocument {
  return { ...doc, deletedAt, purgeAt };
}
