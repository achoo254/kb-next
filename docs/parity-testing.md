# Kiểm giống mock

Mỗi màn của app được chụp và so từng pixel với ảnh xuất từ board tương ứng của mock
([`design/mock-png/`](../design/mock-png), 51 ảnh đúng kích thước board, chụp với chế độ giảm chuyển động).

## Chạy

```sh
pnpm e2e --project parity     # ở gốc repo; hoặc pnpm --filter @kb/web parity
```

Playwright tự dựng web (Vite, cổng 5321), API (PGlite trong RAM, cổng 5320) và IdP giả (cổng 5325), đăng nhập rồi mở
từng màn. Mỗi màn in một dòng:

```text
C09-Universe (pending): 61.42% of pixels differ (ceiling 3%)
```

Báo cáo kèm ảnh chụp của app (`<board>-actual.png`) và ảnh khác biệt (`<board>-diff.png`, pixel khác tô đỏ):
`apps/web/test-results/`, hoặc `pnpm exec playwright show-report` khi chạy với reporter html.

## Khi nào chạy

E2E chậm (dựng web, API, IdP giả rồi mở trình duyệt), nên chỉ chạy đúng màn vừa sửa, một lần trước khi commit
(chủ dự án chốt 05/11/2026):

- Lọc theo board: `pnpm e2e --project parity -g F03`. Không chạy cả bộ `pnpm e2e` hay cả project `parity` để "kiểm
  lây" các màn không đụng tới.
- Trạng thái, luồng bấm, lỗi API của màn kiểm bằng vitest (`*.test.tsx`), không viết thêm spec Playwright cho từng
  trạng thái. Spec Playwright riêng chỉ khi điều cần kiểm không làm được trong jsdom (bố cục thật, cuộn, cỡ cửa sổ).
- Sửa component dùng chung của kit: chạy board kit (`DesignSystem`, `Interaction`) cùng một màn tiêu biểu, không chạy
  hết các màn dùng nó.
- CI không chạy e2e (lint, typecheck, unit test, build).

## Quy tắc

- Project `parity` của [`apps/web/e2e/playwright.config.ts`](../apps/web/e2e/playwright.config.ts): viewport bằng
  kích thước board (1440×900 cho máy tính; board tablet 1180×820 và điện thoại 390×844 tự đặt theo kích thước ảnh),
  `deviceScaleFactor: 1`, theme Tối, `reducedMotion: 'reduce'` (animation tắt như lúc xuất ảnh board).
- Danh sách màn: [`apps/web/e2e/parity-screens.ts`](../apps/web/e2e/parity-screens.ts) (board, route, cần đăng nhập
  không, `pending` hay `built`). Màn `pending` chỉ in khác biệt; màn `built` phải có tối đa 3% pixel khác
  (`MAX_DIFF_RATIO`), so bằng `pixelmatch` với ngưỡng màu mặc định 0,1 (bỏ qua khử răng cưa).
- Màn có nhiều trạng thái (đang tải, trống…) giữ màn ở trạng thái của board bằng cách đổi câu trả lời API ngay trong
  bài kiểm (`mocks`: `onboarded`, `spaces-pending`, `spaces-without-own`), không thêm công tắc vào app. `waitFor` chụp khi
  một phần tử hiện ra (màn đang tải không bao giờ yên mạng); `clock` cố định giờ trình duyệt cho màn có thời gian tương đối;
  `keys`/`type` gõ phím (mở palette ⌘K), `select` chọn một đoạn chữ và `click` bấm một nút (C11: chọn câu broadcast rồi
  bấm "Giải thích"). Câu trả lời AI (C11, C14) là luồng `/api/ask` ghi sẵn trong `apps/web/e2e/ai-boards.ts` vì E2E không
  có nhà cung cấp AI. C02 trả `/api/me/keys` bằng key của board (`keys-c02`) vì E2E không lưu được key thật. C08 trả `/api/me/documents` bằng 8 bài
  của board (`mine-c08`) vì seed dùng chung với C02, C09, C10 giữ các tên đó ở trạng thái khác; Canvas, gần đây, yêu
  thích, thùng rác vẫn là seed. C03 chọn 6 tệp của board vào ô chọn tệp (`files`; câu trả lời tải lên giả `upload-c03`), C16 trả `/api/files`
  bằng 5 tệp của board (`imports-c16`), H04 nạp sẵn IndexedDB của trình duyệt bằng bản nháp và ghi chú của board rồi cắt
  mạng (`offline-h04`, `offline`); dữ liệu ở `apps/web/e2e/office-boards.ts`. A02–A03 trả `/api/me` như của quản trị
  (`admin`; tài khoản E2E không phải quản trị) và API quản trị bằng dữ liệu của board (`admin-a02`,
  `admin-a03`; A01 đã bỏ cùng vòng duyệt, `apps/web/e2e/admin-boards.ts`); H03 trả `/api/me` như của quản trị ở giao diện Tối (`settings-h03`) cùng
  key của board, C19 trả bốn thành viên của board và link mời vừa tạo trong lúc chụp (`workspace-c19`,
  `apps/web/e2e/settings-boards.ts`); C20 dùng 7 thông báo seed của chủ seed. C04, C05 trả bản nháp của board
  (xếp ở Networking, có các mục DORA và thẻ) và danh sách Space (`publish-c04`), C18 trả trang chia sẻ của bài DHCP
  (`share-c18`), H02 trả link mở khi chưa đăng nhập (`open-h02`); dữ liệu ở `apps/web/e2e/share-boards.ts` (E2E không
  hiện lại được token).
- Board tablet (T01, T02) và điện thoại (Mobile, M02–M06) chụp ở cỡ ảnh của board nên app tự lấy bố cục tablet hay
  điện thoại (`data-device`, [`board-frame.md`](board-frame.md#tablet-và-điện-thoại)); T02 bấm "Mục lục" để mở ngăn
  kéo như board, M06 trả `/api/search` bằng kết quả "lấy IP" của board (`search-m06`), M03 và M04 dùng dữ liệu của C04
  và C14. [`phone-layout.spec.ts`](../apps/web/e2e/phone-layout.spec.ts) (project `chromium`) kiểm các màn điện thoại
  không cuộn ngang ở 390px và mọi điều khiển từ 44×44px.
- Board ghép nhiều trạng thái của một màn cạnh nhau (S02, X02, F02, C06) được so trên trang kit `/dev/kit/…` dựng từ chính
  component của màn đó, mỗi trạng thái một ô như board.
- Làm xong một màn: đổi `status` sang `built`, seed dữ liệu giống mock cho màn đó, chạy lại. Vượt ngưỡng thì sửa màn;
  chỉ khi buộc phải khác mới ghi lý do vào [`mock-deviations.md`](mock-deviations.md) và đặt `maxDiff` riêng.
- Mock tải font từ Google, app tự host cùng font qua `@fontsource`. Nếu chữ lệch vài pixel do bản font khác nhau, ghi
  vào `mock-deviations.md` thay vì nới ngưỡng chung.

## Kiểm chế độ Sáng

Board vẽ ở Tối nên parity chỉ chụp Tối. Chế độ Sáng có bài kiểm riêng,
[`light-theme.spec.ts`](../apps/web/e2e/light-theme.spec.ts) (project `chromium`): mở từng màn của `parity-screens.ts`
ở đúng trạng thái board (cùng mock, seed, giờ) với giao diện của tài khoản ghim Sáng (`openScreen(page, screen,
{ theme: 'light' })`: `/api/session`, `/api/me` và `localStorage` `kb-display`), chụp ảnh `<board>-light.png` vào
`apps/web/test-results/` để người xem lại, rồi kiểm tương phản chữ WCAG AA (4,5:1; chữ lớn 3:1). Board máy tính ở
1440×900, tablet 1180×820, board điện thoại và mọi route có bố cục điện thoại ở 390×844 (`<board>-phone`, bỏ các thao
tác chỉ có trên máy tính).

Hai phép kiểm, cả hai phải sạch:

- axe-core (`@axe-core/playwright`, quy tắc `color-contrast`): chữ trên nền đặc, ô nhập.
- Kiểm theo pixel ([`text-contrast.ts`](../apps/web/e2e/text-contrast.ts)): chụp trang với mọi chữ trong suốt, so màu
  chữ với màu trung bình của các pixel ngay sau nó. axe bỏ qua chữ trên gradient, ảnh hay lớp mờ (gần hết panel của
  kit), đúng chỗ nền tối của Tối lọt sang Sáng; phép này bắt được chúng.

Cùng spec chạy lại phép kiểm theo pixel ở Tối (`<board>-dark.png`, tài khoản ghim Tối), để chữ không đọc được ở chế độ
nào cũng lộ ra. Chỉ một ngoại lệ, danh sách `FADED` của spec: trạng thái cố ý làm mờ, chữ mờ dưới AA theo thiết kế, nhưng
mỗi trạng thái có thêm một dấu hiệu không phải độ mờ (06/11/2026):

| Màn | Trạng thái mờ | Dấu hiệu khác |
|---|---|---|
| C13 | Nút ngoài vùng của nút đang chọn | Chỉ hàng xóm còn đường nối và có trong danh sách "Nối trực tiếp"; tên đọc màn hình thêm "không nối với bài đang chọn" |
| Flow | Chặng chưa tới | Chặng đã xong có dấu ✓, chặng đang ở có người đi; tên đọc màn hình thêm "chưa tới" |
| H02 | Mục khoá tới khi đăng nhập | Ổ khoá trên từng mục khoá, kèm "mở khi đăng nhập" cho trình đọc màn hình |
| A02 | Bài đã ẩn | Mắt gạch chéo trên hành tinh (như chú thích); tên nút thêm "Đã ẩn" |

Lỗi khác ngoài danh sách làm bài kiểm đỏ, ở cả hai chế độ.

```sh
KB_E2E_PORT_OFFSET=50 pnpm e2e --project=chromium light-theme.spec.ts -g C11   # một màn, cả Sáng lẫn Tối
```

Sửa ở token hay component dùng chung, không vá từng màn; quy tắc màu Sáng ở
[`settings-and-roles.md`](settings-and-roles.md#giao-diện-và-giảm-chuyển-động-h03).

## Xem mock gốc

Ảnh tĩnh: `design/mock-png/<board>.png`. Bản chạy được (công tắc trạng thái, animation) chỉ có trong thư mục plan của
workspace riêng (`node assets/serve-mock.mjs`); runtime của board không nằm trong repo public này.
