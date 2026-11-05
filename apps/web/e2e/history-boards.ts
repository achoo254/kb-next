/**
 * Board C17 draws the history of DHCP as its author or an admin sees it (Đạt, "Quản trị"). The E2E account is an
 * ordinary reader, who sees only the current version and its approval (apps/server/src/access/history.ts), so the
 * shot answers the history and the v3 ⇄ v4 comparison with what the API gives an admin for the seed
 * (apps/server/src/api/history-routes.test.ts checks those answers against the seed).
 */
import { C13_DHCP_ID } from './graph-canvas-boards';

const dat = { name: 'Đạt', role: 'admin' } as const;
const linh = { name: 'Linh', role: 'reviewer' } as const;
const aiVersion = (version: number, at: string) => ({ kind: 'version', at, actor: dat, version, via: 'api', aiMade: true, summary: null, restoredFrom: null, proposal: false });

export const C17_HISTORY = {
  document: {
    id: C13_DHCP_ID,
    title: 'Giao thức DHCP',
    status: 'approved',
    origin: 'official',
    space: { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6', kind: 'public' },
    collection: { id: 'c1d1b6ec-2a7f-4c2e-8f7b-0d1c3c5e1a01', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' },
  },
  scope: 'full',
  canRestore: true,
  currentVersion: 4,
  events: [
    { kind: 'visibility', at: '2026-11-03T14:40:00.000Z', actor: dat, hidden: false },
    { kind: 'visibility', at: '2026-11-03T14:12:00.000Z', actor: dat, hidden: true },
    { kind: 'review', at: '2026-11-03T03:02:00.000Z', actor: linh, action: 'approved', reason: null, version: 4 },
    {
      kind: 'version',
      at: '2026-11-02T14:30:00.000Z',
      actor: { name: 'Minh', role: 'member' },
      version: 4,
      via: 'editor',
      aiMade: false,
      summary: 'thêm đoạn lease và DHCP snooping',
      restoredFrom: null,
      proposal: true,
    },
    { kind: 'review', at: '2026-11-02T02:00:00.000Z', actor: linh, action: 'changes_requested', reason: 'thiếu nguồn cho đoạn broadcast', version: 3 },
    aiVersion(3, '2026-10-31T07:05:00.000Z'),
    aiVersion(2, '2026-10-29T13:40:00.000Z'),
    aiVersion(1, '2026-10-28T02:12:00.000Z'),
  ],
};

export const C17_DIFF = {
  from: 3,
  to: 4,
  added: 3,
  removed: 1,
  lines: [
    { op: 'same', text: 'Vì chưa có IP, máy mới không biết server DHCP ở đâu, nên gửi gói tới 255.255.255.255 cho mọi máy trong mạng cùng nghe. Chỉ server DHCP trả lời.', heading: false },
    { op: 'add', text: 'Lease và gia hạn', heading: true },
    { op: 'add', text: 'IP chỉ được cho mượn có hạn. Tới nửa thời hạn, máy tự xin gia hạn với đúng server đã cấp.', heading: false },
    { op: 'same', text: 'Rủi ro: DHCP giả mạo', heading: true },
    { op: 'del', text: 'Một máy lạ trả lời nhanh hơn có thể đưa gateway sai.', heading: false },
    { op: 'add', text: 'Một máy lạ trả lời nhanh hơn có thể đưa gateway sai. Switch nên bật DHCP snooping.', heading: false },
  ],
};
