# Phase 7 (Key riêng và Copilot): màn web C14, F02, panel C09, AI của C11

Ngày 05/11/2026. Trạng thái: xong, chưa commit. Không sửa `apps/server`.

## Kết quả

| Board | Route | Khác mock (ngưỡng 3%) |
|---|---|---|
| C14 AI Copilot | `/copilot?q=&scope=&from=&h=` | 2,85% (riêng khối "Trạng thái (demo)" không dựng chiếm ~1,4%) |
| F02 8 trạng thái | `/dev/kit/copilot-states` (trang kit) | 2,89% |
| C11 Reader | `/d/:id` | 2,22% (trước 9%, đã bỏ `maxDiff` và dòng 9% trong `docs/mock-deviations.md`) |
| C09 Universe | `/u` | 2,81% (ảnh lúc chưa hỏi) |

Kiểm lại các board chịu ảnh hưởng: C10 1,64%, C12 2,23%, F01 4,77% (ngưỡng riêng 5% có sẵn), F04 0,90%.

- **Một luồng hỏi dùng chung** (`copilot-run.ts`): `runAsk` đọc stream `/api/ask` thành một lượt hỏi; `useCopilot` (hỏi, Dừng, Thử lại, Huỷ, xếp hàng khi offline và tự gửi khi có mạng lại); `useAiKeys` (key đang dùng, "Đổi sang …" qua `PUT /api/me/key-prefs`). C14, panel C09 và thẻ AI của C11 cùng dùng; giao diện từng trạng thái ở một chỗ (`copilot-turn.tsx`).
- **Ánh xạ F02**: A `status searching/writing` (Dừng huỷ request); B `NO_ANSWER`; C `USER_KEY_REJECTED` (Sửa key → `/settings/keys`, nguồn Jev đã tìm vẫn mở được); D `USER_KEY_NO_CREDIT` (Đổi sang nhà cung cấp còn key tốt, rồi hỏi lại; Mở Key riêng); E `jev: 'off'` hiện kèm câu trả lời; F offline (navigator.onLine hoặc lỗi mạng khi chưa tới máy chủ) → xếp hàng, "Huỷ câu hỏi"; G `check` có `supported: false` (và nguồn `available: false` trong lịch sử) → gạch sóng cam, số trích dẫn viền đứt "2 ?", cảnh báo; H `PROVIDER_FAILED`/`INTERNAL`/stream đứt → giữ chữ đã viết, "Thử lại". Thêm: 403 `NO_USER_KEY` → "Mở Key riêng", `USER_KEY_UNREADABLE` → "Nhập lại key", 429, 503 `USER_KEYS_DISABLED`, 404 phạm vi, 400 câu dài quá, lỗi mạng khi đang online ("Chưa gửi được").
- **C14**: lịch sử Hôm nay / Hôm qua / Trước đó (giờ Sài Gòn), mở câu cũ qua `/api/copilot/history/:id`; chip phạm vi lấy từ trang mở Copilot (`from=<id tài liệu>`: Universe › Space › Collection › Tài liệu) và link "Mở từ: …"; câu hỏi trong địa chỉ được hỏi một lần rồi địa chỉ đổi thành `?h=<id>` (tải lại không tốn key); số trích dẫn mở reader ở đúng đoạn `/d/<id>#<anchor>` (reader đã nhảy theo hash); cột "Nguồn trong phạm vi · n" có nhãn nguồn gốc; chip "Jev · tìm và kiểm nguồn · miễn phí" và "Viết bằng key OpenAI ••••last4"; Sao chép, Thử lại.
- **Mermaid**: sơ đồ tuần tự hai bên vẽ đúng kiểu board (không cần thư viện); loại khác dùng `mermaid` 12.3 tải lười (`import('mermaid')`, chunk riêng, kiểm bằng build: bundle chính chỉ giữ tên chunk), `securityLevel: 'strict'`. "Xem mã Mermaid" ↔ "Xem sơ đồ".
- **C09**: panel hỏi ngay tại chỗ (cả Universe), câu gợi ý về bài đang đọc giờ là nút hỏi; nút mở rộng mở C14 ở đúng câu vừa hỏi (`/copilot?h=…`).
- **C11**: thanh chọn đoạn (Giải thích / Tóm tắt / Hỏi Copilot / Đánh dấu) hiện trên đoạn đang chọn, vị trí theo board; thẻ AI dưới đoạn được hỏi (`task: explain|summarize`, `selection`, phạm vi `document`) với nguồn "[n] tên § mục", "Jev đã kiểm n/n", "Key OpenAI ••••last4"; khung "AI với tài liệu này" giải thích đoạn đang đọc / tóm tắt cả bài, dòng key thật. "Đánh dấu" khoá vì chưa có chỗ lưu. "Dịch bằng AI" → `/d/<id>/translate?to=<ngôn ngữ>`; mọi link key → `/settings/keys` (`SHELL_PATHS.keys`).
- Sáng / Tối đã chụp kiểm tay (sửa các viền trắng mờ bị mất ở chế độ Sáng); giảm chuyển động theo luật chung của `app.css` và media query riêng; mọi nút, chip, trích dẫn dùng được bằng bàn phím, có focus ring.

## Tệp

Mới: `apps/web/src/pages/{copilot-run.ts, copilot-links.ts, copilot-messages.ts, copilot-answer.tsx, copilot-diagram.tsx, copilot-turn.tsx, copilot-turn.css, copilot-screen.tsx, copilot-screen.css, reader-ai.tsx}`, `apps/web/src/dev-kit/pages/copilot-states-page.{tsx,css}`, `apps/web/src/test/api-fakes.ts`; test: `copilot-run.test.ts`, `copilot-answer.test.tsx`, `copilot-screen.test.tsx`.

Sửa: `app.tsx` (mount C14), `layout/app-shell.tsx` (`crumbAction` sau breadcrumb), `layout/shell-paths.ts` (`keys`), `ui/icon.tsx` (chevron-left, thumb, doc-plus), `i18n/messages.ts`, `pages/{universe-ai-panel.tsx, universe-screen.css, reader-screen.tsx, reader-screen.css, reader-side.tsx, reader-messages.ts, translate-screen.tsx, search-links.ts, search-screen.tsx, space-panels.tsx}`, `palette/command-palette.tsx` (`copilotHref` chuyển sang `copilot-links.ts`, link "Hỏi Copilot về Space" dùng `scope=space:<slug>`), `dev-kit/{dev-kit-app.tsx, pages/feedback-page.tsx, pages/doc-boards.test.tsx}`, test reader / universe / translate (dùng `test/api-fakes.ts`), `e2e/{ai-boards.ts, open-screen.ts, parity-screens.ts, sign-in.ts}`, `apps/web/package.json` + `pnpm-lock.yaml` (`mermaid`), `docs/mock-deviations.md` (C09, C11 viết lại; thêm C14, F02), `docs/parity-testing.md` (`select`, `click`, board ghép trạng thái).

`e2e/sign-in.ts` giờ chỉ kiểm đường dẫn khi quay lại màn (C14 tự đổi query sau khi đọc).

## Kiểm

- `pnpm typecheck`: sạch (gốc, server, web, e2e).
- `pnpm lint`: eslint 0 lỗi 0 cảnh báo; check-brand, check-tokens (94 cặp tương phản), check-public (539 tệp) qua.
- `pnpm test`: 96 tệp, 594 qua, 1 bỏ qua (trước: 93 tệp, 557). Mới: luồng hỏi và địa chỉ 20, câu trả lời / sơ đồ 6, C14 8, panel C09 1, F02 1, thanh chọn đoạn C11 1 (+ sửa test key của reader).
- Playwright: parity 8 board ở trên đều qua; `fits-window` của C09, C11, C14 qua (9 ca); `space-reader`, `session`, `reduced-motion` qua (13 ca). Không còn server nào chạy.

## Chỗ khác mock (đã ghi `docs/mock-deviations.md`)

- C14: không có khối "Trạng thái (demo)"; các trạng thái demo của board C14 dùng thiết kế F02; một câu hỏi mỗi lúc (máy chủ không nhớ hội thoại); nút tạo tài liệu / lối đi / canvas và hai nút đánh giá khoá "Sắp có" (phase 8, 9, 12; chưa có API đánh giá); nguồn không ghi tác giả.
- F02: góc thẻ ghi mã API thay cho "Jev: 0,08", "401"…; "Tạo ghi chú" và "Vẫn hỏi AI" khoá (máy chủ không gọi nhà cung cấp khi `NO_ANSWER`, không có API ép gọi); "Trả lời lại không dùng [2]" khoá (API không bỏ được một nguồn); E không hẹn giờ mở lại; F bỏ câu "đã lưu trên máy"; G, H đổi câu cho đúng nghĩa API.
- C11: "Đánh dấu", "Chia sẻ", "Yêu thích" khoá; không có nút "Demo: bỏ key".

## Câu hỏi còn mở

- "Vẫn hỏi AI" (F02 B) và "Trả lời lại không dùng [n]" (F02 G) cần API mới nếu muốn bật; hiện đang khoá.
- Đánh giá câu trả lời (👍/👎) chưa có chỗ lưu phía server.
