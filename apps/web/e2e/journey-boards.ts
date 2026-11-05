/**
 * The journey "Máy mới vào mạng" as boards C07 (its builder, five steps, step 2 picked, Jev's three next steps and the
 * documents to pick from) and Flow (its run, two steps done, ARP to do) draw it. Answered here: the seed's journey of
 * the same name walks other steps (its "bước N" relations), the E2E account may not build an official journey, and
 * E2E has no Jev key.
 */
import type { Journey, JourneyStep, NextStep, PoolDocument } from '../src/api/journey-api';

/** The seed's official "Máy mới vào mạng" (seedId('document:new-host')). */
export const JOURNEY_ID = 'd2d1e302-5577-41ea-8b8f-b4fa399f2b1f';

const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const OBS = { slug: 'observability', nameVi: 'Observability', nameEn: 'Observability', tint: '#86EFAC', glow: '#10B981' };

const doc = (id: string, title: string, type: PoolDocument['type'] = 'lab', space = NET): PoolDocument => ({ id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`, title, type, space });

const PJ = doc('1', 'Packet Journey');
const DHCP = doc('2', 'Giao thức DHCP');
const ARP = doc('3', 'ARP');
const DNS = doc('4', 'DNS');
const HTTP = doc('5', 'HTTP');
const ICMP = doc('6', 'Ping kiểm tra đường');
const TCP = doc('7', 'TCP hay UDP?');
const QUIZ = doc('8', 'Câu hỏi kiểm tra: DORA', 'note');
const SUBNET = doc('9', 'Subnet & CIDR');
const LOGS = doc('10', 'Xem log mạng', 'lab', OBS);

const step = (n: number, kind: JourneyStep['kind'], title: string, minutes: number, document: PoolDocument | null, note: string | null = null, done = false): JourneyStep => ({
  id: `00000000-0000-4000-8000-1000000000${String(n).padStart(2, '0')}`,
  kind,
  title,
  restricted: false,
  minutes,
  note,
  document: document ? { ...document, summary: null } : null,
  done,
});

const BASE = {
  id: JOURNEY_ID,
  title: 'Máy mới vào mạng',
  lang: 'vi',
  planet: null,
  rev: '2026-11-03T14:05:00.000Z',
  space: { ...NET, kind: 'public' },
  jev: true,
} as const;

/** C07: the five steps of the board, an author's draft in Networking. */
export const C07_JOURNEY: Journey = {
  ...BASE,
  origin: 'own',
  status: 'draft',
  mine: true,
  editable: true,
  steps: [
    step(1, 'read', 'Packet Journey', 4, PJ),
    step(2, 'lab', 'DHCP xin IP', 12, DHCP),
    step(3, 'read', 'ARP tìm MAC router', 6, ARP),
    step(4, 'read', 'DNS đổi tên ra IP', 8, DNS),
    step(5, 'quiz', 'HTTP mở trang web', 5, HTTP),
  ],
};

export const C07_POOL: PoolDocument[] = [PJ, DHCP, ARP, DNS, HTTP, ICMP, TCP, SUBNET, LOGS];

export const C07_NEXT: NextStep[] = [
  { ...ICMP, probability: 0.88 },
  { ...TCP, probability: 0.81 },
  { ...QUIZ, probability: 0.77 },
];

/** Flow: the official journey run by the E2E account, two steps done, ARP to do. */
export const FLOW_JOURNEY: Journey = {
  ...BASE,
  origin: 'official',
  status: 'approved',
  mine: false,
  editable: false,
  jev: false,
  steps: [
    step(1, 'read', 'Cắm mạng', 4, PJ, 'Máy mới vào mạng. Chưa có IP, chưa biết ai.', true),
    step(2, 'lab', 'DHCP', 12, DHCP, 'Hét lên cả mạng: ai cấp IP cho mình với?', true),
    step(3, 'lab', 'ARP', 6, ARP, 'Hỏi: router ở địa chỉ MAC nào?'),
    step(4, 'lab', 'DNS', 8, DNS, 'Đổi tên miền thành địa chỉ IP.'),
    step(5, 'lab', 'HTTP', 5, HTTP, 'Gửi GET, nhận trang web. Xong!'),
  ],
};
