---
phase: 3
title: "Màn hình người nói"
status: completed
tier: S
dependsOn: [2]
---

# Giai đoạn 3 · Màn hình người nói

## Mục tiêu

Nhấn `N` trong C21 để mở cửa sổ người nói, gồm slide hiện tại thu nhỏ, slide kế tiếp, ghi chú (`notes`, tức đoạn gốc
đầy đủ) và đồng hồ bấm giờ. Hai cửa sổ luôn ở cùng một slide.

## Tệp

- Sửa `present-screen.tsx`: khi URL có `?view=speaker` thì hiển thị bố cục người nói thay cho bố cục chiếu.
- Mới `apps/web/src/pages/present-sync.ts`: bọc `BroadcastChannel('kb-present:<docId>')`, gửi và nhận `{ type: 'goto', slide }`.
- Mới `apps/web/src/pages/present-sync.test.ts`.
- Sửa `present-screen.css`: bố cục người nói theo chiều ngang, có ô ghi chú cuộn được.

## Chi tiết

- `N` gọi `window.open('/d/:id/present?view=speaker#n', 'kb-speaker')`. Bị chặn popup thì hiện thông báo "Cho phép cửa sổ bật lên để mở màn người nói".
- Chuyển slide ở cửa sổ nào cũng gửi `goto` sang cửa sổ kia. Bên nhận chỉ đặt slide, không gửi lại, để không lặp vô hạn.
- Đồng hồ bắt đầu chạy từ lần chuyển slide đầu tiên. Nhấn `R` để đặt lại.
- Trình duyệt không có `BroadcastChannel` thì ẩn gợi ý phím `N`.
- Màn hình người nói chỉ xuất hiện ở màn ngang; trên điện thoại dọc phím `N` không làm gì.

## Test

- Dùng hai instance `BroadcastChannel` giả để kiểm: gửi từ một bên thì bên kia đổi slide, và không xảy ra vòng lặp.
- Nhấn `N` gọi `window.open` với đúng URL.
