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
  /** One line on what the Space holds (C10, under its name); Networking's is the board's. */
  description: { vi: string; en: string };
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
    description: { vi: 'Máy tính nói chuyện với nhau thế nào, từ cắm dây tới mở web.', en: 'How computers talk to each other, from plugging in a cable to opening a web page.' },
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
    description: { vi: 'Kubernetes từ khái niệm và kiến trúc cụm tới tự dựng cụm bằng kubeadm và làm việc với Pod.', en: 'Kubernetes from its concepts and cluster architecture to building a cluster with kubeadm and working with Pods.' },
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
    description: { vi: 'Bài tập Linux: quá trình khởi động, swap, log tập trung với rsyslog và ghi lại lệnh đã gõ.', en: 'Linux exercises: the boot process, swap, central logging with rsyslog and recording the commands typed.' },
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
    description: { vi: 'Thu thập và truy vấn log tập trung với VictoriaLogs.', en: 'Collecting and querying logs in one place with VictoriaLogs.' },
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
    description: { vi: 'Docker qua ba phần: nền tảng và vòng đời container, image cùng lưu trữ và log, rồi Compose.', en: 'Docker in three parts: basics and the container lifecycle, images with storage and logs, then Compose.' },
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
    description: { vi: 'Nhật ký từng buổi học: thực hành Docker, Compose và dựng cụm Kubernetes.', en: 'A journal of each study session: hands-on Docker, Compose and building a Kubernetes cluster.' },
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
    description: { vi: 'Tệp và ghi chú riêng của bạn, chỉ bạn thấy.', en: 'Your own files and notes, visible only to you.' },
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
  /** [anchor, heading, text]; a null heading is the overview before the first heading (anchor `tong-quan`). */
  chunks: Array<[string, string | null, string]>;
  /** When it was written and last saved (ISO); default: the seed's spread of times (SEED_FIRST_CREATED, recency). */
  at?: string;
  /** Its planet colour (C02 "Hành tinh của bài"). */
  planet?: 'violet' | 'teal' | 'cyan' | 'amber' | 'emerald' | 'pink';
  /** Its review trail (C08 "Lý do · …"), oldest first; a document of SEED_HISTORY takes its trail from there. */
  reviews?: SeedReview[];
  /** In its author's trash since this many days before SEED_LATEST_UPDATE (C08 "Thùng rác"). */
  trashedDaysBefore?: number;
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
    // As C11 shows it: the overview with the four DORA steps, then three sections.
    chunks: [
      [
        'tong-quan',
        null,
        [
          'Máy mới vào mạng chưa có IP. Nó xin IP qua 4 bước gọi là DORA.',
          '1. **Discover** Hét lên cả mạng xin IP',
          '2. **Offer** Server mời một IP',
          '3. **Request** Máy xin đúng IP đó',
          '4. **Acknowledge** Chốt, cho mượn có hạn',
        ].join('\n\n'),
      ],
      ['broadcast-la-gi', 'Broadcast là gì', 'Vì chưa có IP, máy mới không biết server DHCP ở đâu, nên gửi gói tới 255.255.255.255 cho mọi máy trong mạng cùng nghe. Chỉ server DHCP trả lời.'],
      ['lease-va-gia-han', 'Lease và gia hạn', 'IP chỉ được cho mượn có hạn. Tới nửa thời hạn, máy tự xin gia hạn với đúng server đã cấp.'],
      ['rui-ro-dhcp-gia-mao', 'Rủi ro: DHCP giả mạo', 'Một máy lạ trả lời nhanh hơn có thể đưa gateway sai. Switch nên bật DHCP snooping.'],
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
  // The owner's draft of board C02, last saved 20/10 21:24 (Asia/Saigon): long before the other texts, so the
  // Universe's recent lists (C09) stay as they were. "Xem thêm [[" is a link being written.
  {
    key: 'new-host-ip', space: 'me', collection: null, title: 'Máy mới xin IP thế nào', type: 'note', origin: 'own', status: 'draft', author: 'owner',
    at: '2026-10-20T14:24:00Z', planet: 'violet',
    chunks: [
      [
        'tong-quan',
        null,
        [
          'Máy mới vào mạng chưa có IP. Nó phải hỏi cả mạng bằng broadcast, theo 4 bước gọi là DORA.',
          '1. **Discover**\n2. **Offer**\n3. **Request**\n4. **Acknowledge**',
          '> [!WARNING]\n> Mạng có DHCP giả mạo thì máy bạn có thể nhận nhầm gateway.',
          'Xem thêm [[',
        ].join('\n\n'),
      ],
    ],
  },
  // The owner's texts at the other steps of review, and two in the trash (C08 "Của tôi"). Written long before the
  // other texts, so the Universe's recent lists (C09) stay as they were.
  {
    key: 'swap-ubuntu', space: 'me', collection: null, title: 'Ghi chú: swap trên Ubuntu', type: 'note', origin: 'community', status: 'pending', author: 'owner',
    at: '2026-10-18T09:00:00Z',
    reviews: [{ by: 'owner', at: '2026-10-18T09:05:00Z', action: 'submitted', reason: null }],
    chunks: [['swap-ubuntu', 'Swap trên Ubuntu', 'Ubuntu tạo sẵn /swap.img; đổi cỡ bằng swapoff, fallocate rồi mkswap và swapon lại.']],
  },
  {
    key: 'tcp-udp-pic', space: 'me', collection: null, title: 'TCP vs UDP bằng hình', type: 'note', origin: 'own', status: 'changes_requested', author: 'owner',
    at: '2026-10-16T13:00:00Z', planet: 'cyan',
    reviews: [
      { by: 'owner', at: '2026-10-16T13:10:00Z', action: 'submitted', reason: null },
      { by: 'linh', at: '2026-10-17T02:30:00Z', action: 'changes_requested', reason: 'Thêm link RFC 793 cho phần bắt tay 3 bước nhé.' },
    ],
    chunks: [['bat-tay', 'Bắt tay 3 bước', 'SYN, SYN-ACK rồi ACK: hai bên thống nhất số thứ tự trước khi gửi dữ liệu. UDP không có bước này.']],
  },
  {
    key: 'dns-cache', space: 'me', collection: null, title: 'Mẹo DNS cache', type: 'note', origin: 'own', status: 'rejected', author: 'owner',
    at: '2026-10-15T08:00:00Z',
    reviews: [
      { by: 'owner', at: '2026-10-15T08:10:00Z', action: 'submitted', reason: null },
      { by: 'linh', at: '2026-10-15T15:00:00Z', action: 'rejected', reason: 'Nội dung nói về trình duyệt hơn là DNS.' },
    ],
    chunks: [['xoa-cache', 'Xoá cache', 'Trình duyệt giữ bản ghi DNS riêng; mở trang nội bộ của trình duyệt để xoá khi tên miền vừa đổi IP.']],
  },
  {
    key: 'arp-old', space: 'me', collection: null, title: 'Bản nháp cũ: ARP', type: 'note', origin: 'own', status: 'draft', author: 'owner',
    at: '2026-10-12T10:00:00Z', trashedDaysBefore: 3,
    chunks: [['arp', 'ARP', 'ARP hỏi bằng broadcast, trả lời bằng unicast.']],
  },
  {
    key: 'boot-notes', space: 'me', collection: null, title: 'boot-notes.docx', type: 'office', origin: 'own', status: 'private', author: 'owner',
    at: '2026-10-02T10:00:00Z', trashedDaysBefore: 27,
    chunks: [['ghi-chu', 'Ghi chú', 'Ghi chú khi đọc về GRUB và initramfs.']],
  },
];

/** The owner's favourites (C08 "Yêu thích"), by document key, oldest first. */
export const SEED_FAVORITES = ['dhcp', 'new-host', 'new-host-ip'];

/** [source, target, kind, label] by document key. */
export const SEED_LINKS: Array<[string, string, 'wikilink' | 'relation', string | null]> = [
  // C11's backlinks of DHCP: the journey, ARP and the reader's own lab notes.
  ['dhcp', 'arp', 'wikilink', null],
  ['arp', 'dhcp', 'wikilink', null],
  ['lab-notes', 'dhcp', 'wikilink', null],
  ['dhcp', 'dhcp-spoof', 'wikilink', null],
  ['new-host', 'dhcp', 'relation', 'bước 1'],
  ['new-host', 'arp', 'relation', 'bước 2'],
  ['new-host', 'dns', 'relation', 'bước 3'],
  ['new-host', 'tcp-udp', 'relation', 'bước 4'],
  ['new-host', 'http', 'relation', 'bước 5'],
  ['arp-ndp', 'arp', 'wikilink', null],
  // Across Spaces: what makes Linux and Observability the related Spaces of Networking (C10).
  ['syslog', 'dns', 'wikilink', null],
  ['syslog', 'tcp-udp', 'wikilink', null],
  ['victorialogs', 'tcp-udp', 'wikilink', null],
  // The edges of C13 (Networking's graph and the texts it reaches). None points at DHCP, so C11's backlinks stay
  // the board's three; Subnet and Packet Journey hang off DHCP's own links instead.
  ['dhcp', 'subnet', 'wikilink', null],
  ['dhcp', 'arp', 'relation', 'dẫn tới'],
  ['arp', 'dns', 'relation', 'dẫn tới'],
  ['dns', 'http', 'relation', 'dẫn tới'],
  ['tcp-udp', 'http', 'relation', 'cần trước'],
  ['icmp', 'arp', 'relation', 'liên quan'],
  ['dhcp', 'osi', 'relation', 'liên quan'],
  ['osi', 'http', 'relation', 'liên quan'],
  ['http3', 'http', 'relation', 'liên quan'],
  // Across the other Spaces only: Networking's related Spaces (C10) stay Linux and Observability.
  ['syslog', 'boot', 'relation', 'liên quan'],
  ['boot', 'swap', 'relation', 'liên quan'],
  ['victorialogs', 'syslog', 'relation', 'liên quan'],
  ['swap', 'docker-basics', 'relation', 'liên quan'],
  ['docker-basics', 'docker-compose', 'relation', 'dẫn tới'],
  ['docker-basics', 'k8s-arch', 'relation', 'cần trước'],
  ['k8s-arch', 'k8s-build', 'relation', 'dẫn tới'],
  ['k8s-arch', 'victorialogs', 'relation', 'liên quan'],
];

/**
 * When the seed's documents were last updated: the latest is 03/11/2026 21:05 (Asia/Saigon), as C11 shows
 * ("cập nhật 03/11"). C09's "Gần đây" stage opens on "Tiếp tục đọc: Giao thức DHCP" then "Cần cập nhật: Kiến trúc
 * cụm K8s", so those come first; every other document follows, 10 minutes apart, in seed order.
 */
export const SEED_LATEST_UPDATE = new Date('2026-11-03T14:05:00Z');
/**
 * When the seed's documents were written: one hour apart in seed order from this time, so who contributed to a Space
 * first (C10 "Thành viên & quyền": Minh's note before An's) follows the order of the list above.
 */
export const SEED_FIRST_CREATED = new Date('2026-10-01T02:00:00Z');

/** A version of a seed document with history: who saved it, when (ISO), how, and its text. */
export interface SeedVersion {
  editor: SeedAuthor;
  at: string;
  via: 'editor' | 'api';
  aiMade: boolean;
  summary: string | null;
  /** The document's chunks it had, by anchor, or [anchor, the text it had then]; null: the full text. */
  sections: Array<string | [string, string]> | null;
}

/** A review step or a change of visibility of a seed document (C17). */
export interface SeedReview {
  by: SeedAuthor;
  at: string;
  action: 'submitted' | 'approved' | 'changes_requested' | 'rejected';
  reason: string | null;
}

export interface SeedVisibility {
  by: SeedAuthor;
  at: string;
  hidden: boolean;
}

/**
 * The history of DHCP as board C17 shows it (times in UTC; the board's are Asia/Saigon, 7 hours ahead): three
 * versions made by AI through the API, Linh asking for a source, Minh's proposed v4 (the lease section and DHCP
 * snooping), Linh approving it, and Đạt hiding the text then showing it again. C11 reads the same history: v4,
 * "Linh duyệt 03/11 · 4 phiên bản".
 */
export const SEED_HISTORY: Array<{ key: string; versions: SeedVersion[]; reviews: SeedReview[]; visibility: SeedVisibility[] }> = [
  {
    key: 'dhcp',
    versions: [
      { editor: 'dat', at: '2026-10-28T02:12:00Z', via: 'api', aiMade: true, summary: null, sections: ['tong-quan'] },
      { editor: 'dat', at: '2026-10-29T13:40:00Z', via: 'api', aiMade: true, summary: null, sections: ['tong-quan', ['broadcast-la-gi', 'Máy mới hỏi router để lấy IP.']] },
      {
        editor: 'dat',
        at: '2026-10-31T07:05:00Z',
        via: 'api',
        aiMade: true,
        summary: null,
        sections: ['tong-quan', 'broadcast-la-gi', ['rui-ro-dhcp-gia-mao', 'Một máy lạ trả lời nhanh hơn có thể đưa gateway sai.']],
      },
      { editor: 'minh', at: '2026-11-02T14:30:00Z', via: 'editor', aiMade: false, summary: 'thêm đoạn lease và DHCP snooping', sections: null },
    ],
    reviews: [
      { by: 'linh', at: '2026-11-02T02:00:00Z', action: 'changes_requested', reason: 'thiếu nguồn cho đoạn broadcast' },
      { by: 'linh', at: '2026-11-03T03:02:00Z', action: 'approved', reason: null },
    ],
    visibility: [
      { by: 'dat', at: '2026-11-03T14:12:00Z', hidden: true },
      { by: 'dat', at: '2026-11-03T14:40:00Z', hidden: false },
    ],
  },
];
export const SEED_RECENT_FIRST = ['dhcp', 'k8s-arch'];

/** The owner's reading progress of C10 (document key, percent, last anchor read). */
export const SEED_PROGRESS: Array<[string, number, string | null]> = [
  ['arp', 100, 'arp-request-reply'],
  ['dhcp', 72, 'broadcast-la-gi'],
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

/** A Canvas card of the seed (C15): `doc` names a seed document for a document card. */
export interface SeedCanvasCard {
  id: string;
  kind: 'document' | 'note' | 'idea' | 'risk' | 'answer' | 'diagram' | 'link';
  x: number;
  y: number;
  w: number;
  title: string;
  body?: string;
  steps?: string[];
  doc?: string;
  url?: string;
}

/** The owner's canvas of board C15, in Networking: its cards at the board's places and its six connections. */
export const SEED_CANVAS: { key: string; title: string; space: string; cards: SeedCanvasCard[]; connections: Array<[string, string]> } = {
  key: 'dhcp-a-z',
  title: 'DHCP từ A đến Z',
  space: 'net',
  cards: [
    { id: 'idea', kind: 'idea', x: 250, y: 190, w: 220, title: 'Vì sao máy mới phải hét lên cả mạng?' },
    { id: 'lab', kind: 'document', x: 560, y: 300, w: 300, title: 'Giao thức DHCP', doc: 'dhcp' },
    { id: 'diag', kind: 'diagram', x: 960, y: 170, w: 240, title: 'DORA 4 bước', steps: ['D', 'O', 'R', 'A'] },
    { id: 'file', kind: 'document', x: 980, y: 470, w: 230, title: 'lab-notes.docx', doc: 'lab-notes' },
    { id: 'q', kind: 'answer', x: 300, y: 520, w: 240, title: 'Chưa có IP nên chỉ broadcast được tới 255.255.255.255.', body: 'Nguồn: Lab DHCP § Discover' },
    { id: 'risk', kind: 'risk', x: 640, y: 610, w: 200, title: 'DHCP giả mạo' },
    { id: 'url', kind: 'link', x: 780, y: 200, w: 200, title: 'RFC 2131 · DHCP', url: 'https://datatracker.ietf.org/doc/html/rfc2131' },
  ],
  connections: [
    ['idea', 'lab'],
    ['lab', 'diag'],
    ['lab', 'file'],
    ['q', 'lab'],
    ['lab', 'risk'],
    ['url', 'diag'],
  ],
};
