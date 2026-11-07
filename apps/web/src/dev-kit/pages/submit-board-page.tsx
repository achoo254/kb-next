import { type ReactNode, useState } from 'react';
import { AppShell, SHELL_PATHS } from '../../layout/app-shell';
import { SessionProvider } from '../../layout/session-context';
import { SubmitFix, SubmitSent, SubmitSteps } from '../../pages/submit-panels';
import type { SubmitError } from '../../pages/submit-messages';
import '../../pages/submit-screen.css';
import './submit-board-page.css';

/** The board's sample: the Office file it publishes. */
const SAMPLE_DOCUMENT = 'c0600000-0000-4000-8000-000000000001';
const CHOICES: readonly SubmitError[] = ['title-required', 'body-required', 'network'];

/**
 * Board C06-Submit: every state of publishing side by side, as the board lays them out (A · the steps done,
 * B · published, C · what to fix, with its switch between errors). The board's two review result cards are gone with
 * the review gate (docs/mock-deviations.md). The app shows one publication at a time (pages/submit-screen.tsx). Signed
 * in as the board's Đạt, one notification unread.
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
        breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: 'Vũ trụ của bạn', href: SHELL_PATHS.universe }, { label: 'Đăng bài' }]}
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
                  { name: 'Đăng công khai', sub: 'Đã đăng · mọi người đọc được ngay', state: 'done' },
                ]}
              />
            </div>
            <div className="submit-slot submit-slot-b">
              <SubmitSent documentId={SAMPLE_DOCUMENT} />
            </div>
            <div className="submit-slot submit-slot-c">
              <SubmitFix error={error} documentId={SAMPLE_DOCUMENT} onRetry={() => undefined} choices={{ errors: CHOICES, onPick: setError }} />
            </div>
          </div>
        </div>
      </AppShell>
    </SessionProvider>
  );
}
