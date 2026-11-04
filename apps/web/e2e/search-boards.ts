/**
 * The search answers boards C12 and F01 show, in the API's shape (apps/server/src/api/search-routes.ts), for the
 * parity shots: E2E runs without Meilisearch and without a Jev key, so the screens are held in the boards' default
 * state ("cấp phát ip" on C12, "dhcp" in the ⌘K palette) by answering /api/search with these. Titles, places and
 * excerpts are the boards'; origins follow the one-official-label rule (no "Chính thức · AI tạo").
 */
type Part = string | { hit: string };

const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const LINUX = { slug: 'linux', nameVi: 'Linux', nameEn: 'Linux', tint: '#A5F3FC', glow: '#22D3EE' };
const MINE = { slug: 'personal-e2e', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: '#F9A8D4', glow: '#EC4899' };

function parts(list: readonly Part[]): Array<{ text: string; hit: boolean }> {
  return list.map((p) => (typeof p === 'string' ? { text: p, hit: false } : { text: p.hit, hit: true }));
}

interface Row {
  id: string;
  title: string;
  titleParts?: readonly Part[];
  space: typeof NET;
  collection: string | null;
  type: 'lab' | 'note' | 'office';
  origin: 'official' | 'community' | 'own';
  translations: Array<'vi' | 'en'>;
  author?: string;
  heading?: string;
  snippet: readonly Part[];
  relevance?: number;
}

function result(row: Row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    origin: row.origin,
    status: row.origin === 'own' ? 'private' : 'approved',
    lang: 'vi',
    aiTranslated: false,
    updatedAt: '2026-11-03T14:05:00.000Z',
    authorName: row.author ?? 'Đạt',
    translations: row.translations,
    collectionId: row.collection ? `${row.id}-c` : null,
    space: row.space,
    readProgress: 0,
    collection: row.collection ? { id: `${row.id}-c`, nameVi: row.collection, nameEn: row.collection } : null,
    anchor: 'tong-quan',
    heading: row.heading ?? null,
    titleParts: parts(row.titleParts ?? [row.title]),
    snippet: parts(row.snippet),
    match: row.relevance === undefined ? 'keyword' : 'meaning',
    relevance: row.relevance ?? null,
  };
}

function answer(query: string, groups: Array<{ space: typeof NET; kind: 'public' | 'personal'; art: string; rows: Row[] }>, suggestions: string[]) {
  const results = groups.flatMap((g) => g.rows);
  return {
    query,
    exact: false,
    keyword: 'ok',
    meaning: 'ok',
    total: results.length,
    groups: groups.map((g) => ({ space: { ...g.space, kind: g.kind, art: g.art }, results: g.rows.map(result) })),
    origins: {
      official: results.filter((r) => r.origin === 'official').length,
      community: results.filter((r) => r.origin === 'community').length,
      own: results.filter((r) => r.origin === 'own').length,
    },
    variants: null,
    suggestions,
  };
}

/** Board C12, "cấp phát ip": 7 results in Networking, Linux and the reader's own Space. */
export const C12_SEARCH = answer(
  'cấp phát ip',
  [
    {
      space: NET,
      kind: 'public',
      art: '/art/crystal-networking.webp',
      rows: [
        { id: 'c12-dhcp', title: 'Giao thức DHCP', space: NET, collection: 'Giao thức nền tảng', type: 'lab', origin: 'official', translations: ['vi'], snippet: ['Máy mới chưa có IP nên phải xin ', { hit: 'cấp phát IP' }, ' qua 4 bước DORA: Discover, Offer, Request, Acknowledge.'] },
        { id: 'c12-static', title: 'Đặt IP tĩnh hay để DHCP?', space: NET, collection: 'Giao thức nền tảng', type: 'note', origin: 'community', author: 'Minh', translations: ['vi'], snippet: ['Server nên đặt IP tĩnh, máy khách để DHCP ', { hit: 'cấp phát' }, ' tự động.'] },
        { id: 'c12-subnet', title: 'Subnet & CIDR', space: NET, collection: 'Địa chỉ', type: 'lab', origin: 'official', translations: ['vi', 'en'], snippet: ['Mạng /24 có 254 địa chỉ ', { hit: 'IP' }, ' dùng được để ', { hit: 'cấp phát' }, ' cho máy.'] },
        { id: 'c12-journey', title: 'Packet Journey', space: NET, collection: 'Hành trình gói tin', type: 'lab', origin: 'official', translations: ['vi'], snippet: ['Bước đầu tiên: máy nhận địa chỉ từ DHCP server trước khi gửi gói tin đầu tiên.'], relevance: 0.82 },
      ],
    },
    {
      space: LINUX,
      kind: 'public',
      art: '/art/crystal-linux.webp',
      rows: [
        { id: 'c12-syslog', title: 'syslog', space: LINUX, collection: 'Bài tập', type: 'lab', origin: 'official', translations: ['vi'], snippet: ['Đọc log dhclient để biết máy đã nhận ', { hit: 'IP' }, ' lúc nào.'], relevance: 0.64 },
        { id: 'c12-boot', title: 'boot', space: LINUX, collection: 'Bài tập', type: 'lab', origin: 'official', translations: ['vi'], snippet: ['Lúc khởi động, dịch vụ mạng xin địa chỉ ', { hit: 'IP' }, ' trước các dịch vụ khác.'], relevance: 0.58 },
      ],
    },
    {
      space: MINE,
      kind: 'personal',
      art: '/art/crystal-personal.webp',
      rows: [{ id: 'c12-notes', title: 'lab-notes.docx', space: MINE, collection: 'Ghi chú', type: 'office', origin: 'own', translations: ['vi'], snippet: ['DORA = quy trình ', { hit: 'cấp phát IP' }, ' tự động, có thời hạn thuê (lease).'] }],
    },
  ],
  ['DHCP lease', 'IP tĩnh và IP động'],
);

/** Board F01, "dhcp": keyword matches in Networking and the reader's own Space, two results by meaning. */
export const F01_SEARCH = answer(
  'dhcp',
  [
    {
      space: NET,
      kind: 'public',
      art: '/art/crystal-networking.webp',
      rows: [
        { id: 'f01-dhcp', title: 'Giao thức DHCP', titleParts: ['Giao thức ', { hit: 'DHCP' }], space: NET, collection: 'Giao thức nền tảng', type: 'lab', origin: 'official', translations: ['vi', 'en'], snippet: ['Máy mới chưa có IP. Nó xin IP qua 4 bước DORA.'] },
        { id: 'f01-spoof', title: 'Rủi ro: DHCP giả mạo', titleParts: ['Rủi ro: ', { hit: 'DHCP' }, ' giả mạo'], space: NET, collection: 'Giao thức nền tảng', type: 'note', origin: 'community', author: 'Minh', translations: ['vi'], snippet: ['Một máy lạ trả lời nhanh hơn có thể đưa gateway sai.'] },
        { id: 'f01-journey', title: 'Packet Journey', space: NET, collection: 'Hành trình gói tin', type: 'lab', origin: 'official', translations: ['vi'], heading: 'Máy mới cần IP trước khi gửi gói tin', snippet: ['Máy mới cần IP trước khi gửi gói tin.'], relevance: 0.82 },
        { id: 'f01-arp', title: 'ARP', space: NET, collection: 'Giao thức nền tảng', type: 'lab', origin: 'official', translations: ['vi'], heading: 'Bước tiếp theo sau khi có IP', snippet: ['Bước tiếp theo sau khi có IP.'], relevance: 0.64 },
      ],
    },
    {
      space: MINE,
      kind: 'personal',
      art: '/art/crystal-personal.webp',
      rows: [{ id: 'f01-notes', title: 'lab-notes.docx · Ghi chú: DHCP', titleParts: ['lab-notes.docx · Ghi chú: ', { hit: 'DHCP' }], space: MINE, collection: null, type: 'office', origin: 'own', translations: ['vi'], snippet: ['Ghi chú của bạn khi làm lab DHCP.'] }],
    },
  ],
  [],
);

/** The Spaces of board C12's filter, in its order (the seed has seven; the board lists five). */
export const C12_SPACES = {
  spaces: [
    { ...NET, art: '/art/crystal-networking.webp', kind: 'public', caption: { vi: '8 lab', en: '8 labs' }, documentCount: 8, collectionCount: 4, collections: [] },
    { ...LINUX, art: '/art/crystal-linux.webp', kind: 'public', caption: { vi: '3 bài tập', en: '3 exercises' }, documentCount: 3, collectionCount: 3, collections: [] },
    { slug: 'docker', nameVi: 'Docker', nameEn: 'Docker', tint: '#FCD34D', glow: '#F59E0B', art: '/art/crystal-docker.webp', kind: 'public', caption: { vi: '3 phần', en: '3 parts' }, documentCount: 3, collectionCount: 3, collections: [] },
    { slug: 'kubernetes', nameVi: 'Kubernetes', nameEn: 'Kubernetes', tint: '#93C5FD', glow: '#3B82F6', art: '/art/crystal-kubernetes.webp', kind: 'public', caption: { vi: '2 bài', en: '2 docs' }, documentCount: 2, collectionCount: 2, collections: [] },
    { ...MINE, art: '/art/crystal-personal.webp', kind: 'personal', caption: { vi: '3 tệp · riêng tư', en: '3 files · private' }, documentCount: 3, collectionCount: 0, collections: [] },
  ],
};
