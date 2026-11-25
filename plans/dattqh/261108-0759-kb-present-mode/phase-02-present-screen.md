---
phase: 2
title: "Màn trình bày (C21)"
status: completed
tier: L
dependsOn: [1]
---

# Giai đoạn 2 · Màn trình bày (C21)

## Mục tiêu

Thêm màn mới `/d/:id/present` (mã C21, quyền `open` giống C11) hiển thị `Slide[]` từ giai đoạn 1 với bố cục gen Z.
Thiết kế cho điện thoại dọc trước, tự chuyển sang 16:9 trên màn ngang.

## Tệp

- Sửa `apps/web/src/routes.ts`: thêm `{ code: 'C21', titleKey: 'screen.C21', access: 'open', pattern: /^\/d\/<segment>\/present$/ }`, đặt trước dòng C11.
- Sửa loader màn (`LOADERS`, theo `docs/navigation.md` dòng 45): C21 dùng cùng hàm tải với C11 là `GET /api/documents/:id`.
- Mới `apps/web/src/pages/present-screen.tsx`: tải bài, dựng slide, điều khiển, hash `#n`, đổi ngôn ngữ.
- Mới `apps/web/src/pages/present-slide.tsx`: hiển thị từng kiểu slide. Dùng lại `ReaderMarkdown` để hiển thị Markdown trong slide (an toàn, có wikilink).
- Mới `apps/web/src/pages/present-screen.css`: bố cục, bảng màu, hiệu ứng.
- Mới `apps/web/src/pages/present-messages.ts`: chuỗi vi/en, theo mẫu `*-messages.ts`.
- Mới `apps/web/src/pages/present-screen.test.tsx`.
- Sửa `reader-tablet.tsx`, `reader-phone.tsx`: thêm nút "▶ Trình bày" (link tới `/d/:id/present`).
- Sửa `shared-open-screen.tsx`: khi đã đăng nhập và mở được bài thì thêm nút "Trình bày" cạnh nút "Đọc".
- Sửa `apps/web/src/ui/tokens.css`: thêm token cho bảng màu slide. Màu được `check:tokens` và `token-contrast` kiểm nên phải khai báo là token, không viết mã màu trực tiếp.

## Bố cục

- Khung slide luôn tối (đặt `data-theme="dark"` riêng cho khung), nền là `universe-backdrop.tsx` (CSS). Không dùng `universe3d` để màn nhẹ trên điện thoại.
- Dọc (`aspect-ratio < 1`): slide chiếm toàn màn hình. Ở trên có thanh tiến độ chia đoạn (với hơn 40 slide thì chỉ chia theo phần, phần hiện tại có vạch nhỏ bên trong). Phía dưới có nút đóng, chọn bảng màu, đổi EN/VI và chia sẻ.
- Ngang: khung 16:9 ở giữa màn hình. Cỡ chữ tính theo khung, dùng `clamp()` với `cqi` (container query).
- Cỡ chữ: chữ thân khoảng 6–7% chiều rộng khung trên màn dọc, `line-height` ≥ 1.25 để dấu tiếng Việt không bị cắt.
- Bảng màu: `universe` (mặc định), `sunset`, `aurora`, `acid`. Lựa chọn lưu ở `localStorage` (bọc try/catch). Mỗi bảng màu phải đạt độ tương phản chữ ≥ 4.5:1, test bằng `token-contrast`.
- Emoji: mỗi kiểu slide có một emoji mặc định (🧠 TL;DR, 🧭 mục lục, ⚡ số liệu, 💬 trích dẫn, 🛠️ code, ✅ bước, 🎉 kết). Không chèn emoji vào nội dung bài.
- Hiệu ứng: trượt và mờ dần trong 180 ms. Khi `prefers-reduced-motion` thì tắt trượt, chỉ còn mờ dần.

## Điều khiển

- Chạm 1/3 trái để lùi, 2/3 phải để tiến. Vuốt ngang để chuyển slide, vuốt xuống quá 120 px để thoát về `/d/:id`.
- Phím: `←`/`→`/`Space`/`PageUp`/`PageDown`, `Home`/`End`, `T` về slide mục lục, `F` bật/tắt toàn màn hình, `Esc` thoát, `N` mở màn hình người nói (giai đoạn 3).
- Không chuyển slide khi người dùng đang chọn chữ hoặc đang cuộn trong slide code.
- `#n` (bắt đầu từ 1) được cập nhật bằng `history.replaceState`, nên nút Back thoát hẳn khỏi màn chứ không lùi từng slide. `#n` không hợp lệ thì về slide 1.
- Nút copy trên slide code dùng `navigator.clipboard` và báo "Đã chép".
- Slide `end`: nút chia sẻ dùng `navigator.share`, nếu trình duyệt không có thì chép link. Kèm nút "Đọc bài đầy đủ".
- Đổi EN/VI: mở bản dịch ở `/d/<id bản kia>/present#1`, dựa trên `translations` mà API đã trả.
- `[[...]]` và nút "Đọc đủ phần này" mở `/d/:id#anchor`.

## Trạng thái lỗi

Dùng lại `reader-states.tsx`: đang tải, bài riêng tư, không tìm thấy, lỗi mạng (có nút Thử lại).

## Test

- Unit (jsdom): điều khiển bằng phím, hash, đổi bảng màu, các trạng thái lỗi, nút trên C11 và H02.
- Ảnh chụp thật bằng Playwright cho 3 bài mẫu ở khung 390×844 và 1440×900. Kiểm từng slide xem có tràn không (`scrollHeight <= clientHeight` của vùng chữ).
