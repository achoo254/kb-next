---
title: Chế độ slide kb lên prod
date: 2026-11-08
summary: "C21 slide gen Z, hộp TL;DR, đếm lượt xem và sửa thẻ tràn chữ ở Universe đã deploy"
---

# Chế độ slide kb lên prod

## Chuyện gì đã xảy ra
Đã deploy lên prod: chế độ slide C21 (`383465f`), hộp TL;DR trên trang đọc (`af99f14`) và bản sửa tiêu đề dài tràn khỏi thẻ trên bệ Universe (`0a99bfe`).

## Bài học
- Gắn thêm nút vào hàng thao tác của C11 làm "Yêu thích" rớt dòng, parity lệch 11,97% (ngưỡng 9%). Đã chuyển nút ra cạnh A−/A+.
- Playwright `page.route('**/api/**')` chặn nhầm cả mã nguồn `/src/api/*.ts` của Vite. Phải lọc theo `pathname.startsWith('/api/')`.
- Playwright không đọc được thân của request `sendBeacon`. E2E chỉ kiểm mã trả 204, còn nội dung beacon kiểm bằng unit test.
- iCloud trên Mac kẹt làm treo mọi lệnh đọc `ENV production`, nên không gọi được Jev và không SSH được vào `.65`. Chủ dự án chọn push, dựa vào bản sao lưu tự động 02:40.

## Bước tiếp theo
Theo dõi tỉ lệ xem hết slide qua `GET /api/admin/stats/present`. Nếu thấp thì cân nhắc giới hạn số slide mỗi phần.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
