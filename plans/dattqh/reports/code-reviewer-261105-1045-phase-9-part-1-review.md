# Review commit b6a33a0: Phase 9 phần 1 (API viết bài, lịch sử, thùng rác, AI viết hộ, migration 0010)

Ngày: 05/11/2026 (Asia/Saigon) · Người review: code-reviewer · Chỉ đọc, không sửa code.

## Phạm vi

- Server: `access/authoring.ts`, `access/history.ts`, `access/my-content.ts`, `access/spaces-write.ts`,
  `api/authoring-routes.ts`, `api/history-routes.ts`, `api/my-content-routes.ts`, `api/summaries.ts`,
  `authoring/block-diff.ts`, `authoring/markdown-text.ts`, `copilot/write-routes.ts`, `db/schema.ts`,
  `drizzle/0010_planets-and-version-history.sql`, các diff nhỏ ở `content-write.ts`, `translation-write.ts`,
  `reading.ts`, `participation.ts`, `app.ts`. Phía web: chỉ `pages/editor-autosave.ts` (xung đột tự lưu).
- Đã kiểm bằng probe `tsx` (không chạy test suite): va chạm anchor của chunk, mất heading khi bài không tiêu đề,
  chi phí diff.

## Đánh giá chung

Lớp phân quyền đọc nhìn chung chắc: mọi lượt đọc bài/phiên bản/diff/link/gợi ý `[[`/yêu thích đi qua `visibleTo` hoặc
`documentAccess`; mọi id trong route được đối chiếu lại ở `src/access/`; link đọc ra lọc cả hai đầu
(`listLinks`, `linksTouching`, `linkedDocumentIds`); chỉ mục tìm kiếm tách `kb_public`/`kb_private` theo `isPublic`.
Không tìm thấy IDOR đọc nháp của người khác. Lỗi đáng kể nằm ở **tính đúng của lưu bài** (một số nội dung không lưu
được hoặc mất heading), **mức lộ của lịch sử** (câu hỏi mở 1), **chặn chi phí của diff**, và **ngữ nghĩa thùng rác**
(tác giả gỡ được lệnh xoá của quản trị, xoá được bài đã đăng mà mình không sửa được).

## Critical

Không có.

## High

### H1. Bài có hai heading trùng tên kèm một heading "… 2" không lưu được (500, kẹt ở "lỗi lưu")

- `import/hoc-cloud/sections.ts:37-41, 66` (`uniqueAnchor`) dùng cho mọi lần lưu qua `chunksOf`
  (`authoring/markdown-text.ts:36`) → `writeDerived` (`access/authoring.ts:143-145`).
- `uniqueAnchor` chỉ đếm theo base, không kiểm anchor sinh ra đã dùng chưa. Probe:
  `## Ví dụ`, `## Ví dụ`, `## Ví dụ 2` → `['vi-du', 'vi-du-2', 'vi-du-2']`. Bảng `chunks` có
  `unique(document_id, anchor)` (`db/schema.ts:277`) → insert ném lỗi → `PUT /api/documents/:id` 500, cả transaction
  rollback. Cũng xảy ra ở `POST /api/documents` và khôi phục phiên bản.
- Kịch bản: người viết quy trình có "Bước", "Bước", "Bước 2" (hay "Ví dụ" lặp). Tự lưu báo "lỗi lưu" mãi; chữ chỉ còn
  trong IndexedDB của trình duyệt đó. Trước phase 9 hàm này chỉ chạy trên dữ liệu nhập đã tuyển; nay đầu vào là chữ
  người dùng.
- Sửa: sinh anchor đến khi chưa có trong `Set` đã dùng:
  ```ts
  const taken = new Set<string>([overviewAnchor]);
  const uniqueAnchor = (base: string): string => {
    let candidate = base;
    for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}-${n}`;
    taken.add(candidate);
    return candidate;
  };
  ```
  Thêm test cho chuỗi heading trên. Lưu ý anchor của bài nhập có thể đổi nếu dữ liệu cũ từng có mẫu này (khi đó insert
  cũng đã fail, nên thực tế không có).

### H2. Lịch sử lộ nội dung phiên bản trước khi duyệt và lý do duyệt cho mọi người đọc bài (câu hỏi mở 1)

- `access/history.ts:47-82`, `access/authoring.ts:283-298` (`findVersion`, `diffVersions`),
  `api/history-routes.ts:76-144`: điều kiện duy nhất là "đọc được bài hiện tại" (`visibleTo`).
- Khi bài được duyệt (`approved`, không ẩn), **mọi tài khoản đăng nhập** đọc được: markdown đầy đủ của mọi phiên bản
  nháp trước khi duyệt (`GET /versions/:n`, `/diff`), lý do `changes_requested`/`rejected` cùng tên người duyệt, các sự
  kiện ẩn/hiện của quản trị.
- Kịch bản: tác giả lỡ dán mật khẩu router/IP nội bộ ở v2; người duyệt yêu cầu bỏ; v3 bỏ đi rồi được duyệt. Bất kỳ ai
  gọi `GET /api/documents/<id>/versions/2` vẫn đọc được bí mật. Đúng phần mà quy trình duyệt muốn chặn. Hiện chỉ có
  dữ liệu seed và bài nhập, nên rủi ro thật bắt đầu khi phase 11 mở luồng gửi duyệt. Phải chốt trước phase 11.
- Đề xuất (trả lời câu hỏi mở 1):
  | Phần của C17 | Tác giả + quản trị (sau này: người duyệt) | Người đọc khác |
  |---|---|---|
  | Nội dung phiên bản, diff, khôi phục | Mọi phiên bản | Chỉ các phiên bản đã từng là bản đăng (từ lần duyệt đầu trở đi); trước khi có cờ "bản đã duyệt" thì chỉ phiên bản hiện hành |
  | Sự kiện phiên bản (ai, lúc nào, cách nào) | Đủ | Chỉ các phiên bản trên |
  | Lý do duyệt (`changes_requested`, `rejected`, `submitted`) | Đủ | Ẩn; chỉ giữ sự kiện `approved` (C11 đã công khai "Linh duyệt 03/11") |
  | Ẩn/hiện (`audit_log`) | Đủ | Ẩn: đây là thao tác kiểm duyệt |
- Cách làm: một hàm `historyScope(viewer, doc)` trong `src/access/history.ts` (`'full'` khi
  `viewer.isAdmin || doc.authorId === viewer.userId`, ngược lại `'public'`), áp ở `documentActivity` **và**
  `findVersion` (không chỉ ở route, để diff/phiên bản không lách được). Với board C17 xem bằng tài khoản thường, dùng
  tài khoản tác giả (Đạt) trong parity.

### H3. Giới hạn chi phí của diff dùng `&&`: một phía nhỏ, một phía lớn vẫn cấp phát hàng trăm MB

- `authoring/block-diff.ts:79`: `if (before.length > MAX_BLOCKS && after.length > MAX_BLOCKS)`. Một phía ≤ 2.000
  khối thì vẫn chạy LCS với ma trận `Uint32Array((n+1)(m+1))`.
- Body tối đa 200.000 ký tự (`MAX_BODY_CHARS`) → khoảng 66.000 khối (`"x\n\n"`). Probe: 2.000 × 20.000 khối mất 172 ms,
  RSS 266 MB; 2.000 × 66.000 ≈ 132 triệu ô ≈ 528 MB cho mỗi request. `GET /api/documents/:id/diff` không có rate limit.
- Kịch bản: một thành viên bất kỳ tạo nháp riêng, lưu v1 có 2.000 đoạn rồi v2 có 66.000 đoạn, sau đó gọi diff song
  song vài lần. Event loop bị chặn và tiến trình có thể bị OOM, cả site dừng.
- Sửa: chặn theo tích, ví dụ `if (before.length * after.length > 4_000_000)` thì trả "thay hết"; nên cắt tiền tố/hậu
  tố chung trước khi chạy LCS. Thêm `perAccountLimit` cho `/diff` (và `/versions/:n`, `/history`).

## Medium

### M1. Tác giả khôi phục được bài mà quản trị đã xoá

- `access/authoring.ts:316-335`, `access/my-content.ts:38-44`. `trashDocument` cho quản trị xoá bài của người khác,
  nhưng hàng không ghi ai xoá. Bài nằm trong thùng rác của **tác giả** (`listTrash` lọc theo `authorId`), và
  `restoreFromTrash` cho tác giả khôi phục.
- Kịch bản: quản trị xoá một bài cộng đồng vi phạm; tác giả mở C08 → Thùng rác → Khôi phục, bài lên lại ngay.
  Quản trị lại không thấy bài đó trong thùng rác của mình.
- Sửa: thêm cột `deleted_by` (migration 0010 còn chưa lên prod thì gộp vào luôn). Chỉ cho tác giả khôi phục khi
  `deleted_by = authorId`; quản trị xoá thì chỉ quản trị khôi phục. Kiểm duyệt nên dùng "ẩn" (phase 11), còn "xoá" của
  quản trị nên ghi `audit_log`.

### M2. Tác giả xoá được bài `pending`/`approved` mà mình không được sửa

- `access/authoring.ts:319`: `trashDocument` chỉ kiểm tác giả hoặc quản trị, không kiểm `editRight`. Sửa bài đã đăng
  thì `locked`, nhưng xoá bài đã đăng (gỡ khỏi mọi người, mất backlink, mất khỏi chỉ mục) thì được.
- Đây là quyết định sản phẩm: "rút bài" có thể là chủ ý. Nếu không chủ ý, dùng chung luật: chỉ xoá khi
  `editRight(...) === 'ok'`, còn bài đã đăng thì để luồng duyệt ở phase 11 xử lý. Cần người dùng chốt.

### M3. Bài không tiêu đề mà body mở đầu bằng `# …` mất dòng đó sau lần mở lại

- `authoring/markdown-text.ts:22-34`: `composeMarkdown('', '# Mục lục\n\nNội dung')` lưu nguyên
  `"# Mục lục\n\nNội dung"`; khi mở lại, `bodyOf` coi dòng `#` là tiêu đề và cắt đi (`editable()` trả
  `title: doc.title = ''`). Lần lưu kế tiếp ghi `"Nội dung …"`, heading biến mất. Probe xác nhận đúng chuỗi này.
- Editor chỉ cho heading cấp 2-3 (`editor-schema.ts:218`), nên qua UI khó gặp. Nhưng gặp được qua API trực tiếp, qua
  khôi phục phiên bản (`restoreVersion` lấy dòng `#` của body làm tiêu đề bài), hoặc nếu chữ dán vào / AI chèn vào được
  parse thành H1.
- Sửa: bài không tiêu đề thì hạ heading cấp 1 đầu body thành `##` trước khi lưu, hoặc lưu tiêu đề tách khỏi markdown
  (cột `title` đã có) và chỉ ghép khi xuất.

### M4. Tự lưu tự báo "đã sửa ở nơi khác" với chính mình khi chuyển tab lúc đang lưu

- `apps/web/src/pages/editor-autosave.ts:221-236, 291-298`. `leave()` chạy trên mỗi lần `visibilitychange → hidden`
  (chuyển tab), gửi một request keepalive với `baseRev: this.rev` mà **không kiểm `inFlight`**. Nếu `save()` đang bay
  cùng `baseRev`, server tuần tự hoá bằng `FOR UPDATE` và chỉ một request thắng. Nếu request keepalive thắng, `save()`
  nhận 409 `stale` và bật `conflict`, tức hộp "Đã sửa ở nơi khác (Giữ bản này / Tải bản kia)" vì chính tab mình.
  Dữ liệu không mất, nhưng làm người dùng hoang mang.
- Sửa: trong `leave()`, nếu `inFlight` thì chỉ `keepDraft()`, không gửi; hoặc xếp hàng request keepalive sau promise
  đang bay. Khi `save()` nhận `stale` mà vừa có request keepalive thành công, coi là thành công.

### M5. Mỗi lần tự lưu tốn rất nhiều: tối đa 100 truy vấn ILIKE tuần tự trong khi giữ khoá hàng

- `access/authoring.ts:111-139, 142-154`. Mỗi lần lưu (khoảng 800 ms sau khi ngừng gõ, tối đa 120 lần/phút) xoá và
  ghi lại toàn bộ chunk, rồi với tối đa 100 tiêu đề `[[ ]]` chạy từng truy vấn `ILIKE '%…%'` (không có index trigram,
  quét tuần tự bảng `documents`). Tất cả nằm trong transaction đang giữ `FOR UPDATE`, và còn enqueue reindex Meilisearch.
- Sửa: chỉ dựng lại link khi tập `linkedTitles` đổi (so với lần lưu trước); gộp một truy vấn
  `title ILIKE ANY(array[...])`; chỉ dựng lại chunk khi `contentHash` đổi (đã có `sameText`, nhưng đổi một ký tự vẫn
  dựng lại toàn bộ); cân nhắc index `pg_trgm` trên `documents.title`.

### M6. `[[ ]]` do quản trị sửa được nối tới nháp riêng của người khác

- `access/authoring.ts:119`: điều kiện của `resolveLinkTargets` là `visibleTo(writer)`. Quản trị đọc được mọi nháp, và
  cách xếp hạng ưu tiên tiêu đề khớp hẳn trước tiêu chí chính thức/đã duyệt (dòng 129). Quản trị sửa một bài chính thức
  có `[[DHCP]]` trong khi một thành viên có nháp tên đúng "DHCP" → link trỏ vào nháp đó. Người đọc không thấy (link đã
  lọc khi đọc), nên link "biến mất" thay vì trỏ tới bài "Giao thức DHCP" đã duyệt.
- Không lộ dữ liệu (lọc khi đọc vẫn giữ), nhưng sai link. Sửa: resolve theo người đọc của bài, tức
  `{kind:'user', userId: doc.authorId, isAdmin:false}`, hoặc chỉ bài công khai khi bài đang `approved`.

## Low

- **L1. Xoá vĩnh viễn để lại tệp.** `db/schema.ts:220`: `files.document_id` là `ON DELETE SET NULL`, nên `purgeTrash`
  không xoá hàng `files` và tệp trên đĩa của bài Office. Người dùng tin là "xoá vĩnh viễn". Job dọn ở phần 2 nên xoá
  cả tệp.
- **L2. Slug `personal-<uuid>` chưa được giữ riêng.** `api/authoring-routes.ts:56, 288-295`: quản trị tạo Space công
  khai với slug `personal-<userId>` thì `ensurePersonalSpace` của người đó luôn ném lỗi (`spaces-write.ts:53-54`),
  500 khi tạo ghi chú. Nên chặn tiền tố `personal-` trong `PublicSpaceBody`.
- **L3. Tiêu đề nhận xuống dòng.** `Title = z.string().max(200)` (`authoring-routes.ts:58`) nên
  `"A\n\n## X"` sinh thêm chunk/heading từ tiêu đề. Nên thêm `.refine(t => !/[\r\n]/.test(t))`.
- **L4. `canRestore` bật cả với bài Office.** `history-routes.ts:120` chỉ dùng `editRight`, nên UI cho bấm Khôi phục
  rồi nhận 409 `not-editable`.
- **L5. Hàng thùng rác mất `review`.** `latestReviews` lọc bằng `visibleTo` (`my-content.ts:142`), mà bài trong thùng
  rác có `deletedAt` trong DB, nên C08 không hiện "Lý do · …" cho bài đã xoá.
- **L6. Ngân sách AI bị trừ trước khi kiểm key** (`write-routes.ts:86-87`): người không có key mất 1 lượt mỗi lần
  bấm. Giống `ask-routes.ts:232-233`, nên đổi cả hai cùng lúc (đổi thứ tự `keyForTurn` lên trước) hoặc giữ nguyên cho
  nhất quán.
- **L7. Route GET nặng không có rate limit:** `/api/link-suggestions` (ILIKE mỗi phím gõ), `/history`,
  `/versions/:n`, `/diff`.
- **L8. Rất nhiều heading làm insert chunk vượt 65.535 tham số** (`authoring.ts:145`): khoảng hơn 13.000 heading thì
  lưu bị 500. Hiếm gặp, nhưng nên chia lô khi insert.
- **L9. `aiMade` không bao giờ được đặt từ editor**: chấp nhận gợi ý AI viết hộ không đánh dấu phiên bản. C17 chỉ hiện
  "AI tạo" cho bản dịch/seed. Nếu board cần, gửi cờ kèm lần lưu.

## Mục đã kiểm và đạt (để định mức rủi ro)

- **IDOR đọc/sửa/xoá/khôi phục/lịch sử/phiên bản/diff/yêu thích/link** trên nháp của người khác: mọi đường đều qua
  `documentAccess`/`visibleTo` + `editRight`. `findVersion` join `documents` với `visibleTo`. `restoreFromTrash` trả
  404 cho thùng rác của người khác. `DELETE favorite` chỉ xoá hàng của mình.
- **Lộ tiêu đề nháp**: gợi ý `[[` (`suggestLinkTargets`) dùng `visibleTo`; backlink lọc hai đầu; my-content lọc
  `authorId` + `visibleTo`; chỉ mục tìm kiếm đưa nháp vào `kb_private` (truy vấn có lọc `authorId`); diff/phiên bản
  phải đọc được bài.
- **Tạo nội dung chỗ người khác**: Space riêng của người khác trả 403; Collection phải thuộc đúng Space
  (`collectionIn`); tạo Collection trong Space công khai chỉ quản trị (`mayAddCollection`); tạo Space công khai chỉ
  quản trị. Thành viên đặt **nháp** vào Space/Collection công khai được (chủ ý, chờ phase 11; không ai khác thấy).
- **Khôi phục phiên bản do người khác viết**: dùng quyền sửa hiện tại (`saveDocument` → `editRight`), không gộp,
  `editorId` là người khôi phục, có ghi `restoredFrom`. Đạt.
- **AI viết hộ**: không có key thì 403 trước khi gọi nhà cung cấp; tắt key thì 503; sự kiện `done` chỉ có
  `last4`; prompt chỉ chứa chữ người dùng gửi, không trộn dữ liệu server; có ngân sách; dừng khi trình duyệt đóng.
- **Tự lưu/xung đột phía server**: `SELECT … FOR UPDATE` + so `baseRev` với `updatedAt` trong cùng transaction nên
  không ghi đè lặng lẽ. Gộp chỉ khi cùng người, `via='editor'`, không phải bản khôi phục, trong 2 phút tính từ
  `createdAt`.
- **Purge**: chỉ `deleted_at IS NOT NULL AND deleted_at < now-30d`; có index một phần; các FK tới `documents` đều
  `CASCADE` (trừ `files`, `journey_steps` là `SET NULL`, xem L1). Chưa được lên lịch (phần 2).
- **Migration 0010 trên prod**: các cột mới đều có `DEFAULT`, nên `NOT NULL` an toàn với hàng cũ. `updated_at` được
  backfill bằng `created_at`. `via` của bài nhập theo `system:hoc-cloud`, bản dịch theo `ai_translated`. Trước 0010 chỉ
  có ba đường ghi phiên bản (import, dịch, seed), nên mặc định `editor` cho phần còn lại là đúng. `when` của journal
  tăng dần. Có test migration trên dữ liệu cũ.

## Đề xuất theo thứ tự

1. H1: sửa `uniqueAnchor` + test (chặn mất khả năng lưu).
2. H3: chặn diff theo tích kích thước + rate limit các GET lịch sử.
3. H2: chốt phạm vi xem lịch sử theo bảng ở trên, áp trong `src/access/history.ts` và `findVersion` trước phase 11.
4. M1/M2: thêm `deleted_by`; chốt với người dùng việc tác giả có được xoá bài đã đăng hay không.
5. M3, M4: chuẩn hoá H1 khi bài không tiêu đề; chặn `leave()` khi đang có lần lưu bay.
6. M5, M6: giảm chi phí mỗi lần lưu; resolve link theo người đọc của bài.
7. Low theo dịp.

## Số liệu

- Typecheck/lint/test: không chạy lại (máy dùng chung). Báo cáo của implementer ghi 732 pass; chưa kiểm độc lập.
- Probe (tsx) đã chạy: va chạm anchor (H1), mất heading (M3), chi phí diff 2.000 × 20.000 khối = 172 ms / 266 MB RSS (H3).

## Câu hỏi còn mở

1. Tác giả có được "rút" (xoá) bài đã đăng hoặc đang chờ duyệt không (M2)?
2. Phạm vi lịch sử cho người đọc thường (H2): đồng ý phương án "chỉ phiên bản đã đăng, không lý do duyệt, không
   ẩn/hiện" không? Phương án này cần cờ "phiên bản đã duyệt" ở phase 11. Trước khi có cờ đó thì chỉ hiện phiên bản
   hiện hành.
