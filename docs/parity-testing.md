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
  mạng (`offline-h04`, `offline`); dữ liệu ở `apps/web/e2e/office-boards.ts`.
- Board ghép nhiều trạng thái của một màn cạnh nhau (S02, X02, F02) được so trên trang kit `/dev/kit/…` dựng từ chính
  component của màn đó, mỗi trạng thái một ô như board.
- Làm xong một màn: đổi `status` sang `built`, seed dữ liệu giống mock cho màn đó, chạy lại. Vượt ngưỡng thì sửa màn;
  chỉ khi buộc phải khác mới ghi lý do vào [`mock-deviations.md`](mock-deviations.md) và đặt `maxDiff` riêng.
- Mock tải font từ Google, app tự host cùng font qua `@fontsource`. Nếu chữ lệch vài pixel do bản font khác nhau, ghi
  vào `mock-deviations.md` thay vì nới ngưỡng chung.

## Xem mock gốc

Ảnh tĩnh: `design/mock-png/<board>.png`. Bản chạy được (công tắc trạng thái, animation) chỉ có trong thư mục plan của
workspace riêng (`node assets/serve-mock.mjs`); runtime của board không nằm trong repo public này.
