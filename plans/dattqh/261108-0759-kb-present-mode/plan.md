---
title: "Chế độ slide cho bài kb, bố cục gen Z"
description: "Mở bất kỳ bài nào trên kb thành bộ slide dọc kiểu Stories, chiếu được 16:9, cắt tự động từ các phần của bài."
status: completed
priority: P2
tier: L
branch: main
tags: [frontend, backend, content, kb]
blockedBy: []
blocks: []
created: 2026-11-08
---

# Chế độ slide cho bài kb

Chủ dự án chốt 17 quyết định qua buổi grilling ngày 08/11/2026. Mục tiêu: mọi bài trên kb có nút "▶ Trình bày", mở thành
bộ slide hợp gen Z: dọc 9:16 trước, chiếu ngang 16:9 được. Slide cắt tự động từ bài, không cần tác giả làm thêm.

## Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | Làm trong kb (`kb-next`) như một chế độ xem khác của bài. |
| 2 | Slide cắt tự động lúc mở, từ các phần (chunk) của phiên bản mới nhất. Không lưu slide và không đổi bảng `documents`. |
| 3 | Thiết kế cho điện thoại dọc trước, tự chuyển sang 16:9 trên màn ngang. |
| 4 | Quyền xem giống quyền xem bài: bài công khai thì khách xem được, bài riêng tư thì phải đăng nhập. |
| 5 | Phong cách gen Z: mỗi slide một ý, chữ to (≤ ~3 dòng), thanh tiến độ kiểu Stories, emoji điểm nhấn, slide TL;DR / số liệu / trích dẫn, slide cuối có tóm tắt và nút chia sẻ, chuyển cảnh nhanh. |
| 6 | Nền Universe tối, thêm 2–3 bảng màu gradient do người xem chọn. |
| 7 | Mở từ nút "▶ Trình bày" ở trang đọc. Đường dẫn `/d/:id/present`, mỗi slide có địa chỉ riêng `#n`. Trên link chia sẻ `/l/:token` có thêm nút "Trình bày" khi người xem mở được bài. |
| 8 | Rút gọn bằng luật (tách câu, mỗi slide khoảng 200 ký tự). Nếu bài có khối `> [!TLDR]` thì dùng khối đó làm slide đầu, nếu không thì slide đầu là mục lục. Không dùng AI. |
| 9 | Nhấn `N` mở màn hình người nói: đoạn gốc đầy đủ, slide kế tiếp, đồng hồ. Đồng bộ với cửa sổ chiếu qua `BroadcastChannel`. |
| 10 | Code tối đa ~12 dòng mỗi slide, có nút copy. Bảng ≤ 3 cột hiện thành thẻ, bảng lớn hơn dẫn về đúng chỗ trong bài. Ảnh hiện toàn màn hình. |
| 11 | Chạm trái/phải hoặc vuốt để chuyển, vuốt xuống để thoát, phím ←/→/Space để chuyển, `F` bật toàn màn hình. Không tự chuyển slide. |
| 12 | Bản đầu không có xuất ảnh/PDF. |
| 13 | Đổi EN/VI thì mở bản dịch, bắt đầu lại từ slide 1. |
| 14 | Prompt của routine viết bài thêm khối `> [!TLDR]` (3 ý). Trang đọc thường cũng hiển thị khối này. |
| 15 | Bảng màu do người xem chọn và được nhớ trên máy. Slide luôn dùng nền tối, không theo giao diện sáng. |
| 16 | Danh sách bước: mỗi bước một slide, có nhãn "Bước x/y". `[[...]]` mở bài kia ở chế độ đọc thường. |
| 17 | Đếm lượt xem slide ở mức tối thiểu (bài, slide xa nhất, tổng số slide). Sao lưu DB trước khi migrate. |

**Không làm trong bản này:** xuất ảnh carousel hoặc PDF, ảnh OG riêng cho từng slide, cho tác giả chỉnh slide, dùng AI để rút gọn.

## Dữ liệu thật (khảo sát 40 bài công khai qua API, 08/11)

- `GET /api/documents/:id` đã trả bài dưới dạng `chunks[] {anchor, heading, markdown}`, cắt sẵn theo `##`. Slide dựng từ dữ liệu này, không cần endpoint mới.
- Mỗi bài có 7–73 phần, dài 4.700–51.700 ký tự. Không có `###`, không có ảnh, không có `[!WARNING]`. Đoạn văn dài nhất 320–1.380 ký tự.
- Bài lab có 8–36 code block. Bảng xuất hiện ở 6/40 bài. Trích dẫn có ở 3 bài.
- **Hệ quả:** cắt toàn văn 200 ký tự mỗi slide thì bài lab dài sẽ ra khoảng 250 slide. Chủ dự án chốt **giữ toàn văn** (V1). Bù lại, mục lục bấm được, có phím `T` để về mục lục và thanh tiến độ chia theo phần.
- Số lượt xem slide đọc qua `GET /api/admin/stats/present` của API quản trị (V2).

## Các giai đoạn

| Giai đoạn | Tier | Phụ thuộc | Tệp |
|---|---|---|---|
| 1. Bộ cắt slide (hàm thuần + test) | M | — | [phase-01-slide-builder.md](phase-01-slide-builder.md) |
| 2. Màn trình bày (C21) | L | 1 | [phase-02-present-screen.md](phase-02-present-screen.md) |
| 3. Màn hình người nói | S | 2 | [phase-03-speaker-view.md](phase-03-speaker-view.md) |
| 4. Khối TL;DR, kiểm hàng chờ, prompt routine | S | 1 | [phase-04-tldr-and-routine.md](phase-04-tldr-and-routine.md) |
| 5. Đếm lượt xem slide | M | 2 | [phase-05-present-views.md](phase-05-present-views.md) |
| 6. Kiểm tra, tài liệu, deploy | S | 1–5 | [phase-06-verify-docs-deploy.md](phase-06-verify-docs-deploy.md) |

Giai đoạn 4 làm song song với 2–3 được. Giai đoạn 5 chỉ cần màn C21 có chỗ gửi sự kiện.

## Tiêu chí xong

- Mở `/d/<id>/present` của một bài công khai khi chưa đăng nhập thì thấy slide. Bài riêng tư bị chặn giống trang đọc.
- Ở khung 390×844 (dọc) và 1440×900 (ngang), không slide nào tràn chữ ra ngoài, kể cả với 3 bài lab dài nhất trên prod.
- `#n` mở đúng slide n. Phím, chạm, vuốt và `F` chạy đúng như quyết định 11.
- `N` mở màn hình người nói, chuyển slide ở cửa sổ nào thì cửa sổ kia cũng đổi theo.
- Bài có `> [!TLDR]` thì slide 1 là TL;DR, bài không có thì slide 1 là mục lục. Trang đọc thường hiển thị hộp TL;DR.
- `pnpm check:queue` báo lỗi khi tệp chờ mới thiếu `> [!TLDR]`. Prompt routine (cả bản `-en`) đã cập nhật.
- Bảng `present_views` ghi một dòng cho mỗi lượt xem. Có bản sao lưu DB prod trước migrate.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` sạch. E2E chỉ chạy cho màn C21 và nút trên C11.

## Rủi ro

- Bài lab dài khoảng 250 slide, người xem có thể bỏ giữa chừng. Theo dõi tỉ lệ xem hết qua endpoint số liệu; nếu thấp thì cân nhắc lại cách giới hạn mỗi phần.
- Chữ tiếng Việt có dấu ở cỡ chữ lớn dễ bị cắt dấu ở dòng trên. Cần `line-height` ≥ 1.2 và test bằng ảnh chụp thật.
- `BroadcastChannel` chỉ chạy giữa các cửa sổ cùng trình duyệt. Chiếu bằng máy khác sẽ không đồng bộ, nên ghi rõ giới hạn này trong tài liệu.
- `sendBeacon` có thể mất sự kiện khi đóng tab trên iOS. Số lượt xem là số ước lượng, không dùng để tính tiền.

## Kết quả (08/11/2026)

Commit `af99f14` (hộp TL;DR trên trang đọc) và `383465f` (chế độ slide C21) đã push lên `main`. Kiểm tra trước khi push:
lint, typecheck, 1.397 test vitest, build, E2E `present.spec.ts` (2/2), parity C11/T02/M05/H02. Không slide nào tràn
chữ trên 4 bài thật (1.193 slide), ở cả khung 390×844 lẫn 1440×900.

Khác với plan:
- Slide mục lục luôn có (sau TL;DR nếu bài có khối này), để bộ slide dài có chỗ nhảy theo phần (phím `T`).
- Nút "Trình bày" trên desktop là nút tròn nhỏ cạnh A−/A+. Đặt vào hàng thao tác thì "Yêu thích" rớt dòng và parity C11
  vượt ngưỡng (11,97% so với 9%).
- Test cắt slide dùng dữ liệu viết tay trong test. Kiểm tràn chữ trên bài thật làm một lần bằng script tạm, không commit.
- Prompt routine viết bài do phiên song song sửa (commit `972a808` có luật TL;DR trong `content-queue`).
- Không sao lưu riêng trước khi deploy: iCloud trên Mac kẹt nên không lấy được khoá SSH vào `.65`. Chủ dự án chọn push,
  dựa vào bản sao lưu tự động 02:40 cùng ngày. Migration 0019 chỉ tạo bảng mới.

## Câu hỏi xác nhận

V1 và V2 đã chốt ngày 08/11/2026. Không còn câu hỏi mở.
