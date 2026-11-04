import { type ReactNode, useState } from 'react';
import type { StateArt } from '../../ui/art';
import { Badge, type BadgeTone } from '../../ui/badge';
import { Button, type ButtonTone } from '../../ui/button';
import { cssColourLabel } from '../../ui/css-token';
import { EmptyState } from '../../ui/empty-state';
import { GradientTitle } from '../../ui/gradient-title';
import { Icon, type IconName } from '../../ui/icon';
import { IconButton } from '../../ui/icon-button';
import { Loader } from '../../ui/loader';
import { Modal } from '../../ui/modal';
import { RimPanel } from '../../ui/rim-panel';
import { Skeleton } from '../../ui/skeleton';
import { TextField } from '../../ui/text-field';
import { Toast, type ToastTone } from '../../ui/toast';
import { Tooltip } from '../../ui/tooltip';
import { UniverseBackdrop } from '../../ui/universe-backdrop';
import './feedback-page.css';

interface ToastSample {
  tone: ToastTone;
  /** The trigger button's label. */
  name: string;
  /** Colour of the trigger's ring and dot. */
  buttonTone: ButtonTone;
  message: string;
  undo?: boolean;
}

const UNDO_TOAST: ToastSample = { tone: 'undo', name: 'Có hoàn tác', buttonTone: 'violet', message: 'Đã xoá "Ghi chú: ARP"', undo: true };

const TOASTS: readonly ToastSample[] = [
  { tone: 'success', name: 'Thành công', buttonTone: 'success', message: 'Đã đăng "Máy mới vào mạng"' },
  { tone: 'info', name: 'Thông tin', buttonTone: 'accent', message: 'Jev đã xếp tệp vào Networking › DHCP' },
  { tone: 'warn', name: 'Cảnh báo', buttonTone: 'warn', message: 'Bạn đang offline. Thay đổi lưu trên máy.' },
  { tone: 'error', name: 'Lỗi', buttonTone: 'danger', message: 'Không tải lên được. Tệp quá 20 MB.' },
  UNDO_TOAST,
];

interface EmptySample {
  art: StateArt;
  title: string;
  description: string;
  cta: string;
  href: string;
  tone: ButtonTone;
}

const EMPTIES: readonly EmptySample[] = [
  { art: 'crystal-personal', title: 'Chưa có ghi chú', description: 'Viết điều vừa học, Jev tự xếp vào đúng vùng.', cta: 'Viết ghi chú', href: '/u', tone: 'violet' },
  { art: 'journey-path', title: 'Chưa có lối đi', description: 'Nối vài hành tinh thành một chuyến đi để chia sẻ.', cta: 'Tạo lối đi', href: '/u', tone: 'accent' },
  { art: 'telescope-empty', title: 'Không tìm thấy', description: 'Thử từ khác, bỏ dấu, hoặc hỏi AI.', cta: 'Hỏi AI', href: '/copilot', tone: 'warn' },
  { art: 'key-crystal', title: 'Chưa có key', description: 'Vẫn tìm được. Thêm key để AI viết câu trả lời.', cta: 'Thêm key', href: '/settings/keys', tone: 'success' },
];

const BADGES: readonly { name: string; tone: BadgeTone; icon: IconName }[] = [
  { name: 'Bản nháp', tone: 'violet', icon: 'pencil' },
  { name: 'Đã đăng', tone: 'success', icon: 'check' },
  { name: 'Riêng tư', tone: 'warn', icon: 'lock-small' },
  { name: 'Ai có link', tone: 'accent', icon: 'link' },
  { name: 'Offline', tone: 'neutral', icon: 'offline' },
  { name: 'Jev đã kiểm', tone: 'success', icon: 'check' },
  { name: 'Bản dịch AI · chưa duyệt', tone: 'purple', icon: 'translate' },
];

/** The recovery card's states: a send that failed, a retry under way, a draft brought back. */
type RecoveryState = 'fail' | 'busy' | 'ok';

const RECOVERY: Record<
  RecoveryState,
  { title: string; message: string; meta: string; button: string; icon: IconName; tone?: 'danger' | 'success' }
> = {
  fail: {
    title: 'Chưa gửi được',
    message: 'Lỗi mạng khi gửi duyệt. Bản nháp vẫn nằm trên máy này.',
    meta: 'Lần thử 1/3 · 21:25',
    button: 'Thử lại',
    icon: 'warning',
    tone: 'danger',
  },
  busy: {
    title: 'Đang thử lại…',
    message: 'Đang gửi lại lần 2. Bạn cứ làm tiếp.',
    meta: 'Tự thử lại tối đa 3 lần',
    button: 'Đang thử…',
    icon: 'retry',
  },
  ok: {
    title: 'Đã khôi phục',
    message: 'Bản nháp "Máy mới xin IP thế nào" đã được lưu lại an toàn.',
    meta: 'Tự lưu lúc 21:24',
    button: 'Gửi lại',
    icon: 'check',
    tone: 'success',
  },
};

/** Reconnect attempts cycle 1 → 4: the wait shrinks and the bar fills with each attempt. */
const MAX_RECONNECT = 4;

function ToastSection({ onShow }: { onShow(sample: ToastSample): void }): ReactNode {
  return (
    <RimPanel variant="soft" radius="section" className="fb-card">
      <h2 className="fb-h2">Toast</h2>
      <div className="fb-wrap fb-gap-8">
        {TOASTS.map((sample) => (
          <Button
            key={sample.tone}
            variant="trigger"
            tone={sample.buttonTone}
            dot
            className="fb-trigger"
            onClick={() => onShow(sample)}
            dataId={`fb-toast-${sample.tone}`}
          >
            {sample.name}
          </Button>
        ))}
      </div>
      <div className="fb-stack fb-gap-8">
        {TOASTS.map((sample) => (
          <Toast
            key={sample.tone}
            variant="row"
            tone={sample.tone}
            message={sample.message}
            onUndo={sample.undo ? () => onShow(sample) : undefined}
          />
        ))}
      </div>
    </RimPanel>
  );
}

function ConfirmSection({ onDelete }: { onDelete(): void }): ReactNode {
  return (
    <RimPanel variant="soft" radius="section" className="fb-card">
      <h2 className="fb-h2">Xác nhận và lỗi nhập</h2>
      <Button variant="danger" size="xl" icon="trash" className="fb-start" onClick={onDelete} dataId="fb-delete">
        Xoá ghi chú…
      </Button>
      <TextField variant="well" label="Tiêu đề" defaultValue="" placeholder="Đặt tên cho hành tinh" error="Cần một tiêu đề" />
      <TextField
        variant="well"
        type="password"
        label="Key OpenAI"
        defaultValue="sk-xxxx"
        error="OpenAI từ chối key này. Kiểm tra lại hoặc tạo key mới."
        errorTone="warn"
      />
      <span className="fb-note">Tệp: hỗ trợ docx, xlsx, pptx, pdf, md · tối đa 20 MB</span>
    </RimPanel>
  );
}

function EmptySection(): ReactNode {
  return (
    <RimPanel variant="soft" radius="section" className="fb-card">
      <h2 className="fb-h2">Trạng thái trống</h2>
      <div className="fb-grid-4">
        {EMPTIES.map((empty) => (
          <RimPanel key={empty.title} as="div" variant="well" radius="card" className="fb-empty">
            <EmptyState
              art={empty.art}
              title={empty.title}
              description={empty.description}
              tone={empty.tone}
              action={{ label: empty.cta, href: empty.href }}
            />
          </RimPanel>
        ))}
      </div>
    </RimPanel>
  );
}

function SkeletonSection(): ReactNode {
  return (
    <RimPanel variant="soft" radius="section" className="fb-card" dataId="fb-skeleton">
      <h2 className="fb-h2">Skeleton</h2>
      <div className="fb-grid-2" aria-busy="true">
        <RimPanel as="div" variant="well" className="fb-tile fb-skel fb-center">
          <Skeleton tone="glow" circle width={90} height={90} />
          <Skeleton tone="glow" width={70} height={10} radius={5} />
          <span className="fb-caption">Hành tinh</span>
        </RimPanel>
        <RimPanel as="div" variant="well" className="fb-tile fb-skel">
          <Skeleton tone="glow" height={70} radius={12} />
          <Skeleton tone="glow" width="70%" height={12} radius={6} />
          <Skeleton tone="glow" width="45%" height={10} radius={5} />
          <span className="fb-caption">Thẻ</span>
        </RimPanel>
        <RimPanel as="div" variant="well" className="fb-tile fb-skel">
          <Skeleton tone="glow" width="60%" height={18} radius={6} />
          <Skeleton tone="glow" height={10} radius={5} />
          <Skeleton tone="glow" width="90%" height={10} radius={5} />
          <Skeleton tone="glow" width="75%" height={10} radius={5} />
          <span className="fb-caption">Đoạn chữ</span>
        </RimPanel>
        <RimPanel as="div" variant="well" className="fb-tile fb-skel">
          {[
            ['80%', '50%'],
            ['70%', '40%'],
          ].map(([line, sub]) => (
            <div key={line} className="fb-skel-row">
              <Skeleton tone="glow" width={32} height={32} radius={10} />
              <span className="fb-skel-lines">
                <Skeleton tone="glow" width={line} height={10} radius={5} />
                <Skeleton tone="glow" width={sub} height={8} radius={4} />
              </span>
            </div>
          ))}
          <span className="fb-caption">Dòng danh sách</span>
        </RimPanel>
      </div>
    </RimPanel>
  );
}

function LoadingSection(): ReactNode {
  return (
    <RimPanel variant="soft" radius="section" className="fb-card">
      <h2 className="fb-h2">Đang tải</h2>
      <div className="fb-grid-2">
        <RimPanel as="div" variant="well" className="fb-tile fb-load-tall">
          <Loader variant="orbit" label="Đang mở vũ trụ…" />
        </RimPanel>
        <RimPanel as="div" variant="well" className="fb-tile fb-load-tall">
          <Loader variant="ai" label="AI đang viết…" />
        </RimPanel>
        <RimPanel as="div" variant="well" className="fb-tile fb-load-short fb-load-bar">
          <Loader variant="bar" label="Tải lên lab-notes.docx" note="Đang gửi · có thể huỷ" />
        </RimPanel>
        <RimPanel as="div" variant="well" className="fb-tile fb-load-short">
          <Loader variant="ring" label="Jev đang xếp chỗ" note="Đọc nội dung, chọn vùng" />
        </RimPanel>
      </div>
    </RimPanel>
  );
}

function BadgeSection(): ReactNode {
  return (
    <RimPanel variant="soft" radius="section" className="fb-card">
      <h2 className="fb-h2">Nhãn trạng thái</h2>
      <div className="fb-wrap fb-gap-10">
        {BADGES.map((badge) => (
          <Badge key={badge.name} tone={badge.tone} icon={badge.icon}>
            {badge.name}
          </Badge>
        ))}
      </div>
    </RimPanel>
  );
}

function ControlSection(): ReactNode {
  return (
    <RimPanel variant="soft" radius="section" className="fb-card">
      <h2 className="fb-h2">Tooltip, focus, tắt, hover</h2>
      <div className="fb-wrap fb-controls">
        <Tooltip text="Canvas · C">
          {(describedBy) => <IconButton label="Canvas" icon="graph-tree" className="fb-tip-btn" aria-describedby={describedBy} />}
        </Tooltip>
        <Button variant="primary" size="xl" className="fb-focus-demo">
          Đang focus
        </Button>
        <Button variant="primary" size="xl" disabled>
          Đăng (cần tiêu đề)
        </Button>
        <Button variant="ghost" size="xl" disabled>
          Hỏi AI (offline)
        </Button>
        <Button variant="primary" size="xl">
          Di chuột / nhấn thử
        </Button>
      </div>
      <span className="fb-note">
        Hover: nổi 3px + phát sáng. Nhấn: thu 95%. Focus: viền {cssColourLabel('--dark-focus')} cách 3px. Tắt: mờ 45%, kèm lý do trong nhãn.
      </span>
    </RimPanel>
  );
}

function SystemSection(): ReactNode {
  const [attempt, setAttempt] = useState(1);
  const [recovery, setRecovery] = useState<RecoveryState>('fail');
  const rv = RECOVERY[recovery];
  const wait = Math.max(2, 10 - attempt * 2);
  return (
    <RimPanel variant="soft" radius="section" className="fb-card" label="Mẫu trạng thái hệ thống">
      <h2 className="fb-h2">Mẫu hệ thống: quyền thay đổi · kết nối lại · khôi phục</h2>
      <div className="fb-grid-3">
        <RimPanel as="div" variant="well" radius="small" tone="warn" className="fb-system">
          <div role="status" className="fb-system-body">
            <span className="fb-system-title fb-warn">
              <Icon name="lock-open" size={18} />
              Quyền đã thay đổi
            </span>
            <span className="fb-system-text">Quản trị vừa ẩn &quot;Ghi chú: swap&quot;. Link chia sẻ tạm ngưng, bản của bạn vẫn còn.</span>
            <span className="fb-note">Lúc 21:42 · bởi Đạt</span>
          </div>
          <div className="fb-wrap fb-gap-8">
            <Button variant="warn" size="md" href="/me">
              Xem bài của tôi
            </Button>
            <Button variant="ghost" size="md" href="/me">
              Hộp thư
            </Button>
          </div>
        </RimPanel>

        <RimPanel as="div" variant="well" radius="small" tone="accent" className="fb-system">
          <div role="status" aria-live="polite" className="fb-system-body">
            <span className="fb-system-title">
              <Loader variant="spinner" label="Đang kết nối lại" hideLabel />
              Đang kết nối lại…
            </span>
            <span className="fb-system-text">
              Mất mạng. Bạn vẫn đọc và sửa được tệp đã lưu. Thử lại sau {wait} giây (lần {attempt}).
            </span>
            <span className="fb-progress" aria-hidden="true">
              <span className="fb-progress-fill" style={{ width: `${Math.min(100, attempt * 25)}%` }} />
            </span>
          </div>
          <div className="fb-wrap fb-gap-8">
            <Button
              variant="accent"
              size="md"
              onClick={() => setAttempt((n) => (n >= MAX_RECONNECT ? 1 : n + 1))}
              dataId="fb-reconnect"
            >
              Thử ngay
            </Button>
            <Button variant="ghost" size="md" href="/settings">
              Hàng chờ đồng bộ
            </Button>
          </div>
        </RimPanel>

        <RimPanel as="div" variant="well" radius="small" tone={rv.tone} className="fb-system" dataId="fb-recovery">
          <div role="alert" className="fb-system-body">
            <span className="fb-system-title" data-tone={rv.tone}>
              <Icon name={rv.icon} size={18} strokeWidth={2.2} />
              {rv.title}
            </span>
            <span className="fb-system-text">{rv.message}</span>
            <span className="fb-note">{rv.meta}</span>
          </div>
          <div className="fb-wrap fb-gap-8">
            <Button variant="primary" size="md" className="fb-bold" onClick={() => setRecovery((state) => (state === 'fail' ? 'busy' : 'fail'))} dataId="fb-retry">
              {rv.button}
            </Button>
            <Button variant="ghost" size="md" onClick={() => setRecovery('ok')} dataId="fb-recover">
              Khôi phục bản nháp
            </Button>
          </div>
        </RimPanel>
      </div>
      <span className="fb-note">
        Quy tắc: luôn nói chuyện gì xảy ra, dữ liệu của người dùng có an toàn không, và một nút làm tiếp. Không chặn đọc/viết khi đang thử lại.
      </span>
    </RimPanel>
  );
}

/** /dev/kit/feedback: board X01-Feedback (design/mock/X01-Feedback.dc.html), built from the shared kit. */
export function FeedbackPage(): ReactNode {
  // `key` restarts the toast's slide-in when the same tone is shown twice in a row.
  const [toast, setToast] = useState<{ sample: ToastSample; key: number } | null>(null);
  const [confirming, setConfirming] = useState(false);

  function show(sample: ToastSample): void {
    setToast((current) => ({ sample, key: (current?.key ?? 0) + 1 }));
  }

  function closeToast(): void {
    setToast(null);
  }

  return (
    <UniverseBackdrop veil="radial" stars={false} className="fb-page">
      <main className="fb-board" data-screen="X01-Feedback" data-id="screen-X01-Feedback">
        <header className="fb-header">
          <GradientTitle size={40}>Phản hồi và trạng thái</GradientTitle>
          <span className="fb-hint">Bấm các nút để xem toast và hộp xác nhận</span>
        </header>

        <div className="fb-grid-2 fb-gap-20">
          <ToastSection onShow={show} />
          <ConfirmSection onDelete={() => setConfirming(true)} />
        </div>
        <EmptySection />
        <div className="fb-grid-2 fb-gap-20">
          <SkeletonSection />
          <LoadingSection />
        </div>
        <div className="fb-grid-2 fb-gap-20">
          <BadgeSection />
          <ControlSection />
        </div>
        <SystemSection />

        {toast && (
          <Toast
            key={toast.key}
            variant="floating"
            tone={toast.sample.tone}
            message={toast.sample.message}
            onUndo={toast.sample.undo ? closeToast : undefined}
            onClose={closeToast}
            className="fb-floating-toast"
            dataId="fb-floating-toast"
          />
        )}

        <Modal
          open={confirming}
          onClose={() => setConfirming(false)}
          contained
          tone="danger"
          art="crystal-cracked"
          title={'Xoá "Ghi chú: ARP"?'}
          description="Hành tinh và 2 đường nối sẽ biến mất. Bạn có 10 giây để hoàn tác."
          actionsLayout="stretch"
          dataId="fb-confirm"
          actions={
            <>
              <Button variant="outline" size="xxl" onClick={() => setConfirming(false)} dataId="fb-confirm-keep">
                Giữ lại
              </Button>
              <Button
                variant="danger-solid"
                size="xxl"
                onClick={() => {
                  setConfirming(false);
                  show(UNDO_TOAST);
                }}
                dataId="fb-confirm-delete"
              >
                Xoá
              </Button>
            </>
          }
        />
      </main>
    </UniverseBackdrop>
  );
}
