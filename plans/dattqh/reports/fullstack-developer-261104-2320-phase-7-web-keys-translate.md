# Phase 7 (Key riêng và Copilot): màn web F03 và F04

Ngày 04/11/2026. Trạng thái: xong, chưa commit. Không sửa `apps/server`.

## Kết quả

| Màn | Route | Khác mock (ngưỡng 3%) |
|---|---|---|
| F03 Key riêng | `/settings/keys` (rail Cài đặt) | 1,19% |
| F04 Dịch bằng AI | `/d/:id/translate` (rail Spaces), đích `?to=vi\|en`, mặc định ngôn ngữ còn lại | 0,90% |
| Z01 Sitemap (F03 nay là link) | `/dev/kit/sitemap` | 0,02% |

- **F03**: 3 thẻ OpenAI / Gemini / Claude (Chưa có, Hợp lệ ••••last4, Bị từ chối, Hết credit, Cần nhập lại), giờ kiểm theo giờ Sài Gòn, "Xoá key" kèm hộp xác nhận, khung thêm key (lưu → đang kiểm → đã lưu / thử lại kèm câu báo từng mã lỗi; ô key xoá trắng khi lưu xong), link trang lấy key thật của từng nhà cung cấp, "Dùng key nào" (radio + model, lưu `PUT /api/me/key-prefs`), chú giải trạng thái, dòng "Câu hỏi và các đoạn nguồn được gửi tới nhà cung cấp bạn chọn…". `available: false` thì hiện "Key riêng đang tắt trên máy chủ này", khoá radio và model. Có trạng thái đang tải và lỗi tải (X02).
- **F04**: thanh đầu (tiêu đề, VI → EN, "Bản dịch AI · chưa duyệt", thanh tiến độ + %, "Dừng"), cột gốc đánh số theo đúng cách server tách đoạn (đoạn 0 là tiêu đề), cột dịch stream từng đoạn có con trỏ, đoạn chờ là khung nhấp nháy, dòng "model · key ••••last4", hình nối giữa hai cột. "Dừng" huỷ request (server không lưu). Xong → "Đọc bản dịch" mở `/d/<id>?lang=<đích>`; reader đã nhận `?lang=` qua i18n nên không phải sửa. Chưa có key (trước khi gọi, hoặc 403 `NO_USER_KEY`) → "Mở Key riêng" tới `/settings/keys`. Thêm các lỗi: key bị từ chối, hết credit, `USER_KEY_UNREADABLE`, `too-long`, 429, mất kết nối, stream đóng mà không có `done`, tính năng tắt, tài liệu không mở được (X02).
- Board C11 không vẽ lối vào F04 nên chỉ thêm route.
- Kiểm tay cả Sáng và Tối, các trạng thái ngoài ảnh board (đã dịch xong, chưa có key, key bị từ chối, hộp xoá key); giảm chuyển động theo luật chung của `app.css`.

## Tệp

Mới: `apps/web/src/pages/{keys-screen.tsx, keys-screen.css, keys-messages.ts, keys-screen.test.tsx, translate-screen.tsx, translate-screen.css, translate-messages.ts, translate-source.ts, translate-screen.test.tsx}`, `apps/web/e2e/ai-boards.ts`.

Sửa: `apps/web/src/routes.ts`, `app.tsx` (mount + `SCREEN_CHROME`), `app.test.tsx`, `i18n/messages.ts` (tên màn), `ui/tokens.css` (4 màu: đáy quả cầu nhà cung cấp, đầu gradient tiêu đề), `dev-kit/pages/doc-board.tsx` (F03 trong sitemap), `e2e/parity-screens.ts`, `e2e/open-screen.ts` (mock `keys-f03`, `translate-f04`: luồng dịch giữ mở bằng `fetch` của trang vì route của Playwright chỉ trả cả body), `docs/mock-deviations.md` (2 dòng F03, F04).

## Kiểm

- `pnpm typecheck`: sạch (gốc, server, web, e2e).
- `pnpm lint`: eslint 0 lỗi 0 cảnh báo; check-brand, check-tokens (94 cặp tương phản), check-public (522 tệp) qua.
- `pnpm test`: 93 tệp, 557 qua, 1 bỏ qua. Riêng màn mới: F03 14 test, F04 18 test, route 2 test.
- Playwright: parity F03 1,19%, F04 0,90%; `fits-window` của F03, F04 ở 1280×720, 1024×768, 390×844 đều qua.

## Ghi chú

- Phiên khác đang sửa `apps/server` cùng lúc (thêm `USER_KEY_UNREADABLE`, `too-long` cho route dịch); web đã xử lý hai mã này.
- Nút "Dịch bằng AI" có sẵn trong reader (không có trên board C11) vẫn trỏ `KEYS_HREF = /settings`; theo phạm vi giao, không sửa nút AI của reader. Việc sau nên trỏ nó tới `/d/<id>/translate` và `KEYS_HREF` tới `/settings/keys`.
