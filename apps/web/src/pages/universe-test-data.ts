/** API answers of the Universe for the unit tests (the shape of /api/spaces and /api/recent). */
import type { DocumentSummary, SpaceListItem } from '../api/content-api';

export function space(slug: string, extra: Partial<SpaceListItem> = {}): SpaceListItem {
  return {
    slug,
    nameVi: slug,
    nameEn: slug,
    tint: 'var(--tint-net)',
    glow: 'var(--glow-net)',
    art: `/art/crystal-${slug}.webp`,
    kind: 'public',
    caption: { vi: `${slug} vi`, en: `${slug} en` },
    documentCount: 2,
    collectionCount: 1,
    collections: [],
    ...extra,
  };
}

/** The seven Spaces of board C09, the reader's own one included. */
export const BOARD_SPACES: SpaceListItem[] = [
  space('networking', { nameVi: 'Networking', nameEn: 'Networking', caption: { vi: '8 lab', en: '8 labs' }, documentCount: 8 }),
  space('kubernetes'),
  space('linux'),
  space('observability'),
  space('docker'),
  space('weekly', { nameVi: 'Học hàng tuần', nameEn: 'Weekly study' }),
  space('personal-u1', { kind: 'personal', art: '/art/crystal-personal.webp', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', documentCount: 3 }),
];

export function doc(id: string, extra: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id,
    title: `Doc ${id}`,
    type: 'lab',
    origin: 'official',
    status: 'approved',
    lang: 'vi',
    aiTranslated: false,
    updatedAt: '2026-11-03T14:05:00.000Z',
    authorName: null,
    translations: ['vi'],
    collectionId: null,
    space: { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: 'var(--tint-net)', glow: 'var(--glow-net)' },
    readProgress: null,
    ...extra,
  };
}
