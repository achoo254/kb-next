/**
 * Boards A01–A03 draw the admin station with sample texts the seed does not hold (seven texts waiting from five
 * members, thirteen published texts in four Spaces, an admin token and its calls), and the E2E account is no admin.
 * So the shots answer /api/me as an admin's and the admin API with the boards' data; the screens are the real ones
 * (apps/web/src/pages/admin-*-screen.tsx; their states are checked in admin-screens.test.tsx).
 */
const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const LNX = { slug: 'linux', nameVi: 'Linux', nameEn: 'Linux', tint: '#A5F3FC', glow: '#22D3EE' };
const K8S = { slug: 'kubernetes', nameVi: 'Kubernetes', nameEn: 'Kubernetes', tint: '#93C5FD', glow: '#3B82F6' };
const OBS = { slug: 'observability', nameVi: 'Observability', nameEn: 'Observability', tint: '#86EFAC', glow: '#10B981' };

/** 03/11/2026 21:05 in Saigon: "5 phút trước", "hôm qua". */
export const A01_CLOCK = '2026-11-03T14:05:00.000Z';
const minutesBefore = (clock: string, minutes: number): string => new Date(Date.parse(clock) - minutes * 60_000).toISOString();

const id = (n: number): string => `a0100000-0000-4000-8000-00000000000${n}`;
export const A01_FIRST_ID = id(1);

const queued = (n: number, title: string, author: string, type: string, minutes: number, space: typeof NET, scores: [number, number, number, number]) => ({
  id: id(n),
  title,
  type,
  lang: 'vi',
  origin: 'own',
  authorName: author,
  submittedAt: minutesBefore(A01_CLOCK, minutes),
  updatedAt: minutesBefore(A01_CLOCK, minutes),
  space,
  collection: n === 1 ? { id: 'a01c0000-0000-4000-8000-000000000001', nameVi: 'TCP/UDP', nameEn: 'TCP/UDP' } : null,
  tags: n === 1 ? ['tcp', 'udp', 'so sánh'] : [],
  preReview: { onTopic: scores[0], hasSources: scores[1], duplicate: scores[2], inappropriate: scores[3], duplicateOf: null },
});

export const A01_QUEUE = {
  documents: [
    queued(1, 'TCP vs UDP bằng hình', 'Minh', 'note', 5, NET, [0.92, 0.71, 0.12, 0.03]),
    queued(2, 'Ghi chú: swap trên Ubuntu', 'Lan', 'note', 18, LNX, [0.95, 0.88, 0.41, 0.02]),
    queued(3, 'DNS cache poisoning.pptx', 'Huy', 'office', 60, NET, [0.81, 0.22, 0.08, 0.05]),
    queued(4, 'Lối đi: Ping tới Google', 'Tú', 'journey', 120, NET, [0.9, 0.93, 0.18, 0.01]),
    queued(5, 'K8s cho người mới.docx', 'An', 'office', 1500, K8S, [0.89, 0.6, 0.67, 0.02]),
    queued(6, 'Subnet bằng ngón tay', 'Vy', 'note', 1560, NET, [0.94, 0.77, 0.09, 0.04]),
    queued(7, 'syslog đọc nhanh', 'Khoa', 'note', 2880, LNX, [0.91, 0.69, 0.15, 0.02]),
  ],
};

const T = A01_CLOCK;
const summary = (docId: string, title: string, type: string) => ({
  id: docId,
  title,
  type,
  origin: 'official',
  status: 'approved',
  lang: 'vi',
  aiTranslated: false,
  updatedAt: T,
  authorName: 'Đạt',
  translations: ['vi'],
  collectionId: null,
  space: NET,
  readProgress: 0,
});

/** The first text as the reader API gives it to an admin: its lead, three sections, the lab it builds on. */
export const A01_DOCUMENT = {
  lang: 'vi',
  translationAvailable: true,
  document: {
    ...summary(A01_FIRST_ID, 'TCP vs UDP bằng hình', 'note'),
    origin: 'own',
    status: 'pending',
    authorName: 'Minh',
    sourceUrl: null,
    createdAt: T,
    readingMinutes: 2,
    reviewedBy: null,
    readAnchor: null,
    collection: { id: 'a01c0000-0000-4000-8000-000000000001', nameVi: 'TCP/UDP', nameEn: 'TCP/UDP' },
    space: { ...NET, art: '/art/crystal-networking.webp', kind: 'public' },
  },
  translations: [{ id: A01_FIRST_ID, lang: 'vi', aiTranslated: false }],
  toc: [],
  chunks: [
    { anchor: 'tong-quan', heading: null, markdown: 'So sánh bắt tay 3 lần với gửi luôn.' },
    { anchor: 'syn', heading: 'SYN', markdown: 'Mở kết nối.' },
    { anchor: 'ack', heading: 'ACK', markdown: 'Xác nhận.' },
    { anchor: 'udp', heading: 'UDP', markdown: 'Gửi luôn, không chờ.' },
  ],
  backlinks: [],
  outgoing: [{ kind: 'wikilink', label: null, document: summary('a0100000-0000-4000-8000-0000000000a1', 'Lab TCP/UDP', 'lab') }],
  wikilinks: [],
  related: [],
  versions: [],
  file: null,
};

const pid = (n: number): string => `a0200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const post = (n: number, title: string, space: typeof NET, art: string, rest: Record<string, unknown> = {}) => ({
  id: pid(n),
  title,
  type: 'lab',
  lang: 'vi',
  origin: 'official',
  hidden: false,
  authorName: 'Đạt',
  createdAt: '2026-11-02T03:00:00.000Z',
  updatedAt: '2026-11-02T03:00:00.000Z',
  opens: 128,
  aiMade: true,
  translations: ['vi'],
  space: { ...space, art },
  collection: null,
  tags: [],
  ...rest,
});
const net = '/art/crystal-networking.webp';
const lnx = '/art/crystal-linux.webp';
const k8s = '/art/crystal-kubernetes.webp';
const obs = '/art/crystal-observability.webp';

/** In ring order (clockwise from the top), the middle one last: where board A02 draws them. */
export const A02_PUBLISHED = {
  documents: [
    post(1, 'Giao thức DHCP', NET, net, { translations: ['vi', 'en'], tags: ['dhcp', 'dora'] }),
    post(2, 'Tìm hiểu giao thức DNS', NET, net, { translations: ['vi', 'en'] }),
    post(3, 'Tìm hiểu HTTP', NET, net, { translations: ['vi', 'en'] }),
    post(4, 'Subnet bằng ngón tay', NET, net, { origin: 'community', authorName: 'Vy', aiMade: false, createdAt: '2026-11-01T03:00:00.000Z' }),
    post(5, 'TCP vs UDP bằng hình', NET, net, { origin: 'community', authorName: 'Minh', aiMade: false, createdAt: '2026-11-03T03:00:00.000Z' }),
    post(6, 'Giao thức ARP', NET, net),
    post(7, 'ICMP Ping', NET, net),
    post(10, 'Bài tập: swap', LNX, lnx),
    post(8, 'Ghi chú: swap trên Ubuntu', LNX, lnx, { origin: 'community', authorName: 'Lan', aiMade: false, hidden: true }),
    post(9, 'Bài tập: syslog', LNX, lnx),
    post(11, 'Kiến trúc cụm K8s', K8S, k8s),
    post(12, 'Dựng cụm K8s từng bước', K8S, k8s),
    post(13, 'VictoriaLogs', OBS, obs),
  ],
};

/** 03/11/2026 21:40 in Saigon: the token used at 21:31, the log from 21:31 back to 20:58. */
export const A03_CLOCK = '2026-11-03T14:40:00.000Z';
const at = (hhmm: string): string => `2026-11-03T${String(Number(hhmm.slice(0, 2)) - 7).padStart(2, '0')}:${hhmm.slice(3)}:00.000Z`;

export const A03_TOKENS = {
  tokens: [{ id: 'a0300000-0000-4000-8000-000000000001', label: 'pipeline AI', last4: '7f2a', createdAt: '2026-11-02T03:00:00.000Z', lastUsedAt: at('21:31'), revokedAt: null, createdByName: 'Đạt' }],
};

export const A03_CALLS = {
  calls: [
    { id: 'c1', method: 'POST', path: '/api/admin/posts', status: 201, error: null, document: { id: pid(7), title: 'ICMP Ping' }, at: at('21:31') },
    { id: 'c2', method: 'POST', path: '/api/admin/posts', status: 201, error: null, document: { id: pid(1), title: 'Giao thức DHCP' }, at: at('21:30') },
    { id: 'c3', method: 'POST', path: '/api/admin/posts', status: 400, error: 'invalid-body', document: null, at: at('21:28') },
    { id: 'c4', method: 'PATCH', path: `/api/admin/posts/${pid(10)}`, status: 200, error: null, document: { id: pid(10), title: 'Bài tập swap (cũ)' }, at: at('21:12') },
    { id: 'c5', method: 'POST', path: '/api/admin/posts', status: 401, error: 'invalid-token', document: null, at: at('20:58') },
  ],
};
