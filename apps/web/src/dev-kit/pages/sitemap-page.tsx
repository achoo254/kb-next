import type { ReactNode } from 'react';
import { brand } from '../../brand';
import { RimPanel } from '../../ui/rim-panel';
import { BoardLink, DocBoard } from './doc-board';
import './sitemap-page.css';

/** A screen of the sitemap: its name and board code. */
type Entry = readonly [name: string, code: string];

const GLOBAL: readonly Entry[] = [
  ['AI Copilot · theo ngữ cảnh', 'C14'],
  ['⌘K Command palette', 'F01'],
  ['Trang kết quả tìm', 'C12'],
  ['Thông báo · Inbox', 'C20'],
  ['Quick Create (+)', 'C01'],
];
const BEFORE: readonly Entry[] = [
  ['Landing', 'S01'],
  ['Đăng nhập (auth.hoandat.com)', 'S02'],
  ['Onboarding', 'S03'],
];
const YOURS: readonly Entry[] = [
  ['Của tôi · nháp, chờ duyệt', 'C08'],
  ['Cài đặt cá nhân', 'H03'],
  ['Key riêng (AI)', 'F03'],
  ['Offline, đồng bộ', 'H04'],
];
const ADMIN: readonly Entry[] = [
  ['Hàng duyệt', 'A01'],
  ['Nội dung, ẩn/hiện', 'A02'],
  ['API đăng bài', 'A03'],
  ['Workspace, RBAC, nhật ký', 'C19'],
];

/** The four P0 flows: each step's text and the board it happens on. */
const FLOWS: ReadonlyArray<{ name: string; steps: readonly Entry[] }> = [
  { name: '1 · Khám phá', steps: [['Bấm hành tinh Networking', 'C09'], ['Chọn bộ Giao thức nền tảng', 'C10'], ['Đọc Giao thức DHCP', 'C11']] },
  { name: '2 · Tìm', steps: [['⌘K gõ “dhcp”', 'F01'], ['Xem tất cả kết quả', 'C12'], ['Mở đoạn khớp', 'C11']] },
  {
    name: '3 · Hỏi AI',
    steps: [['Đang đọc DHCP', 'C11'], ['Hỏi Copilot · phạm vi Tài liệu', 'C14'], ['Bấm trích dẫn [1]', 'C14'], ['Nhảy tới đúng đoạn', 'C11']],
  },
  {
    name: '4 · Đóng góp',
    steps: [['Bấm +', 'C01'], ['Viết ghi chú', 'C02'], ['Gửi duyệt', 'C04'], ['Đã gửi', 'C06'], ['Người duyệt duyệt', 'A01'], ['Nhận thông báo', 'C20']],
  },
];

function Band({ title, label, entries, warn }: { title: string; label: string; entries: readonly Entry[]; warn?: boolean }): ReactNode {
  return (
    <RimPanel radius="card" label={label} className={warn ? 'z01-band z01-band-warn' : 'z01-band'}>
      <h3>{title}</h3>
      {entries.map(([name, code]) => (
        <BoardLink key={code} code={code} className="z01-mini">
          {name}
          <span>{code}</span>
        </BoardLink>
      ))}
    </RimPanel>
  );
}

function Node({ name, note, code, big }: { name: string; note: string; code: string; big?: boolean }): ReactNode {
  return (
    <BoardLink code={code} className={big ? 'z01-node z01-node-big' : 'z01-node doc-surface'}>
      <b>{name}</b>
      <i>{note}</i>
    </BoardLink>
  );
}

function VLine(): ReactNode {
  return <div className="z01-vline" aria-hidden="true" />;
}

/** Board Z01-Sitemap: the navigation layers, the screens around them, and the four P0 flows. */
export function SitemapPage(): ReactNode {
  return (
    <DocBoard board="Z01-Sitemap" kicker={`${brand.appName} · kiến trúc điều hướng`} title="Sitemap và luồng P0" className="z01">
      <div className="z01-body">
        <div className="z01-side">
          <Band title="Lớp toàn cục · mở ở mọi màn" label="Lớp toàn cục" entries={GLOBAL} />
          <Band title="Trước khi vào" label="Bắt đầu" entries={BEFORE} />
        </div>

        <div className="z01-tree">
          <Node name="Universe" note="C09 · 3D" code="C09" big />
          <VLine />
          <div className="z01-row">
            <Node name="Canvas" note="C15 · 2D canvas" code="C15" />
            <span className="z01-hlink" aria-hidden="true" />
            <Node name="Space · hành tinh" note="C10 · hybrid" code="C10" big />
            <span className="z01-hlink" aria-hidden="true" />
            <Node name="Graph" note="C13 · hybrid" code="C13" />
          </div>
          <VLine />
          <Node name="Collection" note="trong C10" code="C10" />
          <VLine />
          <div className="z01-bar" aria-hidden="true" />
          <div className="z01-row z01-leaves">
            <div className="z01-col">
              <VLine />
              <Node name="Document · đọc" note="C11 · 2D" code="C11" big />
            </div>
            <div className="z01-col">
              <VLine />
              <Node name="Sửa / viết" note="C02 · 2D" code="C02" />
            </div>
            <div className="z01-col">
              <VLine />
              <Node name="Phiên bản" note="C17" code="C17" />
            </div>
          </div>
          <VLine />
          <div className="z01-row z01-tools">
            <Node name="Chia sẻ" note="C18" code="C18" />
            <Node name="Dịch AI" note="F04" code="F04" />
            <Node name="Nhập tệp" note="C16" code="C16" />
            <Node name="Lối đi" note="Flow · C07" code="C07" />
          </div>
        </div>

        <div className="z01-side">
          <Band title="Của bạn" label="Cá nhân" entries={YOURS} />
          <Band title="Quản trị · chỉ admin" label="Quản trị" entries={ADMIN} warn />
        </div>
      </div>

      <RimPanel radius="card" label="4 luồng P0" className="z01-flows">
        <h2>4 luồng P0</h2>
        {FLOWS.map((flow) => (
          <div key={flow.name} className="z01-flow">
            <span className="z01-flow-name">{flow.name}</span>
            {flow.steps.map(([text, code], index) => (
              <div key={`${index}-${text}`} className="z01-flow-step">
                {index > 0 && (
                  <span className="z01-arrow" aria-hidden="true">
                    <span />
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M0 0l10 5-10 5z" />
                    </svg>
                  </span>
                )}
                <BoardLink code={code} className="z01-step doc-surface">
                  {text}
                  <i>{code}</i>
                </BoardLink>
              </div>
            ))}
          </div>
        ))}
      </RimPanel>
    </DocBoard>
  );
}
