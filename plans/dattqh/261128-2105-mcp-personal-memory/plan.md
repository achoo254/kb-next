# MCP: kb làm trí nhớ cá nhân (đợt 1)

Trạng thái: đang làm. Tầng: **M** (một module `apps/server/src/mcp/`, không đổi schema).
Chốt với chủ dự án 28/11/2026.

## Mục tiêu

AI của người dùng dùng Space riêng trong kb như trí nhớ: nhớ lại phần của người dùng trước, sửa ghi chú cũ thay vì
ghi trùng, không bao giờ cất bí mật.

## Phạm vi

1. `search` thêm `scope`: `mine` (Space riêng của người dùng), `library` (các Space dùng chung), `all` (mặc định, như cũ).
2. Tool mới `update_note` (scope `kb:write`): nối thêm (`append`) hoặc thay toàn bộ (`replace`) thân một ghi chú của
   chính người dùng, đổi tiêu đề tuỳ chọn; hai lượt có `confirm_token` như `save_note`. Token gắn với bản hiện tại của
   bài: bài đổi sau bản xem trước thì token hỏng. Phiên bản ghi `via: api`, đánh dấu AI viết.
3. Bản xem trước của `save_note` kèm `similar`: tối đa 3 bài của người dùng trong cùng Space gần với tiêu đề, để agent
   đề xuất `update_note` thay vì tạo bài mới.
4. `save_note` và `update_note` từ chối nội dung có dạng bí mật (khoá riêng PEM, token GitHub/Slack/AWS/OpenAI/
   Anthropic/Google, JWT, token quản trị kb, gán mật khẩu/khoá dạng `password=…`): lỗi `secret_detected`, chỉ nêu loại.

## Ngoài phạm vi (đợt sau)

Loại ghi nhớ và nhãn, hạn xem lại, `forget`, ghi chú "Về tôi" và MCP prompt, ghi nhanh không cần duyệt.
Ghi chú riêng tư nhận mọi chủ đề (luật "chỉ kỹ thuật" chỉ áp cho bài công khai) — không cần code.

## Nghiệm thu

- Test `mcp-routes.test.ts`: scope `mine`/`library`, `update_note` append/replace, token hỏng khi bài đã đổi, không
  sửa được bài người khác, `similar` có bài đã lưu, `secret_detected`.
- `pnpm lint`, `pnpm typecheck`, test MCP xanh; CI xanh; deploy prod; gọi thử `/mcp` thật (tools/list có `update_note`).
- `docs/mcp.md` cập nhật.
