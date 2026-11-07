import { type CSSProperties, type ReactNode, useState } from 'react';
import { APP_HOST, brand } from '../../brand';
import { AiAvatar } from '../../ui/ai-avatar';
import { ORB_ART } from '../../ui/art';
import { AskInput } from '../../ui/ask-input';
import { Button } from '../../ui/button';
import { ChatBubble } from '../../ui/chat-bubble';
import { Chip } from '../../ui/chip';
import { CollectionCard, DocCard, SpaceCard } from '../../ui/content-card';
import { Crystal } from '../../ui/crystal';
import { cssColourLabel } from '../../ui/css-token';
import { Nebula, ParticleField } from '../../ui/effects';
import { GradientTitle } from '../../ui/gradient-title';
import { Icon } from '../../ui/icon';
import { LensRail, type LensRailItem } from '../../ui/lens-rail';
import { DialogCard } from '../../ui/modal';
import { OrbitField, type OrbitDot, type OrbitPath } from '../../ui/orbit-field';
import { OriginTag } from '../../ui/origin-tag';
import { Planet } from '../../ui/planet';
import { RimPanel } from '../../ui/rim-panel';
import { Skeleton } from '../../ui/skeleton';
import { SourceRow } from '../../ui/source-row';
import { type StageCard, StageCards } from '../../ui/stage-cards';
import { Tabs } from '../../ui/tabs';
import { TextField } from '../../ui/text-field';
import { type ThemeName, setTheme, useTheme } from '../../ui/theme';
import { Toast } from '../../ui/toast';
import { ViewNav, type ViewNavItem } from '../../ui/view-nav';
import './design-system-page.css';

/** The token table of the board: name, token suffix of tokens.css, and the board's contrast notes. */
const TOKEN_ROWS = [
  { name: 'bg', token: 'bg', dark: 'nền', light: 'nền' },
  { name: 'bg2', token: 'bg2', dark: 'nền 2', light: 'nền 2' },
  { name: 'surfaceSolid', token: 'surface-solid', dark: 'bề mặt', light: 'bề mặt' },
  { name: 'text', token: 'text', dark: '≈18:1', light: '≈16:1' },
  { name: 'muted', token: 'muted', dark: '≈10:1', light: '≈7.3:1' },
  { name: 'primary', token: 'primary', dark: 'chữ trắng ≈5.7:1', light: 'chữ trắng ≈7:1' },
  { name: 'accent', token: 'accent', dark: '≈11:1', light: '≈5:1' },
  { name: 'link', token: 'link', dark: '≈10:1', light: '≈7:1' },
  { name: 'success', token: 'success', dark: '≈7:1', light: '≈5.2:1' },
  { name: 'successText', token: 'success-text', dark: '≈13:1', light: '≈5.2:1' },
  { name: 'warn', token: 'warn', dark: '≈8.5:1', light: '≈4.6:1' },
  { name: 'warnText', token: 'warn-text', dark: '≈13:1', light: '≈6.8:1' },
] as const;

const COSMIC = [
  { token: '--violet-600', hi: '--violet-300', role: 'Primary' },
  { token: '--cyan-500', hi: '--cyan-200', role: 'Secondary' },
  { token: '--cyan-400', hi: '--cyan-100', role: 'Accent' },
  { token: '--amber-500', hi: '--amber-200', role: 'Warning' },
  { token: '--emerald-500', hi: '--emerald-200', role: 'Success' },
] as const;

const MOTION = [
  { name: 'Bay tới', value: '900ms · in-out', use: 'Universe → Space' },
  { name: 'Quỹ đạo', value: '9–24s · tuyến tính', use: 'Vệ tinh, vòng sáng' },
  { name: 'Trôi', value: '5–6s · lặp', use: 'Hành tinh lơ lửng' },
  { name: 'Bật ra', value: '300ms · nảy nhẹ', use: 'Thẻ, toolbar, menu' },
  { name: 'Biến hình', value: '700ms', use: 'Hành tinh → tài liệu' },
  { name: 'Phản hồi', value: '150–200ms', use: 'Hover, nhấn, toast' },
] as const;

const TABS = [
  { id: 'docs', label: 'Tài liệu' },
  { id: 'collections', label: 'Bộ sưu tập' },
  { id: 'paths', label: 'Lối đi' },
];

const RAIL_ITEMS: readonly LensRailItem[] = [
  { id: 'universe', label: 'Universe', href: '/u', icon: 'home' },
  { id: 'create', label: 'Tạo mới', href: '/u', icon: 'plus', kind: 'create' },
  { id: 'search', label: 'Tìm kiếm', href: '/search', icon: 'search' },
];

const VIEW_ITEMS: readonly ViewNavItem[] = [
  { id: 'orbit', label: 'Orbit', href: '/u', icon: 'cube' },
  { id: 'graph', label: 'Graph', href: '/graph', icon: 'graph-mini' },
  { id: 'canvas', label: 'Canvas', href: '/canvas', icon: 'canvas-mini' },
  { id: 'docs', label: 'Docs', href: '/me', icon: 'docs-mini' },
];

const STAGE: readonly StageCard[] = [
  { id: 'spaces', href: '/u', title: 'Spaces', icon: 'cube' },
  { id: 'universe', href: '/u', title: 'Universe', icon: 'home', highlight: true },
  { id: 'mine', href: '/me', title: 'Của tôi', icon: 'bars' },
];

const ORBIT_MAIN = 'M18 130 A92 60 0 1 1 202 130 A92 60 0 1 1 18 130';
const ORBIT_SIDE = 'M40 138 A70 26 0 1 1 180 138 A70 26 0 1 1 40 138';
const ORBITS: readonly OrbitPath[] = [{ d: ORBIT_MAIN }, { d: ORBIT_SIDE, width: 1.2 }];
const DOTS: readonly OrbitDot[] = [
  { orbit: 0, size: 9, tone: 'sky', duration: 16, delay: -2 },
  { orbit: 0, size: 7, tone: 'violet', duration: 16, delay: -10 },
  { orbit: 1, size: 6, tone: 'cyan', duration: 11, delay: -4, reverse: true },
];

const DOC_PREVIEW = ['--violet-300', '--cyan-300', '--violet-300', '--cyan-300'] as const;

function swatch(token: string): CSSProperties {
  return { background: `var(${token})` };
}

/** One row of the token table: the colour of each theme on its own theme's cell. */
function TokenRow({ row }: { row: (typeof TOKEN_ROWS)[number] }): ReactNode {
  const dark = `--dark-${row.token}` as const;
  const light = `--light-${row.token}` as const;
  return (
    <>
      <span className="ds-token-name">{row.name}</span>
      <span className="ds-token-cell" data-theme-cell="dark">
        <span className="ds-swatch" style={swatch(dark)} />
        <span className="ds-token-value">{cssColourLabel(dark)}</span>
        <span className="ds-token-ratio">{row.dark}</span>
      </span>
      <span className="ds-token-cell" data-theme-cell="light">
        <span className="ds-swatch" style={swatch(light)} />
        <span className="ds-token-value">{cssColourLabel(light)}</span>
        <span className="ds-token-ratio">{row.light}</span>
      </span>
    </>
  );
}

function Header({ theme }: { theme: ThemeName }): ReactNode {
  const dark = theme === 'dark';
  return (
    <header className="ds-header">
      <div>
        <div className="ds-kicker">
          {brand.appName} · {APP_HOST} · {dark ? 'Chế độ tối' : 'Chế độ sáng'}
        </div>
        <h1 className="ds-title">Design System — {brand.appName} Universe</h1>
      </div>
      <div className="ds-header-actions">
        <Chip variant="note">Không gian, không phải danh sách</Chip>
        <Chip variant="note">Hình trước, chữ sau</Chip>
        <Chip variant="note">Mọi thứ đều nối được</Chip>
        <Button
          variant="primary"
          icon={dark ? 'sun' : 'moon'}
          className="ds-theme-toggle"
          aria-label="Đổi giao diện sáng tối"
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          dataId="ds-theme-toggle"
        >
          {dark ? 'Sáng' : 'Tối'}
        </Button>
      </div>
    </header>
  );
}

function UniverseKit(): ReactNode {
  return (
    <RimPanel variant="rim" radius="section" label="Bộ thành phần Universe" className="ds-kit ds-span-12">
      <div className="ds-kit-head">
        <h2 className="ds-h2">Bộ thành phần Universe · đã chốt theo C09</h2>
        <span className="ds-kit-sub">Mẫu sống, mọi màn dùng lại đúng các khối này</span>
      </div>
      <div className="ds-kit-grid">
        <figure className="ds-figure">
          <div className="ds-tile ds-tile-rail">
            <LensRail label="Mẫu lens rail" items={RAIL_ITEMS} activeId="universe" size="mini" />
          </div>
          <figcaption className="ds-caption">
            <b>Lens rail</b> · viền gradient phát sáng
          </figcaption>
        </figure>

        <figure className="ds-figure">
          <div className="ds-tile ds-tile-nav">
            <ViewNav label="Mẫu thanh chế độ xem" items={VIEW_ITEMS} activeId="orbit" size="mini" className="ds-nav-sample" />
            <GradientTitle as="div" size={32} className="ds-hero">
              Vũ trụ tri thức
            </GradientTitle>
            <span className="ds-hero-note">
              Hero: Inter 700 · {cssColourLabel('--hero-1')} → {cssColourLabel('--hero-2')} → {cssColourLabel('--hero-3')} →{' '}
              {cssColourLabel('--hero-4')}
            </span>
            <div className="ds-row">
              <Button variant="rim" className="ds-kit-btn">
                Nút chính · rim
              </Button>
              <Button variant="glass" className="ds-kit-btn">
                Nút phụ · kính
              </Button>
            </div>
            <span className="ds-kit-text">Mục đang mở trong thanh chế độ xem và nút chính dùng chung một kiểu: lòng tím đậm, viền lavender phát sáng.</span>
          </div>
          <figcaption className="ds-caption">
            <b>Thanh chế độ xem · chữ hero · nút</b>
          </figcaption>
        </figure>

        <figure className="ds-figure">
          <RimPanel as="div" variant="rim" radius="card" className="ds-chat">
            <div className="ds-chat-head">
              <AiAvatar size="sm" />
              <span className="ds-chat-title">AI Knowledge Assistant</span>
            </div>
            <ChatBubble from="user" size="sm">
              Máy mới lấy IP thế nào?
            </ChatBubble>
            <ChatBubble from="ai" size="sm">
              Qua 4 bước DORA, theo 3 tài liệu.
            </ChatBubble>
            <SourceRow title="Giao thức DHCP" tag="Chính thức" href="/d/dhcp" size="sm" />
            <AskInput label="Câu hỏi mẫu cho AI" placeholder="Hỏi thêm…" size="sm" onAsk={() => undefined} />
          </RimPanel>
          <figcaption className="ds-caption">
            <b>Rim panel + phần chat AI</b> · panel, sheet, modal
          </figcaption>
        </figure>

        <figure className="ds-figure">
          <div className="ds-tile">
            <StageCards cards={STAGE} size="mini" />
          </div>
          <figcaption className="ds-caption">
            <b>Thẻ dock nghiêng trên sân khấu neon</b> · thẻ phụ, ô lối tắt
          </figcaption>
        </figure>

        <figure className="ds-figure">
          <div className="ds-tile">
            <OrbitField
              width={220}
              height={260}
              orbits={ORBITS}
              gradientX={[18, 202]}
              tints={[{ cx: 180, cy: 91, space: 'networking' }]}
              tintRadius={52}
              dots={DOTS}
              variant="tile"
              className="ds-orbit"
            />
            <img className="ds-orb" src={ORB_ART} alt="" aria-hidden="true" />
            <Crystal space="networking" name="Network" count="9 tài liệu" icon="globe" size="mini" href="/s/networking" className="ds-crystal" />
          </div>
          <figcaption className="ds-caption">
            <b>Tinh thể + lõi tối · quỹ đạo</b> · gradient, ánh màu gần tinh thể, chấm chạy
          </figcaption>
        </figure>
      </div>
      <p className="ds-kit-note">
        <b>Điều hướng:</b> desktop dùng thanh chế độ xem phía trên (Orbit · Graph · Canvas · Docs) cộng lens rail bên trái. Dock dưới đáy chỉ có trên
        điện thoại, dạng viên rim: lòng tối, viền phát sáng, mục đang mở là viên tím đậm. Góc phải trên chỉ có chuông và ⌘K. Đổi sáng tối nằm trong Cài
        đặt (H03). Copilot mở từ rail, ⌘K hoặc panel AI.
      </p>
    </RimPanel>
  );
}

function CardsAndDialogs(): ReactNode {
  const [toast, setToast] = useState(true);
  return (
    <RimPanel variant="glass" radius="section" className="ds-section ds-span-7">
      <h2 className="ds-h2">Thẻ</h2>
      <div className="ds-grid-3">
        <DocCard href="/d/dhcp" origin="official" title="Giao thức DHCP" meta="Lab · 4 bước DORA · VI · EN" note="Thẻ tài liệu">
          <span className="ds-preview" aria-hidden="true">
            {DOC_PREVIEW.map((token, index) => (
              <span key={index} style={swatch(token)} />
            ))}
          </span>
        </DocCard>
        <SpaceCard href="/s/networking" name="Networking" meta="8 lab · 4 bộ sưu tập" note="Thẻ Space (hành tinh)" />
        <CollectionCard href="/s/networking" title="Giao thức nền tảng" note="Thẻ Collection (mặt trăng) · 4 tài liệu" />
      </div>
      <h2 className="ds-h2 ds-h2-gap">Hộp thoại và toast</h2>
      <div className="ds-grid-3 ds-align-start">
        <div role="dialog" aria-label="Xác nhận xoá">
          <DialogCard
            title="Xoá hành tinh này?"
            description="Vào thùng rác 30 ngày, khôi phục được."
            actions={
              <>
                <Button variant="ghost" size="md" className="ds-dialog-btn">
                  Huỷ
                </Button>
                <Button variant="warn" size="md" className="ds-dialog-btn">
                  Xoá
                </Button>
              </>
            }
          />
        </div>
        <div role="dialog" aria-label="Tạo bộ sưu tập">
          <DialogCard
            title="Tạo bộ sưu tập"
            className="ds-dialog-form"
            actions={
              <Button variant="primary" size="md" className="ds-dialog-btn ds-bold">
                Tạo
              </Button>
            }
          >
            <TextField label="Tên" defaultValue="Ghi chú mạng" variant="compact" />
          </DialogCard>
        </div>
        <div className="ds-column">
          <Button variant="ghost" className="ds-toast-btn" onClick={() => setToast((shown) => !shown)} aria-pressed={toast} dataId="ds-toast-toggle">
            Hiện toast
          </Button>
          {toast && <Toast variant="card" tone="success" message="Đã lưu vào thùng rác" onUndo={() => setToast(false)} />}
        </div>
      </div>
    </RimPanel>
  );
}

function StatesAndSurfaces(): ReactNode {
  return (
    <RimPanel variant="glass" radius="section" className="ds-section ds-states ds-span-5">
      <h2 className="ds-h2">Mẫu trạng thái</h2>
      <div className="ds-grid-3">
        <RimPanel as="div" variant="solid" radius="well" className="ds-state">
          <span className="ds-empty-mark" aria-hidden="true" />
          <span className="ds-state-name">Trống</span>
          <span className="ds-state-note">Một câu + 1 hành động</span>
        </RimPanel>
        <RimPanel as="div" variant="solid" radius="well" className="ds-state ds-state-loading">
          <Skeleton circle width={48} height={48} />
          <Skeleton height={10} />
          <Skeleton height={10} width="70%" />
          <span className="ds-state-note">Đang tải · giữ chỗ đúng kích thước</span>
        </RimPanel>
        <RimPanel as="div" variant="solid" radius="well" tone="warn" className="ds-state">
          <span className="ds-error-icon">
            <Icon name="warning" size={40} />
          </span>
          <span className="ds-state-name">Lỗi</span>
          <span className="ds-state-note">Lý do + cách sửa + Thử lại</span>
        </RimPanel>
      </div>
      <h2 className="ds-h2 ds-h2-gap">Bề mặt và hiệu ứng</h2>
      <div className="ds-grid-5">
        <div className="ds-effect">
          <RimPanel as="div" variant="glass" className="ds-effect-box" />
          <span>Glass</span>
        </div>
        <div className="ds-effect">
          <div className="ds-effect-box ds-effect-fill" />
          <span>Glow</span>
        </div>
        <div className="ds-effect">
          <div className="ds-effect-box ds-effect-fill ds-center">
            <Planet size={44} />
          </div>
          <span>Planet</span>
        </div>
        <div className="ds-effect">
          <div className="ds-effect-box ds-effect-fill ds-clip">
            <Nebula />
          </div>
          <span>Nebula</span>
        </div>
        <div className="ds-effect">
          <div className="ds-effect-box ds-effect-fill ds-clip">
            <ParticleField count={14} />
          </div>
          <span>Particle</span>
        </div>
      </div>
      <div className="ds-grid-3 ds-facts">
        <div className="ds-fact">
          <b>Khoảng cách</b>
          <br />
          <span>4·8·12·16·24·32·48</span>
        </div>
        <div className="ds-fact">
          <b>Bo góc</b>
          <br />
          <span>12 chip · 20 thẻ · 28 panel</span>
        </div>
        <div className="ds-fact">
          <b>Chạm</b>
          <br />
          <span>≥ 44px · cách ≥ 8px</span>
        </div>
      </div>
    </RimPanel>
  );
}

/** /dev/kit/design-system: board DesignSystem (design/mock/DesignSystem.dc.html), built from the shared kit. */
export function DesignSystemPage(): ReactNode {
  const theme = useTheme();
  const [tab, setTab] = useState('docs');
  return (
    <main className="ds-page" data-screen="DesignSystem" data-id="screen-DesignSystem">
      <Header theme={theme} />
      <div className="ds-grid">
        <RimPanel variant="glass" radius="section" className="ds-section ds-span-7">
          <h2 className="ds-h2">Token màu · Tối và Sáng</h2>
          <div className="ds-tokens">
            <span className="ds-token-head">Token</span>
            <span className="ds-token-head">Tối (Dark)</span>
            <span className="ds-token-head">Sáng (Light)</span>
            {TOKEN_ROWS.map((row) => (
              <TokenRow key={row.name} row={row} />
            ))}
          </div>
          <span className="ds-note">Tỷ lệ tương phản ≈ so với nền bg của cùng chế độ (chữ thường ≥ 4.5:1). Màu nền và bề mặt không cần tỷ lệ.</span>
        </RimPanel>

        <div className="ds-span-5 ds-stack">
          <RimPanel variant="glass" radius="section" className="ds-section ds-gap-14">
            <h2 className="ds-h2">Bảng màu · Cosmic</h2>
            <div className="ds-grid-5 ds-gap-8">
              {COSMIC.map((colour) => (
                <div key={colour.token} className="ds-cosmic">
                  <span
                    className="ds-cosmic-orb"
                    style={{
                      background: `radial-gradient(circle at 35% 30%, var(${colour.hi}), var(${colour.token}) 60%)`,
                      boxShadow: `0 0 20px var(${colour.token})`,
                    }}
                  />
                  <span className="ds-cosmic-hex">{cssColourLabel(colour.token)}</span>
                  <span className="ds-cosmic-role">{colour.role}</span>
                </div>
              ))}
            </div>
          </RimPanel>
          <RimPanel variant="glass" radius="section" className="ds-section ds-gap-10">
            <h2 className="ds-h2">Chữ</h2>
            <div className="ds-type-faces">
              <div className="ds-face">
                <span className="ds-face-sample ds-display">Aa</span>
                <div className="ds-face-name">Space Grotesk</div>
                <div className="ds-face-use">Tiêu đề, tên hành tinh, số</div>
              </div>
              <div className="ds-face">
                <span className="ds-face-sample ds-inter">Aa</span>
                <div className="ds-face-name">Inter</div>
                <div className="ds-face-use">Nội dung · đủ dấu tiếng Việt</div>
              </div>
            </div>
            <div className="ds-type-scale">
              <span className="ds-type-display">
                Vũ trụ tri thức <span className="ds-type-tag">Display 36–48</span>
              </span>
              <span className="ds-type-h1">
                Giao thức DHCP <span className="ds-type-tag ds-normal">H1 28</span>
              </span>
              <span className="ds-type-reader">
                Đọc dài: 17px, dòng 1.6, tối đa 72 ký tự <span className="ds-type-tag ds-plain">Reader</span>
              </span>
              <span className="ds-type-body">
                Giao diện: 15px <span className="ds-type-tag ds-plain">Body</span>
              </span>
              <span className="ds-note">Nhãn, nguồn, trạng thái · Caption 12</span>
            </div>
          </RimPanel>
        </div>

        <RimPanel variant="glass" radius="section" className="ds-section ds-span-6 ds-gap-14">
          <h2 className="ds-h2">Nguồn gốc nội dung</h2>
          <div className="ds-wrap">
            <OriginTag origin="official" />
            <OriginTag origin="community" />
            <OriginTag origin="private" />
            <OriginTag origin="pending" />
          </div>
          <span className="ds-note">Mọi thẻ, hành tinh, kết quả tìm và trích dẫn đều mang một nhãn này. Phân biệt bằng icon và chữ, không chỉ bằng màu.</span>
          <h2 className="ds-h2 ds-h2-gap">Nút, chip, tab</h2>
          <div className="ds-wrap ds-center-items">
            <Button variant="primary">Primary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="subtle" disabled>
              Disabled
            </Button>
            <Chip>dhcp</Chip>
            <Chip variant="code">VI · EN</Chip>
          </div>
          <Tabs label="Ví dụ tab" items={TABS} value={tab} onChange={setTab} dataId="ds-tabs" />
        </RimPanel>

        <RimPanel variant="glass" radius="section" className="ds-section ds-span-6">
          <h2 className="ds-h2">Ô nhập và vòng focus</h2>
          <div className="ds-grid-2">
            <TextField label="Tên bộ sưu tập" defaultValue="Giao thức nền tảng" hint="Gợi ý: ngắn, dễ đoán" />
            <TextField label="Tiêu đề" defaultValue="" error="Cần tiêu đề trước khi đăng" errorTone="warn" />
          </div>
          <div className="ds-grid-2">
            <div className="ds-focus-sample" data-theme-cell="dark">
              <span className="ds-focus-pill kf-focus-demo">Focus · Tối</span>
              <span className="ds-focus-note">2px {cssColourLabel('--dark-focus')} · cách 3px</span>
            </div>
            <div className="ds-focus-sample" data-theme-cell="light">
              <span className="ds-focus-pill kf-focus-demo">Focus · Sáng</span>
              <span className="ds-focus-note">2px {cssColourLabel('--light-focus')} · cách 3px</span>
            </div>
          </div>
          <span className="ds-note">Nhãn luôn hiện phía trên ô, không dùng placeholder thay nhãn. Lỗi nằm ngay dưới ô, kèm icon và chữ.</span>
        </RimPanel>

        <UniverseKit />
        <CardsAndDialogs />
        <StatesAndSurfaces />

        <RimPanel variant="glass" radius="section" className="ds-section ds-span-12">
          <h2 className="ds-h2">Chuyển động · token</h2>
          <div className="ds-grid-6">
            {MOTION.map((motion) => (
              <div key={motion.name} className="ds-motion">
                <span className="ds-motion-name">{motion.name}</span>
                <span className="ds-motion-value">{motion.value}</span>
                <span className="ds-motion-use">{motion.use}</span>
              </div>
            ))}
          </div>
          <span className="ds-note">
            Giảm chuyển động: dừng mọi quay, trôi, lấp lánh; chuyển cảnh chỉ còn mờ dần 200ms. Màn đọc, viết, tìm và quản trị không có chuyển động nền.
          </span>
        </RimPanel>
      </div>
    </main>
  );
}
