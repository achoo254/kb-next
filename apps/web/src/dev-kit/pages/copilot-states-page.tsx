import type { ReactNode } from 'react';
import type { CopilotSource } from '../../api/copilot-api';
import { AppShell } from '../../layout/app-shell';
import { SessionProvider } from '../../layout/session-context';
import { Button } from '../../ui/button';
import { AnswerText } from '../../pages/copilot-answer';
import { type CopilotTurn, type KeysLoad, newTurn } from '../../pages/copilot-run';
import { DoubtWarning, JevOffNote, QuestionBubble, type TurnActions, TurnView } from '../../pages/copilot-turn';
import './copilot-states-page.css';

function source(n: number, title: string, section: string | null = null): CopilotSource {
  return { n, documentId: `sample-${n}`, anchor: 'tong-quan', title, section, spaceName: 'Networking', collectionName: 'Giao thức nền tảng', origin: 'official', status: 'approved' };
}

function turn(question: string, change: Partial<CopilotTurn>): CopilotTurn {
  return { ...newTurn({ question, scope: { kind: 'universe' } }), ...change };
}

const T = '2026-11-04T14:10:00.000Z';

/** A reader whose Gemini key is out of credit and whose Claude key works (D offers "Đổi sang Claude"). */
const KEYS: KeysLoad = {
  status: 'ready',
  keys: {
    available: true,
    keys: [
      { provider: 'gemini', last4: '9f3e', status: 'quota', updatedAt: T, lastCheckedAt: T },
      { provider: 'anthropic', last4: '7c1d', status: 'ok', updatedAt: T, lastCheckedAt: T },
    ],
    prefs: { provider: 'gemini', model: 'gemini-3.8-flash' },
    active: { provider: 'anthropic', model: 'claude-haiku-5-5', last4: '7c1d' },
    models: { openai: [], gemini: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }], anthropic: [{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }] },
  },
};

/** The sample actions of the board: the states are drawn, not driven. */
const NO_ACTIONS: TurnActions = {
  onStop: () => undefined,
  onRetry: () => undefined,
  onCancel: () => undefined,
  onSwitch: () => Promise.resolve(false),
};

interface StateCard {
  code: string;
  title: string;
  /** What the API or the browser says in this state (the board's corner note). */
  cause: ReactNode;
  tone?: 'warn';
  /** G: the board's tighter card. */
  tight?: boolean;
  body: ReactNode;
}

const DOUBT = turn('Lease DHCP kéo dài bao lâu?', {
  stage: 'done',
  jev: 'ok',
  text: 'Lease thường được gia hạn khi đi được nửa thời gian [1]. Mặc định trên router nhà là 24 giờ [2].',
  sources: [source(1, 'Giao thức DHCP', 'Lease'), source(2, 'Router gia đình', 'DHCP')],
  citations: [
    { n: 1, supported: true },
    { n: 2, supported: false },
  ],
  questionId: 'sample',
});

const CARDS: readonly StateCard[] = [
  {
    code: 'A',
    title: 'Đang nghĩ',
    cause: 'status · searching',
    body: (
      <TurnView
        turn={turn('DNS hoạt động thế nào?', {
          stage: 'searching',
          jev: 'ok',
          found: 3,
          sources: [source(1, 'Lab DNS'), source(2, 'HTTP')],
          text: 'DNS đổi tên miền thành IP. Máy bạn hỏi resolver, resolver hỏi tiếp root, rồi TLD',
        })}
        keys={KEYS}
        actions={NO_ACTIONS}
        size="full"
      />
    ),
  },
  { code: 'B', title: 'Kho chưa có', cause: 'NO_ANSWER', body: <TurnView turn={turn('Sao lưu etcd thế nào?', { stage: 'failed', failure: 'no-answer' })} keys={KEYS} actions={NO_ACTIONS} size="full" /> },
  {
    code: 'C',
    title: 'Key bị từ chối',
    cause: 'USER_KEY_REJECTED',
    tone: 'warn',
    body: (
      <TurnView
        turn={turn('So sánh TCP và UDP', { stage: 'failed', failure: 'key-rejected', key: { provider: 'openai', last4: 'a1b2' }, sources: [source(1, 'Lab TCP/UDP'), source(2, 'Lab TCP/UDP', 'Bắt tay 3 lần')] })}
        keys={KEYS}
        actions={NO_ACTIONS}
        size="full"
      />
    ),
  },
  {
    code: 'D',
    title: 'Hết credit',
    cause: 'USER_KEY_NO_CREDIT',
    tone: 'warn',
    body: <TurnView turn={turn('Tóm tắt lab HTTP', { stage: 'failed', failure: 'no-credit', key: { provider: 'gemini' } })} keys={KEYS} actions={NO_ACTIONS} size="full" />,
  },
  {
    code: 'E',
    title: 'Jev tạm nghỉ',
    cause: 'status · jev: off',
    body: <JevOffNote turn={turn('DHCP cấp IP ra sao?', { stage: 'writing', jev: 'off', sources: [source(1, 'Giao thức DHCP')] })} />,
  },
  {
    code: 'F',
    title: 'Mất mạng',
    cause: (
      <span className="f02-offline">
        <span aria-hidden="true" />
        Offline
      </span>
    ),
    body: <TurnView turn={turn('ICMP khác gì TCP?', { stage: 'queued' })} keys={KEYS} actions={NO_ACTIONS} size="full" />,
  },
  {
    code: 'G',
    title: 'Trích dẫn không khả dụng',
    cause: 'check · 1/2',
    tone: 'warn',
    tight: true,
    body: (
      <>
        <QuestionBubble turn={DOUBT} size="full" />
        <div className="copilot-box">
          <AnswerText turn={DOUBT} />
        </div>
        <DoubtWarning turn={DOUBT} size="full" />
      </>
    ),
  },
  {
    code: 'H',
    title: 'Lỗi · Thử lại',
    cause: 'PROVIDER_FAILED',
    body: (
      <TurnView
        turn={turn('Vẽ sơ đồ hành trình gói tin', { stage: 'failed', failure: 'interrupted', sources: [source(1, 'Packet Journey'), source(2, 'ARP'), source(3, 'Giao thức DHCP'), source(4, 'Switch')] })}
        keys={KEYS}
        actions={NO_ACTIONS}
        size="full"
      />
    ),
  },
];

/**
 * Board F02-CopilotStates: the eight states of a Copilot answer side by side, each drawn by the very components of
 * C14 and the C09 panel (pages/copilot-turn.tsx) from a sample turn. The app shows one state at a time, from the API
 * (pages/copilot-run.ts); the corner note of each card says which answer of the API puts it there.
 */
export function CopilotStatesPage(): ReactNode {
  return (
    <SessionProvider value={{ status: 'ready', signedIn: true, signInAvailable: true, user: { name: 'Đạt', email: null, picture: null } }}>
      <AppShell screen="F02-CopilotStates" rail="copilot" veil="strong" unread={3} className="f02-shell">
        <div className="f02-board">
          <div className="f02-head">
            <h1 className="f02-title">AI Copilot · 8 trạng thái</h1>
            <span className="f02-lead">Jev tìm và kiểm nguồn miễn phí · model của bạn viết câu trả lời</span>
            <Button variant="rim" size="lg" href="/copilot" className="f02-open">
              Mở AI Copilot
            </Button>
          </div>
          <div className="f02-grid">
            {CARDS.map((card) => (
              <section key={card.code} className="f02-card" data-tone={card.tone} data-tight={card.tight || undefined} aria-label={card.title}>
                <div className="f02-card-head">
                  <span className="f02-card-title">
                    {card.code} · {card.title}
                  </span>
                  <span className="f02-card-cause">{card.cause}</span>
                </div>
                {card.body}
              </section>
            ))}
          </div>
        </div>
      </AppShell>
    </SessionProvider>
  );
}
