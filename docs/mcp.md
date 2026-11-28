# MCP cho AI Agent

kb có một endpoint MCP để AI Agent (tiến trình `tunelo` trên máy của người dùng, nhóm tool `kb`) đọc Knowledge Base
và lưu ghi chú **với đúng quyền của người dùng**, bằng access token của IdP (auth-next). Không dùng token quản trị
`kf_admin_` ([`admin-api.md`](admin-api.md)); token đó không mở được `/mcp`.

Mã nguồn: [`apps/server/src/mcp/`](../apps/server/src/mcp). Quyết định: plan
`plans/dattqh/261125-0811-chat-ai-in-conversation/` của workspace, ADR 0028 của chat-next.

## Endpoint

| | |
|---|---|
| Tài nguyên (`aud` của token) | `${PUBLIC_URL}/mcp`, production `https://kb.hoandat.com/mcp` |
| Metadata (RFC 9728) | `GET /.well-known/oauth-protected-resource/mcp` (và `/.well-known/oauth-protected-resource`), công khai, CORS `*` |
| Máy chủ uỷ quyền | `AUTH_ISSUER` (auth-next) |
| Scope | `kb:read` (đọc), `kb:write` (lưu ghi chú) |
| Giao thức | Streamable HTTP, **không trạng thái**: mỗi `POST /mcp` một thông điệp JSON-RPC, trả JSON; không có luồng SSE, không có phiên (`GET`/`DELETE` → 405) |

Không cần biến env mới: tài nguyên suy từ `PUBLIC_URL`, issuer từ `AUTH_ISSUER`. Endpoint chỉ chạy khi đăng nhập đã
bật (`AUTH_CLIENT_SECRET`); khi tắt, `/mcp` trả 503 `mcp-unavailable` và metadata trả 404. nginx chuyển `/mcp` và hai
đường metadata vào server ([`infra/nginx/kb.hoandat.com.conf`](../infra/nginx/kb.hoandat.com.conf)).

Ở auth-next, chỉ client `tunelo-agent` được xin tài nguyên này (cùng device login với tunnel, Chat MCP, Localman MCP);
client MCP đăng ký động không xin được `kb:*`. Máy đăng nhập `tunelo` trước khi có kb phải `tunelo login` lại.

## Xác thực

Chỉ header `Authorization: Bearer <access token>`; cookie phiên và kiểm Origin của web không áp dụng (router gắn trước
chúng). Request có `Origin` khác `PUBLIC_URL` bị 403. Token phải là JWT ES256 `typ: at+jwt`, chữ ký khớp JWKS của
IdP, `iss` = `AUTH_ISSUER`, `aud` chứa tài nguyên, chưa hết hạn, có `sub`.

| Trường hợp | Trả lời |
|---|---|
| Không có token | 401, `WWW-Authenticate: Bearer scope="kb:read kb:write", resource_metadata="…/.well-known/oauth-protected-resource/mcp"` |
| Token sai (audience, loại, chữ ký, issuer, hết hạn) | 401 `error="invalid_token"` |
| Token không có scope `kb:*` | 403 `error="insufficient_scope"` |
| `tools/call` của tool cần scope token thiếu | 403 `insufficient_scope` nêu scope cần (step-up) |
| Hơn 120 request một phút một tài khoản | 429 `rate-limited`, `Retry-After` |
| Không đọc được khoá của IdP | 503 `auth-unavailable`, `Retry-After: 5` |
| Lô JSON-RPC (mảng) hay body không phải JSON-RPC | 400 |

`sub` của token là tài khoản kb mà phiên web của cùng tài khoản IdP dùng (bảng `users`). Tài khoản IdP chưa từng
đăng nhập kb, đã bị gỡ khỏi workspace hay đã xoá dữ liệu: tool trả lỗi `kb_account_required`. Quản trị đọc như trên
web (mọi bài, kể cả bài riêng tư của người khác).

## Tool

Mọi tool chạy qua `src/access/` với viewer của tài khoản, cùng code với route web: thấy bài đã đăng, bài riêng tư của
chính mình, không bao giờ thấy bài trong Space quản trị đã ẩn hay bài riêng tư của người khác. Mỗi bài trả về luôn có
`url` chuẩn (`${PUBLIC_URL}/d/<id>`) để làm thẻ nguồn.

| Tool | Scope | Đầu vào | Trả về |
|---|---|---|---|
| `search` | `kb:read` | `query` (1–200 ký tự), `space?` (slug), `limit?` (1–30, mặc định 10), `mode?` (`all` mặc định: từ khoá + theo nghĩa bằng Jev; `keyword`) | `{query, keyword, meaning, results[]}`; mỗi kết quả: thông tin bài, `heading`, `excerpt` (≤ 600 ký tự), `passage_url` (`…/d/<id>#<anchor>`), `match` |
| `get_document` | `kb:read` | `id`: id bài hoặc link kb (`…/d/<id>`) | thông tin bài, `markdown` (bản mới nhất; tệp lưu trữ thì chữ đã trích), `source_url`, `tags`, `translations[]` |
| `list_spaces` | `kb:read` | không | `{spaces[]}`: `slug`, `name_vi`, `name_en`, `kind`, `url`, `document_count`, `updated_at` |
| `recent` | `kb:read` | `limit?` (1–20, mặc định 8) | `{documents[]}`: bài đọc được đổi gần nhất, mỗi văn bản một bản theo ngôn ngữ của tài khoản |
| `save_note` | `kb:write` | `title` (một dòng, ≤ 200), `markdown` (≤ 200 000), `space?` (slug), `lang?` (`vi`/`en`), `confirm_token?` | lần 1: `{preview, similar[], confirm_token, confirm_token_expires_at, next}`; lần 2: `{saved: true, document}` |
| `update_note` | `kb:write` | `id` (id hoặc link), `mode` (`append`/`replace`), `markdown` (≤ 200 000), `title?`, `confirm_token?` | lần 1: `{preview, confirm_token, confirm_token_expires_at, next}`; lần 2: `{saved: true, changed, version, document}` |
| `remember` | `kb:write` | `topic` (một dòng, ≤ 120), `fact` (≤ 2 000), `chat_id?`, `sensitive?`, `lang?` | ghi ngay: `{remembered, action: created/appended, topic, memory_id, url, undo_url}` |
| `memory_index` | `kb:read` | `chat_id?` | `{paused, sensitive, topics[] {id, title, summary, updated_at, chat_id, url}, text}` |

`search` có `scope?`: `all` (mặc định, như trước), `mine` (chỉ Space riêng của người dùng: trí nhớ của họ; chưa có
Space riêng thì không có kết quả), `library` (chỉ các Space dùng chung). `space` thu hẹp thêm trong phạm vi đó.

Thông tin bài: `id`, `title`, `url`, `lang`, `type`, `visibility` (`public`/`private`), `status`, `updated_at`,
`author`, `space {slug, name, kind, url}`.

### Trí nhớ của AI (`remember`, `memory_index`)

Như trí nhớ của trợ lý AI: agent tự ghi điều bền về người dùng trong lúc trò chuyện, **không qua bản xem trước**, vì
mỗi lần ghi đều thấy được (Chat hiện "Đã ghi nhớ" kèm `undo_url`) và hoàn tác được. Mã: [`src/memory/`](../apps/server/src/memory),
[`memory-tools.ts`](../apps/server/src/mcp/memory-tools.ts); trang web `/memory` và API `/api/memory` ([`memory-routes.ts`](../apps/server/src/api/memory-routes.ts)).

- **Nơi giữ:** Collection `purpose = 'memory'` ("Trí nhớ" / "Memory") trong Space riêng, tạo lần đầu ghi. Mỗi chủ đề
  một ghi chú riêng tư, thân là các dòng `- yyyy-mm-dd: ý` (ngày giờ Việt Nam). Chủ đề gắn với một hội thoại Chat có nhãn
  `chat:<chat_id>`; không nhãn là trí nhớ chung.
- **Ghi:** cùng chủ đề (so tiêu đề bỏ dấu, không phân biệt hoa thường) và cùng phạm vi thì nối dòng mới, khác thì tạo
  (chủ đề gắn hội thoại và chủ đề chung cùng tên là hai chủ đề riêng). Ghi và hoàn tác của một tài khoản chạy lần lượt
  (kb chạy một tiến trình): hai lần `remember` cùng lúc vào một chủ đề giữ cả hai ý, không sinh chủ đề trùng; lần nối
  mang `baseRev`, gặp bản sửa trên web xen giữa thì đọc lại và thử lại, quá 3 lần thì `topic_unavailable`.
  Từ chối: bí mật (`secret_detected`), số giấy tờ tuỳ thân hay tài khoản tài chính (`never_remembered`,
  [`never-kept.ts`](../apps/server/src/memory/never-kept.ts): số đứng cạnh từ khoá, có dấu hay không, hoặc số thẻ hợp
  lệ Luhn; theo mẫu nên không bắt hết), chủ đề nhạy cảm khi người dùng chưa bật (`sensitive_off`; agent tự đánh giá qua
  `sensitive`, chủ đề lưu khi đã bật mang nhãn `sensitive`), trí nhớ đang tạm dừng (`memory_paused`), chủ đề đầy
  (`too_long`).
- **Hoàn tác:** mỗi lần ghi để lại một token (bảng `memory_undos`, chỉ giữ sha256, sống 24 giờ, dùng một lần, chỉ chủ
  tài khoản; lịch dọn thùng rác hằng ngày xoá token hết hạn). `undo_url` = `/memory?undo=<token>`: trang chỉ gửi
  `POST /api/memory/undo` khi người dùng bấm, rồi bỏ token khỏi địa chỉ. Chủ đề còn đúng phiên bản vừa ghi thì: mới tạo
  vào thùng rác, nối thêm về phiên bản trước. Đã đổi sau đó (ý mới hơn, người dùng tự sửa) thì chỉ gỡ đúng dòng đã ghi;
  không còn thấy dòng đó thì `undo-stale`. Token chỉ bị tính đã dùng khi hoàn tác xong.
- **Đọc:** `memory_index` trả trí nhớ chung, cộng chủ đề của `chat_id` khi có, mới sửa trước, mỗi chủ đề kèm hai ý mới
  nhất; `text` gọn tối đa 4 000 ký tự (dừng ở chủ đề đầu tiên không vừa). Đang tạm dừng thì rỗng; chủ đề nhạy cảm bị bỏ
  khi người dùng tắt.
- **Agent không đọc được** (mọi tool, chặn chung ở `documentViews` của [`tool-kit.ts`](../apps/server/src/mcp/tool-kit.ts)):
  trí nhớ của tài khoản khác, kể cả khi agent chạy bằng tài khoản quản trị (quản trị vẫn xem trên web như mọi bài riêng
  tư); trí nhớ của chính mình khi đang tạm dừng; chủ đề nhạy cảm của chính mình khi đang tắt.
- **Người dùng điều khiển** ở `/memory`: tạm dừng (`users.memory_paused`), cho phép chủ đề nhạy cảm
  (`users.memory_sensitive`, mặc định tắt), sửa hay xoá từng chủ đề như mọi bài, "Xoá toàn bộ trí nhớ" (`DELETE
  /api/memory`, vào thùng rác 30 ngày).
- **Rủi ro đã biết:** `remember` ghi không qua duyệt, nên nội dung độc (một bài, một tin của người khác) có thể xui agent
  ghi điều sai. Giảm bằng lời dặn của tool (chỉ ghi điều người dùng tự nói hay xác nhận), chip "Đã ghi nhớ" và hoàn tác.

### Trí nhớ cá nhân

Space riêng là trí nhớ của người dùng: agent nhớ lại bằng `search` scope `mine` trước, rồi mới ra thư viện. Mỗi chủ đề
giữ một ghi chú: bản xem trước của `save_note` kèm `similar` (tối đa 3 bài của chính người dùng trong Space đích, tìm
theo từ khoá của tiêu đề, không tìm theo nghĩa; tìm lỗi thì ghi log và để rỗng, không làm hỏng bản xem trước) để agent
đề xuất `update_note` thay vì tạo bài mới. Ghi chú riêng tư nhận mọi chủ đề; luật "chỉ chủ đề kỹ thuật" chỉ áp cho bài
công khai.

`update_note` chỉ sửa **ghi chú riêng tư do chính người dùng viết** (quản trị cũng vậy): bài người khác trả
`no_access`, bài đã công khai trả `not_private` (sửa trên web, nơi người đọc thấy thay đổi), tệp lưu trữ và lối đi trả
`not_editable`. `append` nối khối mới sau thân bài, `replace` thay toàn bộ thân (bản cũ vẫn trong lịch sử); `markdown`
toàn khoảng trắng là `invalid_arguments`. Token gắn thêm với `updatedAt` của bài lúc xem trước: bài đổi sau đó thì
token thành `confirm_token_invalid`, agent xem trước lại. Lưu bằng `saveDocument` như trình soạn, phiên bản riêng
`via: api`, đánh dấu AI viết; bài vẫn riêng tư. Thân dài quá 200 000 ký tự trả `too_long`.

`save_note` và `update_note` từ chối nội dung có dạng bí mật ([`secret-guard.ts`](../apps/server/src/mcp/secret-guard.ts):
khoá riêng PEM, token GitHub/GitLab/Slack, khoá AWS/Google/nhà cung cấp AI, JWT, token quản trị kb, gán
`password=…`/`api_key: …` có giá trị thật) bằng `secret_detected`, chỉ nêu loại, không nhắc lại giá trị. Không bị tính:
chỗ giữ chỗ (`<your key>`, `${VAR}`, `***`, `xxxxxxxx`, `your-…`, `REDACTED…`), biểu thức code (`process.env.API_KEY`,
`z.string().min(8)`, `getpass()`) và đường dẫn. Bộ chặn không bắt hết: giá trị dưới 8 ký tự, có khoảng trắng,
`Authorization: Bearer …` hay "mật khẩu: …" lọt qua; mô tả tool vẫn dặn agent không lưu bí mật.

Hai tool ghi (`readOnlyHint: false`) chạy hai lượt như `chatmcp` của Chat; mô tả dưới đây cho `save_note`: lượt không có
`confirm_token` chỉ trả bản xem trước và token, **không ghi gì**; agent đưa bản xem trước cho người dùng duyệt (thẻ
duyệt), rồi gọi lại với đúng các đối số cũ cộng `confirm_token`. Token gắn với `sub`, tên tool và đối số, sống 5 phút,
dùng một lần (`confirm_token_invalid`, `confirm_token_expired`, `confirm_token_used`); khoá và nonce đã dùng nằm trong
bộ nhớ tiến trình (kb chạy một tiến trình), khởi động lại chỉ làm hỏng bản xem trước đang chờ. Ghi chú được tạo như
trình soạn tạo bài mới (`createDocument`), trong Space riêng của người dùng (tạo nếu chưa có) trừ khi nêu Space, rồi
"Lưu riêng tư" như C04 (`status: private`): chỉ người dùng (và quản trị) đọc được. Space của người khác hay Space đã ẩn
trả `space_not_found`.

Lỗi của tool là kết quả `isError: true` với `{"error": {"code", "message"}}`: `invalid_arguments`, `not_found`,
`no_access`, `hidden`, `space_not_found`, `kb_account_required`, `insufficient_scope`, các mã `confirm_token_*`,
`not_editable`, `not_private`, `too_long`, `stale`, `secret_detected`, `never_remembered`, `sensitive_off`,
`memory_paused`, `topic_unavailable`, `internal`.

## Kiểm thử

[`mcp-routes.test.ts`](../apps/server/src/mcp/mcp-routes.test.ts) (IdP giả ký access token, Meilisearch thật):
metadata, 401/403, step-up, tài khoản chưa có, bài riêng tư của người khác và Space ẩn không lộ qua mọi tool,
`save_note` chỉ xem trước khi thiếu token và tạo bài riêng tư khi có; scope `mine`/`library`, `similar`, `update_note`
nối và thay (vẫn riêng tư), token hỏng khi bài đã đổi, không sửa được bài người khác, từ chối bí mật.
[`secret-guard.test.ts`](../apps/server/src/mcp/secret-guard.test.ts): mẫu bí mật và các ghi chú thường không bị chặn.
Test route cần Meilisearch, chưa có bản cho Windows: chạy trên CI (Linux).
[`memory.test.ts`](../apps/server/src/memory/memory.test.ts) (không cần Meilisearch): tạo và nối chủ đề, phạm vi
hội thoại, không lộ sang tài khoản khác, từ chối bí mật, số giấy tờ và chủ đề nhạy cảm, `/api/memory` (cài đặt, hoàn
tác một lần, tạm dừng, xoá hết, cần phiên).
