# Khung board: một màn cho mọi cỡ cửa sổ

Mọi màn của KnowFlow dựng theo board của mock ([`design/`](../design)), tọa độ cố định 1440×900. Khung board
(`.board-frame`, [`apps/web/src/ui/app.css`](../apps/web/src/ui/app.css); hệ số ở
[`apps/web/src/layout/board-zoom.ts`](../apps/web/src/layout/board-zoom.ts)) cho các màn đó vừa mọi cửa sổ, nên không
phải sửa từng màn.

## Khung làm gì

- Board luôn rộng 1440 và cao tối thiểu 900 (đơn vị board), co bằng CSS `zoom` theo bề ngang cửa sổ:
  `zoom = clamp(768/1440, rộng cửa sổ / 1440, 1)`. Cửa sổ 1440×900 vẫn là 1:1 (ảnh so pixel không đổi); cửa sổ rộng
  hơn giữ 1 và căn giữa (`app-shell.css`).
- Board cao hơn cửa sổ thì trang cuộn dọc (hệ số chừa chỗ cho thanh cuộn). Dưới 768px board ngừng co và trang cuộn
  ngang (chưa có board điện thoại).
- `AppShell` (mọi màn đã đăng nhập) và `ScreenPage layout="board"` tự có khung. Màn tự lo cửa sổ hẹp bằng media query
  riêng (landing, login, lỗi) khai báo `responsive` để giữ 1:1.

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
   từ 768px không có thanh cuộn ngang.
