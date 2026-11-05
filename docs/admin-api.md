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

API cho web (phiên đăng nhập): `POST /api/documents/:id/submit` `{space?, collection?, tags?}`, `POST
/api/documents/:id/withdraw`; quản trị: `GET /api/moderation/queue`, `POST /api/moderation/documents/:id/decision`
`{decision, reason?}`, `GET /api/moderation/published`, `PATCH /api/moderation/documents/:id`. Chi tiết mã lỗi ở đầu
`apps/server/src/api/review-routes.ts`.

## Thông báo (C20)

Loại: `mention`, `comment` (bình luận mới ở C11, tác giả bài và người được `@Tên` nhắc, chỉ ai còn đọc được bài; mất
quyền đọc thì đoạn trích bị ẩn khi liệt kê), `review` (kết quả duyệt cho tác giả; bài mới chờ duyệt cho quản trị, không
gửi thêm khi quản trị chưa đọc thông báo trước của bài đó, xoá khi tác giả rút lại), `stale` (bài đã duyệt 180 ngày chưa sửa, server kiểm mỗi ngày, mỗi lần sửa
báo một lần), `permission` (quản trị ẩn hay hiện bài). API: `GET /api/me/notifications`, `GET
/api/me/notifications/unread` (chấm đỏ trên chuông), `POST /api/me/notifications/:id/read|unread`, `POST
/api/me/notifications/read-all`. Ghi thông báo mới: `notify()` ở `apps/server/src/notifications/notification-store.ts`;
sau khi việc chính đã lưu thì dùng `notifyAfter()` (lỗi chỉ ghi log, không biến việc đã xong thành lỗi 500).

## API quản trị (token)

Dành cho pipeline đăng bài chạy ở server khác. Xác thực bằng token quản trị, không dùng phiên web, không cần `Origin`.

- Token tạo ở A03 (`/admin/api`): `kf_admin_` + 43 ký tự ngẫu nhiên, hiện **một lần**; server chỉ lưu sha256 và 4 ký
  tự cuối. Tạo token mới thì token cũ bị thu hồi. Token chỉ dùng được khi người tạo còn trong `ADMIN_SUBS`.
- Giới hạn 60 lần gọi mỗi phút mỗi IP (cả lần gọi sai token), quá thì 429 `rate-limited`.
- Mỗi lần gọi **đã xác thực** được ghi (phương thức, đường dẫn, mã trả về, mã lỗi, bài liên quan; không ghi token hay
  nội dung); lần gọi thiếu hay sai token chỉ bị giới hạn tần suất, không ghi. Việc dọn hằng ngày xoá dòng quá 30 ngày;
  20 lần mới nhất hiện ở A03.

| Endpoint | Thân | Trả |
|---|---|---|
| `POST /api/admin/posts` | `title`, `lang` (`vi`/`en`), `space` (slug Space công khai) hoặc `collection` (id Collection, hoặc slug Space), `tags?`, `markdown`, `type?` (`note`/`lab`/`process`), `source?` (`ai`/`human`), `hidden?` | 201 `{id, url, status: "approved", hidden}` |
| `PATCH /api/admin/posts/:id` | `hidden?`, `title?`, `tags?`, `space?`, `collection?` | 200 `{id, title, status, hidden}` |
| `GET /api/admin/review` | — | 200 `{documents: [...]}`: bài chờ duyệt, mới gửi trước, kèm `preReview` của Jev |

Lỗi: 401 `token-required` (thiếu header), 401 `invalid-token` (sai, đã thu hồi, người tạo không còn là quản trị),
400 `invalid-body` / `space-required`, 404 `not-found`, 409 `not-approved` (ẩn bài chưa duyệt), 429 `rate-limited`.

```sh
curl -sS https://kb.hoandat.com/api/admin/posts \
  -H "Authorization: Bearer $KB_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Giao thức DHCP","lang":"vi","collection":"networking","tags":["dhcp","dora"],
       "markdown":"## DORA 4 bước\n\nDiscover, Offer, Request, Ack.","source":"ai","hidden":false}'
```

Bài đăng xong hiện ngay ở C09/C10 với nhãn Chính thức; `"hidden": true` thì đăng mà chưa hiện.
