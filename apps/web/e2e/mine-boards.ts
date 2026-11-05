/**
 * Board C08 draws "Của tôi" with nine sample texts at every step of review: a published note and journey, a note in
 * review, one sent back with Linh's reason, Office files in draft, private and hidden by an admin, a rejected note,
 * and a canvas. The seed cannot hold them as drawn: the same titles are a draft on C02 ("Máy mới xin IP thế nào"),
 * private files on C09 ("3 tệp · riêng tư") and an official journey on C10/C13 ("Máy mới vào mạng"). So the shot
 * answers /api/me/documents with the board's eight texts (the canvas is the seed's own, from /api/canvases), placed
 * in the E2E account's real personal Space; everything else (recent, favourites, trash, Spaces) is the seed's.
 */
const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const K8S = { slug: 'kubernetes', nameVi: 'Kubernetes', nameEn: 'Kubernetes', tint: '#93C5FD', glow: '#3B82F6' };
const LNX = { slug: 'linux', nameVi: 'Linux', nameEn: 'Linux', tint: '#A5F3FC', glow: '#22D3EE' };

type Space = typeof NET;

interface BoardText {
  id: string;
  title: string;
  type: 'note' | 'office' | 'journey';
  status: 'draft' | 'private' | 'pending' | 'changes_requested' | 'rejected' | 'approved';
  origin: 'own' | 'community';
  /** null: the account's personal Space. */
  space: Space | null;
  collection: { id: string; nameVi: string; nameEn: string } | null;
  hidden: boolean;
  favorite: boolean;
  updatedAt: string;
  review: { action: 'changes_requested' | 'rejected'; reason: string; by: string; at: string } | null;
}

const text = (t: Partial<BoardText> & Pick<BoardText, 'id' | 'title' | 'status'>): BoardText => ({
  type: 'note',
  origin: 'own',
  space: null,
  collection: null,
  hidden: false,
  favorite: false,
  updatedAt: '2026-11-01T14:00:00.000Z',
  review: null,
  ...t,
});

/** In the board's order (which places each planet on its ring). Times as the board says them on 03/11/2026 21:05. */
const BOARD_TEXTS: BoardText[] = [
  text({ id: 'c0800000-0000-4000-8000-000000000001', title: 'Máy mới xin IP thế nào', status: 'approved', origin: 'community', space: NET, collection: { id: 'c0800000-0000-4000-8000-0000000000c0', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' }, favorite: true }),
  text({ id: 'c0800000-0000-4000-8000-000000000002', title: 'Ghi chú: swap trên Ubuntu', status: 'pending', origin: 'community', space: LNX, updatedAt: '2026-11-03T13:05:00.000Z' }),
  text({
    id: 'c0800000-0000-4000-8000-000000000003',
    title: 'TCP vs UDP bằng hình',
    status: 'changes_requested',
    space: NET,
    collection: { id: 'c0800000-0000-4000-8000-0000000000c1', nameVi: 'Web', nameEn: 'Web' },
    updatedAt: '2026-11-02T14:00:00.000Z',
    review: { action: 'changes_requested', reason: 'Thêm link RFC 793 cho phần bắt tay 3 bước nhé.', by: 'Linh', at: '2026-11-02T09:00:00.000Z' },
  }),
  text({ id: 'c0800000-0000-4000-8000-000000000004', title: 'lab-notes.docx', type: 'office', status: 'private', updatedAt: '2026-11-03T14:05:00.000Z' }),
  text({ id: 'c0800000-0000-4000-8000-000000000005', title: 'subnet.xlsx', type: 'office', status: 'draft', updatedAt: '2026-10-31T14:05:00.000Z' }),
  text({ id: 'c0800000-0000-4000-8000-000000000006', title: 'Máy mới vào mạng', type: 'journey', status: 'approved', origin: 'community', space: NET, favorite: true, updatedAt: '2026-10-27T14:05:00.000Z' }),
  text({ id: 'c0800000-0000-4000-8000-000000000007', title: 'k8s-intro.pptx', type: 'office', status: 'approved', origin: 'community', space: K8S, hidden: true, updatedAt: '2026-10-29T14:05:00.000Z' }),
  text({
    id: 'c0800000-0000-4000-8000-000000000008',
    title: 'Mẹo DNS cache',
    status: 'rejected',
    updatedAt: '2026-10-30T14:05:00.000Z',
    review: { action: 'rejected', reason: 'Nội dung nói về trình duyệt hơn là DNS.', by: 'Linh', at: '2026-10-30T14:05:00.000Z' },
  }),
];

/** /api/me/documents of the board, with the account's own personal Space where the board says "Vũ trụ của bạn". */
export function c08Documents(personal: Space): { documents: unknown[] } {
  return {
    documents: BOARD_TEXTS.map(({ space, ...t }) => ({
      ...t,
      lang: 'vi',
      aiTranslated: false,
      authorName: 'Đạt',
      translations: ['vi'],
      collectionId: t.collection?.id ?? null,
      space: space ?? personal,
      readProgress: null,
      planet: null,
    })),
  };
}

/** The seed's "now" of C08 (03/11/2026 21:05 in Saigon): "sửa hôm qua", "Xoá 3 ngày trước". */
export const C08_CLOCK = '2026-11-03T14:05:00.000Z';
