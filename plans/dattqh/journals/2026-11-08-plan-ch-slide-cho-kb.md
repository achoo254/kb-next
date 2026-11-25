---
title: Plan chế độ slide cho kb
date: 2026-11-08
summary: Chốt thiết kế slide gen Z cho bài kb và viết plan 6 giai đoạn
---

# Plan chế độ slide cho kb

## Chuyện gì đã xảy ra
Chủ dự án muốn trình bày bài kb dưới dạng slide, bố cục hợp gen Z. Qua một buổi grilling đã chốt 17 quyết định: slide cắt tự động lúc mở, thiết kế cho điện thoại dọc trước, nền Universe tối kèm bảng màu gradient, màn hình người nói, khối `> [!TLDR]` do routine viết, và đếm lượt xem ở mức tối thiểu.

## Phát hiện từ dữ liệu prod
- `GET /api/documents/:id` đã trả `chunks[] {anchor, heading, markdown}` cắt sẵn theo `##`, nên không cần endpoint mới để dựng slide.
- Khảo sát 40 bài công khai: không có `###`, không có ảnh, không có `[!WARNING]`. Bài lab dài tới 51.700 ký tự và có tới 36 code block.
- Cắt toàn văn 200 ký tự mỗi slide thì bài lab ra khoảng 250 slide.

## Quyết định
- V1: giữ toàn văn. Bù lại, mục lục bấm được, có phím `T` để về mục lục và thanh tiến độ chia theo phần.
- V2: xem số liệu qua `GET /api/admin/stats/present` của API quản trị.

## Bước tiếp theo
Chạy `/ak-cook` với plan `plans/dattqh/261108-0759-kb-present-mode/plan.md`, bắt đầu từ giai đoạn 1 (bộ cắt slide) và giai đoạn 4 (TL;DR).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
