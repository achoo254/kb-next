---
title: "kb tự giữ 37 bài chép từ Học Cloud: gỡ dấu vết, bỏ lệnh nhập, sửa nội dung"
status: phase-1-2-done
created: 2026-11-06
tier: M
---

# kb tự giữ nội dung chép từ Học Cloud

Quyết định (chủ dự án, 06/11/2026): kb chỉ chép nội dung phù hợp, không ghi nguồn, không link về Học Cloud. Học Cloud là
lịch sử, không sửa gì ở đó. Database kb là bản chuẩn của 37 bài. Báo cáo gốc:
[research-261106-2158-kb-article-completeness.md](../reports/research-261106-2158-kb-article-completeness.md).

## Phase 1 · Code (kb-next), tier M

- API quản trị: `GET /api/admin/posts/:id` (tiêu đề, thân bài, `rev`) và `PUT /api/admin/posts/:id/text`
  (`title?`, `body`, `summary?`, `baseRev?`) tạo phiên bản mới qua `saveDocument`, đẩy sang chỉ mục tìm kiếm.
- Ảnh: 20 ảnh chụp màn hình chép vào `apps/web/public/content-img/` (CSP `img-src 'self'` đang chặn ảnh Học Cloud).
- Bỏ lệnh nhập: CLI, bundle entry, script `import:hoc-cloud`, phần HTTP source, mục runbook; giữ các helper dùng chung
  (tách section, html-to-markdown, tóm tắt). Bỏ ô tích hợp "Học Cloud" trên Workspace.
- Kiểm: lint, typecheck, test liên quan, build; deploy qua CI.

## Phase 2 · Dữ liệu prod, tier M

1. Sao lưu database `kb` (`pg_dump`).
2. SQL: tên tài khoản hệ thống `system:hoc-cloud` thành "KnowFlow"; `source_url` của bài nhập về NULL.
3. Qua endpoint mới, mỗi bài một phiên bản "Gỡ dấu vết Học Cloud": bỏ dòng playground và mọi link Học Cloud, ảnh trỏ
   `/content-img/...`, giải mã HTML entity, thay `${DOC_INSPECT}`.
4. Sửa 19 lỗi P1 (mỗi bài một phiên bản có tóm tắt).

## Phase 3 · Nội dung tiếp theo (sau, từng đợt)

P2 (phiên bản hết vá, lệnh cũ, chuẩn bị/dọn dẹp/bài tiếp theo), lối đi mỗi Space, bài mới, bản dịch EN.

## Tiêu chí xong (Phase 1-2)

- [x] Không bài nào còn chuỗi `hoc-cloud` hay "Học Cloud"; trang bài không còn tác giả "Học Cloud".
- [x] 20 ảnh hiện trên kb.hoandat.com.
- [x] `import:hoc-cloud` không còn trong repo/bundle; Workspace không còn ô Học Cloud.
- [x] 19 lỗi P1 đã sửa, mỗi bài có phiên bản mới xem được trong lịch sử.
- [x] Có bản sao lưu database trước khi ghi.

## Rủi ro

Ghi nhầm nội dung: mỗi lần ghi là một phiên bản, khôi phục được ở lịch sử (C17) hoặc từ bản sao lưu.

## Kết quả 06/11/2026

- Code: commit `84dd3b3` (bỏ lệnh nhập, API sửa nội dung, ảnh `/content-img/`), `9de85f5` (nginx cho thân request lớn tới 1100k
  ở documents/admin/journeys/canvases/write; trước đó trình soạn không lưu được bài > 48 KB). nginx và script kích hoạt cài
  tay trên .65 (bản cũ: `/root/kb.hoandat.com.conf.bak-20261106`, `/root/kb-activate-incoming.bak-20261106`).
- Dữ liệu: sao lưu `/root/pg-backups/kb-before-content-cleanup-20261106.dump`; tác giả hệ thống đổi tên "KnowFlow",
  `source_url` 33 bài về NULL; 33 phiên bản "Dọn bài…" + 27 phiên bản "Sửa lỗi…" qua API quản trị.
- Thêm ngoài báo cáo: 42 dòng chữ trong ngoặc nhọn (`<pod>`, `<ADDR-1>`) bị reader bỏ, đã thoát `\<…>`; 169 khối "Quan sát
  bằng" thành đoạn văn hoặc khối `text`; 93 câu dẫn bị cụt "— …" viết lại; placeholder địa chỉ thay bằng dải RFC 5737.
- Token API tạm đã thu hồi. Chưa kiểm bằng mắt trên giao diện (trang cần đăng nhập).
