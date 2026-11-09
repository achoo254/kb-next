# Chuyển màn trong app (không tải lại trang)

Bấm link giữa các màn của Knowledge Base không tải lại trang nữa: địa chỉ đổi bằng History API, app vẽ lại tại chỗ. Bundle,
phiên đăng nhập, khung app (lens rail, thanh Orbit/Graph/Canvas/Docs, chuông, ⌘K, nền vũ trụ) giữ nguyên; chỉ phần
nội dung đổi. Mã: [`apps/web/src/router/`](../apps/web/src/router) và `ShellHost` trong
[`apps/web/src/layout/app-shell.tsx`](../apps/web/src/layout/app-shell.tsx).

## Link nào đi trong app

Một listener `click` trên `document` (`installRouter`, `navigation.ts`) nhận mọi `<a>` của kit (Button `href`, link
thường, breadcrumb, rail…), không phải sửa từng chỗ. Đi trong app khi đủ các điều kiện:

- click trái, không giữ ⌘/Ctrl/Shift/Alt, chưa handler nào `preventDefault`;
- link không có `target` (trừ `_self`), `download`, `rel="external"`;
- cùng origin, và đường dẫn là một màn trong `ROUTES` (`isInAppPath`, `routes.ts`).

Còn lại để trình duyệt tự xử lý (tải trang): `/api`, `/auth`, file, `/dev/kit`, đường dẫn lạ (server quyết), origin
khác (kb-office…), trang đăng nhập `/login` (S02: đường tới IdP) và link chia sẻ `/l/…` (H02: server gửi kèm thẻ link
preview). Link `#anchor` của chính trang đang xem cũng để trình duyệt cuộn; link sang trang khác có `#anchor`
(`/privacy#delete`) mở trang đó rồi cuộn tới anchor.

Code chuyển màn sau một thao tác dùng `navigate(href, { replace? })` thay cho `window.location.assign/replace`: địa chỉ
ngoài app (hoặc khi router chưa chạy, như test từng màn) vẫn tải trang. Đăng xuất, xoá dữ liệu của tôi và các bước
đăng nhập (`login-page.tsx`) cố ý tải trang để không giữ gì của phiên cũ trong bộ nhớ.

## Một lần chuyển màn

1. Thanh tiến trình mảnh trên đỉnh cửa sổ (`navigation-progress.tsx`; hiện sau 80 ms nên màn sẵn sàng ngay không
   nháy thanh; đứng yên khi giảm chuyển động). Màn cũ vẫn hiện.
2. Dữ liệu đầu của màn mới được hỏi trước (`route-prefetch.ts`). Màn mới hiện khi dữ liệu về, hoặc sau
   `NAV_GRACE_MS` = 300 ms thì hiện với skeleton của chính nó. Màn không có loader hiện ngay.
3. Có View Transitions: đổi màn trong `document.startViewTransition`, ảnh màn cũ giữ tới khi màn mới vẽ xong dữ
   liệu đã chờ sẵn (tối đa `SETTLE_MS` = 40 ms), rồi chỉ vùng nội dung (`#content`) mờ chéo 180 ms; khung đứng yên.
   Giảm chuyển động (hệ điều hành hoặc H03 `data-motion`) thì đổi tức thì, không mờ chéo. Trình duyệt không có View
   Transitions đổi màn ngay (có thể thấy skeleton một khung hình trước dữ liệu).
4. Màn mới mount lại từ đầu (khoá theo mục lịch sử, như một lần tải trang), `document.title` đổi, focus chuyển tới
   `h1` của màn (không có thì `<main>`), vùng `aria-live` đọc tiêu đề mới.
5. Cuộn: màn mới mở ở đầu trang (hoặc tại `#anchor`); Back/Forward về đúng vị trí đã cuộn của mục đó
   (`history.scrollRestoration = 'manual'`, vị trí giữ theo khoá `history.state.kbNav`).

Vì sao không dùng Suspense: các màn tải dữ liệu bằng `useEffect` (không suspend), đổi cả ~50 màn sang Suspense là quá
rộng. Thay vào đó loader của màn gọi đúng các hàm API mà màn gọi khi mount; câu trả lời nằm trong bộ đệm của
`getJson` (`api-client.ts`, `prefetchGets`) và lần gọi kế tiếp cùng đường dẫn lấy nó, một lần, trong 10 giây. Mọi
request thay đổi dữ liệu (POST/PUT/PATCH/DELETE) xoá bộ đệm, nên không bao giờ hiện bản cũ sau khi sửa. Màn có loader:
C09, C10, C11, C21 (cùng bài với C11, theo `?lang=` nếu có), C13, C08, C20. Thêm màn: thêm một dòng vào `LOADERS`, gọi đúng hàm và tham số màn dùng.

Prefetch khi rê chuột, focus hoặc chạm vào link trong app: cùng loader đó, mỗi đường dẫn tối đa một lần mỗi 10 giây,
lỗi bỏ qua (màn tự hỏi lại và hiện lỗi của nó). Các màn không tách chunk nên không có JS để tải trước.

## Khung app giữ nguyên

Mỗi màn vẫn viết `<AppShell …props>` như cũ. Trong app (`ShellHost` ở `app.tsx`) `AppShell` không tự vẽ khung: nó
gửi props cho host (`shell-host-store.ts`), host vẽ đúng một khung, và nội dung của màn được portal vào `<main>` của
khung. Màn cũ rút props và màn mới gửi props trong cùng một commit nên khung không bao giờ unmount, chỉ đổi props (ô
rail đang chọn, lớp phủ, breadcrumb, `data-screen`…). Màn không có `AppShell` (bố cục điện thoại, trang công khai)
rút khung. Ngoài host (test, dev kit) `AppShell` tự vẽ khung tại chỗ như trước; DOM của trang tải thẳng không đổi nên
parity không đổi.

Những thứ sống theo trang, không theo màn, chỉ cài một lần: board zoom và nhận diện thiết bị, đồng bộ Office offline
(`main.tsx`), phiên (`useSession` trong `App`), số thông báo chưa đọc (hỏi lại mỗi lần chuyển màn, như trước mỗi lần
tải trang), bảng ⌘K (đóng khi chuyển màn, kể cả Back). Listener mà một màn tự gắn phải gỡ khi unmount, vì màn giờ
unmount mà trang không tải lại.

## Thẻ mở đầu

Thẻ "Đang mở cửa vũ trụ" (S02 B, `opening-pace.ts`) chỉ dành cho lần tải trang: đăng nhập xong, mở link, tải lại.
Chuyển màn trong app không kiểm phiên lại nên không có thẻ; tới Universe bằng link thì Universe hiện ngay với
skeleton của nó (`universe-entry.tsx`, `hasNavigatedInApp`).

## Kiểm thử

- `router/navigation.test.ts`: luật chặn link, Back/Forward, cuộn và `#anchor`, thời gian chờ 300 ms (fake timers),
  prefetch, View Transition, focus.
- `layout/shell-host.test.tsx`, `app-navigation.test.tsx`: khung không mount lại (cùng phần tử rail), một lần kiểm
  phiên, thanh tiến trình.
- `api/api-client.test.ts`: bộ đệm prefetch.
- E2E `e2e/navigation.spec.ts`: C09 → C10 → C11 → Back trên một trang (biến trên `window` còn, không thẻ mở đầu,
  tiêu đề đổi).
