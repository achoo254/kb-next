/** API answers of publishing and previewing (C04, C05) for the unit tests: the board's draft and the Spaces it may go to. */
import type { DocumentView, SpaceListItem } from '../api/content-api';
import { space } from './universe-test-data';

export const DOC_ID = 'd-new-host';
const T = '2026-11-03T14:05:00.000Z';

/** Networking (with "Giao thức nền tảng") and the reader's own Universe. */
export const PUBLISH_SPACES: SpaceListItem[] = [
  space('networking', { nameVi: 'Networking', nameEn: 'Networking', collections: [{ id: 'c-proto', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' }] }),
  space('personal-me', { kind: 'personal', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe' }),
];

/** The draft "Máy mới xin IP thế nào" in the reader's own Universe, with its four DORA sections and three tags. */
export function draftView(patch: Partial<DocumentView['document']> = {}, chunks?: DocumentView['chunks']): DocumentView {
  return {
    lang: 'vi',
    translationAvailable: true,
    document: {
      id: DOC_ID,
      title: 'Máy mới xin IP thế nào',
      type: 'note',
      origin: 'own',
      status: 'draft',
      lang: 'vi',
      aiTranslated: false,
      updatedAt: T,
      authorName: 'Đạt',
      translations: ['vi'],
      collectionId: null,
      space: { slug: 'personal-me', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: 'var(--tint-personal)', glow: 'var(--glow-personal)', art: '/art/crystal-personal.webp', kind: 'personal' },
      readProgress: 0,
      sourceUrl: null,
      createdAt: T,
      readingMinutes: 2,
      reviewedBy: null,
      readAnchor: null,
      collection: null,
      tags: ['dhcp', 'broadcast', 'lease'],
      canShare: true,
      ...patch,
    },
    translations: [{ id: DOC_ID, lang: 'vi', aiTranslated: false }],
    toc: [
      { anchor: 'tong-quan', title: null, level: 2 },
      { anchor: 'discover', title: 'Discover', level: 2 },
      { anchor: 'offer', title: 'Offer', level: 2 },
      { anchor: 'request', title: 'Request', level: 2 },
      { anchor: 'acknowledge', title: 'Acknowledge', level: 2 },
    ],
    chunks: chunks ?? [
      { anchor: 'tong-quan', heading: null, markdown: 'Máy mới hỏi cả mạng để xin IP, qua 4 bước DORA.' },
      { anchor: 'discover', heading: 'Discover', markdown: 'Máy mới gửi broadcast.' },
    ],
    backlinks: [],
    outgoing: [],
    wikilinks: [],
    related: [],
    versions: [],
    file: null,
  };
}
