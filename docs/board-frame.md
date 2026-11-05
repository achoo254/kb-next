# Khung board: một màn cho mọi cỡ cửa sổ

Mọi màn của KnowFlow dựng theo board của mock ([`design/`](../design)), tọa độ cố định 1440×900. Khung board
(`.board-frame`, [`apps/web/src/ui/app.css`](../apps/web/src/ui/app.css); hệ số ở
[`apps/web/src/layout/board-zoom.ts`](../apps/web/src/layout/board-zoom.ts)) cho các màn đó vừa mọi cửa sổ, nên không
phải sửa từng màn.

## Khung làm gì

- Board luôn rộng 1440 và cao tối thiểu 900 (đơn vị board), co bằng CSS `zoom` cho vừa cả bề ngang lẫn bề cao cửa
  sổ: `zoom = clamp(768/1440, min(rộng/1440, max(cao/900, 0.85 × rộng/1440)), 1)`. Cửa sổ 1440×900 vẫn là 1:1 (ảnh
  so pixel không đổi); cửa sổ rộng hơn giữ 1.
- Cửa sổ thấp (laptop 13", ví dụ 1440×840) co theo bề cao để thấy trọn board, không cuộn. Bề cao chỉ được co thêm tới
  0.85 lần mức co theo bề ngang (`SHORT_WINDOW_FACTOR`): 1440 rộng thì vừa tới cao 765, chữ 12–13px của board vẫn từ
  11px trở lên. Cửa sổ thấp hơn nữa giữ mức đó và trang cuộn dọc (hệ số chừa chỗ cho thanh cuộn). Dưới 768px board
  ngừng co và trang cuộn ngang, trừ các màn có board điện thoại (mục "Tablet và điện thoại" dưới đây).
- Khi khung rộng hơn board (cửa sổ rộng hơn 1440, hoặc cửa sổ thấp co theo bề cao) board nằm giữa (`--board-offset`,
  `app-shell.css`); logo, thanh lens, chuông và ⌘K bám mép cửa sổ. `--board-side` (trên root, px của board,
  `board-zoom.ts`) là phần khung thừa mỗi bên, bằng 0 khi board chiếm trọn bề ngang (1440×900, cửa sổ hẹp mà đủ cao): panel nào cần bám mép phải cửa sổ thì cộng
  nó vào `left`. Hiện chỉ panel AI của C09 (và panel "thử hỏi" của S05) dùng; scene và chữ của C09 ở yên theo board.
  Panel phải của C10, C11 và các màn khác vẫn theo board.
- `AppShell` (mọi màn đã đăng nhập) và `ScreenPage layout="board"` tự có khung. Màn tự lo cửa sổ hẹp bằng media query
  riêng (landing, login, lỗi) khai báo `responsive` để giữ 1:1.

## Tablet và điện thoại

Bề ngang cửa sổ chọn một trong ba bố cục ([`apps/web/src/layout/device.ts`](../apps/web/src/layout/device.ts), mốc
ở [`ui/breakpoints.ts`](../apps/web/src/ui/breakpoints.ts)); `installBoardZoom` ghi nó vào `data-device` trên
`<html>`, component đọc bằng `useDevice()`:

| Bố cục | Bề ngang | Màn có bố cục riêng | Các màn khác |
|---|---|---|---|
| `desktop` | từ 1280px | (board 1440×900) | board 1440×900 như trên |
| `tablet` | 641–1279px | Universe (T01) và reader (T02) dựng trên board 1180×820, co bằng `--tablet-zoom` cùng công thức (`AppShell tabletBoard`, lớp `.board-frame-tablet`) | board 1440×900 |
| `phone` | đến 640px | `/u` (Mobile), `/create` (M02), trình soạn `/new` và `/d/:id/edit` (bước soạn của M02), `/d/:id/publish` (M03) và các bước gửi duyệt sau đó (`/d/:id/submit`: đang gửi, đã gửi, chưa gửi được), `/copilot` (M04), `/d/:id` (M05), `/search` (M06), `/upload` (chọn và tải tệp, không sửa): bố cục thật theo bề ngang cửa sổ, không zoom, chỉ 2D, trong `PhoneShell`; thanh pill dưới `MobileTabBar` thay lens rail (trình soạn và các bước gửi duyệt che cả màn, không có thanh) | board 1440×900 ở mức co nhỏ nhất, cuộn ngang |

- Tablet: T01 là 3D nhẹ (`TABLET_SCENE.light3d`: không quầng blur quanh quỹ đạo, nửa số chấm sáng, không
  supersampling), không có panel AI (nút "Copilot" trên thanh trên mở C14); T02 bỏ cột mục lục và cột phải, mục lục
  thành ngăn kéo bên trái (nút "Mục lục", đóng bằng ×, nền mờ, Esc, vuốt sang trái), các hành động thành cột nút tròn.
  `toBoardPx()` tự dùng `--tablet-zoom` khi màn đang dựng trên board tablet.
- Điện thoại (giới hạn của Z02): không có Canvas (`/canvas` báo cần màn hình lớn hơn, pha lê Canvas ở M02 và nút
  Canvas ở M04 chỉ giải thích), Graph chỉ xem (ẩn nối và gỡ liên kết, gợi ý của Jev), tệp Office chỉ đọc (`OfficeView
  readOnly`, nút "Sửa" của M05 tắt kèm lý do). Vũ trụ 2D chỉ đặt 6 Space theo board, Space khác vào từ "Bay tới
  Space" của M06.
- Trình soạn trên điện thoại dùng chung tự lưu, bản offline trong trình duyệt và trợ lý AI với C02 (trợ lý mở thành
  sheet); `toBoardPx()` trả 1 trên màn điện thoại (không có khung board).
- Màn điện thoại không bao giờ cuộn ngang ở 390px và mọi điều khiển từ 44×44px:
  [`apps/web/e2e/phone-layout.spec.ts`](../apps/web/e2e/phone-layout.spec.ts) kiểm các route trên, kể cả trình soạn,
  các bước sau "Gửi duyệt" (đã gửi, mất mạng) và tải tệp.

## Dựng một màn mới

1. Đặt màn trong `AppShell` hoặc `ScreenPage layout="board"`, vị trí theo tọa độ của board (px của board).
2. Nội dung dài hơn board cuộn trong panel của nó (`overflow-y: auto`), như reader.
3. Không viết media query theo bề ngang cửa sổ cho màn có khung: bên trong khung bố cục luôn rộng 1440.
4. Chiều cao bằng cửa sổ: `calc(100vh / var(--frame-zoom, 1))` (`100vh` trong khung cũng bị co). Lớp phủ `fixed`
   tính kích thước theo `%` của chính nó, không theo `vw`/`vh`.
5. Đo trên màn hình (`getBoundingClientRect`, sự kiện chuột) ra px đã co: đổi sang px của board bằng `toBoardPx()`
   trước khi đặt `left`/`top` hay cộng với `scrollTop`. Canvas của React Three Fiber dùng `resize={{ offsetSize: true }}`.
6. Thêm màn vào [`apps/web/e2e/parity-screens.ts`](../apps/web/e2e/parity-screens.ts): bộ so pixel
   ([`parity-testing.md`](parity-testing.md)) và [`fits-window.spec.ts`](../apps/web/e2e/fits-window.spec.ts) tự kiểm
   màn ở 1280×720, 1024×768 và 390×844: không link, nút, ô nhập hay chữ nào bị cắt hoặc nằm ngoài chỗ cuộn tới được, và
   từ 768px (hoặc khi màn có bố cục điện thoại) không có thanh cuộn ngang. Màn có board tablet/điện thoại thêm một dòng
   cho board đó (ảnh PNG cỡ 1180×820 hay 390×844 tự đặt viewport, nên app lấy đúng bố cục).
