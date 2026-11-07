# Vòng đời bài, thông báo và API quản trị

## Vòng đời bài

Tác giả toàn quyền với bài của mình (chủ dự án chốt 07/11/2026: bỏ vòng duyệt): đăng công khai hay giữ riêng tư là
lựa chọn của tác giả, không chờ ai duyệt. Mỗi bài có `status` (bước đang ở) và `hidden` (chỉ quản trị đổi). Người
khác, kể cả khách chưa đăng nhập, chỉ thấy bài `approved` và không ẩn (`apps/server/src/access/visibility.ts`). Các
bước nằm ở `apps/server/src/access/review.ts`:

| Từ | Việc | Thành | Ai |
|---|---|---|---|
| mọi bước trừ `approved` | Đăng công khai (C04 "Đăng công khai", C08 "Đăng" mở C04; tối đa 5 lần mỗi 10 phút): công khai ngay | `approved` (bài `own` thành `community`; mốc "lần sửa cuối" đặt lại lúc đăng) | tác giả |
| mọi bước | Lưu riêng tư (C04), Gỡ xuống (C08): bài đã đăng thành riêng tư, mọi link chia sẻ bị thu hồi | `private` (bài `community` về lại `own`) | tác giả |
| mọi bước | Sửa (C02, C07, tệp Office), vào thùng rác | giữ nguyên bước | tác giả, quản trị |
| `approved` | Ẩn / hiện, đổi tiêu đề, thẻ, nơi đặt (A02, `PATCH` của API): chỉ bài đã đăng, cả bản vá hoặc không gì cả | giữ `approved` | quản trị |
| — | Đăng qua API | `approved`, nguồn `official` | token quản trị |

`hidden` chỉ quản trị đổi: tác giả gỡ xuống, đăng lại hay sửa bài đều không đụng tới nó, nên bài quản trị đã ẩn vẫn ẩn
tới khi quản trị hiện lại (đăng lại thì câu trả lời có `hidden: true`, C06 báo bài đang bị ẩn).

Dữ liệu cũ của vòng duyệt: enum vẫn giữ `pending`, `changes_requested`, `rejected` (không viết migration) nhưng không
bước nào dẫn tới chúng nữa. Bài còn ở ba bước này đọc như bài riêng tư (chỉ tác giả và quản trị), C08 xếp vào "Riêng
tư"; tác giả đăng hay lưu riêng tư như mọi bài (thông báo "bài mới chờ duyệt" chưa đọc của quản trị về bài đó bị xoá
lúc ấy). Bảng `review_events` (cả điểm Jev cũ) và thông báo `review` cũ giữ để xem lại lịch sử, không ghi thêm.

Tác giả chọn nơi đặt, thẻ (tối đa 8), ngôn ngữ gốc rồi bấm "Đăng công khai" hay "Lưu riêng tư" ở C04
(`/d/:id/publish`; C02 và C08 mở C04). Chỉ nút "Đăng công khai" của C04 đăng bài: nó hiện các bước của C06 ngay tại
chỗ và đổi địa chỉ thành `/d/:id/submit`; mở hay tải lại `/d/:id/submit` không bao giờ đăng (bài đã đăng thì hiện "Đã
đăng", bài khác chuyển về C04). C05 (`/d/:id/preview`) xem trước bài như khách hay như tác giả.

API cho web (phiên đăng nhập): `POST /api/documents/:id/submit` `{space?, collection?, tags?, lang?}` → `{status:
"approved", hidden, publishedAt}` (409 `already-published`), `POST /api/documents/:id/private` (cùng thân; "Lưu riêng
tư", gỡ bài đã đăng); chỉ quản trị: `GET /api/moderation/published`, `PATCH /api/moderation/documents/:id`. Chi tiết mã
lỗi ở đầu `apps/server/src/api/review-routes.ts`.

## Thông báo (C20)

Loại: `mention`, `comment` (bình luận mới ở C11, tác giả bài và người được `@Tên` nhắc, chỉ ai còn đọc được bài; mất
quyền đọc thì đoạn trích bị ẩn khi liệt kê), `review` (còn lại từ vòng duyệt đã bỏ: kết quả duyệt cũ của tác giả,
"bài mới chờ duyệt" cũ của quản trị mở thẳng bài; không ghi thêm), `stale` (bài đã đăng 180 ngày chưa sửa, server kiểm mỗi ngày, mỗi lần sửa
báo một lần), `permission` (quản trị ẩn hay hiện bài). API: `GET /api/me/notifications`, `GET
/api/me/notifications/unread` (chấm đỏ trên chuông), `POST /api/me/notifications/:id/read|unread`, `POST
/api/me/notifications/read-all`. Ghi thông báo mới: `notify()` ở `apps/server/src/notifications/notification-store.ts`;
sau khi việc chính đã lưu thì dùng `notifyAfter()` (lỗi chỉ ghi log, không biến việc đã xong thành lỗi 500).

## Link chia sẻ

Chỉ bài đã đăng và đang hiện mới có link, do tác giả hoặc quản trị tạo ở C18 (`/d/:id/share`; nút "Chia sẻ" của C11
và C08 mở trang này; người đọc khác bấm "Chia sẻ" ở C11 thì chép địa chỉ bài). Mỗi bài một link đang chạy: tạo link
mới thì link cũ bị thu hồi. Token 32 ký tự ngẫu nhiên, server chỉ lưu sha256 và 4 ký tự cuối, nên link chỉ hiện đủ lúc
vừa tạo; sau đó C18 hiện `…/l/••••abcd` và "Tạo link mới" (có hỏi lại) để chép lại. Mã QR của link và "Tải ảnh story"
(PNG 1080 × 1920: tiêu đề, Space, art `ill-doc-planet`, mã QR) cũng chỉ có trong lúc trang còn giữ link đủ (vừa tạo,
chưa tải lại trang); cả hai làm ngay trên trình duyệt (`apps/web/src/pages/share-story.ts`), không gọi mạng, không lưu
token vào đâu.

- Hạn link: không hạn, 7 ngày, 30 ngày, tính từ lúc chọn. Chỉ đổi được hạn hay quyền của link đang chạy; link đã hết
  hạn hay đã thu hồi tắt hẳn (409 `link-expired`), muốn chia sẻ lại thì tạo link mới.
- Bài rời trạng thái đã đăng (tác giả gỡ xuống hay lưu riêng tư, vào thùng rác) thu hồi mọi link của nó; đăng lại không
  làm link cũ chạy lại;
  xoá hẳn thì link mất theo. Quản trị chỉ ẩn bài thì link trả "riêng tư" trong lúc ẩn và chạy lại khi bài được hiện.
- Người có link được: chỉ xem, hay cho phép remix (người đã đăng nhập chép bài thành bản nháp của mình, cuối bài ghi
  "Remix từ …"). Chưa đăng nhập chỉ thấy trang xem trước (tiêu đề, tác giả, các mục, đoạn đầu); đăng nhập rồi đọc bài ở
  C11 như mọi bài công khai.
- Mở link (H02, `/l/<token>`): sai token 404 `not-found`; hết hạn 410 `link-expired`, đã thu hồi 410 `link-revoked`
  ("Link này đã tắt"); bài không còn công khai (bị ẩn, bị gỡ xuống) mà người mở không đọc được: 404 `private` ("Hành
  tinh riêng tư", không lộ gì về bài). Đường dẫn khác dưới `/l/` nhận trang "không tìm thấy" của app.
- Lịch sử truy cập (C18): mỗi lượt mở của người nhận (giờ, tài khoản hoặc "khách"; tác giả và quản trị mở thử không tính), tạo, đổi hạn hay quyền, thu hồi link, cùng lúc
  bài được duyệt (bài cũ của vòng duyệt) và lúc quản trị ẩn hay hiện bài. Không bao giờ ghi token. Lượt mở giữ 90 ngày.
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
| `POST /api/admin/spaces` | `slug`, `nameVi`, `nameEn`, `tint`, `glow` (`#RRGGBB`), `art` (`/art/<tên>.webp`), `unitVi`, `unitEn`, `descriptionVi?`, `descriptionEn?` | 201 `{slug}`: Space công khai mới (như `POST /api/spaces` của phiên web); slug đã có thì 409 `slug-taken` |
| `POST /api/admin/collections` | `space` (slug Space công khai), `nameVi`, `nameEn?` | 201 `{id, space}`: Collection (hành tinh) mới; Space không có hoặc không công khai thì 404 `not-found` |

Lỗi: 401 `token-required` (thiếu header), 401 `invalid-token` (sai, đã thu hồi, người tạo không còn là quản trị),
400 `invalid-body` / `space-required`, 404 `not-found`, 409 `not-approved` (ẩn hay sửa bài chưa đăng), 409 `stale` (bài đã
đổi sau `baseRev`, kèm `rev` mới), 409 `not-editable` / `journey` (tệp Office, lối đi), 429 `rate-limited`.

```sh
curl -sS https://kb.hoandat.com/api/admin/posts \
  -H "Authorization: Bearer $KB_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Giao thức DHCP","lang":"vi","collection":"networking","tags":["dhcp","dora"],
       "markdown":"## DORA 4 bước\n\nDiscover, Offer, Request, Ack.","source":"ai","hidden":false}'
```

Bài đăng xong hiện ngay ở C09/C10 với nhãn Chính thức; `"hidden": true` thì đăng mà chưa hiện.

## Hàng chờ bài AI

Mỗi tối một cloud routine của Claude chạy ba lượt (20:00, 21:00, 22:00). Mỗi lượt chọn một Space khác hai lượt trước,
dựng một **hành tinh** (Collection) mới ở đó với 3 bài tiếng Việt nối nhau bằng `[[Tiêu đề]]` và nối sang bài của hành
tinh khác, tự duyệt (soát danh sách kiểm, đối chiếu sự thật với Wikipedia hoặc tài liệu chính thức) rồi đẩy vào repo.
Mỗi tối vì vậy có ít nhất ba hệ (Space) được thêm hành tinh. GitHub Actions đăng bài **hiện ngay**, không chờ người duyệt
(chủ dự án chốt 07/11/2026). Bài có lỗi thì quản trị ẩn hoặc sửa ở A02 (`/admin/content`), hoặc qua
`PUT /api/admin/posts/:id/text`. kb là kho kiến thức đủ mọi chủ đề nên bài công nghệ không quá một phần ba.

- [`content/topics.json`](../content/topics.json): danh sách hành tinh cần viết (`slug`, `space`, `lang`, `name`,
  `nameEn`, `tech`, `brief` gợi ý các bài, `status`: `todo` → `queued` (routine) → `published` (workflow), hoặc
  `skipped` kèm `note`). Còn ít hơn 6 mục `todo` thì routine tự thêm hành tinh mới.
- [`content/spaces.json`](../content/spaces.json): `existing` là các Space công khai đã có; `create` là Space workflow
  tự tạo (qua `POST /api/admin/spaces`) trước hành tinh đầu tiên của nó.
- `content/queue/<hành-tinh>/<bài>.md`: 3–5 bài chờ đăng của một hành tinh. Đầu tệp là front matter `title`, `tags`
  (cách nhau bằng dấu phẩy, tối đa 8), `type` (`note`/`lab`/`process`), giữa hai dòng `---`; sau đó là thân bài
  Markdown (ít nhất 1.200 ký tự).
- [`content/published.json`](../content/published.json): sổ `planets` (`slug → collectionId`) và `posts`
  (`<hành-tinh>/<bài> → id`, tiêu đề). Database là bản chuẩn của bài, repo không giữ thân bài sau khi đăng.

`pnpm check:queue` ([`scripts/content-queue.ts`](../scripts/content-queue.ts), chạy trong `pnpm lint`) kiểm ba tệp
JSON và mọi hành tinh chờ: 3–5 bài, front matter, độ dài; các bài trong hành tinh nối thành một khối; có ít nhất một
link sang bài của hành tinh khác (khi đã có); mọi `[[ ]]` trỏ tới bài đang chờ hoặc đã có trong sổ; link giữa các bài
chờ không đi vòng; tiêu đề không trùng; không địa chỉ server (như `check:public`), không chuỗi giống khoá, không nhắc
Học Cloud.

[`publish-queue.yml`](../.github/workflows/publish-queue.yml) chạy khi `content/queue/**` đổi trên `main` (hoặc bấm tay):
`pnpm publish:queue` ([`scripts/publish-queue.ts`](../scripts/publish-queue.ts)) tạo Space khi cần, tạo Collection một
lần (`POST /api/admin/collections`), rồi đăng từng bài (`hidden: false`, `source: "ai"`) theo thứ tự bài được trỏ tới
đăng trước, vì máy chủ chỉ nối `[[ ]]` lúc lưu bài. Mỗi bài đăng xong ghi sổ ngay; hành tinh đăng đủ bài thì xoá thư mục
chờ, chủ đề thành `published`, rồi commit lại. Bài lỗi giữ lại để lần sau thử lại, bài trỏ tới nó chờ theo; bài đã có
trong sổ không đăng lần hai. Token chỉ nằm ở secret `KB_ADMIN_TOKEN` của repo; tạo token mới ở A03 là token cũ bị thu
hồi, nhớ cập nhật secret. Commit chỉ đổi `content/queue/**`, `content/topics.json`, `content/published.json` không chạy
`ci` nên không deploy.

Tắt routine: tắt ở trang routine của claude.ai; hàng chờ trống thì workflow không làm gì.
