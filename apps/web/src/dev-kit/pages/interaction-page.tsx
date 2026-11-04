import { type CSSProperties, type ReactNode, useState } from 'react';
import { ORB_ART } from '../../ui/art';
import { Chip } from '../../ui/chip';
import { Nebula, ParticleField } from '../../ui/effects';
import { Icon, type IconName } from '../../ui/icon';
import { OrbitField, type OrbitDot, type OrbitPath } from '../../ui/orbit-field';
import { Planet, type PlanetTone } from '../../ui/planet';
import { RimPanel } from '../../ui/rim-panel';
import { Tabs } from '../../ui/tabs';
import { UniverseBackdrop } from '../../ui/universe-backdrop';
import './interaction-page.css';

interface Layer {
  id: 'universe' | 'space' | 'collection' | 'document';
  name: string;
  sub: string;
  href: string;
  tone: PlanetTone;
  size: number;
  icon: IconName;
}

/** The navigation layers, outermost first (orb diameters of the board). */
const LAYERS: readonly Layer[] = [
  { id: 'universe', name: 'Universe', sub: 'Toàn cảnh · tìm · gần đây', href: '/u', tone: 'violet', size: 68, icon: 'layer-universe' },
  { id: 'space', name: 'Space', sub: 'Hành tinh · lĩnh vực', href: '/s/networking', tone: 'cyan', size: 60, icon: 'layer-space' },
  { id: 'collection', name: 'Collection', sub: 'Mặt trăng · bộ sưu tập', href: '/s/networking', tone: 'violet', size: 52, icon: 'layer-collection' },
  { id: 'document', name: 'Document', sub: 'Đọc · sửa · phiên bản', href: '/d/dhcp', tone: 'blue', size: 48, icon: 'layer-document' },
];

const SCOPES = ['Universe', 'Space', 'Collection', 'Document'] as const;

const GLOBALS = [
  { name: 'Thanh chế độ xem', text: 'Trên cùng: Orbit · Graph · Canvas · Docs. Mục đang mở là viên tím viền sáng', href: '/u' },
  { name: 'Lens rail', text: 'Mép trái: Universe · Graph · + · Tìm · Copilot · Spaces · Của tôi · Cài đặt', href: '/u' },
  { name: 'Dock dưới · chỉ mobile', text: 'Viên rim 5 mục: Vũ trụ · Graph · + · Của tôi · Copilot', href: '/u' },
  { name: '⌘K và chuông', text: 'Góc phải trên. Tìm, chạy lệnh, thông báo. Sáng tối ở Cài đặt', href: '/search' },
  { name: 'Breadcrumb', text: 'Universe › Space › Collection › Document', href: '/d/dhcp' },
  { name: 'Quick Create (+)', text: 'Ghi chú, tài liệu, collection, Space, nhập file', href: '/u' },
] as const;

/** The five zoom levels and the scale the demo scene flies to. */
const LEVELS = [
  { id: 'galaxy', label: 'Thiên hà', what: 'toàn bộ Universe', scale: 0.5 },
  { id: 'system', label: 'Hệ', what: 'một Space', scale: 1 },
  { id: 'planet', label: 'Hành tinh', what: 'một Collection', scale: 2 },
  { id: 'surface', label: 'Bề mặt', what: 'mở Document', scale: 4.5 },
  { id: 'passage', label: 'Đoạn', what: 'đúng câu được trích', scale: 9 },
] as const;
type LevelId = (typeof LEVELS)[number]['id'];

const VIEWS = [
  { id: 'orbit', label: 'Orbit', note: 'Mặc định ở Universe và Space: thấy toàn cảnh và quan hệ.' },
  { id: 'canvas', label: 'Canvas', note: 'Tự sắp xếp, nối, ghi chú (C15).' },
  { id: 'docs', label: 'Docs', note: 'Đọc sâu 2D, ưu tiên chữ, có chế độ sáng (C11).' },
  { id: 'list', label: 'Danh sách', note: 'Phương án 2D cho trình đọc màn hình, máy yếu, hoặc khi bật giảm chuyển động.' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

const LIST_ROWS = [
  { title: 'Giao thức DHCP', meta: 'Chính thức · Lab' },
  { title: 'TCP vs UDP bằng hình', meta: 'Cộng đồng' },
  { title: 'lab-notes.docx', meta: 'Của bạn · riêng tư' },
] as const;

const GESTURES = [
  { key: '↔', name: 'Kéo và thả', text: 'Xếp, nối trong Canvas' },
  { key: '⊕', name: 'Cuộn / chụm', text: 'Thu phóng 5 tầng' },
  { key: '●', name: 'Bấm', text: 'Chọn, hiện vệ tinh, toolbar' },
  { key: '●●', name: 'Bấm đôi', text: 'Bay vào Space' },
  { key: '⌘K', name: 'Tìm nhanh', text: 'Bảng lệnh mọi màn' },
  { key: '⌘J', name: 'Copilot', text: 'Mở panel AI theo ngữ cảnh' },
  { key: '⌘Z', name: 'Hoàn tác', text: '⇧⌘Z làm lại' },
  { key: '⌘S', name: 'Lưu ngay', text: 'Thường tự lưu' },
  { key: '←→', name: 'Mũi tên', text: 'Đi từng bước lối đi' },
  { key: 'Esc', name: 'Lùi ra', text: 'Về tầng trên' },
  { key: 'Tab', name: 'Bàn phím', text: 'Mọi nút có vòng focus' },
  { key: '⇪', name: 'Vuốt lên', text: 'Điện thoại: sheet chi tiết' },
] as const;

const MOTION_RULES = [
  'Màn đọc, viết, tìm, quản trị: không có chuyển động nền; chỉ phản hồi 150–200ms.',
  'Không animation nào chặn nhập liệu; gõ phím luôn được xử lý ngay cả khi đang chuyển cảnh.',
  'Bay giữa các tầng tối đa 900ms, bấm Esc hoặc bấm tiếp để bỏ qua.',
  'Giảm chuyển động: dừng quay, trôi, lấp lánh; chuyển cảnh còn mờ dần 200ms.',
  'Máy yếu (FPS < 30) tự chuyển Universe sang 2D, có nút bật lại 3D.',
] as const;

const TILE_ORBIT = 'M62 55 A150 36 0 1 1 362 55 A150 36 0 1 1 62 55';
const TILE_ORBITS: readonly OrbitPath[] = [{ d: TILE_ORBIT }];
const TILE_DOTS: readonly OrbitDot[] = [
  { orbit: 0, size: 9, tone: 'sky', duration: 12, delay: -1 },
  { orbit: 0, size: 7, tone: 'violet', duration: 12, delay: -7 },
];

function NavigationLayers(): ReactNode {
  return (
    <RimPanel variant="rim" radius="section" label="Kiến trúc điều hướng nhiều lớp" className="ix-section ix-nav">
      <div className="ix-head">
        <h2 className="ix-h2">Kiến trúc điều hướng nhiều lớp</h2>
        <span className="ix-head-note">Bấm từng tầng để mở màn tương ứng</span>
      </div>
      <div className="ix-nav-grid">
        <div className="ix-layers">
          {LAYERS.map((layer, index) => (
            <div key={layer.id} className="ix-layer-step">
              <a className="ix-layer" href={layer.href} data-id={`ix-layer-${layer.id}`}>
                <Planet size={layer.size} tone={layer.tone} glow="none" className={`ix-layer-orb ix-orb-${layer.id}`}>
                  <Icon name={layer.icon} size={24} />
                </Planet>
                <span className="ix-layer-name">{layer.name}</span>
                <span className="ix-layer-sub">{layer.sub}</span>
              </a>
              {index < LAYERS.length - 1 && <span className="ix-layer-link" aria-hidden="true" />}
            </div>
          ))}
        </div>
        <div className="ix-peers">
          <span className="ix-peers-label">Góc nhìn ngang hàng của một Space</span>
          <div className="ix-peers-row">
            <a className="ix-peer" data-peer="canvas" href="/canvas" data-id="ix-peer-canvas">
              Canvas<span className="ix-peer-sub">tự do</span>
            </a>
            <span className="ix-peers-swap" aria-hidden="true">
              ↔
            </span>
            <a className="ix-peer" data-peer="graph" href="/graph" data-id="ix-peer-graph">
              Graph<span className="ix-peer-sub">quan hệ</span>
            </a>
          </div>
          <span className="ix-note-small">Đổi qua lại giữ nguyên Space và vùng đang xem.</span>
        </div>
      </div>
      <a className="ix-copilot" href="/copilot" data-id="ix-copilot">
        <Planet size={36} tone="violet" glow="none" className="ix-copilot-orb">
          <Icon name="star" size={18} />
        </Planet>
        <span className="ix-copilot-title">AI Copilot · lớp toàn cục</span>
        <span className="ix-copilot-text">Mở từ mọi màn. Phạm vi mặc định theo chỗ đang đứng:</span>
        <span className="ix-copilot-scopes">
          {SCOPES.map((scope) => (
            <Chip key={scope} variant="scope">
              {scope}
            </Chip>
          ))}
        </span>
      </a>
      <div className="ix-globals">
        {GLOBALS.map((item) => (
          <a key={item.name} className="ix-global" href={item.href}>
            <span className="ix-global-name">{item.name}</span>
            <span className="ix-global-text">{item.text}</span>
          </a>
        ))}
      </div>
    </RimPanel>
  );
}

function ZoomLevels(): ReactNode {
  const [level, setLevel] = useState<LevelId>('galaxy');
  const current = LEVELS.find((entry) => entry.id === level) ?? LEVELS[0];
  const sceneStyle: CSSProperties = { transform: `scale(${current.scale})` };
  return (
    <RimPanel variant="rim" radius="section" label="Năm tầng thu phóng" className="ix-section">
      <h2 className="ix-h2">Năm tầng thu phóng · bấm để bay</h2>
      <Tabs
        label="Tầng thu phóng"
        items={LEVELS}
        value={level}
        onChange={(id) => setLevel(LEVELS.find((entry) => entry.id === id)?.id ?? 'galaxy')}
        variant="segment"
        panelIdPrefix="ix-zoom"
        dataId="ix-zoom-tabs"
      />
      <div className="ix-stage" role="tabpanel" id={`ix-zoom-${current.id}`} aria-label={`${current.label} · ${current.what}`}>
        <div className="ix-zoom-scene" style={sceneStyle} aria-hidden="true">
          <span className="ix-zoom-dot" data-tone="emerald" />
          <span className="ix-zoom-dot" data-tone="cyan" />
          <span className="ix-zoom-dot" data-tone="amber" />
          <Planet size={80} tone="violet" className="ix-zoom-planet" />
          <span className="ix-zoom-doc" />
          <span className="ix-zoom-line" data-line="1" />
          <span className="ix-zoom-line" data-line="2" />
        </div>
        <span key={current.id} className="ix-stage-tag">
          {current.label} · {current.what}
        </span>
      </div>
      <span className="ix-note">Thiên hà = Universe · Hệ = Space · Hành tinh = Collection · Bề mặt = Document · Đoạn = trích dẫn.</span>
    </RimPanel>
  );
}

function HybridViews(): ReactNode {
  const [view, setView] = useState<ViewId>('orbit');
  const current = VIEWS.find((entry) => entry.id === view) ?? VIEWS[0];
  return (
    <RimPanel variant="rim" radius="section" label="Hiển thị hybrid" className="ix-section">
      <h2 className="ix-h2">Hiển thị hybrid · cùng tri thức, bốn cách nhìn</h2>
      <Tabs
        label="Cách nhìn"
        items={VIEWS}
        value={view}
        onChange={(id) => setView(VIEWS.find((entry) => entry.id === id)?.id ?? 'orbit')}
        variant="segment"
        panelIdPrefix="ix-view"
        className="ix-view-tabs"
        dataId="ix-view-tabs"
      />
      <div className="ix-stage" role="tabpanel" id={`ix-view-${current.id}`} aria-label={current.label}>
        {view === 'orbit' && (
          <div key="orbit" className="ix-view ix-view-orbit">
            <span className="ix-view-ring" aria-hidden="true">
              <span className="ix-view-moon" />
            </span>
            <Planet size={80} tone="violet" className="ix-view-planet">
              DHCP
            </Planet>
          </div>
        )}
        {view === 'canvas' && (
          <div key="canvas" className="ix-view ix-view-canvas" aria-hidden="true">
            <span className="ix-canvas-card" data-card="1" />
            <span className="ix-canvas-card" data-card="2" />
            <span className="ix-canvas-card" data-card="3" />
          </div>
        )}
        {view === 'docs' && (
          <div key="docs" className="ix-view ix-view-docs">
            <span className="ix-docs-title">Giao thức DHCP</span>
            <span className="ix-docs-line" data-line="1" />
            <span className="ix-docs-line" data-line="2" />
            <span className="ix-docs-line" data-line="3" />
          </div>
        )}
        {view === 'list' && (
          <ul key="list" className="ix-view ix-view-list">
            {LIST_ROWS.map((row) => (
              <li key={row.title} className="ix-list-row">
                <span>{row.title}</span>
                <span className="ix-list-meta">{row.meta}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="ix-note">{current.note}</span>
    </RimPanel>
  );
}

function Gestures(): ReactNode {
  return (
    <RimPanel variant="rim" radius="section" label="Tương tác và phím tắt" className="ix-section">
      <h2 className="ix-h2">Tương tác và phím tắt</h2>
      <div className="ix-gestures">
        {GESTURES.map((gesture) => (
          <div key={gesture.name} className="ix-gesture">
            <Chip variant="key" className="ix-gesture-key">
              {gesture.key}
            </Chip>
            <span className="ix-gesture-name">{gesture.name}</span>
            <span className="ix-gesture-text">{gesture.text}</span>
          </div>
        ))}
      </div>
      <span className="ix-note">
        Tự lưu sau 800ms ngừng gõ ở mọi luồng tạo/sửa. ⌘Z / ⇧⌘Z hoàn tác và làm lại trong editor, Canvas và các thao tác xoá/ẩn (toast "Hoàn tác").
      </span>
    </RimPanel>
  );
}

function AnimationDemos(): ReactNode {
  const [morphed, setMorphed] = useState(false);
  return (
    <RimPanel variant="rim" radius="section" label="Animation · thử ngay" className="ix-section">
      <h2 className="ix-h2">Animation · thử ngay</h2>
      <div className="ix-demos">
        <div className="ix-demo ix-demo-orbit">
          <OrbitField width={424} height={110} orbits={TILE_ORBITS} gradientX={[62, 362]} dots={TILE_DOTS} variant="tile" className="ix-demo-field" />
          <img className="ix-demo-orb" src={ORB_ART} alt="" aria-hidden="true" width={72} height={72} />
          <span className="ix-demo-label">Quỹ đạo gradient · chấm chạy theo đường</span>
        </div>
        <div className="ix-demo">
          <Nebula className="ix-demo-nebula" />
          <ParticleField count={14} />
          <span className="ix-demo-label">Hạt và tinh vân</span>
        </div>
        <button
          type="button"
          className="ix-demo ix-demo-morph"
          aria-label="Thử biến hình hành tinh thành tài liệu"
          aria-pressed={morphed}
          data-morphed={morphed}
          onClick={() => setMorphed((value) => !value)}
          data-id="ix-morph"
        >
          <span className="ix-morph-shape" aria-hidden="true">
            DHCP
          </span>
          <span className="ix-demo-label">{morphed ? 'Đã mở tài liệu · bấm để thu về' : 'Biến hình · bấm để mở'}</span>
        </button>
      </div>
      <div className="ix-rules">
        <span className="ix-rules-title">Animation không cản trở đọc, viết, tìm, quản trị</span>
        {MOTION_RULES.map((rule) => (
          <span key={rule} className="ix-rule">
            • {rule}
          </span>
        ))}
      </div>
    </RimPanel>
  );
}

/** /dev/kit/interaction: board Interaction (design/mock/Interaction.dc.html), built from the shared kit. */
export function InteractionPage(): ReactNode {
  return (
    <UniverseBackdrop veil="fade" stars={false} artPosition="16% 40%" className="ix-backdrop">
      <main className="ix-page" data-screen="Interaction" data-id="screen-Interaction">
        <h1 className="ix-title">Navigation · Interaction · Animation</h1>
        <NavigationLayers />
        <div className="ix-grid">
          <ZoomLevels />
          <HybridViews />
          <Gestures />
          <AnimationDemos />
        </div>
      </main>
    </UniverseBackdrop>
  );
}
