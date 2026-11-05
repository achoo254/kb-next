/**
 * Boards C04, C05, C18 and H02 draw the owner's draft "Máy mới xin IP thế nào" placed in Networking › Giao thức nền
 * tảng with its DORA sections and three tags, the official DHCP text shared with a 7-day link and its access history,
 * and a shared text opened signed out. The seed holds the draft without sections or tags (C02 draws it that way) and
 * no share link, and E2E cannot make a token it could show again; so the shots answer those calls with the boards'
 * data. The screens are the real ones (apps/web/src/pages/publish-screen.tsx, preview-screen.tsx, share-screen.tsx,
 * shared-open-screen.tsx; their states are checked in their *.test.tsx).
 */
import { C02_DRAFT_ID } from './graph-canvas-boards';

const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const PROTOCOLS = { id: 'c0400000-0000-4000-8000-000000000001', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' };
const AT = '2026-11-03T14:05:00.000Z';

export const PUBLISH_DOCUMENT_ID = C02_DRAFT_ID;

/** /api/spaces of C04: Networking (with its Collection) and the owner's own Universe. */
export const C04_SPACES = {
  spaces: [
    { ...NET, art: '/art/crystal-networking.webp', kind: 'public', caption: { vi: '', en: '' }, documentCount: 12, collectionCount: 1, collections: [PROTOCOLS] },
    {
      slug: 'personal-board',
      nameVi: 'Vũ trụ của bạn',
      nameEn: 'Your universe',
      tint: '#F9A8D4',
      glow: '#EC4899',
      art: '/art/crystal-personal.webp',
      kind: 'personal',
      caption: { vi: '', en: '' },
      documentCount: 8,
      collectionCount: 0,
      collections: [],
    },
  ],
};

/** The draft of C04 and C05 as /api/documents/:id answers it. */
export const C04_DOCUMENT = {
  lang: 'vi',
  translationAvailable: true,
  document: {
    id: PUBLISH_DOCUMENT_ID,
    title: 'Máy mới xin IP thế nào',
    type: 'note',
    origin: 'own',
    status: 'draft',
    lang: 'vi',
    aiTranslated: false,
    updatedAt: AT,
    authorName: 'Đạt',
    translations: ['vi'],
    collectionId: PROTOCOLS.id,
    space: { ...NET, art: '/art/crystal-networking.webp', kind: 'public' },
    readProgress: 0,
    sourceUrl: null,
    createdAt: AT,
    readingMinutes: 2,
    reviewedBy: null,
    readAnchor: null,
    collection: PROTOCOLS,
    tags: ['dhcp', 'broadcast', 'lease'],
    canShare: true,
  },
  translations: [{ id: PUBLISH_DOCUMENT_ID, lang: 'vi', aiTranslated: false }],
  toc: [
    { anchor: 'tong-quan', title: null, level: 2 },
    { anchor: 'discover', title: 'Discover', level: 2 },
    { anchor: 'offer', title: 'Offer', level: 2 },
    { anchor: 'request', title: 'Request', level: 2 },
    { anchor: 'acknowledge', title: 'Acknowledge', level: 2 },
  ],
  chunks: [
    { anchor: 'tong-quan', heading: null, markdown: 'Máy mới vào mạng chưa có IP. Nó hỏi cả mạng bằng broadcast, theo 4 bước DORA.' },
    { anchor: 'discover', heading: 'Discover', markdown: 'Máy mới gửi broadcast tìm server DHCP.' },
    { anchor: 'offer', heading: 'Offer', markdown: 'Server đề nghị một địa chỉ.' },
    { anchor: 'request', heading: 'Request', markdown: 'Máy xin đúng địa chỉ đó.' },
    { anchor: 'acknowledge', heading: 'Acknowledge', markdown: 'Server xác nhận, máy dùng IP.' },
  ],
  backlinks: [],
  outgoing: [],
  wikilinks: [],
  related: [],
  versions: [],
  file: null,
};

/** 03/11/2026 21:20 in Saigon: the history's "21:12 hôm nay", "20:40". */
export const C18_CLOCK = '2026-11-03T14:20:00.000Z';
const saigon = (hhmm: string): string => `2026-11-03T${String(Number(hhmm.slice(0, 2)) - 7).padStart(2, '0')}:${hhmm.slice(3)}:00.000Z`;

/** /api/documents/:id/share of C18: the official DHCP text, its 7-day view-only link, who has access, its history. */
export function c18Share(documentId: string): unknown {
  return {
    document: {
      id: documentId,
      title: 'Giao thức DHCP',
      origin: 'official',
      status: 'approved',
      hidden: false,
      lang: 'vi',
      type: 'lab',
      space: { ...NET, art: '/art/crystal-networking.webp' },
      collection: PROTOCOLS,
      sections: ['Discover', 'Offer', 'Request', 'Acknowledge'],
      authorName: 'Đạt',
    },
    shareable: true,
    link: { id: 'c1800000-0000-4000-8000-000000000001', last4: '7f3k', access: 'view', expiry: '7d', expiresAt: '2026-11-10T13:40:00.000Z', expired: false, revokedAt: null, createdAt: saigon('20:31') },
    openings7d: 12,
    history: [
      { kind: 'opened', at: saigon('21:12'), by: null, detail: null },
      { kind: 'changed', at: saigon('20:40'), by: 'Đạt', detail: '7d|' },
      { kind: 'created', at: saigon('20:31'), by: 'Đạt', detail: '30d|view' },
      { kind: 'approved', at: saigon('19:58'), by: 'Linh', detail: null },
    ],
    approverName: 'Linh',
    permission: null,
  };
}

/** A share link's token of H02 (32 characters, as the server makes them). */
export const H02_TOKEN = 'mMoiVaoMang000000000000000000H02';

/** /api/l/:token of H02, signed out: the board's "Máy mới vào mạng" with its five steps. */
export const H02_PREVIEW = {
  access: 'view',
  signedIn: false,
  canRemix: false,
  document: {
    id: 'h0200000-0000-4000-8000-000000000001',
    title: 'Máy mới vào mạng',
    lang: 'vi',
    type: 'note',
    authorName: 'dattqh',
    readingMinutes: 4,
    sections: ['Wi-Fi', 'DHCP', 'ARP', 'DNS', 'HTTP'],
    peek: { heading: 'Wi-Fi', text: 'Cắm mạng: máy mới chưa có IP, chưa biết ai.' },
    space: NET,
  },
};
