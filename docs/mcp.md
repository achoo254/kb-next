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
| `save_note` | `kb:write` | `title` (một dòng, ≤ 200), `markdown` (≤ 200 000), `space?` (slug), `lang?` (`vi`/`en`), `confirm_token?` | lần 1: `{preview, confirm_token, confirm_token_expires_at, next}`; lần 2: `{saved: true, document}` |

Thông tin bài: `id`, `title`, `url`, `lang`, `type`, `visibility` (`public`/`private`), `status`, `updated_at`,
`author`, `space {slug, name, kind, url}`.

`save_note` là tool ghi duy nhất (`readOnlyHint: false`), chạy hai lượt như `chatmcp` của Chat: lượt không có
`confirm_token` chỉ trả bản xem trước và token, **không ghi gì**; agent đưa bản xem trước cho người dùng duyệt (thẻ
duyệt), rồi gọi lại với đúng các đối số cũ cộng `confirm_token`. Token gắn với `sub`, tên tool và đối số, sống 5 phút,
dùng một lần (`confirm_token_invalid`, `confirm_token_expired`, `confirm_token_used`); khoá và nonce đã dùng nằm trong
bộ nhớ tiến trình (kb chạy một tiến trình), khởi động lại chỉ làm hỏng bản xem trước đang chờ. Ghi chú được tạo như
trình soạn tạo bài mới (`createDocument`), trong Space riêng của người dùng (tạo nếu chưa có) trừ khi nêu Space, rồi
"Lưu riêng tư" như C04 (`status: private`): chỉ người dùng (và quản trị) đọc được. Space của người khác hay Space đã ẩn
trả `space_not_found`.

Lỗi của tool là kết quả `isError: true` với `{"error": {"code", "message"}}`: `invalid_arguments`, `not_found`,
`no_access`, `hidden`, `space_not_found`, `kb_account_required`, `insufficient_scope`, các mã `confirm_token_*`,
`internal`.

## Kiểm thử

[`mcp-routes.test.ts`](../apps/server/src/mcp/mcp-routes.test.ts) (IdP giả ký access token, Meilisearch thật):
metadata, 401/403, step-up, tài khoản chưa có, bài riêng tư của người khác và Space ẩn không lộ qua mọi tool,
`save_note` chỉ xem trước khi thiếu token và tạo bài riêng tư khi có.
