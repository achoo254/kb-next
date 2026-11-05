import { type ReactNode, useState } from 'react';
import { AppShell, SHELL_PATHS } from '../../layout/app-shell';
import { SessionProvider } from '../../layout/session-context';
import { ReviewNoticeCard, SubmitFix, SubmitSent, SubmitSteps } from '../../pages/submit-panels';
import type { SubmitError } from '../../pages/submit-messages';
import '../../pages/submit-screen.css';
import './submit-board-page.css';

/** The board's sample: the Office file it sends, the queue it joins, Linh's results. */
const SAMPLE_DOCUMENT = 'c0600000-0000-4000-8000-000000000001';
const CHOICES: readonly SubmitError[] = ['title-required', 'body-required', 'network'];

/**
 * Board C06-Submit: every state of sending for review side by side, as the board lays them out (A · the steps done,
 * B · sent, C · what to fix, with its switch between errors), and the two result cards that come later. The app shows
 * one submission at a time (pages/submit-screen.tsx). Signed in as the board's Đạt, one notification unread.
 */
export function SubmitBoardPage(): ReactNode {
  const [error, setError] = useState<SubmitError>('title-required');
  return (
    <SessionProvider value={{ status: 'ready', signedIn: true, signInAvailable: true, user: { name: 'Đạt', email: null, picture: null } }}>
      <AppShell
        screen="C06"
        rail="mine"
        unread={1}
        className="submit-shell"
        breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: 'Vũ trụ của bạn', href: SHELL_PATHS.universe }, { label: 'Gửi duyệt' }]}
      >
        <div className="submit-screen" data-id="submit-board">
          <button type="button" className="c06-replay">
            Chạy lại hiệu ứng
          </button>
          <div className="submit-content">
            <div className="submit-slot submit-slot-a">
              <SubmitSteps
                percent={100}
                steps={[
                  { name: 'Lưu bài', sub: 'Bản nháp đã lưu trên máy và server', state: 'done' },
                  { name: 'Trích nội dung Office', sub: 'lab-notes.docx · đọc 5/5 trang, 2 bảng, 1 hình', state: 'done' },
                  { name: 'Jev sơ duyệt', sub: 'Đã chấm 4 tiêu chí · điểm chỉ quản trị xem', state: 'done' },
                  { name: 'Gửi vào hàng duyệt', sub: 'Vị trí 3 trong hàng · người duyệt: Linh', state: 'done' },
                ]}
              />
            </div>
            <div className="submit-slot submit-slot-b">
              <SubmitSent />
            </div>
            <div className="submit-slot submit-slot-c">
              <SubmitFix error={error} documentId={SAMPLE_DOCUMENT} onRetry={() => undefined} choices={{ errors: CHOICES, onPick: setError }} />
            </div>
            <section aria-label="Thông báo sau khi duyệt" className="submit-notices">
              <ReviewNoticeCard
                notice={{
                  kind: 'approved',
                  kicker: 'Thông báo · sau đó',
                  title: 'Bài đã được duyệt · đã hiện trong vũ trụ',
                  line: 'Linh đã duyệt · Networking › Giao thức nền tảng · nhãn Cộng đồng',
                  action: { label: 'Chia sẻ', href: `/d/${SAMPLE_DOCUMENT}` },
                }}
              />
              <ReviewNoticeCard
                notice={{
                  kind: 'changes',
                  kicker: 'Thông báo · sau đó',
                  title: 'Bài cần sửa · lý do: Thiếu nguồn',
                  line: '"Thêm link RFC 2131 cho phần DORA nhé." · Linh',
                  action: { label: 'Sửa và gửi lại', href: `/d/${SAMPLE_DOCUMENT}/edit` },
                }}
              />
            </section>
          </div>
        </div>
      </AppShell>
    </SessionProvider>
  );
}
