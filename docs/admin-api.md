# Vòng đời bài, thông báo và API quản trị

## Vòng đời bài

Mỗi bài có `status` (bước đang ở) và `hidden` (chỉ quản trị đổi). Người khác chỉ thấy bài `approved` và không ẩn
(`apps/server/src/access/visibility.ts`). Các bước nằm ở `apps/server/src/access/review.ts`:

| Từ | Việc | Thành | Ai |
|---|---|---|---|
| `draft`, `private`, `changes_requested`, `rejected` | Gửi duyệt (C06, C08 "Gửi duyệt"; tối đa 5 lần mỗi 10 phút) | `pending` | tác giả |
| `pending` | Rút lại (C08) | `draft` | tác giả |
| `pending` | Duyệt / Yêu cầu sửa / Từ chối (A01; hai việc sau bắt buộc lý do) | `approved` (bài `own` thành `community`; mốc "lần sửa cuối" đặt lại lúc duyệt), `changes_requested`, `rejected` | quản trị |
| `approved` | Ẩn / hiện, đổi tiêu đề, thẻ, nơi đặt (A02, `PATCH` của API): chỉ bài đã duyệt, cả bản vá hoặc không gì cả | giữ `approved` | quản trị |
| — | Đăng qua API | `approved`, nguồn `official` | token quản trị |

Lý do yêu cầu sửa hay từ chối chỉ tác giả và quản trị đọc được. Gửi duyệt xong, server hỏi Jev bốn câu (đúng chủ đề,
có nguồn, trùng bài đã có trong 5 bài gần nhất theo tìm kiếm, ngôn từ không phù hợp), lưu điểm vào sự kiện `submitted`
cho A01; Jev tắt hay lỗi thì bài vẫn vào hàng duyệt, không có điểm. Không bao giờ tự duyệt hay tự từ chối.

Tác giả chọn nơi đặt, thẻ (tối đa 8), ngôn ngữ gốc rồi bấm "Gửi duyệt" hay "Lưu riêng tư" ở C04 (`/d/:id/publish`;
C02 và C08 "Gửi duyệt" mở C04). Chỉ nút "Gửi duyệt" của C04 gửi bài: nó hiện các bước của C06 ngay tại chỗ và đổi địa
chỉ thành `/d/:id/submit`; mở hay tải lại `/d/:id/submit` không bao giờ gửi (bài đang chờ duyệt thì hiện "Đã gửi
duyệt", bài khác chuyển về C04). C05 (`/d/:id/preview`) xem trước bài như khách (sau khi duyệt) hay như tác giả.

API cho web (phiên đăng nhập): `POST /api/documents/:id/submit` `{space?, collection?, tags?, lang?}`, `POST
/api/documents/:id/private` (cùng thân; "Lưu riêng tư": bài đang chờ thì ra khỏi hàng duyệt, bài đã duyệt trả 409
`published`), `POST /api/documents/:id/withdraw`; người duyệt và quản trị (403 `reviewer-only` với người khác): `GET
/api/moderation/queue`, `POST /api/moderation/documents/:id/decision` `{decision, reason?}`; chỉ quản trị: `GET /api/moderation/published`, `PATCH /api/moderation/documents/:id`. Chi tiết mã lỗi ở đầu
`apps/server/src/api/review-routes.ts`.

## Thông báo (C20)

Loại: `mention`, `comment` (bình luận mới ở C11, tác giả bài và người được `@Tên` nhắc, chỉ ai còn đọc được bài; mất
quyền đọc thì đoạn trích bị ẩn khi liệt kê), `review` (kết quả duyệt cho tác giả; bài mới chờ duyệt cho quản trị, không
gửi thêm khi quản trị chưa đọc thông báo trước của bài đó, xoá khi tác giả rút lại), `stale` (bài đã duyệt 180 ngày chưa sửa, server kiểm mỗi ngày, mỗi lần sửa
báo một lần), `permission` (quản trị ẩn hay hiện bài). API: `GET /api/me/notifications`, `GET
/api/me/notifications/unread` (chấm đỏ trên chuông), `POST /api/me/notifications/:id/read|unread`, `POST
/api/me/notifications/read-all`. Ghi thông báo mới: `notify()` ở `apps/server/src/notifications/notification-store.ts`;
sau khi việc chính đã lưu thì dùng `notifyAfter()` (lỗi chỉ ghi log, không biến việc đã xong thành lỗi 500).

## Link chia sẻ

Chỉ bài đã duyệt và đang hiện mới có link, do tác giả hoặc quản trị tạo ở C18 (`/d/:id/share`; nút "Chia sẻ" của C11
và C08 mở trang này; người đọc khác bấm "Chia sẻ" ở C11 thì chép địa chỉ bài). Mỗi bài một link đang chạy: tạo link
mới thì link cũ bị thu hồi. Token 32 ký tự ngẫu nhiên, server chỉ lưu sha256 và 4 ký tự cuối, nên link chỉ hiện đủ lúc
vừa tạo; sau đó C18 hiện `…/l/••••abcd` và "Tạo link mới" (có hỏi lại) để chép lại. Mã QR của link và "Tải ảnh story"
(PNG 1080 × 1920: tiêu đề, Space, art `ill-doc-planet`, mã QR) cũng chỉ có trong lúc trang còn giữ link đủ (vừa tạo,
chưa tải lại trang); cả hai làm ngay trên trình duyệt (`apps/web/src/pages/share-story.ts`), không gọi mạng, không lưu
token vào đâu.

- Hạn link: không hạn, 7 ngày, 30 ngày, tính từ lúc chọn. Chỉ đổi được hạn hay quyền của link đang chạy; link đã hết
  hạn hay đã thu hồi tắt hẳn (409 `link-expired`), muốn chia sẻ lại thì tạo link mới.
- Bài rời trạng thái đã đăng (bị yêu cầu sửa, bị từ chối, rút lại, giữ riêng tư, vào thùng rác) thu hồi mọi link của nó;
  xoá hẳn thì link mất theo. Quản trị chỉ ẩn bài thì link trả "riêng tư" trong lúc ẩn và chạy lại khi bài được hiện.
- Người có link được: chỉ xem, hay cho phép remix (người đã đăng nhập chép bài thành bản nháp của mình, cuối bài ghi
  "Remix từ …"). Chưa đăng nhập chỉ thấy trang xem trước (tiêu đề, tác giả, các mục, đoạn đầu); đăng nhập rồi đọc bài ở
  C11 như mọi bài công khai.
- Mở link (H02, `/l/<token>`): sai token 404 `not-found`; hết hạn 410 `link-expired`, đã thu hồi 410 `link-revoked`
  ("Link này đã tắt"); bài không còn công khai (bị ẩn, bị gửi lại) mà người mở không đọc được: 404 `private` ("Hành
  tinh riêng tư", không lộ gì về bài). Đường dẫn khác dưới `/l/` nhận trang "không tìm thấy" của app.
- Lịch sử truy cập (C18): mỗi lượt mở của người nhận (giờ, tài khoản hoặc "khách"; tác giả và quản trị mở thử không tính), tạo, đổi hạn hay quyền, thu hồi link, cùng lúc
  bài được duyệt và lúc quản trị ẩn hay hiện bài. Không bao giờ ghi token. Lượt mở giữ 90 ngày.
- Quản trị vừa ẩn hay hiện bài: tác giả thấy banner "Quyền vừa thay đổi" ở C18 khi còn thông báo `permission` chưa đọc.

API (phiên đăng nhập, tác giả hoặc quản trị): `GET /api/documents/:id/share`, `POST` `{expiry, access}` (201, token chỉ
có trong câu trả lời này; 409 `not-shareable`), `PATCH` `{expiry?, access?}` (409 `link-expired`), `DELETE` (404 `no-link`). Mở link:
`GET /api/l/:token`, `POST /api/l/:token/remix` (tối đa 10 lần mỗi phút mỗi tài khoản; 403 `remix-off`, 409 `not-remixable` với tệp lưu sẵn). Trang `/l/:token`
có thẻ OG do server render (mục Link chia sẻ của [deployment-guide.md](deployment-guide.md#link-chia-sẻ)). Chi tiết mã
lỗi ở đầu `apps/server/src/api/share-routes.ts`.

## API quản trị (token)

Dành cho pipeline đăng bài chạy ở server khác. Xác thực bằng token quản trị, không dùng phiên web, không cần `Origin`.

- Token tạo ở A03 (`/admin/api`): `kf_admin_` + 43 ký tự ngẫu nhiên, hiện **một lần**; server chỉ lưu sha256 và 4 ký
  tự cuối. Tạo token mới thì token cũ bị thu hồi. Token chỉ dùng được khi người tạo còn là quản trị
  (gốc trong `ADMIN_SUBS` hoặc theo vai trò, [`settings-and-roles.md`](settings-and-roles.md)) và chưa bị gỡ khỏi workspace.
- Giới hạn 60 lần gọi mỗi phút mỗi IP (cả lần gọi sai token), quá thì 429 `rate-limited`.
- Mỗi lần gọi **đã xác thực** được ghi (phương thức, đường dẫn, mã trả về, mã lỗi, bài liên quan; không ghi token hay
  nội dung); lần gọi thiếu hay sai token chỉ bị giới hạn tần suất, không ghi. Việc dọn hằng ngày xoá dòng quá 30 ngày;
  20 lần mới nhất hiện ở A03.

| Endpoint | Thân | Trả |
|---|---|---|
| `POST /api/admin/posts` | `title`, `lang` (`vi`/`en`), `space` (slug Space công khai) hoặc `collection` (id Collection, hoặc slug Space), `tags?`, `markdown`, `type?` (`note`/`lab`/`process`), `source?` (`ai`/`human`), `hidden?` | 201 `{id, url, status: "approved", hidden}` |
| `PATCH /api/admin/posts/:id` | `hidden?`, `title?`, `tags?`, `space?`, `collection?` | 200 `{id, title, status, hidden}` |
| `GET /api/admin/posts/:id` | — | 200 `{id, title, lang, type, status, hidden, version, rev, body}`: bản mới nhất, `body` là thân bài không gồm dòng tiêu đề |
| `PUT /api/admin/posts/:id/text` | `body`, `title?`, `summary?` (tóm tắt thay đổi, hiện ở lịch sử C17), `baseRev?` (`rev` đã đọc), `source?` (`ai`/`human`) | 200 `{id, version, rev, changed}`: mỗi lần gọi là một phiên bản riêng (không gộp với lần lưu của trình soạn); nội dung y hệt thì `changed: false` |
| `GET /api/admin/review` | — | 200 `{documents: [...]}`: bài chờ duyệt, mới gửi trước, kèm `preReview` của Jev |

Lỗi: 401 `token-required` (thiếu header), 401 `invalid-token` (sai, đã thu hồi, người tạo không còn là quản trị),
400 `invalid-body` / `space-required`, 404 `not-found`, 409 `not-approved` (ẩn bài chưa duyệt), 409 `stale` (bài đã
đổi sau `baseRev`, kèm `rev` mới), 409 `not-editable` / `journey` (tệp Office, lối đi), 429 `rate-limited`.

```sh
curl -sS https://kb.hoandat.com/api/admin/posts \
  -H "Authorization: Bearer $KB_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Giao thức DHCP","lang":"vi","collection":"networking","tags":["dhcp","dora"],
       "markdown":"## DORA 4 bước\n\nDiscover, Offer, Request, Ack.","source":"ai","hidden":false}'
```

Bài đăng xong hiện ngay ở C09/C10 với nhãn Chính thức; `"hidden": true` thì đăng mà chưa hiện.
