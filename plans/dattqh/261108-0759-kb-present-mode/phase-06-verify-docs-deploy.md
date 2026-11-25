---
phase: 6
title: "Kiểm tra, tài liệu, deploy"
status: completed
tier: S
dependsOn: [1, 2, 3, 4, 5]
---

# Giai đoạn 6 · Kiểm tra, tài liệu, deploy

## Kiểm tra (chạy lần lượt, không chạy song song)

1. `pnpm lint` (gồm eslint, check:brand, check:tokens, check:public, check:queue).
2. `pnpm typecheck`.
3. `pnpm test` (đã có sẵn `--maxWorkers=2`).
4. `pnpm build`.
5. E2E: chỉ chạy spec mới `apps/web/e2e/present.spec.ts`, một lần trước khi commit. Spec gồm: mở bài từ C11, bấm "Trình bày", chuyển slide bằng phím, kiểm hash, thoát. Thêm ca khách chưa đăng nhập mở bài công khai, và ca bài riêng tư bị chặn.
6. Ảnh chụp kiểm tràn chữ ở 390×844 và 1440×900 cho 3 bài mẫu (xem giai đoạn 2).

Trước các bước nặng, kiểm `memory_pressure` và tiến trình nặng khác trên máy.

## Tài liệu

- `docs/navigation.md`: thêm màn C21 (đường dẫn, quyền, loader, cách thoát).
- `README.md`: thêm một dòng mô tả tính năng nếu README có danh sách tính năng.
- `docs/admin-api.md`: quy ước TL;DR (giai đoạn 4). Nếu V2 chọn (a) thì thêm endpoint số liệu.
- Ghi giới hạn: màn hình người nói chỉ đồng bộ được trong cùng một trình duyệt.

## Deploy

- Sao lưu DB prod trước (giai đoạn 5), sau đó deploy theo `docs/deployment-guide.md`. Theo luật hiện tại, deploy không cần hỏi duyệt.
- Kiểm trên prod: mở một bài công khai ở `/d/<id>/present` bằng cửa sổ ẩn danh, kiểm slide TL;DR hoặc mục lục, phím, `#n`, và `present_views` có tăng.

## Commit

Commit theo nhóm, dùng conventional commit, không nhắc tới AI. Kiểm `git diff --cached` trước mỗi lần commit.
