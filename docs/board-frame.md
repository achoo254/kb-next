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
- `AppShell` (mọi màn đã đăng nhập; trong app là một khung dùng chung, giữ nguyên khi chuyển màn:
  [`navigation.md`](navigation.md#khung-app-giữ-nguyên)) và `ScreenPage layout="board"` tự có khung. Màn tự lo cửa sổ hẹp bằng media query
  riêng (landing, login, lỗi) khai báo `responsive` để giữ 1:1.

## Tablet và điện thoại

Bề ngang cửa sổ chọn một trong ba bố cục ([`apps/web/src/layout/device.ts`](../apps/web/src/layout/device.ts), mốc
ở [`ui/breakpoints.ts`](../apps/web/src/ui/breakpoints.ts)); `installBoardZoom` ghi nó vào `data-device` trên
`<html>`, component đọc bằng `useDevice()`:

| Bố cục | Bề ngang | Màn có bố cục riêng | Các màn khác |
|---|---|---|---|
| `desktop` | từ 1280px | (board 1440×900) | board 1440×900 như trên |
| `tablet` | 641–1279px | Universe (T01) và reader (T02) dựng trên board 1180×820, co bằng `--tablet-zoom` cùng công thức (`AppShell tabletBoard`, lớp `.board-frame-tablet`) | board 1440×900 |
| `phone` | đến 640px | `/u` (Mobile), `/create` (M02), trình soạn `/new` và `/d/:id/edit` (bước soạn của M02), `/d/:id/publish` (M03) và các bước đăng bài sau đó (`/d/:id/submit`: đang đăng, đã đăng, chưa đăng được), `/copilot` (M04), `/d/:id` (M05), `/search` (M06), `/upload` (chọn và tải tệp, không sửa), trình dựng lối đi `/journey/new` và `/journey/:id/edit`, lối đi `/journey/:id` (không có board điện thoại, dựng từ C07 và Flow bằng bộ phần điện thoại): bố cục thật theo bề ngang cửa sổ, không zoom, chỉ 2D, trong `PhoneShell`; thanh pill dưới `MobileTabBar` thay lens rail (trình soạn, trình dựng lối đi và các bước gửi duyệt che cả màn, không có thanh) | board 1440×900 ở mức co nhỏ nhất, cuộn ngang |

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
- Trình dựng lối đi trên điện thoại (`journey-builder-phone.tsx`, cùng trạng thái và tự lưu với C07 qua
  `journey-builder-state.ts`): thanh trên (quay lại, Space, chip tự lưu bấm để lưu ngay, "Xuất bản" sang M03), tên lối
  đi, các bước là thẻ đổi thứ tự bằng nút lên/xuống 44px (không kéo thả), "Thêm bước" mở sheet tìm tài liệu (không phân
  biệt dấu) kèm gợi ý của Jev, bấm thẻ mở sheet sửa tiêu đề, kiểu bước, số phút, tài liệu nguồn hay nội dung ghi chú, bỏ
  bước. Lối đi (`journey-run-phone.tsx`): các bước thành cột từ trên xuống, thẻ của bước đang mở nằm ngay dưới bước đó.
  Sheet dùng chung `PhoneSheet` (`layout/phone-sheet.tsx`: thanh kéo, chạm nền mờ hay Esc để đóng).
- Màn điện thoại co giãn từ 320 tới 640px: không có bề ngang cố định 390px (quỹ đạo 2D và vòng tạo của M02 thu nhỏ
  theo `usePhoneScale()`, sao trải theo tỉ lệ bề ngang), hàng chip và thẻ hoặc xuống dòng hoặc cuộn ngang trong chính
  nó (đánh dấu `data-scroll-row`), mọi phần tránh tai thỏ và thanh home (`--safe-top`, `--safe-bottom`… trên
  `.phone-shell`, từ `env(safe-area-inset-*)`). Sheet Space của Mobile đóng bằng nút ×, thanh kéo, kéo xuống, chạm vào
  bầu trời hay Esc; đóng rồi còn nút "Mở <Space>" phía trên thanh dưới.
- Màn điện thoại không bao giờ cuộn ngang và mọi điều khiển từ 44×44px, ở 320×640, 360×780, 375×812, 390×844 và
  430×932:
  [`apps/web/e2e/phone-layout.spec.ts`](../apps/web/e2e/phone-layout.spec.ts) kiểm các route trên (không phần nào
  vượt mép phải, trừ trong hàng cuộn ngang), kể cả trình soạn, các bước sau "Đăng công khai" (đã đăng, mất mạng), tải tệp,
  sheet mẫu của M02, trình dựng lối đi (cả hai sheet) và lối đi ở cả năm cỡ.

## Thẻ mở vũ trụ

Trong lúc kiểm phiên đăng nhập (mọi trang cần đăng nhập) và lúc `/u` tải dữ liệu, màn hiện thẻ B của S02 (quả cầu,
"Đang mở cửa vũ trụ của bạn", Xác thực · Tải vũ trụ · Sẵn sàng). Mỗi bước xong giữ dấu ✓ khoảng 350ms, cả ba cùng xong
rồi mới sang màn, tổng tối thiểu 1,2 giây; việc chậm hơn thì không chờ thêm ngoài nhịp của bước cuối. Giảm chuyển động:
các bước theo đúng tiến độ thật, chỉ giữ trạng thái cuối một nhịp
([`apps/web/src/pages/opening-pace.ts`](../apps/web/src/pages/opening-pace.ts)). E2E đăng nhập
([`sign-in.ts`](../apps/web/e2e/sign-in.ts)) chờ thẻ này nhường chỗ rồi mới chụp.

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
