/**
 * Boards A02 and A03 draw the admin station with sample texts the seed does not hold (thirteen published texts in
 * four Spaces, an admin token and its calls), and the E2E account is no admin.
 * So the shots answer /api/me as an admin's and the admin API with the boards' data; the screens are the real ones
 * (apps/web/src/pages/admin-*-screen.tsx; their states are checked in admin-screens.test.tsx).
 */
const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const LNX = { slug: 'linux', nameVi: 'Linux', nameEn: 'Linux', tint: '#A5F3FC', glow: '#22D3EE' };
const K8S = { slug: 'kubernetes', nameVi: 'Kubernetes', nameEn: 'Kubernetes', tint: '#93C5FD', glow: '#3B82F6' };
const OBS = { slug: 'observability', nameVi: 'Observability', nameEn: 'Observability', tint: '#86EFAC', glow: '#10B981' };

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
