/**
 * Dev seed matching the mock: the 7 Spaces of board C09 (names, crystal colours and art, what they count) and the
 * collections and documents of board C10 (Networking), plus enough documents in the other Spaces for their
 * crystal captions ("8 lab", "2 bài", "3 bài tập", "1 lab", "3 phần", "5 tuần", "3 tệp · riêng tư").
 * `owner` is the account reading the dev app ("Của bạn"): SEED_OWNER_SUB, else the seed admin.
 */

export type SeedAuthor = 'dat' | 'linh' | 'minh' | 'an' | 'owner';

export const SEED_USERS: ReadonlyArray<{ key: Exclude<SeedAuthor, 'owner'>; sub: string; name: string; role: 'member' | 'reviewer' }> = [
  { key: 'dat', sub: 'seed:dat', name: 'Đạt', role: 'member' },
  { key: 'linh', sub: 'seed:linh', name: 'Linh', role: 'reviewer' },
  { key: 'minh', sub: 'seed:minh', name: 'Minh', role: 'member' },
  { key: 'an', sub: 'seed:an', name: 'An', role: 'member' },
];

export interface SeedCollection {
  vi: string;
  en: string;
  tint?: string;
  glow?: string;
  art?: string;
}

export interface SeedSpace {
  key: string;
  /** Personal Spaces get `personal-<owner id>`. */
  slug: string | null;
  vi: string;
  en: string;
  tint: string;
  glow: string;
  art: string;
  kind: 'public' | 'personal';
  unitVi: string;
  unitEn: string;
  /** The crystal caption board C09 shows (stored with KB_SEED=mock, see src/captions/seed-captions.ts). */
  caption: { vi: string; en: string };
  collections: SeedCollection[];
}

export const SEED_SPACES: SeedSpace[] = [
  {
    key: 'net',
    slug: 'networking',
    vi: 'Networking',
    en: 'Networking',
    tint: '#C4B5FD',
    glow: '#8B5CF6',
    art: '/art/crystal-networking.webp',
    kind: 'public',
    unitVi: 'lab',
    unitEn: 'labs',
    caption: { vi: '8 lab', en: '8 labs' },
    collections: [
      { vi: 'Giao thức nền tảng', en: 'Core protocols', tint: '#C4B5FD', glow: '#8B5CF6', art: '/art/crystal-networking.webp' },
      { vi: 'Web', en: 'Web', tint: '#A5F3FC', glow: '#22D3EE', art: '/art/crystal-linux.webp' },
      { vi: 'Địa chỉ', en: 'Addressing', tint: '#F0ABFC', glow: '#C026D3', art: '/art/crystal-weekly.webp' },
      { vi: 'Hành trình gói tin', en: 'Packet journey', tint: '#93C5FD', glow: '#3B82F6', art: '/art/crystal-kubernetes.webp' },
    ],
  },
  {
    key: 'k8s',
    slug: 'kubernetes',
    vi: 'Kubernetes',
    en: 'Kubernetes',
    tint: '#93C5FD',
    glow: '#3B82F6',
    art: '/art/crystal-kubernetes.webp',
    kind: 'public',
    unitVi: 'bài',
    unitEn: 'articles',
    caption: { vi: '2 bài', en: '2 docs' },
    collections: [
      { vi: 'Kiến trúc cụm', en: 'Cluster architecture' },
      { vi: 'Dựng từng bước', en: 'Step by step' },
    ],
  },
  {
    key: 'lnx',
    slug: 'linux',
    vi: 'Linux',
    en: 'Linux',
    tint: '#A5F3FC',
    glow: '#22D3EE',
    art: '/art/crystal-linux.webp',
    kind: 'public',
    unitVi: 'bài tập',
    unitEn: 'exercises',
    caption: { vi: '3 bài tập', en: '3 exercises' },
    collections: [
      { vi: 'syslog', en: 'syslog' },
      { vi: 'boot', en: 'boot' },
      { vi: 'swap', en: 'swap' },
    ],
  },
  {
    key: 'obs',
    slug: 'observability',
    vi: 'Observability',
    en: 'Observability',
    tint: '#86EFAC',
    glow: '#10B981',
    art: '/art/crystal-observability.webp',
    kind: 'public',
    unitVi: 'lab',
    unitEn: 'labs',
    caption: { vi: '1 lab', en: '1 lab' },
    collections: [
      { vi: 'VictoriaLogs', en: 'VictoriaLogs' },
      { vi: 'LogsQL', en: 'LogsQL' },
    ],
  },
  {
    key: 'dkr',
    slug: 'docker',
    vi: 'Docker',
    en: 'Docker',
    tint: '#FDE68A',
    glow: '#F59E0B',
    art: '/art/crystal-docker.webp',
    kind: 'public',
    unitVi: 'phần',
    unitEn: 'parts',
    caption: { vi: '3 phần', en: '3 parts' },
    collections: [
      { vi: 'Cơ bản', en: 'Basics' },
      { vi: 'Storage & Build', en: 'Storage & Build' },
      { vi: 'Compose', en: 'Compose' },
    ],
  },
  {
    key: 'wk',
    slug: 'weekly',
    vi: 'Học hàng tuần',
    en: 'Weekly learning',
    tint: '#F0ABFC',
    glow: '#C026D3',
    art: '/art/crystal-weekly.webp',
    kind: 'public',
    unitVi: 'tuần',
    unitEn: 'weeks',
    caption: { vi: '5 tuần', en: '5 weeks' },
    collections: ['11-07', '18-07', '01-08', '08-08', '17-09'].map((week) => ({ vi: week, en: week })),
  },
  {
    key: 'me',
    slug: null,
    vi: 'Vũ trụ của bạn',
    en: 'Your universe',
    tint: '#F9A8D4',
    glow: '#EC4899',
    art: '/art/crystal-personal.webp',
    kind: 'personal',
    unitVi: 'tệp',
    unitEn: 'files',
    caption: { vi: '3 tệp · riêng tư', en: '3 files · private' },
    collections: [],
  },
];

export interface SeedDocument {
  key: string;
  space: string;
  /** Index into the Space's collections; null for none. */
  collection: number | null;
  title: string;
  type: 'lab' | 'note' | 'process' | 'office' | 'web' | 'journey';
  origin: 'official' | 'community' | 'own';
  status: 'draft' | 'private' | 'pending' | 'changes_requested' | 'rejected' | 'approved';
  author: SeedAuthor;
  /** [anchor, heading, text] */
  chunks: Array<[string, string, string]>;
}

const official = { origin: 'official', status: 'approved', author: 'dat' } as const;
const mine = { origin: 'own', status: 'private', author: 'owner' } as const;

export const SEED_DOCUMENTS: SeedDocument[] = [
  // Networking · Giao thức nền tảng (C10, in its order)
  {
    key: 'arp', space: 'net', collection: 0, title: 'Giao thức ARP', type: 'lab', ...official,
    chunks: [
      ['arp-la-gi', 'ARP là gì', 'ARP (Address Resolution Protocol) tìm địa chỉ MAC ứng với một địa chỉ IP trong cùng mạng cục bộ.'],
      ['arp-request-reply', 'ARP request và reply', 'Máy hỏi bằng gói broadcast "ai giữ IP này?", máy giữ IP đó trả lời bằng gói unicast kèm địa chỉ MAC của nó.'],
    ],
  },
  {
    key: 'dhcp', space: 'net', collection: 0, title: 'Giao thức DHCP', type: 'lab', ...official,
    chunks: [
      ['dhcp-la-gi', 'DHCP là gì', 'DHCP cấp địa chỉ IP, mặt nạ mạng, gateway và DNS cho máy vừa vào mạng, không cần cấu hình tay.'],
      ['dora', 'DORA 4 bước', 'Discover, Offer, Request, Acknowledge: máy mới phát Discover, máy chủ DHCP gửi Offer, máy chọn một Offer bằng Request và nhận ACK.'],
      ['thoi-han-thue', 'Thời hạn thuê', 'Địa chỉ được cho thuê có thời hạn; quá nửa thời hạn máy gửi Request để gia hạn.'],
    ],
  },
  {
    key: 'dns', space: 'net', collection: 0, title: 'Tìm hiểu giao thức DNS', type: 'lab', ...official,
    chunks: [
      ['dns-la-gi', 'DNS là gì', 'DNS đổi tên miền như kb.hoandat.com thành địa chỉ IP, giống danh bạ của Internet.'],
      ['phan-giai', 'Phân giải đệ quy', 'Resolver hỏi lần lượt máy chủ gốc, máy chủ TLD rồi máy chủ có thẩm quyền, và lưu kết quả theo TTL.'],
    ],
  },
  {
    key: 'icmp', space: 'net', collection: 0, title: 'ICMP Ping', type: 'lab', ...official,
    chunks: [
      ['ping', 'Ping hoạt động thế nào', 'Ping gửi gói ICMP Echo Request và chờ Echo Reply để đo máy đích có trả lời không và mất bao lâu.'],
      ['ttl', 'TTL và traceroute', 'Mỗi router giảm TTL đi một; về 0 thì gói bị bỏ và router báo lại bằng ICMP Time Exceeded, traceroute dựa vào điều này.'],
    ],
  },
  {
    key: 'dhcp-spoof', space: 'net', collection: 0, title: 'Ghi chú: DHCP giả mạo', type: 'note', origin: 'community', status: 'approved', author: 'minh',
    chunks: [['rogue-dhcp', 'Máy chủ DHCP giả', 'Một máy chủ DHCP lạ trong mạng có thể trả gateway giả để nghe lén; bật DHCP snooping trên switch để chặn.']],
  },
  {
    key: 'dhcp-home', space: 'net', collection: 0, title: 'DHCP trên router nhà', type: 'note', ...mine,
    chunks: [['router-nha', 'Router nhà', 'Router nhà cấp dải 192.168.1.100 đến 192.168.1.200; đặt địa chỉ cố định cho máy in bằng cách gắn MAC.']],
  },
  {
    key: 'arp-ndp', space: 'net', collection: 0, title: 'So sánh ARP và NDP', type: 'note', origin: 'community', status: 'pending', author: 'owner',
    chunks: [['arp-ndp', 'ARP và NDP', 'IPv6 không dùng ARP: NDP dùng ICMPv6 Neighbor Solicitation và Neighbor Advertisement để tìm địa chỉ MAC.']],
  },
  // Networking · Web
  {
    key: 'http', space: 'net', collection: 1, title: 'Tìm hiểu HTTP', type: 'lab', ...official,
    chunks: [
      ['request-response', 'Yêu cầu và phản hồi', 'Trình duyệt gửi yêu cầu HTTP gồm phương thức, đường dẫn và header; máy chủ trả mã trạng thái, header và nội dung.'],
      ['ma-trang-thai', 'Mã trạng thái', '2xx là thành công, 3xx là chuyển hướng, 4xx là lỗi phía người gọi, 5xx là lỗi phía máy chủ.'],
    ],
  },
  {
    key: 'tcp-udp', space: 'net', collection: 1, title: 'TCP vs UDP', type: 'lab', ...official,
    chunks: [
      ['tcp', 'TCP', 'TCP bắt tay ba bước, đánh số gói và gửi lại gói mất, nên dữ liệu đến đủ và đúng thứ tự.'],
      ['udp', 'UDP', 'UDP gửi không cần kết nối và không gửi lại, nhanh hơn, hợp với gọi thoại, game và DNS.'],
    ],
  },
  {
    key: 'http3', space: 'net', collection: 1, title: 'HTTP/3 bằng hình', type: 'note', origin: 'community', status: 'approved', author: 'an',
    chunks: [['quic', 'QUIC', 'HTTP/3 chạy trên QUIC, một giao thức trên UDP, nên mất một gói không làm nghẽn các luồng khác.']],
  },
  // Networking · Địa chỉ
  {
    key: 'subnet', space: 'net', collection: 2, title: 'Subnet & CIDR', type: 'lab', ...official,
    chunks: [
      ['cidr', 'Ký hiệu CIDR', '/24 nghĩa là 24 bit đầu là phần mạng; mạng 192.168.1.0/24 có 254 địa chỉ dùng cho máy.'],
      ['chia-subnet', 'Chia subnet', 'Mượn thêm bit phần máy để chia một mạng lớn thành nhiều mạng nhỏ, mỗi mạng có địa chỉ mạng và broadcast riêng.'],
    ],
  },
  {
    key: 'subnet-xlsx-net', space: 'net', collection: 2, title: 'subnet.xlsx', type: 'office', ...mine,
    chunks: [['sheet-1', 'Sheet1', 'Bảng tính chia subnet: cột mạng, mặt nạ, địa chỉ đầu, địa chỉ cuối, broadcast.']],
  },
  // Networking · Hành trình gói tin
  {
    key: 'osi', space: 'net', collection: 3, title: 'Packet Journey qua OSI', type: 'lab', ...official,
    chunks: [
      ['dong-goi', 'Đóng gói', 'Dữ liệu đi xuống từng tầng OSI, mỗi tầng thêm header của mình: segment, packet, frame rồi thành bit trên dây.'],
      ['mo-goi', 'Mở gói', 'Ở máy nhận, mỗi tầng đọc và bỏ header của mình rồi đưa phần còn lại lên tầng trên.'],
    ],
  },
  {
    key: 'new-host', space: 'net', collection: 3, title: 'Máy mới vào mạng', type: 'journey', ...official,
    chunks: [['lo-trinh', 'Lối đi 5 bước', 'Năm bước của một máy mới vào mạng: DHCP xin địa chỉ, ARP tìm gateway, DNS phân giải tên, TCP kết nối, HTTP lấy trang.']],
  },
  // Kubernetes
  {
    key: 'k8s-arch', space: 'k8s', collection: 0, title: 'Kiến trúc cụm K8s', type: 'lab', ...official,
    chunks: [
      ['control-plane', 'Control plane', 'API server, etcd, scheduler và controller manager quyết định trạng thái mong muốn của cụm.'],
      ['node', 'Node', 'Mỗi node chạy kubelet, container runtime và kube-proxy để chạy pod và nối mạng cho chúng.'],
    ],
  },
  {
    key: 'k8s-build', space: 'k8s', collection: 1, title: 'Dựng cụm K8s từng bước', type: 'lab', ...official,
    chunks: [['kubeadm', 'kubeadm init', 'Khởi tạo control plane bằng kubeadm init, cài plugin mạng CNI, rồi cho các node tham gia bằng kubeadm join.']],
  },
  // Linux
  {
    key: 'syslog', space: 'lnx', collection: 0, title: 'Đọc log hệ thống với syslog', type: 'lab', ...official,
    chunks: [['journalctl', 'journalctl', 'journalctl -u <dịch vụ> xem log của một dịch vụ; thêm -f để theo dõi log mới.']],
  },
  {
    key: 'boot', space: 'lnx', collection: 1, title: 'Quá trình khởi động Linux', type: 'lab', ...official,
    chunks: [['boot-order', 'Thứ tự khởi động', 'Firmware nạp bootloader, bootloader nạp kernel và initramfs, kernel chạy systemd làm tiến trình số 1.']],
  },
  {
    key: 'swap', space: 'lnx', collection: 2, title: 'Cấu hình swap', type: 'lab', ...official,
    chunks: [['swapfile', 'Tạo swapfile', 'Tạo tệp bằng fallocate, mkswap rồi swapon; thêm vào /etc/fstab để giữ sau khi khởi động lại.']],
  },
  // Observability
  {
    key: 'victorialogs', space: 'obs', collection: 0, title: 'VictoriaLogs: gom log tập trung', type: 'lab', ...official,
    chunks: [['ingest', 'Gửi log', 'VictoriaLogs nhận log qua syslog, JSON lines hay Loki push API, lưu nén theo luồng và truy vấn bằng LogsQL.']],
  },
  // Docker
  {
    key: 'docker-basics', space: 'dkr', collection: 0, title: 'Docker cơ bản', type: 'lab', ...official,
    chunks: [['image-container', 'Image và container', 'Image là khuôn chỉ đọc; container là một tiến trình chạy từ image với lớp ghi riêng.']],
  },
  {
    key: 'docker-storage', space: 'dkr', collection: 1, title: 'Docker: storage và build', type: 'lab', ...official,
    chunks: [['volume', 'Volume', 'Volume giữ dữ liệu ngoài vòng đời container; build nhiều tầng giúp image nhỏ hơn.']],
  },
  {
    key: 'docker-compose', space: 'dkr', collection: 2, title: 'Docker Compose', type: 'lab', ...official,
    chunks: [['compose-file', 'compose.yaml', 'Một tệp compose.yaml mô tả nhiều dịch vụ, mạng và volume; docker compose up chạy tất cả.']],
  },
  // Học hàng tuần: one page a week
  ...['11-07', '18-07', '01-08', '08-08', '17-09'].map(
    (week, i): SeedDocument => ({
      key: `week-${week}`, space: 'wk', collection: i, title: `Học hàng tuần ${week}`, type: 'note', ...official,
      chunks: [['tom-tat', 'Tóm tắt tuần', `Những gì đã học trong tuần ${week}: bài lab, câu hỏi còn mở và việc tuần sau.`]],
    }),
  ),
  // Vũ trụ của bạn: the three private files of C09
  {
    key: 'lab-notes', space: 'me', collection: null, title: 'lab-notes.docx', type: 'office', ...mine,
    chunks: [['ghi-chu', 'Ghi chú', 'Ghi chú của bạn khi làm lab DHCP: máy nhận địa chỉ sau bốn gói DORA.']],
  },
  {
    key: 'subnet-xlsx', space: 'me', collection: null, title: 'subnet.xlsx', type: 'office', ...mine,
    chunks: [['sheet-1', 'Sheet1', 'Bảng tính chia subnet: cột mạng, mặt nạ, địa chỉ đầu, địa chỉ cuối, broadcast.']],
  },
  {
    key: 'k8s-intro', space: 'me', collection: null, title: 'k8s-intro.pptx', type: 'office', ...mine,
    chunks: [['slide-1', 'Slide 1', 'Giới thiệu Kubernetes: pod, deployment, service.']],
  },
];

/** [source, target, kind, label] by document key. */
export const SEED_LINKS: Array<[string, string, 'wikilink' | 'relation', string | null]> = [
  ['dhcp', 'arp', 'wikilink', null],
  ['new-host', 'dhcp', 'relation', 'bước 1'],
  ['new-host', 'arp', 'relation', 'bước 2'],
  ['new-host', 'dns', 'relation', 'bước 3'],
  ['new-host', 'tcp-udp', 'relation', 'bước 4'],
  ['new-host', 'http', 'relation', 'bước 5'],
  ['arp-ndp', 'arp', 'wikilink', null],
  ['dhcp-spoof', 'dhcp', 'wikilink', null],
  // Across Spaces: what makes Linux and Observability the related Spaces of Networking (C10).
  ['syslog', 'dhcp', 'wikilink', null],
  ['victorialogs', 'tcp-udp', 'wikilink', null],
];

/**
 * When the seed's documents were last updated: the latest is 03/11/2026 21:05 (Asia/Saigon), as C11 shows
 * ("cập nhật 03/11"). C09's "Gần đây" stage opens on "Tiếp tục đọc: Giao thức DHCP" then "Cần cập nhật: Kiến trúc
 * cụm K8s", so those come first; every other document follows, 10 minutes apart, in seed order.
 */
export const SEED_LATEST_UPDATE = new Date('2026-11-03T14:05:00Z');
export const SEED_RECENT_FIRST = ['dhcp', 'k8s-arch'];

/** The owner's reading progress of C10 (document key, percent, last anchor read). */
export const SEED_PROGRESS: Array<[string, number, string | null]> = [
  ['arp', 100, 'arp-request-reply'],
  ['dhcp', 72, 'dora'],
  ['icmp', 30, 'ping'],
  ['dhcp-home', 45, 'router-nha'],
  ['http', 40, 'request-response'],
  ['subnet', 100, 'chia-subnet'],
  ['osi', 10, 'dong-goi'],
];

/** The discussion of C11 (DHCP): [key, document key, author, hours before SEED_LATEST_UPDATE, text]. */
export const SEED_COMMENTS: Array<[string, string, SeedAuthor, number, string]> = [
  ['relay-question', 'dhcp', 'minh', 2, '@Linh mạng khác subnet thì DHCP relay chạy thế nào?'],
  ['relay-answer', 'dhcp', 'linh', 1, 'Router chuyển tiếp gói Discover tới server. Mình sẽ thêm một đoạn về relay.'],
];
