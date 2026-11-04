import { type CSSProperties, type ReactNode, useState } from 'react';
import { brand } from '../../brand';
import { ORB_ART } from '../../ui/art';
import { RimPanel } from '../../ui/rim-panel';
import { BoardLink, DocBoard } from './doc-board';
import './spatial-page.css';

/** A tag under a card: a board code and its name. */
type Tag = readonly [label: string, code: string];

function Tags({ tags }: { tags: readonly Tag[] }): ReactNode {
  return (
    <div className="z02-tags">
      {tags.map(([label, code]) => (
        <BoardLink key={label} code={code} className="z02-tag">
          {label}
        </BoardLink>
      ))}
    </div>
  );
}

/** A numbered (or keyed) rule. */
function Rule({ mark, children }: { mark: string; children: ReactNode }): ReactNode {
  return (
    <div className="z02-li">
      <b>{mark}</b>
      <span>{children}</span>
    </div>
  );
}

/** The same Spaces as the 3D demo, as the flat list of the 2D mode. */
const FLAT: ReadonlyArray<{ name: string; count: string; tone: string }> = [
  { name: 'Networking', count: '8 lab', tone: '--violet-600' },
  { name: 'Linux', count: '3 bài tập', tone: '--cyan-400' },
  { name: 'Docker', count: '3 phần', tone: '--amber-500' },
  { name: 'Kubernetes', count: '2 bài', tone: '--cyan-500' },
  { name: 'Observability', count: '1 lab', tone: '--emerald-500' },
  { name: 'Học hàng tuần', count: '5 tuần', tone: '--purple-500' },
];

/** "Thử ngay": the same orbit in 3D and as the 2D list, and motion paused on request. */
function ModeDemo(): ReactNode {
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [reduced, setReduced] = useState(false);
  return (
    <RimPanel radius="card" label="Thử chế độ hiển thị" className="z02-card z02-demo">
      <div className="z02-demo-head">
        <h3>Thử ngay</h3>
        <div role="group" aria-label="Chế độ hiển thị" className="z02-modes">
          <button type="button" aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>
            3D
          </button>
          <button type="button" aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>
            2D
          </button>
        </div>
        <button type="button" role="switch" aria-checked={reduced} className="z02-motion" onClick={() => setReduced(!reduced)}>
          Giảm chuyển động: {reduced ? 'Bật' : 'Tắt'}
        </button>
      </div>
      <div className="z02-stage" data-paused={reduced || undefined}>
        {mode === '3d' ? (
          <>
            <div className="z02-space">
              <div className="z02-plane">
                <span className="z02-ring">
                  <span className="z02-ring-dot" />
                </span>
                <span className="z02-ring-inner">
                  <span className="z02-ring-inner-dot" />
                </span>
                <img className="z02-orb" src={ORB_ART} alt="" aria-hidden="true" />
              </div>
            </div>
            <span className="z02-caption">CSS 3D: perspective, rotateX, translateZ · thật: Three.js</span>
          </>
        ) : (
          <>
            <ul className="z02-flat">
              {FLAT.map((space) => (
                <li key={space.name}>
                  <BoardLink code="C10" className="z02-flat-item">
                    <span className="z02-flat-dot" style={{ '--dot': `var(${space.tone})` } as CSSProperties} />
                    <span className="z02-flat-text">
                      <b>{space.name}</b>
                      <span>{space.count}</span>
                    </span>
                  </BoardLink>
                </li>
              ))}
            </ul>
            <span className="z02-caption">Bản 2D: cùng dữ liệu, cùng thứ tự Tab, không cần GPU</span>
          </>
        )}
      </div>
    </RimPanel>
  );
}

/** Board Z02-Spatial3D: where 3D, hybrid and 2D apply, when the Universe falls back to 2D, and the budgets. */
export function SpatialPage(): ReactNode {
  return (
    <DocBoard board="Z02-Spatial3D" kicker={`${brand.appName} · không gian 3D có kiểm soát`} title="3D, hybrid, 2D và hiệu năng" className="z02">
      <div className="z02-kinds">
        <RimPanel radius="card" label="3D chiếm ưu thế" className="z02-card">
          <div className="z02-vis z02-vis-3d">
            <div className="z02-vis-plane">
              <span className="z02-vis-ring" />
              <img src={ORB_ART} alt="" aria-hidden="true" />
            </div>
          </div>
          <h3>3D chiếm ưu thế</h3>
          <span className="z02-mut">Khám phá, bay giữa các hành tinh, zoom, quỹ đạo, cảm giác quy mô.</span>
          <Tags tags={[['C09 Universe', 'C09'], ['T01', 'T01']]} />
        </RimPanel>
        <RimPanel radius="card" label="Hybrid" className="z02-card">
          <div className="z02-vis" aria-hidden="true">
            <span className="z02-node z02-node-a" />
            <span className="z02-node z02-node-b" />
            <span className="z02-node z02-node-c" />
            <span className="z02-edge z02-edge-a" />
            <span className="z02-edge z02-edge-b" />
          </div>
          <h3>Hybrid</h3>
          <span className="z02-mut">Có chiều sâu, nhưng nút, cạnh, nhãn sắc nét, chọn được chính xác, có viền focus.</span>
          <Tags tags={[['C10 Space', 'C10'], ['C13 Graph', 'C13']]} />
        </RimPanel>
        <RimPanel radius="card" label="2D chiếm ưu thế" className="z02-card">
          <div className="z02-vis z02-vis-doc" aria-hidden="true">
            <span className="z02-vis-doc-title">Giao thức DHCP</span>
            <span style={{ width: 160 }} />
            <span style={{ width: 130 }} />
            <span style={{ width: 150 }} />
          </div>
          <h3>2D chiếm ưu thế</h3>
          <span className="z02-mut">Đọc và viết: chữ, tương phản, tốc độ, chọn chữ, phím tắt. Không ép 3D vào cột đọc.</span>
          <Tags tags={[['C11 Reader', 'C11'], ['C02 Editor', 'C02']]} />
        </RimPanel>
        <RimPanel radius="card" label="Canvas 2D" className="z02-card">
          <div className="z02-vis z02-vis-canvas" aria-hidden="true">
            <span className="z02-block z02-block-a" />
            <span className="z02-block z02-block-b" />
            <span className="z02-block-link" />
          </div>
          <h3>Canvas không gian 2D</h3>
          <span className="z02-mut">Kéo, thu phóng, sắp xếp tự do. Thẻ bên trong là component 2D rõ ràng, không trang trí thừa.</span>
          <Tags tags={[['C15 Canvas', 'C15']]} />
        </RimPanel>
      </div>

      <div className="z02-middle">
        <ModeDemo />
        <div className="z02-rules">
          <RimPanel radius="card" label="Khi nào chuyển sang 2D" className="z02-card">
            <h3>Tự chuyển sang 2D khi</h3>
            <Rule mark="1">
              Hệ điều hành bật giảm chuyển động (<code>prefers-reduced-motion</code>).
            </Rule>
            <Rule mark="2">
              Máy yếu: <code>navigator.hardwareConcurrency</code> ≤ 4 hoặc <code>deviceMemory</code> ≤ 4 GB, hoặc không có WebGL2.
            </Rule>
            <Rule mark="3">Đang tiết kiệm pin hoặc FPS đo được dưới 30 trong 3 giây đầu.</Rule>
            <Rule mark="4">Người dùng chọn 2D (nhớ trong cài đặt, H03).</Rule>
          </RimPanel>
          <RimPanel radius="card" label="Ngân sách hiệu năng" className="z02-card">
            <h3>Ngân sách hiệu năng</h3>
            <Rule mark="60">Mục tiêu 60 fps; dưới 30 fps thì giảm chất lượng rồi mới chuyển 2D.</Rule>
            <Rule mark="40">Tối đa 40 hành tinh vẽ cùng lúc. Hành tinh xa vẽ bằng sprite (LOD).</Rule>
            <Rule mark="0">
              Dừng animation khi tab bị ẩn (<code>visibilitychange</code>).
            </Rule>
            <Rule mark="1">Skeleton hiện trước; engine 3D tải lười sau lần vẽ đầu, không chặn tìm kiếm và đọc.</Rule>
          </RimPanel>
        </div>
      </div>

      <div className="z02-notes">
        <RimPanel radius="card" label="Truy cập bằng bàn phím" className="z02-card">
          <h3>Bàn phím và trình đọc màn hình</h3>
          <Rule mark="Tab">Đi qua từng hành tinh theo thứ tự cố định.</Rule>
          <Rule mark="←→">Xoay quỹ đạo; ↑↓ thu phóng.</Rule>
          <Rule mark="↵">Vào Space đang chọn; Esc lùi ra.</Rule>
          <span className="z02-mut">Song song với canvas 3D luôn có một danh sách ẩn chứa đúng các hành tinh đó, cho trình đọc màn hình.</span>
        </RimPanel>
        <RimPanel radius="card" label="Giới hạn trên điện thoại" className="z02-card">
          <h3>Giới hạn trên điện thoại</h3>
          <span className="z02-mut">
            Điện thoại không chạy Universe 3D. Dùng quỹ đạo 2D đơn giản (Mobile) và khay kéo lên. Tablet ngang 1180×820 chạy 3D giảm nhẹ: ít hạt, ít vòng quỹ đạo.
          </span>
          <Tags tags={[['Mobile', 'Mobile'], ['T01 Tablet', 'T01'], ['T02 Tablet', 'T02']]} />
        </RimPanel>
        <RimPanel radius="card" label="Ghi chú triển khai" className="z02-card">
          <h3>Ghi chú triển khai</h3>
          <span className="z02-mut">
            Mock dùng CSS 3D. Bản thật dùng Three.js / React Three Fiber, tải lười theo route C09. Nút, nhãn, panel vẫn là HTML phủ lên canvas để chọn chữ,
            focus và đọc màn hình hoạt động bình thường.
          </span>
          <span className="z02-mut">Chuyển động không bao giờ chặn đọc, viết, tìm kiếm hay quản trị: mọi thao tác đó dùng được trước khi 3D tải xong.</span>
        </RimPanel>
      </div>
    </DocBoard>
  );
}
