# Phase 9 · Phần 1: API viết bài, C02 (trình soạn), C17 (lịch sử)

Trạng thái: **xong**. Typecheck, lint, 732 test (114 tệp) sạch; parity C02 1,83 %, C17 1,89 % (ngưỡng 3 %, không nâng
ngưỡng riêng). Chưa commit.

## Migration `0010_planets-and-version-history`

- `document_versions`: thêm `via` (enum `version_via`: `editor | api | import | restore | translation`, mặc định
  `editor`), `ai_made` (bool), `summary` (text), `restored_from` (int), `updated_at` (lần lưu cuối của phiên bản).
  Backfill: `updated_at = created_at`; phiên bản của tài khoản `system:hoc-cloud` → `import`; bài `ai_translated` →
  `translation` + `ai_made`. Có test migration trên dữ liệu cũ.
- `documents`: thêm `planet` (text, một trong `violet | teal | cyan | amber | emerald | pink`, null = mặc định) và index
  một phần `documents_deleted_at_idx` (chỉ bài trong thùng rác, cho job dọn).
- Nhập Học Cloud ghi `via: 'import'`, dịch AI ghi `via: 'translation', aiMade: true`.

## API (cho phần 2 dựng C01, C08)

Mọi route cần phiên (401 `sign-in-required`); mọi lượt đọc/ghi qua `src/access/` (test no-bypass vẫn xanh). Client có
kiểu: `apps/web/src/api/authoring-api.ts`, `history-api.ts` (test server gọi chính client này).

`DocumentSummary` = như reading API (`id, title, type, origin, status, lang, aiTranslated, updatedAt, authorName,
translations, collectionId, space{slug,nameVi,nameEn,tint,glow}, readProgress`).

### Viết bài — `src/api/authoring-routes.ts`

| Route | Body / query | Trả về | Lỗi |
|---|---|---|---|
| `POST /api/documents` | `{title?, body?, type?: 'note'\|'process', space?: slug, collection?: uuid, lang?, planet?}` | 201 `EditableDocument` | 400 `invalid-body`, `unknown-collection`; 404 / 403 `no-access` (Space riêng của người khác); 429 |
| `GET /api/documents/:id/edit` | | `EditableDocument` | 404, 403 `hidden` / `no-access` / `locked`, 409 `not-editable` |
| `PUT /api/documents/:id` | `{title, body, planet?, baseRev}` | `{rev, version, savedAt, changed}` | 409 `{error:'stale', rev}`, như trên |
| `DELETE /api/documents/:id` | | 204 (vào thùng rác) | 404, 403 `no-access` |
| `POST /api/documents/:id/restore` | | 204 (ra khỏi thùng rác) | 404 (không phải thùng rác của mình) |
| `GET /api/documents/:id/links` | | `{backlinks: DocumentSummary[], outgoing: DocumentSummary[]}` | như `/edit` (trừ `locked`) |
| `GET /api/link-suggestions` | `?q=&exclude=` | `{documents: [{id,title,type,origin,status,space}]}` (tối đa 8) | |
| `POST /api/me/space` | | 201/200 `{space: SpaceBrief & {kind, art}, created}` | |
| `POST /api/spaces` (quản trị) | `{slug,nameVi,nameEn,tint,glow,art,unitVi,unitEn,descriptionVi?,descriptionEn?}` | 201 `{space}` | 403 `admin-only`, 409 `slug-taken` |
| `POST /api/collections` | `{space: slug, nameVi, nameEn?}` | 201 `{collection: {id,nameVi,nameEn,spaceSlug}}` | 403 `no-access` (chỉ Space riêng của mình; quản trị: mọi Space) |

`EditableDocument = {id, title, body (Markdown không có dòng #), type, lang, origin, status, planet, rev, version,
savedAt, space: SpaceBrief & {kind}, collection: CollectionBrief | null}`.

- Bài mới: `origin 'own'`, `status 'draft'`, chỉ tác giả (và quản trị) đọc được. Không ghi `space` → Space riêng, tự tạo
  khi chưa có (`personal-<userId>`). Được đặt vào Space công khai (nháp chờ phase 11) hoặc Space riêng của mình.
- Ai sửa được: quản trị; tác giả khi `draft | private | changes_requested | rejected`. `pending`, `approved` →
  `locked` với tác giả (sửa qua hàng duyệt ở phase 11).
- Lưu: cùng người, phiên bản `via 'editor'` tạo chưa quá 2 phút → cập nhật phiên bản đó, quá thì phiên bản mới. Lưu
  đúng nội dung đang có → `changed: false`, không thêm phiên bản. Dựng lại `chunks` và link `[[ ]]` (khớp tiêu đề không
  phân biệt hoa thường/dấu; không trùng hẳn thì tiêu đề chứa nguyên cụm, ưu tiên chính thức, đã duyệt, cùng ngôn ngữ,
  ngắn nhất; chỉ bài người viết đọc được). Lưu, xoá, khôi phục đều `sync.enqueue` cho tìm kiếm.
- `[[DHCP]]` nối tới "Giao thức DHCP"; backlink hiện ở C11 của DHCP cho tác giả, người khác không thấy (có test).

### Của tôi (C08) — `src/api/my-content-routes.ts`

`MyDocument = DocumentSummary & {planet, favorite, review: {action, reason, by, at} | null}` (`review` = sự kiện duyệt
mới nhất, để hiện "Lý do · … · Linh").

| Route | Trả về |
|---|---|
| `GET /api/me/documents?type=&status=` | `{documents: MyDocument[]}`: bài của mình còn sống, mới sửa trước |
| `GET /api/me/recent` | `{documents: Array<MyDocument & {at}>}`: đọc (reading_progress) hoặc sửa gần đây, tối đa 30 |
| `GET /api/me/favorites` | `{documents: Array<MyDocument & {favoritedAt}>}` (chỉ bài còn đọc được) |
| `PUT` / `DELETE /api/documents/:id/favorite` | 204 (PUT: 404/403 như reader) |
| `GET /api/me/trash` | `{documents: Array<MyDocument & {deletedAt, purgeAt}>}` (`purgeAt = deletedAt + 30 ngày`) |

Chưa có số "Lượt mở" (C08) trong dữ liệu.

### Lịch sử (C17) — `src/api/history-routes.ts`

- `GET /api/documents/:id/history` → `{document: {id,title,status,origin,space,collection}, canRestore, currentVersion,
  events}`; `events` mới trước, mỗi sự kiện:
  - `{kind:'version', at, actor, version, via, aiMade, summary, restoredFrom, proposal}` (`proposal`: người sửa không
    phải tác giả, không phải quản trị → "Đề xuất sửa");
  - `{kind:'review', at, actor, action, reason, version}` (`version` = phiên bản hiện hành lúc đó);
  - `{kind:'visibility', at, actor, hidden}` — đọc từ `audit_log` (`targetType 'document'`, action `document.hide` /
    `document.show`, hằng `HIDE_ACTION`/`SHOW_ACTION` trong `src/access/history.ts`). **Phase 11 (A02) khi ẩn/hiện bài
    phải ghi audit này.**
  - `actor = {name, role: 'admin'|'reviewer'|'member'} | null`.
- `GET /api/documents/:id/versions/:n` → `{version, markdown, savedAt, editorName}`.
- `GET /api/documents/:id/diff?from=&to=` → `{from, to, added, removed, lines: [{op:'same'|'add'|'del'|'gap', text, heading}]}`
  (so theo khối Markdown, một khối ngữ cảnh mỗi bên).
- `POST /api/documents/:id/versions/:n/restore` → `{rev, version}`: phiên bản mới `via 'restore'`, không gộp; cùng
  quyền với sửa.

### AI viết hộ — `src/copilot/write-routes.ts`

`POST /api/write {task: 'continue'|'shorten'|'outline'|'explain', title, text, selection?}` → event-stream `delta {text}`,
`done {provider, model, last4}`, `error {code, provider?, last4?}`; trước stream: 503 `USER_KEYS_DISABLED`, 403
`NO_USER_KEY` / `USER_KEY_UNREADABLE`, 429. Dùng lại key riêng, `streamText`, ngân sách AI (1 lượt), `reportProviderFailure`.
Không lưu gì.

### Job dọn thùng rác (phần 2 nối lịch)

`purgeTrash(db, now): Promise<string[]>` trong `src/access/authoring.ts` xoá hẳn bài ở thùng rác ≥ 30 ngày (phiên bản,
đoạn, link, yêu thích đi theo FK cascade) và trả id; phần 2 gọi hằng ngày trong `housekeeping()` của `server.ts` rồi
`search?.sync.enqueue(ids)` để gỡ khỏi chỉ mục. Có test 29 ngày giữ / 31 ngày xoá.

## Web

- `/d/:id/edit` (C02), `/new` (tạo ghi chú rồi `location.replace` sang editor; `?space=&collection=&type=process`),
  `/d/:id/history` (C17). Phần 2 nối C01 "Ghi chú" tới `/new`.
- Trình soạn: **TipTap 3** (lý do ở `docs/editor.md`): node `wikilink`, `callout` (`> [!WARNING]`), `steps` (danh sách
  đánh số chữ đậm, cùng luật reader). Menu `/` (8 khối), danh sách `[[` (gọi `/api/link-suggestions`), tab Liên kết
  (backlink + liên kết đi), AI viết hộ (stream, Dừng, Chấp nhận/Bỏ, không key → "Mở Key riêng").
- Tự lưu 800 ms, ⌘S; chip: đang gõ, đang lưu, đã lưu HH:mm, offline · lưu trên máy, lỗi lưu (Thử lại), đã sửa ở nơi
  khác (Giữ bản này / Tải bản kia). Bản sửa chép vào IndexedDB `kb-editor` trước khi gửi; mất mạng giữa chừng rồi có
  mạng lại → tự gửi (test `editor-autosave.test.ts` và `editor-screen.test.tsx`). Mở lại bài: bản trên máy mới hơn được
  gửi; mở khi offline dùng bản trên máy.
- Reader (C11): "Linh duyệt 03/11" giờ lấy ngày duyệt (`reviewedAt` mới trong `GET /api/documents/:id`), và vẽ
  `> [!WARNING]` thành hộp cảnh báo (không đổi giao diện C11 với dữ liệu seed).
- Màu hành tinh: token `--planet-*` mới trong `tokens.css`; selector `[data-planet]` đang ở `editor-screen.css`, phần 2
  có thể chuyển ra chỗ dùng chung cho C08.
- Sửa kèm: `headingsOf` (C15, điểm liên quan) nay sắp theo vị trí đoạn (trước đây phụ thuộc thứ tự vật lý của bảng).

## Seed (KB_SEED=mock)

- Lịch sử DHCP như board C17: v1–v3 Đạt qua API · AI tạo (28/10 09:12, 29/10 20:40, 31/10 14:05), Linh yêu cầu sửa
  (02/11 09:00), v4 Minh "thêm đoạn lease và DHCP snooping" (02/11 21:30), Linh duyệt (03/11 10:02), Đạt ẩn/hiện
  (03/11 21:12 / 21:40). v3 → v4 = "+3 thêm −1 bỏ".
- Bản nháp của chủ seed "Máy mới xin IP thế nào" trong Space riêng, lưu 20/10 21:24, hành tinh tím (C02).
- Hệ quả đã cập nhật test: Space riêng có 4 bài (3 tệp + bản nháp), phiên bản DHCP của C11 là Minh/Đạt/Đạt/Đạt.

## Kiểm tra

- `pnpm typecheck`: sạch. `pnpm lint` (eslint, brand, tokens 94 cặp WCAG AA, public): sạch.
- `pnpm test`: 114 tệp, 732 pass, 1 skip (có sẵn). Test mới: `block-diff.test.ts` (7), `authoring-routes.test.ts`
  (12), `history-routes.test.ts` (4), `write-routes.test.ts` (4), migration 0010 (1), `editor-schema.test.ts` (5),
  `editor-autosave.test.ts` (8), `editor-screen.test.tsx` (13), `history-screen.test.tsx` (9), `reader-markdown.test.tsx`
  (2), `new-note.test.tsx` (2).
- Bảo mật có test: người khác không đọc/sửa/xoá/khôi phục/xem lịch sử/phiên bản/diff/yêu thích/link của bản nháp;
  thành viên không sửa được bài chính thức; tác giả bị khoá khi bài chờ duyệt; không đưa bài vào Space riêng người khác;
  thùng rác người khác trả 404.
- Parity (`pnpm e2e --project parity -g "C02|C17"`, offset cổng 40, đã tắt hết server): C02 1,83 %, C17 1,89 %.
- Lệch mock: thêm 2 dòng C02, C17 vào `docs/mock-deviations.md`. Tài liệu mới `docs/editor.md`; README và
  `docs/parity-testing.md` cập nhật.

## Câu hỏi còn mở

1. **Ai xem lịch sử**: hiện ai đọc được bài thì xem được toàn bộ lịch sử (phiên bản cũ, lý do yêu cầu sửa, ẩn/hiện) —
   cần thiết để C17 giống board khi xem bằng tài khoản thường. Nếu muốn giới hạn lý do duyệt và ẩn/hiện cho tác giả và
   quản trị, đổi một chỗ ở `historyRoutes`.
2. Tác giả bị khoá sửa bài `pending`/`approved`: phase 11 cần định nghĩa luồng sửa bài đã đăng (đề xuất sửa / bản sửa
   chờ duyệt).
3. Bản nháp seed làm số "dựa trên N tài liệu" ở panel AI của C09 (và nền S03/F01) tăng 1; theo quy tắc e2e không chạy
   lại các board đó — nên chạy C09 khi phần 2 đụng tới.
4. Reader vẫn hiện `[[Tiêu đề]]` dạng chữ thô (có từ trước với bài nhập); có nên biến thành link trong C11 không.

## Sửa sau review (`code-reviewer-261105-1045-phase-9-part-1-review.md`)

Chưa stage/commit (nằm trên b6a33a0). Mỗi mục có test hồi quy.

| Mục | Sửa | Test |
|---|---|---|
| H1 trùng anchor | `uniqueAnchor` (`import/hoc-cloud/sections.ts`) giữ đúng cách đánh số cũ (`vi-du`, `vi-du-2`, `vi-du-3`, `tong-quan-2`), chỉ khi số đó đã là anchor của heading khác mới đếm tiếp: "Ví dụ, Ví dụ, Ví dụ 2" → `vi-du, vi-du-2, vi-du-2-2`. 25 test nhập Học Cloud (fixture thật) vẫn ra anchor cũ | `sections.test.ts`, lưu bài qua API (`authoring-routes.test.ts`) |
| H2 lịch sử | `historyScope(viewer, doc)` trong `access/history.ts`: tác giả, quản trị `full`; người đọc khác `public` = chỉ phiên bản hiện hành + sự kiện `approved` (không lý do, không ẩn/hiện). `findVersion` (dùng cho xem bản, diff, khôi phục) từ chối bản cũ với `public` → 404. API trả thêm `scope`. C17 với người đọc thường: "Phiên bản đang đăng" và câu giải thích thay cho so sánh. Ảnh so pixel C17 dùng câu trả lời API của quản trị (mock `history-c17`, `e2e/history-boards.ts`), dòng lệch mock đã cập nhật | `history-routes.test.ts`, `history-screen.test.tsx` |
| H3 diff | Cắt phần đầu, cuối chung rồi mới so; bảng LCS quá 4 triệu ô thì hiện "thay hết" phần giữa. `/history`, `/versions/:n`, `/diff`: 60 lượt/phút/tài khoản | 2.000 × 66.000 khối < 2 s (`block-diff.test.ts`) |
| M1 xoá bởi quản trị | Cột `deleted_by` (gộp vào 0010, sinh lại migration + snapshot). Thùng rác của ai là bài người đó xoá; chỉ người xoá hoặc quản trị khôi phục | `authoring-routes.test.ts`, test migration |
| M2 | Tác giả xoá được bài chưa đăng (nháp, riêng tư, chờ duyệt, cần sửa, bị từ chối); bài `approved` chỉ quản trị xoá | `authoring-routes.test.ts` |
| M3 | Bài không tiêu đề mà body mở bằng `# …`: lưu thành `## …`, mở lại không mất | `block-diff.test.ts` |
| M4 | `leave()` dùng chung cờ `inFlight` với `save()`: một request mỗi lúc, request keepalive xong mới lưu tiếp với rev mới | `editor-autosave.test.ts` |
| M5 | Một truy vấn cho mọi tiêu đề `[[ ]]`, chạy trước transaction giữ khoá hàng | (qua các test link) |
| M6 | Link resolve theo những gì **tác giả** của bài đọc được, kể cả khi quản trị sửa | `authoring-routes.test.ts` |
| L1 | `purgeTrash` trả `{documentIds, storageKeys}`: xoá hàng `files` của bài bị xoá hẳn và trả tên tệp trên đĩa; phần 2 nối job thì unlink các tệp này | `authoring-routes.test.ts` |
| L2 | `POST /api/spaces` từ chối slug `personal-…` | có |
| L3 | Tiêu đề có xuống dòng → 400 | có |
| L4 | `canRestore` false với tệp Office | — |
| L5 | `review` của bài trong thùng rác vẫn hiện cho tác giả | — |
| L6 | AI viết hộ và Copilot kiểm key trước khi trừ ngân sách AI | test ask/write cũ vẫn xanh |
| L7 | `/api/link-suggestions` 120 lượt/phút; ba route lịch sử như H3 | — |
| L8 | Ghi chunk theo lô 1.000 hàng | — |
| L9 | Chưa làm: phiên bản lưu sau khi "Chấp nhận" gợi ý AI chưa đánh dấu `aiMade` (cần gửi cờ kèm lần lưu) | — |

**API đổi so với phần trên:** `HistoryResponse.scope: 'full' | 'public'`; `purgeTrash` trả `{documentIds, storageKeys}`;
`GET /api/me/trash` liệt kê bài **mình đã xoá**; `DELETE /api/documents/:id` 403 với bài đã đăng của tác giả;
`POST /api/documents/:id/restore` 404 khi bài do người khác (quản trị) xoá.

**Kiểm tra:** `pnpm typecheck`, `pnpm lint` sạch; `pnpm test` 114 tệp, 741 pass, 1 skip; parity chỉ chạy C17 (C02 không
đổi giao diện): 1,89 %.
