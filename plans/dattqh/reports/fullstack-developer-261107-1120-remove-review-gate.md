# Bỏ vòng duyệt: tác giả toàn quyền với bài của mình

Ngày 07/11/2026. Quyết định của chủ dự án: tác giả tự đăng công khai hay giữ riêng tư; quản trị vẫn quản lý mọi bài.
Trạng thái: **xong**, chưa commit, chưa push (để phiên điều phối commit).

## Kết quả

- `POST /api/documents/:id/submit` đăng bài ngay: bài chuyển sang `approved`, `own` thành `community`, mốc 180 ngày tính lại từ lúc đăng.
  Câu trả lời mới là `{status: "approved", hidden, publishedAt}`; bài đã đăng thì trả 409 `already-published`.
  Khách đọc được bài ngay sau khi đăng.
- `POST /api/documents/:id/private` chạy được từ mọi bước, kể cả bài đã đăng (C08 "Gỡ xuống", C04 "Gỡ xuống · về riêng tư").
  Bài thành `private`, `community` về `own`, mọi link chia sẻ bị thu hồi. Đăng lại không làm link cũ chạy lại.
- Tác giả sửa được bài của mình ở mọi bước: không còn mã `locked` ở trình soạn, khôi phục phiên bản, lối đi và tệp Office.
- Tác giả xoá được bài đã đăng của mình.
- Quản trị ẩn bài thì bài vẫn ẩn: tác giả gỡ xuống, đăng lại hay sửa bài đều không đụng tới `hidden`.
  Đăng lại một bài đang bị ẩn thì câu trả lời có `hidden: true`, và C06 ghi "Quản trị đang ẩn bài này".
- Những thứ đã bỏ:
  - `POST /withdraw`.
  - `GET /api/moderation/queue` và `POST /api/moderation/documents/:id/decision`.
  - `GET /api/admin/review`: không script nào trong `scripts/` dùng nó. Màn A03 và C19 cũng bỏ thẻ endpoint này.
  - Việc Jev sơ duyệt bài khi gửi (xoá `review/pre-review.ts`).
  - Thông báo "bài mới chờ duyệt" gửi quản trị.
- `POST /api/admin/posts` giữ nguyên.
- A01: bỏ màn. `/admin` giờ mở A02, giống `/admin/content`. `/admin/review` ra trang không tìm thấy.
- Vai trò Người duyệt gộp vào Thành viên, theo lời khuyên của kongming (phương án B):
  - `effectiveRole` trả `member` cho dòng nào còn lưu `reviewer`.
  - `PATCH` vai trò chỉ nhận `member`/`admin`; gửi `reviewer` thì trả 400.
  - Link mời chỉ còn loại Thành viên; nhận link không đổi vai trò, nên `raised` luôn `false`.
  - `/api/me` và quyền trong Space bỏ trường `canReview`.
  - Trên web: bảng quyền C19, ô chọn vai trò, ô chọn vai trò của link mời và dòng "Ai duyệt" ở C10 đều bỏ phần Người duyệt.
- Không còn chỗ nào ở giao diện bảo tác giả chờ duyệt. Chữ "duyệt" chỉ còn ở dữ liệu lịch sử thật: lượt duyệt cũ ở C17, thông báo cũ ở C20, dòng "Người duyệt" ở C18 của bài từng được duyệt.

## Dữ liệu cũ trên production (không viết migration)

| Giá trị | Code mới đối xử thế nào |
|---|---|
| `status` `pending`, `changes_requested`, `rejected` | Giữ trong enum nhưng không bước nào dẫn tới nữa. Chỉ tác giả và quản trị đọc được, giống bài riêng tư (người duyệt hết quyền đọc riêng bài `pending`). C08 và C04 hiện chúng là "Riêng tư". Tác giả đăng hay lưu riêng tư như mọi bài; lúc đó các thông báo "chờ duyệt" chưa đọc của quản trị về bài ấy bị xoá. |
| `users.role = reviewer` | Hoạt động như Thành viên. Quản trị đổi vai trò ở C19 thì dòng được ghi lại. |
| `invite_links.role = reviewer` (link còn hạn) | Đọc như link Thành viên: dùng được nhiều lần, không nâng vai trò. |
| `review_events` (kể cả `jev_scores`), thông báo `review` | Giữ để xem lịch sử (C17, C18, nhật ký C19), không ghi thêm. Thông báo `submitted` cũ của quản trị mở thẳng bài. |

Khi tác giả tự đăng, không ghi sự kiện duyệt nào, nên lịch sử C17 và C18 không có dòng "đã đăng". Tôi chọn vậy để chữ "Đã duyệt bởi …" của dữ liệu cũ vẫn đúng.

## Tệp

Server:
- `access/review.ts`: viết lại các bước vòng đời bài.
- `review/moderation.ts`, `api/review-routes.ts`, `api/admin-api-routes.ts`, `app.ts`.
- `access/visibility.ts`, `authoring.ts`, `journeys.ts`, `files.ts`.
- `access/roles.ts`, `viewer.ts`, `workspace-members.ts`, `participation.ts`.
- `api/space-members.ts`, `me-routes.ts`, `workspace-routes.ts`.
- `workspace/invites.ts`, `notifications/notification-store.ts`.
- `db/seed-data.ts` (Linh thành member) và chú thích trong `schema.ts`. Không đổi SQL nào.
- Xoá `review/pre-review.ts`.

Web:
- API: `review-api.ts` (thêm `publishDocument`, `keepPrivate`), `content-api.ts`, `workspace-api.ts`, `history-api.ts`, `notifications-api.ts`.
- Màn: C04, C05, C06, C08, C02/C07 (bỏ trạng thái `locked`), C18, C10, C17, C19, C20, A02/A03, H03, trang pháp lý, dev-kit.
- Xoá `admin-review-screen.tsx` và `staff-role.tsx`.
- e2e: `parity-screens.ts` (bỏ A01; maxDiff C04 0,045, C06 0,045, C08 0,06, C18 0,035), `admin-boards.ts`, `open-screen.ts`, `settings-boards.ts`, `history-boards.ts`, `phone-layout.spec.ts`.

Tài liệu:
- `docs/admin-api.md` (bảng "Vòng đời bài", thông báo, link chia sẻ, bảng API).
- `docs/editor.md` ("Ai sửa được", "Xoá").
- `docs/settings-and-roles.md`.
- `docs/mock-deviations.md`: dòng A01, A03, C04/M03, C06, C08, C18, C10, C19, C17, C02/C07, C20.
- `docs/board-frame.md`, `docs/parity-testing.md`, `docs/deployment-guide.md`, `README.md`.

Tổng `git diff --shortstat`: 164 tệp, +1640 / −3903 dòng. Con số này gồm cả thay đổi của một phiên khác, xem phần Lưu ý.

## Kiểm tra (chạy lần lượt, không chạy song song)

- `pnpm typecheck`: cả gốc, server, web và `e2e/tsconfig` đều sạch, 0 lỗi.
- `pnpm lint`: eslint 0 lỗi, 0 cảnh báo (`--max-warnings=0`).
  Các bước kiểm phụ: check-brand ✓; check-tokens ✓ (94 cặp tương phản đạt AA); check-public ✓ (860 tệp); check-queue ✓.
- `pnpm test`: **172 tệp pass; 1328 test pass, 1 bỏ qua.**
- `pnpm build`: ✓ built. Vite cảnh báo chunk lớn hơn 500 kB.
- Parity, chạy một lần trên các board đã sửa:
  - Pass trong ngưỡng 3%: C17 2,30%, C05 3,00%, A02 1,33%, A03 2,50%, H03 1,07%, C19 2,69%, M03 13,10% (ngưỡng 14%).
  - C10 2,69%: lượt đầu báo lỗi ENOENT khi ghi artifact trace của Playwright, chạy lại thì pass.
  - Vượt ngưỡng đúng như dự đoán, đã ghi deviation và nâng maxDiff, chạy lại 5/5 pass: C04 3,84%, C06 3,84%, C08 5,05%, C18 3,20%.
- Test server mới, trong `review-routes.test.ts` (13 test):
  - Đăng xong khách đọc được ngay và không quản trị nào nhận thông báo.
  - Các trường hợp bị từ chối khi đăng.
  - Tác giả sửa bài đã đăng.
  - Gỡ xuống thì thu hồi link và trả `origin` về `own`.
  - Bài `pending`/`changes_requested`/`rejected` cũ đọc như riêng tư cho tới khi tác giả đăng.
  - Tác giả xoá bài đã đăng.
  - Quản trị ẩn bài thì tác giả không bỏ ẩn được.
- Test cập nhật thêm: `share-routes`, `workspace-routes` (reviewer được đọc như member, link mời reviewer cũ, gửi `reviewer` bị 400), `authoring-routes`, `admin-api-routes`, `visibility`, `content-routes`, `history-routes`, `journey-routes`, `file-routes`, `activity-routes`.
- Test web mới: C04 đăng và gỡ xuống, C06 bài bị ẩn và `already-published`, C08 "Gỡ xuống" và trạng thái cũ hiện là riêng tư, trình soạn mở bài đã đăng, `/admin` hiện A02, thông báo `submitted` cũ mở bài.

## Lưu ý cho phiên điều phối

1. **Có một phiên khác đang sửa cùng cây thư mục** (danh sách "Xem tất cả N hệ" / sắp xếp Space). Các thay đổi đó không thuộc việc này:
   - `apps/server/src/access/content.ts`, `apps/server/src/api/content-routes.ts` (phần `latestAt`).
   - `apps/web/src/pages/universe-spaces.ts(.test.ts)`, `universe-screen.tsx`.
   - Các tệp mới `spaces-screen.*`.
   - Một phần của `universe-phone.tsx/.css`, `i18n/messages.ts`, `app-shell.tsx`, `content-api.ts`. Mấy tệp này có cả thay đổi của việc này, nên commit cần tách theo từng hunk.
2. `e2e/phone-layout.spec.ts` (Mobile, 5 cỡ màn) **đang fail** vì nút `a.phone-all-spaces` "Xem tất cả 7 hệ" chỉ cao 28px, dưới mức tối thiểu 44px. Nút này do phiên kia thêm, không phải việc này. Test "publishing on a phone" của M03/C06 pass.
3. A01 đã bỏ khỏi bộ kiểm giống mock; ảnh `design/mock-png` của A01 vẫn để nguyên.

## Câu hỏi còn mở

- Có cần ghi một sự kiện "đã đăng" (actor là tác giả) để C17 và C18 hiện lúc bài được đăng không? Hiện tại không ghi.
  Nếu ghi thì cần thêm giá trị vào enum `review_action` (tức là cần migration) hoặc dùng lại `approved` (sẽ hiện chữ "duyệt").
- Giới hạn 5 lần đăng mỗi 10 phút được giữ như cũ. Tác giả gỡ xuống rồi đăng lại nhiều lần có thể chạm giới hạn này.
