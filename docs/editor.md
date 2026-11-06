# Trình soạn bài (C02)

Trình soạn bài ở `/d/<id>/edit` (board C02), tạo ghi chú mới ở `/new` (`?space=`, `?collection=`, `?type=process`).
Mã: [`apps/web/src/pages/editor-screen.tsx`](../apps/web/src/pages/editor-screen.tsx) và các tệp `editor-*` cùng thư
mục; API: [`apps/server/src/api/authoring-routes.ts`](../apps/server/src/api/authoring-routes.ts).

Trên điện thoại (đến 640px) cùng trình soạn đó hiện theo bước soạn của board M02: thanh trên (quay lại, loại bài,
chip tự lưu, "Tiếp" sang M03), tiêu đề với hành tinh, màu, nội dung, thanh công cụ `/`, `[[`, ảnh, sơ đồ, AI (trợ lý mở
thành sheet). Tự lưu, bản offline và xung đột y như trên máy tính ([`board-frame.md`](board-frame.md#tablet-và-điện-thoại)).

## Chọn TipTap thay vì CodeMirror 6

Phase 9 cho chọn CodeMirror 6 hoặc TipTap, lấy cái dựng lại board C02 với ít ghi đè style nhất. Chọn **TipTap 3**
(ProseMirror), quyết định ngày 05/11/2026:

- Board C02 là trình soạn **nhìn thấy kết quả**: đoạn văn đã định dạng, sơ đồ bốn thẻ D-O-R-A, hộp cảnh báo màu hổ phách,
  chip `[[`. TipTap dựng đúng các khối đó bằng node riêng, mỗi node là HTML của chính app nên style lấy thẳng từ token
  (`editor-screen.css`), và TipTap không kèm theme nào để phải ghi đè.
- CodeMirror 6 sửa mã nguồn Markdown: muốn giống board phải ẩn ký hiệu `#`, `**`, `>` bằng decoration và vẽ widget cho
  sơ đồ, hộp cảnh báo, rồi ghi đè theme mặc định (gutter, dòng đang chọn, con trỏ). Nhiều code hơn, nhiều ghi đè hơn.
- TipTap có sẵn: hoàn tác / làm lại (⌘Z / ⇧⌘Z, Ctrl+Y), plugin gợi ý cho menu `/` và danh sách `[[`, bảng, ảnh, và
  `@tiptap/markdown` để đọc / ghi Markdown.

## Dữ liệu vẫn là Markdown

Bài lưu ở máy chủ là một đoạn Markdown (dòng đầu `# Tiêu đề`, như bài nhập từ Học Cloud), cắt thành các đoạn cho
reader, tìm kiếm và Copilot. Trình soạn đọc và ghi đúng dạng đó ([`editor-schema.ts`](../apps/web/src/pages/editor-schema.ts)):

| Khối trên board | Node TipTap | Markdown |
|---|---|---|
| Liên kết tới bài khác | `wikilink` | `[[Tiêu đề]]`, `[[Tiêu đề\|chữ hiện]]` |
| Hộp cảnh báo | `callout` | `> [!WARNING]` rồi `> nội dung` (reader vẽ thành hộp cảnh báo) |
| Sơ đồ các bước (DORA) | `steps` | danh sách đánh số, mỗi mục mở đầu bằng chữ đậm: `1. **Discover** …` (luật của reader) |

Một `[[` chưa đóng được tô như chip "đang nối". Bấm đúp hoặc Enter trên sơ đồ để sửa các bước.

Mỗi lần lưu, máy chủ dựng lại các đoạn và bảng `links`: mỗi `[[ ]]` nối tới bài có tiêu đề khớp (không phân biệt hoa
thường, dấu) mà người viết đọc được, ưu tiên bài chính thức. Bài nháp chỉ tác giả thấy, nên backlink từ bài nháp chỉ
hiện với tác giả cho tới khi bài được duyệt.

## Tự lưu, offline, phiên bản

- Tự lưu 800 ms sau khi ngừng gõ (board Interaction), ⌘S / Ctrl+S lưu ngay. Chip lưu có các trạng thái: đang gõ, đang
  lưu, đã lưu (giờ), offline · lưu trên máy, lỗi lưu (Thử lại), bài đã sửa ở nơi khác (Giữ bản này / Tải bản kia).
- Mọi thay đổi được chép vào IndexedDB của trình duyệt (`kb-editor`) trước khi máy chủ nhận; mất mạng thì bài chờ ở
  đó và tự gửi khi có mạng lại. Mở lại bài: bản trên máy mới hơn được mở và gửi đi; nếu máy chủ đã có bản khác từ nơi
  khác, người viết chọn giữ bản nào. Mở bài khi offline: dùng bản trên máy nếu có.
- Mỗi lần lưu cùng một người trong 2 phút tính từ lúc tạo phiên bản thì cập nhật phiên bản đó, quá 2 phút thì tạo phiên
  bản mới. Lịch sử, so sánh và khôi phục: `/d/<id>/history` (board C17).
- Phiên bản "AI tạo" (`document_versions.ai_made`, huy hiệu AI ở C17 và A02): sau khi người viết bấm "Chấp nhận" một
  gợi ý "AI viết hộ", lần lưu mang đoạn đó gửi `aiMade: true` (giữ cả trong bản trên máy nếu đang offline); máy chủ
  chỉ đánh dấu phiên bản mà chính lần lưu đó ghi (của người lưu), lưu thành công thì các lần sau không gửi nữa. Gộp
  trong 2 phút giữ dấu AI nếu một trong các lần lưu có AI; lưu không có cờ không bao giờ xoá dấu đã có. Bản dịch AI
  (F04) đã được đánh dấu khi tạo, sửa tay sau đó là phiên bản mới không có dấu AI.
- Ai sửa được: tác giả khi bài là nháp, riêng tư, bị yêu cầu sửa hay bị từ chối; quản trị luôn sửa được. Bài đang chờ
  duyệt hoặc đã đăng thì khoá với tác giả (sửa qua hàng duyệt ở phase 11).
- Xoá: tác giả xoá được bài của mình chưa đăng (kể cả đang chờ duyệt, bị yêu cầu sửa); bài đã đăng chỉ quản trị xoá.
  Bài nằm trong thùng rác của người đã xoá: quản trị xoá thì chỉ quản trị khôi phục. Sau 30 ngày `purgeTrash` xoá hẳn
  bài cùng phiên bản, đoạn, link, yêu thích và hàng tệp, rồi trả tên tệp trên đĩa để job dọn xoá tệp.
- Link `[[ ]]` tìm theo những gì **tác giả** của bài đọc được (quản trị sửa hộ cũng vậy), một truy vấn cho mọi tiêu đề,
  chạy trước khi giữ khoá hàng.
