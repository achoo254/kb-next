# Phase 8: Graph và Canvas (C13, C15)

Trạng thái: xong. Không commit, không tạo nhánh. Không cần migration: bảng `links` và `canvases` có sẵn đủ cột.

## Kết quả kiểm

| Kiểm | Kết quả |
|---|---|
| `pnpm typecheck` | sạch (server, web, e2e) |
| `pnpm lint` | sạch: eslint 0 lỗi 0 cảnh báo, check-brand, check-tokens (94 cặp đạt WCAG AA), check-public (574 tệp) |
| `pnpm test` | 104 tệp, 664 test qua, 1 bỏ qua (có sẵn từ trước). Test mới: 57 (server 19, web 38) |
| `pnpm e2e --project parity -g "C13\|C15"` | C13-Graph 7,71% (ngưỡng riêng 8%, có dòng trong `docs/mock-deviations.md`); C15-Canvas 1,54% (ngưỡng 3%) |

Không chạy e2e của board khác (đúng quy tắc 05/11/2026). Seed đổi nên đã kiểm C10/C11 bằng cách so câu trả lời API trước và sau: backlinks của DHCP hiển thị y nguyên (Máy mới vào mạng, ARP, lab-notes), ba bài "Liên quan" đầu (ARP 0,75 · Ghi chú 0,68 · Máy mới 0,60) và "Space liên quan" của Networking (Linux, Observability) không đổi; chỉ mục thứ 4–5 của related (C11 không hiện) và danh sách `outgoing` (web không dùng) thay đổi, test `content-routes.test.ts` đã cập nhật theo.

## API

Mọi lượt đọc tài liệu và liên kết đi qua `src/access/` (thêm `access/graph.ts`); test no-bypass vẫn qua.

- `GET /api/graph?space=<slug>&lang=` → `{ space, spaces[], nodes[], edges[], suggestions }`. Nút: `{ id, title, type, origin, status, spaceSlug, summary, degree, backlinks }` (một nút mỗi bài theo ngôn ngữ đọc; tài liệu của Space rồi các bài nối tới, tối đa 300 nút, 6 bước). Cạnh: `{ id, source, target, type: 'leads-to'|'prerequisite'|'related', label, removable }`, mỗi cặp một cạnh. Nhãn quan hệ "dẫn tới"/"bước N" → `leads-to`, "cần trước" → `prerequisite`, còn lại `related`. 404/403/400 như C10.
- `GET /api/graph/suggestions?document=<id>` (cần đăng nhập, 12 lần/phút) → `{ suggestions: [{ id, title, spaceSlug, relevance }] }`, tối đa 3, chỉ bài cùng Space chưa nối mà người đọc được phép nối; 503 `jev-off`, 502 `jev-failed`. Jev chấm bằng câu Score 5 mức (`src/jev/relatedness.ts`, purpose `graph-suggest`), không tự nối.
- `POST /api/graph/edges { sourceId, targetId, label? }` → 201 `{ edge }`; `DELETE /api/graph/edges/:id` → 204. Quyền: đọc được cả hai bài và là quản trị hoặc tác giả của một trong hai bài; cạnh được lưu từ bài của chính người tạo nên chỉ ai đọc được bài đó mới thấy. Lỗi: 403 `not-allowed`, 409 `exists`, 400 `same-document`; liên kết viết trong bài (`wikilink`) không xoá được qua API này.
- `GET /api/canvases?space=`, `POST /api/canvases { title, space? }`, `GET|PUT|DELETE /api/canvases/:id`, `POST /api/canvases/:id/suggestion { exclude? }`. Chỉ chủ canvas đọc/ghi (người khác nhận 404). `PUT { title, canvas: { rev, cards, connections } }` → `{ updatedAt, rev }`, 409 `stale` khi `rev` cũ hơn bản đã lưu; thẻ tài liệu mới phải đọc được (403). Body canvas tới 256 kB (riêng `/api/canvases`), tối đa 200 thẻ, 400 dây. `canvases.data` lưu `{ spaceId, canvas }`.

## Web

- C13 `/graph?space=` (không có `space` thì mở Space đầu của Universe): `d3-force` chạy tới nghỉ trước khi vẽ (nguồn ngẫu nhiên cố định, điểm xuất phát theo thứ tự nút), mỗi Space kéo nút về một chỗ như board. Cạnh vẽ SVG, nút là nút bấm hình cầu theo màu Space (viền liền: chính thức, đứt: cộng đồng/của bạn). Thu phóng/kéo (nút, cuộn, kéo nền, phím +/−/0), bản đồ thu nhỏ, chip Space và chọn nguồn, màn không nút nào khớp bộ lọc, panel chi tiết, lối đi tính từ cạnh, gợi ý Jev theo yêu cầu, bỏ nối cạnh do người dùng tạo. Bàn phím: một nút trong thứ tự Tab, mũi tên đi sang nút gần nhất theo hướng, Enter chọn, Esc bỏ chọn.
- C15 `/canvas/:id` (route mới) và `/canvas` (danh sách, tạo, xoá; không có board). Kéo thả thẻ (một bước hoàn tác mỗi lần thả), mũi tên dời thẻ, công cụ V/H/N/T/L, thêm tài liệu của Space hoặc liên kết, hộp sửa thẻ, ⌘Z/Ctrl+Z hoàn tác, ⇧⌘Z/Ctrl+Y làm lại, Delete xoá. Lưu tự động 800 ms sau khi ngừng (board Interaction); mỗi thay đổi ghi ngay vào localStorage; `pagehide`/ẩn tab gửi bản đang chờ bằng `fetch keepalive`; mở lại thì khôi phục bản chưa kịp lưu (đáp ứng "không mất thay đổi quá 2 giây"). Gợi ý Jev nối hai thẻ hiện một lần khi mở, bấm "Nối" mới nối.
- Nối các lối vào: pill Graph/Canvas của khung app và rail Graph mang `?space=` của Space hiện tại; tab "Canvas"/"Graph" của C10 cũng vậy.
- Seed: Networking có các cạnh của board C13 (không cạnh nào trỏ vào DHCP, không có TCP ↔ Docker để giữ C10/C11), liên kết seed có `createdAt` tăng dần theo thứ tự; canvas "DHCP từ A đến Z" của chủ seed với 7 thẻ, 6 dây đúng toạ độ board.

## Tệp

Mới (server): `src/access/graph.ts`, `src/api/graph-routes.ts`, `src/api/canvas-routes.ts`, `src/canvas/canvas-data.ts`, `src/canvas/canvas-store.ts`, `src/jev/relatedness.ts`, `src/api/graph-routes.test.ts`, `src/api/canvas-routes.test.ts`.
Mới (web): `src/api/graph-api.ts`, `src/api/canvas-api.ts`, `src/pages/graph-{layout,model,messages,view,panel,screen}.ts(x)`, `graph-screen.css`, `src/pages/canvas-{model,messages,autosave,board,dialogs,list,screen}.ts(x)`, `canvas-screen.css`, test `graph-model`, `graph-screen`, `canvas-model`, `canvas-screen`; `e2e/graph-canvas-boards.ts`.
Sửa: `apps/server/src/app.ts`, `db/seed-data.ts`, `db/seed-database.ts`, `api/content-routes.test.ts`; `apps/web/src/app.tsx`, `routes.ts`, `layout/app-shell.tsx`, `pages/space-panels.tsx`, `ui/tokens.css` (3 token của sân khấu Graph), test `app`, `app-shell`, `space-screen`; `e2e/parity-screens.ts`, `e2e/open-screen.ts` (mock `canvas-c15`); `package.json` + lockfile (`d3-force`, `@types/d3-force`); `README.md`, `docs/mock-deviations.md`.

## Chỗ khác mock (đã ghi `docs/mock-deviations.md`)

- C13 (ngưỡng 8%): vị trí nút do d3-force xếp trên dữ liệu thật (23 nút, tên bài thật, DHCP 6 liên kết · 3 backlink), không phải toạ độ vẽ tay; Subnet nối DHCP bằng liên kết trong bài nên lối đi là DHCP → ARP → DNS; bỏ thanh "Trạng thái"; tiêu đề "· Jev gợi ý" chỉ khi máy chủ có Jev. Phần đồ thị chiếm khoảng 5% pixel khác, panel khoảng 1,8%, thanh demo bị bỏ khoảng 0,4%.
- C15: các trạng thái lưu thật, "Ý tưởng (T)" thay "Chữ (T)", thẻ lab hiện hai mục đầu của bài, thẻ tệp ghi "Của bạn · riêng tư", "Thêm vào lối đi" và "Chia sẻ" tạm khoá, trang `/canvas` không có board.

## Câu hỏi còn mở

1. C13 và C11 mâu thuẫn về DHCP (C13: 5 backlink, Subnet "cần trước"; C11: 3 backlink). Đang giữ C11; nếu muốn C13 khớp hơn thì phải đổi C11 (chạy lại parity C11).
2. Quyền nối cạnh "liên quan": tác giả của một trong hai bài hoặc quản trị. Nếu muốn mọi thành viên tự nối giữa các bài chính thức thì cần cạnh riêng theo người (thêm cột chủ cạnh, migration 0010) hoặc qua duyệt.
3. Nút "Mở trong Canvas" của C14 vẫn tạm khoá; nối câu trả lời Copilot vào Canvas chưa nằm trong phạm vi lần này.
