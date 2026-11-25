---
phase: 4
title: "Khối TL;DR, kiểm hàng chờ, prompt routine"
status: completed
tier: S
dependsOn: [1]
---

# Giai đoạn 4 · Khối TL;DR

## Mục tiêu

Quy ước một khối `> [!TLDR]` gồm 3 ý ngắn ở đầu bài. Trang đọc hiển thị khối này thành hộp tóm tắt, slide dùng nó làm
slide 2. Routine viết bài mỗi tối luôn viết khối này cho bài mới.

## Tệp

- Sửa `apps/web/src/pages/reader-markdown.tsx`: mở rộng `rehypeWarnings` để nhận cả `[!TLDR]`, hiển thị thành hộp "🧠 TL;DR". Dùng chung đường xử lý với `[!WARNING]`, không viết plugin mới.
- Sửa `reader-markdown.test.tsx`: thêm ca test cho TL;DR.
- Sửa `apps/web/src/pages/reader-screen.css`: kiểu cho hộp TL;DR, màu lấy từ token.
- Sửa `scripts/content-queue.ts` và `.test.ts`: tệp chờ **mới** bắt buộc có `> [!TLDR]` với 2–4 gạch đầu dòng nằm trước `##` đầu tiên. Thiếu thì `pnpm check:queue` báo lỗi và CI chặn.
- Sửa `docs/admin-api.md`, mục "Hàng chờ bài AI": thêm quy ước TL;DR.
- Kiểm `apps/server/src/markdown` (phần tách chunk và trích tóm tắt) xem khối TL;DR có làm hỏng tóm tắt hay chỉ mục tìm kiếm không. Nếu có thì bỏ khối này ra khỏi phần trích tóm tắt.

## Routine

- Routine "Viết bài kb mỗi tối" `trig_01Ky1HeNSVRdLQKBfH4DVHmQ` và routine viết bản `-en`: dùng `RemoteTrigger` đọc prompt hiện tại, thêm luật "Mở bài bằng khối `> [!TLDR]` gồm 3 gạch đầu dòng, mỗi dòng không quá 90 ký tự, nằm trước `##` đầu tiên", rồi cập nhật lại. Không đổi lịch chạy hay model.
- Ghi id của routine `-en` vào plan này khi tìm thấy.
- Không viết lại bài cũ.

## Test

- `pnpm vitest run apps/web/src/pages/reader-markdown.test.tsx scripts/content-queue.test.ts`
- Đọc lại prompt của cả hai routine sau khi cập nhật, xác nhận đã có luật TL;DR.
