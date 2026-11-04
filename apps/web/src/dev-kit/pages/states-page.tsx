import { type ReactNode, useState } from 'react';
import { ILLUSTRATIONS, type StateArt } from '../../ui/art';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { EmptyState } from '../../ui/empty-state';
import { GradientTitle } from '../../ui/gradient-title';
import { ShieldIcon } from '../../ui/icon';
import { Loader } from '../../ui/loader';
import { RimPanel } from '../../ui/rim-panel';
import { Skeleton } from '../../ui/skeleton';
import { UniverseBackdrop } from '../../ui/universe-backdrop';
import './states-page.css';

/** How the thumbnail places its content: centred (default), stretched rows, or stretched rows from the top. */
type VisLayout = 'center' | 'stretch' | 'top';

/** One UI state of the board: its thumbnail, title and the screens that hold it. */
interface StateDefinition {
  id: string;
  /** Accessible name of the card (the board's English label). */
  label: string;
  title: string;
  /** Codes of the boards holding the state. */
  boards: readonly string[];
  /** A full sample defined only here (accent border and a "mẫu đầy đủ" pill). */
  full?: boolean;
  layout?: VisLayout;
  /** A wider gap inside the thumbnail (the permission sample). */
  roomy?: boolean;
  Vis: () => ReactNode;
}

/** The blinking caret of a field or of text being written. */
function Caret(): ReactNode {
  return (
    <span className="x03-caret" aria-hidden="true">
      |
    </span>
  );
}

/** A compact empty state of a thumbnail: AI art, two lines and its actions. */
function CompactEmpty({ art, text, tone, children }: { art: StateArt; text: string; tone?: 'warn'; children?: ReactNode }): ReactNode {
  return (
    <EmptyState art={art} title={text} size="compact" tone={tone} className="x03-empty">
      {children}
    </EmptyState>
  );
}

/** A progress bar of a thumbnail, filled in a tone. */
function ProgressBar({ value, tone, label }: { value: number; tone: 'accent' | 'primary' | 'warn' | 'success'; label: string }): ReactNode {
  return (
    <span className="x03-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span className="x03-bar-fill" data-tone={tone} style={{ width: `${value}%` }} />
    </span>
  );
}

function OnboardingVis(): ReactNode {
  return (
    <>
      <span className="x03-steps" aria-hidden="true">
        <span data-active="true" />
        <span />
        <span />
      </span>
      <span className="x03-langs">
        <span className="x03-lang" data-active="true">
          VI
        </span>
        <span className="x03-lang">EN</span>
      </span>
      <span className="x03-mut">Bước 1/3 · chọn ngôn ngữ</span>
    </>
  );
}

function EmptyUniverseVis(): ReactNode {
  return (
    <>
      <span className="x03-add" aria-hidden="true">
        +
      </span>
      <span className="x03-mut">
        Vũ trụ của bạn còn trống
        <br />
        Tạo hành tinh đầu tiên
      </span>
    </>
  );
}

function SkeletonVis(): ReactNode {
  return (
    <>
      <span className="x03-row x03-row-planets">
        <Skeleton tone="soft" circle width={44} height={44} />
        <Skeleton tone="soft" circle width={70} height={70} />
        <Skeleton tone="soft" circle width={36} height={36} />
      </span>
      <Skeleton tone="soft" width="70%" height={10} />
      <Skeleton tone="soft" width="50%" height={10} />
    </>
  );
}

function SearchLoadingVis(): ReactNode {
  return (
    <>
      <span className="x03-search">
        dhcp
        <Caret />
        <span className="x03-spacer" />
        <Loader variant="spinner" label="Đang tìm" className="x03-spinner" />
      </span>
      <Skeleton tone="soft" height={30} />
      <Skeleton tone="soft" width="85%" height={30} />
      <Skeleton tone="soft" width="70%" height={30} />
    </>
  );
}

function NoResultsVis(): ReactNode {
  return (
    <CompactEmpty art="telescope-empty" text={'Không tìm thấy “dhcpv7”\nThử: DHCP · lease · DORA'}>
      <span className="x03-actions">
        <Button variant="glow" size="sm">
          Hỏi AI
        </Button>
        <Button variant="outline" size="sm">
          Tạo ghi chú
        </Button>
      </span>
    </CompactEmpty>
  );
}

function AiThinkingVis(): ReactNode {
  return (
    <>
      <span className="x03-row">
        <img className="x03-ai-core x03-pulse" src={ILLUSTRATIONS['ai-core']} alt="" aria-hidden="true" />
        <Badge variant="pill" tone="success">
          Jev đang tìm nguồn · 3 đoạn
        </Badge>
      </span>
      <span className="x03-answer">
        DHCP cấp IP qua 4 bước: Discover, Offer
        <Caret />
      </span>
      <span className="x03-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <Button variant="outline" size="sm" className="x03-start">
        Dừng
      </Button>
    </>
  );
}

function NoSourcesVis(): ReactNode {
  return (
    <CompactEmpty art="ai-core" tone="warn" text={'Kho chưa có câu trả lời\nKhông tốn key của bạn'}>
      <Button variant="outline" size="sm">
        Tạo ghi chú về chủ đề này
      </Button>
    </CompactEmpty>
  );
}

function ParsingFailedVis(): ReactNode {
  return (
    <>
      <span className="x03-file">
        <span className="x03-file-type" aria-hidden="true">
          P
        </span>
        <span className="x03-file-name">scan-lab.pdf</span>
        <Badge variant="pill" tone="warn">
          Đọc lỗi
        </Badge>
      </span>
      <span className="x03-mut x03-left">Ảnh scan mờ, OCR không đọc được chữ. Thử tệp rõ hơn hoặc bỏ qua bước OCR.</span>
      <span className="x03-actions">
        <Button variant="glow" size="sm">
          Thử lại
        </Button>
        <Button variant="outline" size="sm">
          Bỏ qua
        </Button>
      </span>
    </>
  );
}

function OfflineVis(): ReactNode {
  return (
    <>
      <img className="x03-planet-offline" src={ILLUSTRATIONS['planet-offline']} alt="" aria-hidden="true" />
      <Badge variant="pill" tone="warn">
        <Loader variant="spinner" label="Đang kết nối lại" className="x03-spinner x03-spinner-warn" />
        Offline · đang kết nối lại
      </Badge>
      <span className="x03-mut">
        3 thay đổi chờ đồng bộ
        <br />
        Vẫn đọc và sửa được tệp đã lưu
      </span>
    </>
  );
}

function AccessDeniedVis(): ReactNode {
  return (
    <CompactEmpty art="vault-lock" text={'Bài này chưa được duyệt\nhoặc là bài riêng tư'}>
      <Button variant="outline" size="sm">
        Về vũ trụ
      </Button>
    </CompactEmpty>
  );
}

function DeleteConfirmVis(): ReactNode {
  return (
    <>
      <span className="x03-confirm-title">Xoá “Ghi chú: swap”?</span>
      <span className="x03-mut">Vào Thùng rác 30 ngày, khôi phục được</span>
      <span className="x03-actions">
        <Button variant="outline" size="sm">
          Huỷ
        </Button>
        <Button variant="glow" size="sm" className="x03-btn-warn">
          Chuyển vào thùng rác
        </Button>
      </span>
    </>
  );
}

function ConflictVis(): ReactNode {
  return (
    <>
      <span className="x03-versions">
        <span className="x03-version" data-side="local">
          <b>Máy này</b>
          <br />
          21:05
        </span>
        <span className="x03-version" data-side="server">
          <b>Server</b>
          <br />
          21:12
        </span>
      </span>
      <span className="x03-actions">
        <Button variant="outline" size="sm">
          Giữ bản này
        </Button>
        <Button variant="glow" size="sm">
          Giữ cả hai
        </Button>
      </span>
    </>
  );
}

function ImportProgressVis(): ReactNode {
  return (
    <>
      <span className="x03-step">lab-notes.docx · Chia đoạn</span>
      <ProgressBar value={64} tone="accent" label="lab-notes.docx" />
      <span className="x03-step">subnet.xlsx · Lập chỉ mục</span>
      <ProgressBar value={88} tone="primary" label="subnet.xlsx" />
      <span className="x03-mut x03-left">2/3 tệp xong</span>
    </>
  );
}

function PublishResultVis(): ReactNode {
  return (
    <>
      <span className="x03-row">
        <Badge variant="pill" tone="success">
          Đã gửi duyệt
        </Badge>
        <Badge variant="pill" tone="warn">
          Chưa gửi được
        </Badge>
      </span>
      <span className="x03-mut">
        Thất bại: đã giữ bản nháp
        <br />
        Mất mạng giữa chừng · Thử lại
      </span>
    </>
  );
}

function PermissionChangedVis(): ReactNode {
  return (
    <>
      <div role="status" className="x03-notice">
        <span className="x03-notice-icon" aria-hidden="true">
          <ShieldIcon size={16} />
        </span>
        <div>
          <div className="x03-notice-title">Quyền của bạn vừa đổi</div>
          <div className="x03-notice-text">Đạt cho bạn vai trò Người duyệt. Tải lại để thấy Hàng duyệt.</div>
        </div>
      </div>
      <span className="x03-actions">
        <Button variant="glow" size="sm">
          Tải lại
        </Button>
        <Button variant="outline" size="sm">
          Để sau
        </Button>
      </span>
      <span className="x03-note">Mất quyền khi đang xem bài: nội dung mờ đi, giữ phần đã nhập, hiện nút Về vũ trụ.</span>
    </>
  );
}

function AutosavedVis(): ReactNode {
  return (
    <span className="x03-stack">
      <Badge variant="pill" tone="success">
        <span className="x03-saved-dot" aria-hidden="true" />
        Đã lưu 21:24
      </Badge>
      <Badge variant="pill" className="x03-pill-busy">
        <Loader variant="spinner" label="Đang lưu" className="x03-spinner x03-spinner-busy" />
        Đang lưu…
      </Badge>
      <Badge variant="pill" tone="accent" className="x03-pill-accent x03-pill-local">
        Offline · lưu trên máy
      </Badge>
    </span>
  );
}

function CitationMissingVis(): ReactNode {
  return (
    <>
      <span className="x03-answer x03-answer-tight">
        Lease DHCP thường kéo dài 24 giờ{' '}
        <Badge variant="pill" tone="warn" className="x03-pill-small">
          chưa có nguồn
        </Badge>
      </span>
      <span className="x03-flag">Jev không tìm thấy đoạn nào trong kho ủng hộ câu này. Câu bị gắn cờ, không xoá.</span>
      <span className="x03-actions x03-wrap">
        <Button variant="outline" size="sm">
          Ẩn câu chưa có nguồn
        </Button>
        <Button variant="outline" size="sm">
          Hỏi lại, chỉ dùng nguồn
        </Button>
      </span>
    </>
  );
}

/** The three steps of the retry demo: failed after the automatic retries, retrying, recovered. */
const RETRY_STEPS = [
  { title: 'Gửi bài thất bại', badge: 'Lần 3/3', body: 'Đã thử lại tự động 3 lần. Bản nháp vẫn an toàn trên máy.', value: 100, button: 'Thử lại ngay', tone: 'warn' },
  { title: 'Đang thử lại…', badge: 'Đang chạy', body: 'Gửi lại phần còn thiếu, không gửi lại từ đầu.', value: 60, button: 'Đang thử…', tone: 'busy' },
  { title: 'Đã khôi phục', badge: 'Xong', body: 'Bài đã vào hàng duyệt. Không mất gì.', value: 100, button: 'Xem bài', tone: 'success' },
] as const;

const RETRY_BADGE = {
  warn: { tone: 'warn', className: undefined, bar: 'warn' },
  busy: { tone: 'violet', className: 'x03-pill-busy', bar: 'primary' },
  success: { tone: 'success', className: undefined, bar: 'success' },
} as const;

/** The live retry sample: "Thử lại" walks through the steps, "Đặt lại demo" starts over. */
function RetryRecoverVis(): ReactNode {
  const [index, setIndex] = useState(0);
  const step = RETRY_STEPS[index] ?? RETRY_STEPS[0];
  const look = RETRY_BADGE[step.tone];
  return (
    <>
      <span className="x03-row">
        <span className="x03-retry-title">{step.title}</span>
        <Badge variant="pill" tone={look.tone} className={look.className}>
          {step.badge}
        </Badge>
      </span>
      <span className="x03-note x03-note-body">{step.body}</span>
      <ProgressBar value={step.value} tone={look.bar} label={step.title} />
      <span className="x03-actions">
        <Button variant="glow" size="sm" onClick={() => setIndex((current) => Math.min(current + 1, RETRY_STEPS.length - 1))}>
          {step.button}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIndex(0)}>
          Đặt lại demo
        </Button>
      </span>
    </>
  );
}

/** The 18 states of the board, in its order. */
const STATES: readonly StateDefinition[] = [
  { id: 'onboarding', label: 'First-time onboarding', title: '1 · Lần đầu vào', boards: ['S03'], Vis: OnboardingVis },
  { id: 'empty-universe', label: 'Empty Universe', title: '2 · Universe trống', boards: ['S05', 'C09'], Vis: EmptyUniverseVis },
  { id: 'skeleton', label: 'Loading skeleton', title: '3 · Đang tải / skeleton', boards: ['S04', 'C09'], Vis: SkeletonVis },
  { id: 'search-loading', label: 'Search loading', title: '4 · Đang tìm', boards: ['C12', 'F01'], layout: 'top', Vis: SearchLoadingVis },
  { id: 'no-results', label: 'No search results', title: '5 · Không có kết quả', boards: ['C12'], Vis: NoResultsVis },
  { id: 'ai-thinking', label: 'AI thinking', title: '6 · AI đang nghĩ / đang viết', boards: ['C14', 'F02'], layout: 'top', Vis: AiThinkingVis },
  { id: 'no-sources', label: 'No relevant sources', title: '7 · Không có nguồn liên quan', boards: ['C14', 'F02'], Vis: NoSourcesVis },
  { id: 'parsing-failed', label: 'Parsing failed', title: '8 · Đọc tệp thất bại', boards: ['C16', 'C03'], layout: 'stretch', Vis: ParsingFailedVis },
  { id: 'offline', label: 'Offline reconnecting', title: '9 · Offline / kết nối lại', boards: ['H04'], Vis: OfflineVis },
  { id: 'access-denied', label: 'Access denied', title: '10 · Không có quyền', boards: ['X02', 'C11'], Vis: AccessDeniedVis },
  { id: 'delete-confirm', label: 'Delete confirmation', title: '11 · Xác nhận xoá', boards: ['C08', 'X01'], Vis: DeleteConfirmVis },
  { id: 'conflict', label: 'Conflict resolution', title: '12 · Giải quyết xung đột', boards: ['H04'], Vis: ConflictVis },
  { id: 'import-progress', label: 'Import progress', title: '13 · Tiến độ nhập', boards: ['C16', 'C03'], layout: 'stretch', Vis: ImportProgressVis },
  { id: 'publish-result', label: 'Publish success failure', title: '14 · Gửi bài thành công / thất bại', boards: ['C06'], Vis: PublishResultVis },
  {
    id: 'permission-changed',
    label: 'Permission changed',
    title: '15 · Quyền thay đổi',
    boards: ['C18', 'C20', 'C19'],
    full: true,
    layout: 'top',
    roomy: true,
    Vis: PermissionChangedVis,
  },
  { id: 'autosaved', label: 'Document autosaved', title: '16 · Đã tự lưu', boards: ['C02'], Vis: AutosavedVis },
  { id: 'citation-missing', label: 'AI citation unavailable', title: '17 · AI không có trích dẫn', boards: ['C14'], full: true, layout: 'top', Vis: CitationMissingVis },
  { id: 'retry-recover', label: 'Retry recover', title: '18 · Thử lại / khôi phục', boards: ['C16', 'C06', 'C14'], full: true, layout: 'top', Vis: RetryRecoverVis },
];

/** One state card: the thumbnail, the title and the board codes. */
function StateCard({ state }: { state: StateDefinition }): ReactNode {
  const { Vis } = state;
  const classes = state.full ? 'x03-card x03-card-full' : 'x03-card';
  return (
    <RimPanel variant="soft" radius="card" label={state.label} className={classes} dataId={`x03-state-${state.id}`}>
      <RimPanel as="div" variant="vis" radius="well" className={`x03-vis x03-vis-${state.layout ?? 'center'}${state.roomy ? ' x03-vis-roomy' : ''}`}>
        <Vis />
      </RimPanel>
      <span className="x03-title">
        {state.title}
        {state.full && ' '}
        {state.full && (
          <Badge variant="pill" tone="accent" className="x03-pill-accent">
            mẫu đầy đủ
          </Badge>
        )}
      </span>
      <span className="x03-where">
        {state.boards.map((board) => (
          <Chip key={board} variant="board">
            {board}
          </Chip>
        ))}
      </span>
    </RimPanel>
  );
}

/** /dev/kit/states: board X03-StatesCoverage (design/mock/X03-StatesCoverage.dc.html), built from the shared kit. */
export function StatesPage(): ReactNode {
  return (
    <UniverseBackdrop veil="radial" stars={false} className="x03-page">
      <main className="x03-main" data-screen="X03-StatesCoverage" data-id="screen-X03-StatesCoverage">
        <header>
          <div className="x03-kicker">KnowFlow · UI states theo review</div>
          <GradientTitle size={42} className="x03-heading">
            18 trạng thái giao diện
          </GradientTitle>
          <span className="x03-lead">Mỗi thẻ: hình thu nhỏ + màn hình đang chứa trạng thái đó. Ba thẻ có viền là mẫu đầy đủ, chỉ định nghĩa ở đây.</span>
        </header>
        <div className="x03-grid">
          {STATES.map((state) => (
            <StateCard key={state.id} state={state} />
          ))}
        </div>
        <RimPanel variant="glass" radius="card" label="Quy tắc chung" className="x03-rules" dataId="x03-rules">
          <span className="x03-rules-title">Quy tắc chung cho mọi trạng thái lỗi</span>
          <span className="x03-rules-text">
            Nói điều gì đã xảy ra và việc người dùng làm được ngay. Giữ dữ liệu người dùng đã nhập. Thử lại tự động tối đa 3 lần (1 s, 3 s, 9 s), sau đó hiện nút
            Thử lại. Không chỉ dùng màu: luôn có chữ hoặc biểu tượng đi kèm.
          </span>
        </RimPanel>
      </main>
    </UniverseBackdrop>
  );
}
