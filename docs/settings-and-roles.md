# Cài đặt, vai trò và xoá tài khoản

Cài đặt cá nhân (H03, `/settings`) và cài đặt workspace (C19, `/admin/settings`, chỉ quản trị). Mã chính:
[`apps/server/src/access/roles.ts`](../apps/server/src/access/roles.ts),
[`workspace-members.ts`](../apps/server/src/access/workspace-members.ts),
[`account-data.ts`](../apps/server/src/access/account-data.ts),
[`apps/server/src/workspace/`](../apps/server/src/workspace),
[`apps/server/src/api/workspace-routes.ts`](../apps/server/src/api/workspace-routes.ts),
[`apps/web/src/ui/display-prefs.ts`](../apps/web/src/ui/display-prefs.ts).

## Vai trò

Hai vai trò (chủ dự án chốt 07/11/2026: tác giả toàn quyền với bài của mình, bỏ vòng duyệt và vai trò Người duyệt):

| Quyền | Quản trị | Thành viên |
|---|---|---|
| Đọc, viết, đăng công khai hay giữ riêng tư, sửa và xoá bài của mình | có | có |
| Quản lý mọi bài: ẩn/hiện, sửa, chuyển chỗ, xoá (A02 ở `/admin` và `/admin/content`), API và token A03, cài đặt workspace C19 | có | không |

- `ADMIN_SUBS` là **quản trị gốc**: luôn là quản trị, không ai đổi vai trò hay gỡ được từ app. Dùng để khởi tạo.
- Vai trò khác lưu ở `users.role`; một quản trị đổi ở C19 "Đổi vai trò" (chỉ `member` hay `admin`, gửi `reviewer`
  bị 400). Không ai tự đổi vai trò của mình. Quyền mới có hiệu lực ở lần gọi API kế tiếp.
- Dữ liệu cũ: enum `user_role` và `invite_role` vẫn giữ `reviewer` (không viết migration). Tài khoản còn lưu
  `reviewer` hoạt động như Thành viên ở mọi nơi (`effectiveRole` trong
  [`roles.ts`](../apps/server/src/access/roles.ts) trả `member`); quản trị đổi vai trò ở C19 thì dòng được ghi lại.
- Quy tắc đọc ([`visibility.ts`](../apps/server/src/access/visibility.ts)): mọi người, kể cả khách, đọc bài đã đăng và
  không ẩn; tác giả đọc mọi bài của mình; quản trị đọc mọi bài.
- Phiên của tài khoản đã bị gỡ hay đã bị xoá không dùng được: mỗi lần tra phiên đều kiểm lại tài khoản, nên một
  phiên mở ra đúng lúc bị gỡ hay xoá cũng bị bỏ ngay.
- C19 liệt kê tối đa 1000 tài khoản (quản trị, rồi người vào gần nhất trước) và ghi tổng số.
- Token API quản trị chỉ chạy khi người tạo còn là quản trị (gốc hoặc theo vai trò) và còn trong workspace.
- **Gỡ thành viên** (C19 "Gỡ"): đăng xuất mọi phiên, không đăng nhập lại được (đăng nhập trả `?login=removed`), bài
  của người đó giữ nguyên. "Khôi phục" cho vào lại với vai trò cũ.

## Mời bằng link

App không gửi email. Quản trị tạo link ở C19, chép gửi qua chat. Link luôn cho vào với vai trò Thành viên (vai trò mọi
tài khoản đã có), nên nhận link không đổi vai trò của ai (`raised` luôn `false`); quản trị cấp quyền quản trị ở "Đổi
vai trò".

- Token 32 ký tự ngẫu nhiên, server chỉ lưu sha256 và 4 ký tự cuối, hiện **một lần** lúc tạo. Một link chạy tại một
  thời điểm (tạo mới thu hồi link cũ, có khoá để hai lần tạo cùng lúc vẫn chỉ còn một link), hết hạn sau 7 ngày, thu
  hồi được, và ngừng chạy khi người tạo không còn là quản trị. Link dùng được nhiều lần trong 7 ngày.
- Link `reviewer` cũ còn hạn đọc như link Thành viên (dùng được nhiều lần, không nâng vai trò).
- Lúc nhận, link (khoá dòng) và tài khoản (còn trong workspace) được kiểm lại trong chính giao dịch ghi lượt nhận.
- Token nằm trong đường dẫn `/i/<token>` và `/api/invites/<token>`: nginx không ghi chúng vào log
  ([`infra/nginx/kb.hoandat.com.conf`](../infra/nginx/kb.hoandat.com.conf)), trang gửi `Referrer-Policy: no-referrer`.
- Người nhận mở `/i/<token>`, đăng nhập bằng tài khoản hoandat (IdP) rồi bấm "Vào workspace".

## Nhật ký kiểm toán (C19)

Ghi: đổi vai trò, gỡ và khôi phục, tạo/thu hồi/dùng link mời, tạo và thu hồi token API, đăng nhập, xoá dữ liệu, ẩn và
hiện bài. Danh sách C19 ghép thêm quyết định duyệt cũ (review events của vòng duyệt đã bỏ) và các lần API quản trị tạo hay sửa bài (nhật ký gọi
API), mới nhất trước, lọc theo Thành viên / Nội dung / API / Đăng nhập. Không ghi token, email hay nội dung bài.

## Giao diện và giảm chuyển động (H03)

- Tối / Sáng / Theo hệ thống và "Giảm chuyển động" áp ngay cho mọi màn (`data-theme` và `data-motion="reduce"` trên
  `<html>`), lưu theo tài khoản trên server (`PATCH /api/me`) và một bản trong trình duyệt (`localStorage` `kb-display`)
  để lần mở sau vẽ đúng ngay từ khung đầu; `GET /api/session` trả lại hai cài đặt này sau khi đăng nhập.
- Sáng dùng token Sáng và ảnh `bg-universe-light`. Nút đổi giao diện chỉ có ở H03.
- Quy tắc màu cho mọi màn (06/11/2026): nền nào mang chữ theo theme (`--c-text`, `--c-link`…) thì cũng phải theo theme.
  Không trộn trực tiếp mực đêm `--night-*` (chỉ dành cho hình nghệ thuật tối ở cả hai chế độ) vào hàng, thẻ, ô, nút;
  dùng bản theo theme `--c-ink-*` của [`tokens.css`](../apps/web/src/ui/tokens.css) (Tối giữ mực đêm, Sáng là trắng hay
  tím nhạt), hoặc `light-dark()` với giá trị Sáng riêng. Nền có chữ trắng (`--rim-active-bg`, `--rim-button-bg`…) ở
  Sáng gần như đặc để chữ trắng đạt 4,5:1. Màu chữ trên thẻ cũng theo theme: sắc đậm (`--violet-700`, `--cyan-700`) ở
  Sáng, sắc nhạt ở Tối. Kiểm bằng [`light-theme.spec.ts`](../apps/web/e2e/light-theme.spec.ts)
  ([`parity-testing.md`](parity-testing.md#kiểm-chế-độ-sáng)).
- Chữ trắng trên nền màu (avatar, chữ cái loại tệp, nút bước của Trung tâm nhập, chấm số thông báo, quả cầu nhà cung cấp
  key) đặt trên sắc đậm đạt 4,5:1 ở cả hai chế độ (06/11/2026). Trạng thái thể hiện bằng làm mờ luôn kèm một dấu hiệu
  khác (biểu tượng, chữ cho trình đọc màn hình), không chỉ dựa vào độ mờ.
- Canvas (C15) giữ thẻ và hộp công cụ kính tối ở cả hai chế độ, chữ sáng trên đó (quyết định 06/11/2026): đây là lựa
  chọn của board, không phải lỗi lọt nền tối.
- "Giảm chuyển động" của app cộng thêm với cài đặt hệ điều hành: tắt animation và transition, Universe chạy 2D.
- "Mở app ở chế độ" (Orbit / Danh sách) chỉ lưu trên máy này: C08 và A02 mở theo lựa chọn đó.
- Cỡ chữ khi đọc: nút A−/A+ trong trình đọc (C11, tablet T02, điện thoại M05) chọn 16 / 17 (mặc định) / 18 / 20px cho
  chữ thân bài; đoạn mở đầu và tiêu đề mục co giãn theo cùng tỉ lệ (17px: mở đầu 19px, tiêu đề mục 25px, dòng cao
  1.75). Lưu theo tài khoản (`PATCH /api/me` `readerTextSize`, cột `users.reader_text_size`, migration
  `0017_reader-text-size`), `GET /api/session` trả lại, một bản trong trình duyệt (`localStorage`
  `kb-reader-text-size`, biến CSS `--reader-text-size` trên `<html>`) để khung đầu đã đúng cỡ. Đổi cỡ giữ nguyên đoạn
  đang đọc ở chỗ cũ trên màn hình nên tiến độ đọc và anchor không nhảy. Trên điện thoại hai nút là ô chạm 44px; ở đầu
  và cuối thang nút vẫn nhận focus (`aria-disabled`). H03 không có nút riêng: chọn ngay trong lúc đọc là đủ.

## Xoá tài khoản (ADR 0018 của auth-next)

Tài khoản chỉ xoá ở `https://auth.hoandat.com/account#account-delete`. App không có nút, hộp thoại hay API xoá: chỗ cũ
ở H03 (dưới tâm trạm) chỉ còn một dòng "Xoá tài khoản ở auth.hoandat.com" mở trang đó trong tab mới (`IDP_ACCOUNT_URL`
ở `apps/web/src/brand.ts`); trang Quyền riêng tư (`/privacy#delete`) dẫn tới cùng chỗ.

Xoá ở IdP thì IdP gửi `POST https://kb.hoandat.com/api/idp/account-deleted`
([`account-deleted.ts`](../apps/server/src/auth/account-deleted.ts)), body là SET (RFC 8417,
`Content-Type: application/secevent+jwt`). Server kiểm bằng JWKS từ discovery của IdP (cùng bộ đệm khoá với back-channel
logout): header `alg` ES256, `typ` `secevent+jwt`; `iss` là `AUTH_ISSUER`; `aud` đúng `PUBLIC_URL/api/idp/account-deleted`;
`exp` chưa qua (lệch giờ 60 giây); có event `urn:hoandat:auth:event:account.deleted`; có `sub`. Route nằm trước bước
kiểm Origin, giới hạn tần suất chung với back-channel logout.

| Trả lời | Khi |
|---|---|
| `202` | Đã xoá xong trong một giao dịch, hoặc không có tài khoản nào mang `sub` đó (chưa từng đăng nhập, hoặc đã xoá: IdP gửi lại thì không làm gì thêm) |
| `400` | Body không phải SET (sai media type, không phải JWS, `typ` khác) |
| `401` | Thuật toán khác ES256, chữ ký sai, `iss`/`aud` sai, hết hạn, thiếu event hay `sub` |
| `503` | Không đọc được khoá của IdP, đăng nhập chưa bật, hoặc xoá lỗi: IdP thử lại |

Log chỉ ghi id nội bộ của tài khoản và kết quả, không ghi SET hay `sub`.

| Xoá hẳn | Giữ lại |
|---|---|
| Bài không chính thức chưa xuất bản (nháp, riêng tư, kể cả bài còn lại từ vòng duyệt cũ) hoặc nằm trong thùng rác (kể cả bài đã xuất bản), mọi bài trong Space cá nhân và chính Space đó | Bài **chính thức** ngoài Space cá nhân, ở bất kỳ bước nào (thuộc workspace) |
| Tệp đã tải lên không còn bài nào dùng (cả tệp trên đĩa) | Bài cộng đồng đã xuất bản: tác giả hiện là "Tài khoản đã xoá" |
| Key riêng và lựa chọn key, lịch sử Copilot, tiến độ đọc và hành trình, yêu thích, thông báo, Canvas, bình luận, dấu vết đã mở link chia sẻ | Phiên bản và quyết định duyệt cũ người đó viết trên bài còn lại |
| Mọi phiên đăng nhập | Nhật ký kiểm toán (thêm dòng `account.data-deleted`) |

Bài cộng đồng đã xuất bản được giữ vì đó là bài công khai người khác đọc, dẫn link và Copilot trích; kb đã có sẵn dòng
tài khoản "bia mộ" không tên làm tác giả. Muốn gỡ thì tác giả thôi xuất bản hay xoá bài trước khi xoá tài khoản (trang
Quyền riêng tư ghi rõ). Link chia sẻ, token API và link mời người đó tạo bị thu hồi. Dòng tài khoản ở lại như bia mộ
(`deletedAt`, `sub` đổi thành `deleted:<id>`, không tên, email, ảnh).

Không có gì để chuyển chủ: Space cá nhân chỉ có chủ của nó (xoá cùng tài khoản), Space công khai không có chủ, quản trị
workspace là vai trò chứ không phải quyền sở hữu (quản trị gốc `ADMIN_SUBS` luôn còn). Bản sao offline trên máy người
dùng (IndexedDB) không bị server xoá được; trang Quyền riêng tư hướng dẫn xoá dữ liệu trang trong trình duyệt.

## Giới hạn đã biết

- Một lần tải tệp hay lưu Office đang chạy đúng lúc tài khoản bị xoá có thể ghi xong một dòng tệp thuộc tài
  khoản đã xoá; dòng và tệp đó không được dọn. Phiên đã bị bỏ nên không có lần ghi mới sau đó.
- Migration 0016 thêm giá trị `admin` cho enum `user_role` trong giao dịch của migration (Postgres 12 trở lên cho
  phép, prod là 16.8); không được dùng giá trị đó trong cùng migration. Migration sau cần `'admin'` phải là tệp riêng.
