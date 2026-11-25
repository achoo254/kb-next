# Phase 7 (Key riêng và Copilot): phần server

Ngày 04/11/2026. Trạng thái: xong phần server, chưa commit. Phần web dựng theo các route và sự kiện dưới đây.

## Route và sự kiện (đúng như code)

Mọi route cần đăng nhập (401 `sign-in-required`). Lỗi trước khi stream là JSON `{error: code}`.

**Key riêng** (`apps/server/src/user-keys/key-routes.ts`, client `apps/web/src/api/keys-api.ts`):

- `GET /api/me/keys` → `{available, keys: [{provider, last4, status, updatedAt, lastCheckedAt}], prefs: {provider, model} | null, active: {provider, model, last4} | null, models: {openai|gemini|anthropic: [{id, label}]}}`. `active` là `null` khi tính năng tắt.
- `PUT /api/me/keys/:provider` `{key}` → `{provider, last4, status, updatedAt, lastCheckedAt}`. Lỗi: 400 `KEY_FORMAT`, `KEY_REJECTED`, `KEY_NO_CREDIT`, `invalid-body`; 503 `KEY_CHECK_FAILED`, `USER_KEYS_DISABLED`; 429 `rate-limited` (5 lần/phút, tính cả lần lỗi); 404 `not-found` khi nhà cung cấp lạ.
- `DELETE /api/me/keys/:provider` → `{deleted: true}`; vẫn chạy khi tính năng tắt.
- `PUT /api/me/key-prefs` `{provider, model}` → như `GET`; 400 `invalid-body` khi model không thuộc nhà cung cấp đó.

**Hỏi** (`apps/server/src/copilot/ask-routes.ts`, client `apps/web/src/api/copilot-api.ts`, `streamAsk`):

- `POST /api/ask` `{question?, scope: {kind: 'universe'|'space'|'collection'|'document', id?}, task?: 'answer'|'explain'|'summarize', selection?}`. `question` bắt buộc với `answer`, `selection` bắt buộc với `explain`/`summarize` (≤ 1.000 và 4.000 ký tự). Space nhận id hoặc slug.
- Trước khi stream, theo thứ tự: 401, 503 `USER_KEYS_DISABLED`, 400 `invalid-body`, 429 `rate-limited` (20 lần gọi nhà cung cấp mỗi phút mỗi tài khoản, dùng chung với dịch; một câu hỏi tính 1), 403 `NO_USER_KEY` hoặc `USER_KEY_UNREADABLE` (key đang dùng không giải mã được nữa), 404 `not-found` (phạm vi không thấy được).
- Stream `text/event-stream`, mỗi sự kiện là `event: <tên>` và một dòng `data: <JSON>`:
  1. `status {stage: 'searching', jev, found: 0}`: `jev` là `ok` khi server có Jev.
  2. `error {code: 'NO_ANSWER'}` rồi kết thúc, khi kho chưa đủ (chưa gọi nhà cung cấp).
  3. `sources {sources: [{n, documentId, anchor, title, section, spaceName, collectionName, origin, status}]}`. `spaceName`/`collectionName` theo ngôn ngữ tài khoản (hoặc `?lang=`).
  4. `status {stage: 'writing', jev: 'ok'|'off', found}`: `off` khi Jev lỗi hay quá giờ ở bước tìm hoặc chọn đoạn.
  5. `delta {text}` (nhiều lần), trích dẫn `[n]`, có thể có khối ```` ```mermaid ````.
  6. `check {citations: [{n, supported}]}`: chỉ khi `jev: 'ok'`. Số không có trong nguồn luôn là `supported: false`.
  7. `done {questionId, provider, model, last4}`.
  - Hoặc `error {code, provider, last4}` với `USER_KEY_REJECTED` (key bị đánh dấu `invalid`), `USER_KEY_NO_CREDIT` (đánh dấu `quota`), `PROVIDER_FAILED` (key giữ `ok`; chữ đã stream được giữ phía client; gồm cả câu trả lời bị nhà cung cấp cắt vì trần token hay chặn an toàn). Không lưu gì.
  - `error {code: 'INTERNAL'}`: lỗi server khác sau khi đã mở stream. **Mã này thêm ngoài hợp đồng**; web xử như trạng thái H "lỗi / thử lại".
- `GET /api/copilot/history` → `{items: [{id, task, question, scope: {kind, id: string | null}, createdAt}]}`, mới nhất trước, tối đa 50. Có thêm `task` ngoài hợp đồng.
- `GET /api/copilot/history/:id` → `{id, task, question, selection, scope, answer, sources: [...nguồn, available], citations: [...] | null, provider, model, createdAt}`. Nguồn mà người hỏi không còn đọc được có `available: false`, tiêu đề và tên để trống. Câu của tài khoản khác: 404.
- Chỉ câu trả lời xong (`done`) mới được lưu; `NO_ANSWER`, lỗi nhà cung cấp, câu bị cắt và trình duyệt rời đi giữa chừng không vào lịch sử.

**Dịch** (`apps/server/src/copilot/translate-routes.ts`, client `streamTranslation`):

- `POST /api/documents/:id/translate` `{to: 'vi'|'en'}`. Trước khi stream: 401, 503, 400 `invalid-body`, 403 `NO_USER_KEY` / `USER_KEY_UNREADABLE`, 404 `not-found` / 403 `hidden` / 403 `no-access`, 400 `same-language`, 400 `not-translatable` (tài liệu không có Markdown), 400 `too-long` (quá 15 lần gọi, hoặc một đoạn dài hơn 8.000 ký tự), 429 `rate-limited` (số lần gọi của bản dịch không vừa ngân sách phút này).
- Stream: `paragraph {index, text}` (chữ tới lúc đó của đoạn, đoạn 0 là dòng tiêu đề `#`), `done {documentId}`, hoặc `error` như trên (không lưu gì).
- Bản dịch lưu qua `apps/server/src/access/translation-write.ts`: `draft`, `aiTranslated`, `origin: 'own'`, tác giả là người dịch, `translationGroupId = bài gốc.translationGroupId ?? bài gốc.id`. Bài gốc không bao giờ bị ghi. Dịch lại cùng ngôn ngữ thì thay bản nháp cũ bằng phiên bản mới; dịch hỏng thì bản nháp cũ giữ nguyên. Mở bằng `GET /api/documents/:id?lang=<to>` (route đọc chọn bản theo ngôn ngữ người đọc).

## Cách làm

- Luồng hỏi: tìm phân tầng trong phạm vi (keyword + Jev theo nghĩa, tách từ `search-routes.ts` sang `src/search/layered-search.ts`, dùng chung), rồi **một** lượt Jev `ask-passages` gồm Noul "đủ để trả lời" (ngưỡng 0,4) và Score từng đoạn (ngưỡng 0,5, tối đa 5 nguồn). Bước 1 và 3 của spec gộp một lượt vì Noul cần đọc đoạn tìm được. Kiểm trích dẫn: Jev `ask-check`, một Noul cho mỗi cặp (câu, nguồn được trích).
- Jev tắt: chỉ dùng đoạn theo từ khoá. Meilisearch giữ từ đầu câu khi bỏ bớt từ, nên câu hỏi tiếng Anh sẽ không khớp bài tiếng Việt và ra `NO_ANSWER`. Đây là đúng nghĩa "chỉ theo từ khoá"; test dùng câu tiếng Việt.
- Nhà cung cấp: `src/llm/stream-text.ts` (một hàm `streamText` cho cả ba), `src/llm/providers.ts` (danh sách model, header key, phân loại lỗi). Gemini `thinkingLevel: MINIMAL` cộng 2.000 token chừa; Claude Haiku 5.x tắt suy nghĩ, Sonnet 5.5 `between_tools`. Không có biến key AI nào của server (grep rỗng).
- Mã hoá: `src/user-keys/crypto.ts`, AAD `kb/user-key/v1\0userId\0provider`, tag GCM nối sau bản mã (base64). Key hỏng lúc dùng chỉ đánh dấu đúng bản đã dùng (khớp `nonce`).
- Migration `0008_user-keys-and-copilot.sql`: thêm `nonce`, `status`, `last_checked_at`, bỏ `iv`, `auth_tag`, thêm `user_key_prefs`, `copilot_questions`. Bảng `user_keys` được xoá trắng trước (chưa bản nào ghi vào; có test migration).

## Tệp

Mới: `apps/server/src/user-keys/{crypto,key-check,key-store,key-routes}.ts`, `apps/server/src/llm/{providers,stream-text}.ts`,
`apps/server/src/copilot/{ask-routes,translate-routes,answer-prompt,citation-check,passages,paragraphs,event-stream,provider-failure}.ts`,
`apps/server/src/search/layered-search.ts`, `apps/server/src/access/translation-write.ts`, `apps/server/src/api/account-limit.ts`,
`apps/server/drizzle/0008_user-keys-and-copilot.sql` (+ snapshot), `apps/web/src/api/{keys-api,copilot-api}.ts`,
test: `user-keys/{crypto,key-routes}.test.ts`, `llm/stream-text.test.ts`, `copilot/{ask-routes,translate-routes,citation-check}.test.ts`,
`apps/server/test/{fake-providers,copilot-fixtures}.ts`.

Sửa: `config.ts`, `app.ts`, `server.ts`, `db/schema.ts`, `access/search.ts` (lọc theo Collection, tài liệu), `access/reading.ts`
(`findCollection`), `api/search-routes.ts` (dùng `layered-search`), `import/hoc-cloud/prepare.ts` (export `OVERVIEW_ANCHOR`),
`test/test-server.ts`, `config.test.ts`, `db/migrations.test.ts`, `api/web-client-contract.test.ts`, `apps/web/src/api/api-client.ts`
(`getJson` dùng chung), `apps/web/src/api/content-api.ts` (bỏ bản `getJson` riêng), `.env.example`, `docs/deployment-guide.md` (mục Key riêng).

## Kiểm

- `pnpm typecheck`: sạch (gốc, server, web, e2e).
- `pnpm lint`: eslint 0 lỗi 0 cảnh báo; check-brand, check-tokens (94 cặp tương phản), check-public (507 tệp) đều qua.
- `pnpm test`: 88 tệp, 503 test qua, 1 bỏ qua (test Jev thật, chỉ chạy khi có key).
- `drizzle-kit check`: ổn.
- `grep -r "OPENAI_API_KEY\|ANTHROPIC_API_KEY\|GEMINI_API_KEY" apps/server`: rỗng.

## Việc của chủ dự án trước khi bật trên prod

Tạo tệp bí mật và thêm `USER_KEYS_SECRET_PATH` theo `docs/deployment-guide.md` mục Key riêng, sao lưu tệp riêng với database.
Chưa gọi thật OpenAI, Gemini, Claude (chỉ máy chủ giả); nên thử một lượt mỗi nhà cung cấp bằng key thật sau deploy.

## Sửa sau review (04/11/2026, theo `code-reviewer-261104-2320-phase-7-server-review.md`)

Chưa commit. Mỗi mục sửa code đều có test hồi quy (L4, L5 chỉ là ghi chú và tài liệu).

- **H1, câu trả lời hay bản dịch bị cắt vẫn tính là xong.** `src/llm/stream-text.ts` giờ đọc lý do kết thúc của từng nhà cung cấp. Chỉ coi là trọn khi có: OpenAI `finish_reason: "stop"` rồi `[DONE]`; Gemini `finishReason: "STOP"`; Anthropic `stop_reason` `end_turn`/`stop_sequence` rồi `message_stop`. Trần token, chặn an toàn, hay kết nối đóng sạch giữa chừng đều thành `PROVIDER_FAILED`. Không thêm mã lỗi mới. Câu hỏi bị cắt không vào lịch sử. Bản dịch bị cắt không lưu, bản nháp cũ giữ nguyên. Test: máy chủ giả có thêm key `capped` (trần token) và `cutoff` (đóng sạch) cho cả ba nhà cung cấp; thêm test route hỏi và route dịch.
- **M1, không giới hạn số lần gọi khi dịch.** Đã đo nội dung Học Cloud nhập vào (37 tài liệu từ fixture và `content/`). Dài nhất là lab DHCP, 79.215 ký tự, cần 11 lần gọi ở nhóm 8.000 ký tự; tài liệu kế tiếp cần 8; mỗi tài liệu seed cần 1. Chọn: nhóm 8.000 ký tự, trần đầu ra 8.192 token, tối đa 15 lần gọi. Dài hơn, hoặc có đoạn dài hơn một nhóm, thì 400 `too-long` trước mọi lần gọi. Giới hạn 20/phút đổi thành ngân sách số lần gọi (`AccountBudget`): câu hỏi tính 1, bản dịch tính bằng số lần gọi của nó.
- **M2, mất kết nối trước khi stream mở.** `connectionSignal(req, res)` được lấy đầu tiên trong handler. Nó huỷ ngay nếu socket đã đóng. Route kiểm lại trước khi mở stream, trước khi gọi nhà cung cấp và trước khi lưu. Test: client rời đi lúc đang chọn đoạn thì không có request nào tới nhà cung cấp và không lưu gì; client rời đi giữa câu trả lời thì máy chủ giả thấy request bị huỷ và không lưu gì; unit test cho trường hợp client đóng trước khi handler xem tới.
- **M3, ghi vào bài gốc.** Không ghi vào bài gốc nữa. Bản dịch mang `translationGroupId = bài gốc.translationGroupId ?? bài gốc.id`. `listTranslationsOf` nhận khoá văn bản và lấy cả bài gốc chưa có nhóm. Route đọc và route tìm kiếm gom theo `translationGroupId ?? id`. Test: người đọc dịch bài DHCP đã duyệt của tác giả khác; hàng bài gốc không đổi; trang đọc chuyển qua lại vi/en cho người dịch và chỉ vi cho người khác; số bài đếm không đổi.
- **L1, đổi nhà cung cấp trong một lượt.** Key đang dùng không giải mã được thì đánh dấu `unreadable` và trả 403 `USER_KEY_UNREADABLE`; lượt sau dùng key `ok` mới. Test: key OpenAI sai bí mật cùng key Gemini tốt; lượt đầu 403 và không request nào, lượt sau chạy bằng Gemini.
- **L2, phạm vi Collection.** Chỉ mục có thêm `collectionId` (filterable). Bộ lọc Meilisearch thêm `collectionId IN [...]`. **Sau deploy phải chạy `reindex` một lần** (đã ghi trong `docs/deployment-guide.md`). Test kiểm bộ lọc gửi tới Meilisearch và nguồn chỉ thuộc Collection đó.
- **L3, kiểm trích dẫn.** Mỗi số được trích có ít nhất một câu được kiểm trước khi chạm trần 30 câu hỏi.
- **L4, `explain`/`summarize`.** Giữ việc gọi model bất kể Jev nói kho đủ hay không: đoạn người đọc chọn chính là tư liệu. Đã ghi chú trong code (`ask-routes.ts`).
- **L5.** `docs/deployment-guide.md` ghi rằng production cần `TYPESAFE_API_KEY` thì quy tắc "kho chưa có" mới có tác dụng.
- **L6.** `keys.mark` lỗi DB thì chỉ log; client vẫn nhận đúng mã lỗi key.
- **L7.** Khoá `pg_advisory_xact_lock` theo (văn bản, ngôn ngữ, người dịch) để hai lần dịch đồng thời không tạo hai bản nháp. Có test hai lần lưu song song, nhưng PGlite chạy các transaction tuần tự nên test này không chứng minh được khoá; trên Postgres thật khoá là thứ chặn.
- **Test còn thiếu, đã thêm:** lịch sử của tài khoản khác (404, danh sách rỗng), phạm vi Collection, ngắt kết nối giữa stream, 429 ở câu thứ 21 của `/api/ask`, ngân sách dịch (12 lần gọi rồi 9 thì 429, 8 thì qua).
- **Chưa làm:** L8 (câu trả lời cũ chứa nội dung bài đã ẩn sau đó) và L9 (chi phí Jev) chỉ là ghi chú, không có việc code.

Web (`apps/web/src/api/copilot-api.ts`): hình dạng dữ liệu không đổi. Chỉ sửa chú thích: thêm các mã trước khi stream `USER_KEY_UNREADABLE` (403) và `too-long` (400), và ghi rằng `PROVIDER_FAILED` gồm cả câu bị cắt. Màn web nên hiện `USER_KEY_UNREADABLE` là "nhập lại key ở Key riêng".

Kiểm sau sửa: `pnpm typecheck` sạch. eslint của `apps/server` và `apps/web/src/api` sạch; check-brand, check-tokens, check-public (523 tệp) qua. `pnpm lint` toàn repo còn 1 lỗi ở `apps/web/src/pages/translate-screen.tsx:184` (`react-hooks/immutability`), tệp đang viết dở của phiên web, không phải của phần server. `pnpm test`: 93 tệp, 557 test qua, 1 bỏ qua.

