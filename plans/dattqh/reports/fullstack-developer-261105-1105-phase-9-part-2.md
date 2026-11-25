# Phase 9 · Phần 2: C01 (vòng tạo mới), C08 (Của tôi), job dọn thùng rác, `[[ ]]` trong C11, seed

Trạng thái: **xong**. Typecheck, lint sạch; `pnpm test` 119 tệp, 788 pass, 1 skip (có sẵn); parity C01 1,49 %,
C08 1,66 %, C11 2,22 % (ngưỡng 3 %, không nâng ngưỡng riêng). Chưa stage, chưa commit.

## Server

| Việc | Ở đâu |
|---|---|
| Xếp hạng `[[ ]]` tách thành hàm thuần `bestLinkTarget` (lưu bài và trang đọc dùng chung) | `src/authoring/link-targets.ts`, `src/access/authoring.ts` |
| `purgeTrash` dùng chung `purgeWhere`; thêm `purgeOwnTrash(db, viewer, id \| null)`: chỉ thùng rác của chính tài khoản (`deletedBy`) | `src/access/authoring.ts` |
| Job dọn: `runTrashPurge`, `finishPurge` (gỡ tệp trên đĩa + `sync.enqueue`), `startTrashPurge` (chạy lúc khởi động rồi mỗi 24 giờ, `unref`, lỗi thì log và lần sau thử lại) | `src/authoring/trash-purge.ts` |
| Nối job trong `server.ts` (tắt khi `KB_SEED=mock`, vì thùng rác của seed ghi ngày theo board 03/11/2026; dừng khi tắt server) | `src/server.ts` |
| `DELETE /api/me/trash/:id` → 204 / 404; `DELETE /api/me/trash` → `{purged}`; 30 lượt/phút; cùng `finishPurge` | `src/api/my-content-routes.ts` |
| `MyDocument` thêm `hidden`, `collection` (cho "Bị quản trị ẩn", "Nơi nằm: Networking › Web") | như trên |
| `GET /api/documents/:id` thêm `wikilinks: [{title, id}]` (hàm `writtenLinks`) | `src/api/content-routes.ts` |

Lưu trữ tệp tải lên **chưa có** (bảng `files` chưa có ai ghi tới phase 10): `removeStoredFiles` trả về ngay, comment
nói rõ phase 10 điền vào; `purgeTrash` đã trả `storageKeys` sẵn.

`[[ ]]` trong C11: bảng `links` không giữ chữ đã viết, nên server phát lại đúng luật xếp hạng của lần lưu trên các
đích wikilink mà người đọc **đọc được** của bài. Đích mà người đọc không mở được thì tiêu đề giữ nguyên chữ (cả `[[ ]]`).

## Web

- **C01** `/create` (route mới, nút "+" của lens rail trỏ tới): 9 lựa chọn theo vòng như board, panel mô tả theo
  chuột hoặc focus bàn phím, chú giải 4 nhóm. Ghi chú → `/new`, Canvas → `/canvas`; Space cá nhân, Collection mở form
  trong panel (dùng `POST /api/me/space`, `POST /api/collections` của phần 1; quản trị chọn được Space công khai, thành
  viên thấy "· chỉ quản trị"). Tài liệu từ mẫu, Office, Nhập hàng loạt, URL, Lối đi: còn trên vòng, `aria-disabled`,
  panel ghi "Sắp có · …". Esc đóng form, rồi đóng vòng (về trang trước, không có thì `/u`). Tệp: `create-menu.tsx`,
  `create-options.ts`, `create-panes.tsx`, `create-messages.ts`, `create-menu.css`.
- **C08** `/me`: tab Vũ trụ của tôi (vũ trụ 3 vòng theo bước duyệt + ô "Bị từ chối", hoặc Danh sách), Gần đây, Yêu thích,
  Thùng rác (khôi phục có hoàn tác, "Xoá vĩnh viễn" sau khi gõ XOÁ, "Dọn thùng rác", "còn N ngày", vàng khi ≤ 3 ngày);
  lọc theo loại và trạng thái duyệt (áp cho cả 4 tab); panel chi tiết (trạng thái, lý do của người duyệt, nơi nằm,
  hành động theo trạng thái, yêu thích, bỏ vào thùng rác có hoàn tác). Trạng thái: đang tải, lỗi + Thử lại, trống từng
  tab, "vũ trụ riêng còn trống" (dùng lại `createCards` của `universe-states.tsx`, nay export; quả cầu giữa thành
  "Hành tinh đầu tiên" khi Space riêng chưa có bài). Canvas của tài khoản hiện như hành tinh riêng tư. Tệp: `mine-*.ts(x)`,
  `mine-screen.css`.
- **C11**: `ReaderMarkdown` nhận `wikilinks`, plugin rehype `rehypeWikilinks` biến `[[Tiêu đề]]` / `[[Tiêu đề|chữ]]` thành
  link `/d/<id>`; trong code giữ nguyên.
- Kit: `Tabs` thêm `count` tuỳ chọn; icon mới `create-*`, `favorite`, `eye-off`; token mới (khối C01/C08) trong
  `tokens.css`. Palette ⌘K: "Tạo ghi chú" → `/new`, "Tải tệp Office" → `/create`. S05: "Viết ghi chú" → `/new`, các
  thẻ còn lại và "Hành tinh đầu tiên" → `/create`. `SHELL_PATHS` thêm `create`, `newNote`.

## Seed (KB_SEED=mock)

Của chủ seed, trong Space riêng, ghi ngày trước mọi bài khác (danh sách gần đây của C09 không đổi): "Ghi chú: swap trên
Ubuntu" (chờ duyệt), "TCP vs UDP bằng hình" (cần sửa, Linh: "Thêm link RFC 793…"), "Mẹo DNS cache" (bị từ chối, có lý
do); thùng rác "Bản nháp cũ: ARP" (3 ngày) và "boot-notes.docx" (27 ngày); yêu thích DHCP, "Máy mới vào mạng", "Máy mới
xin IP thế nào". `SeedDocument` thêm `reviews`, `trashedDaysBefore`; `SEED_FAVORITES`. Test cập nhật theo: Space riêng có
7 bài, 4 ghi chú.

## Kiểm tra

- `pnpm typecheck`: sạch. `pnpm lint` (eslint, brand, tokens 94 cặp WCAG AA, public): sạch.
- `pnpm test`: 119 tệp, 788 pass, 1 skip. Test mới (46): `trash-purge.test.ts` (4), `my-content-routes.test.ts` (6:
  thùng rác, yêu thích, danh sách của mình, gần đây của người khác không bao giờ thấy bài của chủ; xoá hẳn chỉ trong
  thùng rác của mình; `hidden`, `collection`, lý do; `wikilinks`), `mine-model.test.ts` (9), `mine-screen.test.tsx` (16),
  `create-menu.test.tsx` (8), `reader-markdown.test.tsx` (+2), `reader-screen.test.tsx` (+1).
- Parity (`KB_E2E_PORT_OFFSET=40 pnpm e2e --project parity -g "C01|C08|C11"`, một lần cuối; server E2E đã tắt): C01
  1,49 %, C08 1,66 %, C11 2,22 %.

## Lệch mock (đã ghi `docs/mock-deviations.md`)

- **C01**: màn `/create` thay cho lớp phủ; 5 lựa chọn "Sắp có" (không có khung chọn mẫu, khung URL); khung Space cá nhân
  không có ô tên, màu (một Space cá nhân mỗi tài khoản, theo phần 1).
- **C08**: ảnh so pixel trả `/api/me/documents` bằng 8 bài của board (mock `mine-c08`, `e2e/mine-boards.ts`) vì seed
  dùng chung với C02/C09/C10/C13 giữ các tên đó ở trạng thái khác; số tab "Gần đây" là số thật (16, board 6); lý do
  không có nhãn phân loại; "Lượt mở" luôn "—"; loại Office ghi "Tệp Word"; Gửi duyệt, Rút lại, Chia sẻ, Gỡ khoá; bài
  đã đăng không bỏ vào thùng rác được; không có công tắc theme.
- Dòng S05 và F01 sửa theo đích mới của thẻ và lệnh.
- `docs/parity-testing.md` (mock `mine-c08`), `docs/deployment-guide.md` (việc định kỳ trong `kb-server`), README.

## Câu hỏi còn mở

1. **Nhiều Space cá nhân?** Board C01 cho đặt tên, màu và có cả "Ôn thi mạng (cá nhân)" trong danh sách Collection,
   tức nhiều Space cá nhân. Phần 1 chốt một Space mỗi tài khoản, nên khung chỉ tạo/mở Space đó. Muốn đúng board thì đổi
   mô hình dữ liệu (slug, Space mặc định của bài mới, Universe). Khuyến nghị: giữ một Space, dùng Collection để chia chủ đề.
2. **Tài liệu từ mẫu**: chưa có API mẫu nên đang "Sắp có". Làm được rẻ bằng `/new?template=lab|process|compare` với khung
   Markdown sẵn (không cần API mới), nếu anh muốn có ngay ở phase 9.
3. **C09 không chạy lại**: seed thêm 3 bài riêng tư của chủ, số "dựa trên N tài liệu" của panel AI ở C09 (và nền
   S03/F01) tăng 3 (phần 1 đã tăng 1). Theo quy tắc e2e không chạy các board đó; nên chạy C09 ở lần sửa C09 kế tiếp.
4. Nút "Yêu thích" ở C11 vẫn khoá "Sắp có" (lệch mock cũ) dù API yêu thích đã có; nối được ở lần sửa C11 sau.
