---
phase: 5
title: "Đếm lượt xem slide"
status: completed
tier: M
dependsOn: [2]
---

# Giai đoạn 5 · Đếm lượt xem slide

## Mục tiêu

Mỗi lượt xem C21 ghi một dòng gồm bài, slide xa nhất đã xem và tổng số slide. Không ghi tài khoản, không ghi IP.
Từ đó biết bao nhiêu lượt mở slide và bao nhiêu người xem tới cuối.

## Tệp

- Sửa `apps/server/src/db/schema.ts`: thêm bảng `present_views`:
  `id uuid pk`, `document_id uuid` (FK `documents`, `on delete cascade`), `lang`, `furthest int`, `total int`, `viewed_at timestamptz default now()`. Thêm index trên `(document_id, viewed_at)`.
- Mới: migration `apps/server/drizzle/0019_present-views.sql` sinh bằng drizzle-kit, kèm snapshot trong `meta`.
- Sửa `apps/server/src/db/migrations.test.ts` nếu test này liệt kê bảng.
- Mới hoặc sửa: `apps/server/src/api/present-routes.ts` với `POST /api/documents/:id/present-views` và body `{ furthest, total }`.
  - Gọi `openDocument(db, viewer, id)` trước để kiểm quyền, nên bài riêng tư không ghi được và trả 404 giống C11.
  - Kiểm `0 < furthest <= total <= 1000`. Áp giới hạn tần suất theo IP, dùng cùng helper giới hạn với `openLimit`.
  - Trả 204.
- Sửa `apps/server/src/app.ts`: gắn router mới.
- Sửa `apps/server/src/retention.ts`: xoá dòng cũ hơn 180 ngày, đặt cùng lượt dọn hằng giờ với `share_link_visits`.
- Sửa `present-screen.tsx`: lần đầu trang bị ẩn (`visibilitychange` sang `hidden`) hoặc khi thoát màn thì gọi `navigator.sendBeacon` **một lần** cho mỗi lượt mở.
- Mới: `present-routes.test.ts` gồm các ca bài công khai ghi được, bài riêng tư trả 404, dữ liệu sai trả 400, và bị giới hạn tần suất.

## Xem số liệu (V2, chủ dự án chốt 08/11/2026)

- Sửa `apps/server/src/api/admin-api-routes.ts`: thêm `GET /api/admin/stats/present?days=30` (1–180 ngày), xác thực bằng token quản trị như các endpoint quản trị khác. Kết quả trả về:
  `{ days, opened, finished, byDocument: [{ id, title, lang, opened, finished }] }`, trong đó `finished` là số lượt có `furthest = total`. Lấy 50 bài có nhiều lượt mở nhất.
- Thêm test vào `admin-api-routes.test.ts` và tài liệu vào `docs/admin-api.md`.

## Dữ liệu prod

1. Trước khi deploy bản có migration: chạy `pg_dump` database `kb` trên `.65`, lưu theo quy ước sao lưu đang dùng cho kb (xem `docs/deployment-guide.md`) và ghi tên tệp vào plan này.
2. Deploy. Migration chạy theo luồng deploy hiện tại.
3. Mở một bộ slide trên prod, thoát ra, rồi kiểm `select count(*) from present_views` tăng lên.
