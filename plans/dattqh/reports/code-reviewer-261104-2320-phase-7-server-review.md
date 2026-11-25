# Review commit 9055af1: phần server của Key riêng, Copilot và dịch bằng AI

Ngày 04/11/2026 (Asia/Saigon). Người review: code-reviewer. Chỉ đọc, không sửa code.

## Phạm vi

- Commit `9055af1` (46 tệp, +6.191/−151; phần server khoảng 3.000 dòng ngoài snapshot drizzle).
- Đối chiếu: mục "Hợp đồng API" của `tieu-de-next/plans/dattqh/261103-1707-knowflow-kb-build/phase-07-key-rieng-va-copilot.md` và báo cáo `plans/dattqh/reports/fullstack-developer-261104-2300-phase-7-server.md`.
- Đã đọc kỹ: `user-keys/{crypto,key-store,key-routes,key-check}.ts`, `llm/{providers,stream-text}.ts`, `copilot/*.ts`, `search/layered-search.ts`, `access/{search,reading,translation-write,visibility}.ts`, `api/{account-limit,validate,request-context}.ts`, `app.ts`, `server.ts`, `config.ts`, migration `0008`.
- Kiểm thực nghiệm: một script thăm dò (`npx tsx`, máy chủ giả trả SSE rồi đóng kết nối sạch, không có `[DONE]`) xác nhận phát hiện H1. Không chạy bộ test đầy đủ.

## Đánh giá chung

Phần bảo mật key làm tốt: không tìm thấy đường nào để key đầy đủ (hay thân lỗi của nhà cung cấp) lọt ra response, log, sự kiện SSE, URL hay DB ở dạng rõ. Phân quyền đi qua lớp access ở mọi điểm đọc. Quy tắc "không gọi nhà cung cấp khi Jev nói kho không đủ" được giữ cho tác vụ `answer`. Chưa có lỗi mức critical.

Lỗi thật đáng sửa trước khi bật trên prod: stream bị cắt cụt hoặc chạm trần token vẫn được coi là xong, nên câu trả lời dở dang vào lịch sử và **bản dịch thiếu nội dung được lưu như bản hoàn chỉnh** (H1). Ngoài ra còn vài điểm mức medium/low về chi phí và tác dụng phụ của bước dịch.

## Critical

Không có.

## High

### H1. Stream kết thúc sớm hoặc chạm trần token vẫn tính là thành công: câu trả lời dở được lưu, bản dịch bị cụt được lưu như bản đầy đủ

- Vị trí: `apps/server/src/llm/stream-text.ts:223-233` (vòng đọc SSE hết thì `outcome = 'ok'`), `:164-185` (`textOf` bỏ qua `finish_reason` / `stop_reason` / `finishReason`); hệ quả ở `apps/server/src/copilot/ask-routes.ts:199-216` và `apps/server/src/copilot/translate-routes.ts:83-113`.
- Đã kiểm: máy chủ giả gửi một `data:` của OpenAI rồi `res.end()` (không `[DONE]`): `streamText` trả `"Half an ans"`, log `outcome: "ok"`, không ném lỗi. Chú thích đầu tệp ("a stream that breaks ... throws ProviderError('failed')") chỉ đúng khi socket lỗi, không đúng khi kết nối đóng sạch.
- Các trường hợp thật:
  1. OpenAI `finish_reason: "length"`, Anthropic `message_delta.stop_reason: "max_tokens"` rồi `message_stop`, Gemini `finishReason: "MAX_TOKENS"` / `"SAFETY"` / `"RECITATION"`: đều được đọc như kết thúc bình thường.
  2. Proxy hay nhà cung cấp đóng kết nối sạch giữa chừng (OpenAI không gửi `[DONE]`, Anthropic không gửi `message_stop`).
- Kịch bản lỗi khi dịch: `groupParagraphs` (`paragraphs.ts:31-46`) để một đoạn dài hơn 4.000 ký tự thành một nhóm riêng (bảng lớn, khối code dài, một đoạn import không có dòng trống). Dịch một đoạn 15.000 ký tự với `MAX_OUTPUT_TOKENS = 4_096` (`translate-routes.ts:36`) thì bị cắt khoảng giữa đoạn; server vẫn ghép kết quả, lưu phiên bản mới (`saveAiTranslation`) và gửi `done`. Người dùng nhận một bản nháp thiếu phần cuối mà không có dấu hiệu gì. Khi dịch lại, bản cũ bị thay bằng bản cụt.
- Kịch bản lỗi khi hỏi: câu trả lời dài hơn 1.500 token (`answer-prompt.ts:21`), hoặc Gemini chặn vì SAFETY nên chữ rỗng: vẫn có `check`, lưu `copilot_questions` với `answer` dở hoặc rỗng, gửi `done`.
- Cách sửa: trong `textOf`/`streamText`, đọc lý do kết thúc của từng nhà cung cấp; coi là hoàn tất chỉ khi gặp dấu kết thúc chuẩn (`[DONE]`, `message_stop` với `stop_reason` ∈ {`end_turn`,`stop_sequence`}, `finishReason: "STOP"`). Hết luồng mà chưa gặp dấu kết thúc thì ném `ProviderError('failed', status)`. Thêm loại kết quả `truncated`: route dịch trả `error {code: 'PROVIDER_FAILED'}` và không lưu (hoặc chia lại nhóm đó nhỏ hơn); route hỏi vẫn có thể giữ chữ nhưng không lưu lịch sử như câu đã xong (hoặc lưu kèm cờ). Thêm test máy chủ giả cho cả hai trường hợp (EOF sạch, `finish_reason: length`).

## Medium

### M1. Một lần dịch không có giới hạn số lần gọi nhà cung cấp

- Vị trí: `apps/server/src/copilot/translate-routes.ts:83-106`.
- Kịch bản: tài liệu 200.000 ký tự thành khoảng 50 nhóm, tức 50 lần gọi tuần tự, mỗi lần tối đa 120 giây (`CALL_TIMEOUT_MS`). Giới hạn 20/phút chỉ tính 1 cho cả request, nên một tài khoản mở 20 lần dịch mỗi phút là khoảng 1.000 lần gọi có tính tiền trên key của họ, và server giữ 20 kết nối dài hàng chục phút. Bấm nhầm "Dịch" trên tài liệu rất dài cũng tốn tiền của người dùng mà không có cảnh báo trước.
- Cách sửa: chặn trước khi stream, ví dụ quá 40 nhóm hoặc 120.000 ký tự thì 400 `too-long`. Có thể thêm giới hạn số stream AI đồng thời mỗi tài khoản (1–2).

### M2. Mất kết nối trước khi stream mở thì không huỷ được lời gọi nhà cung cấp

- Vị trí: `apps/server/src/copilot/event-stream.ts:16` (`res.on('close', …)` gắn trong `openEventStream`).
- Kịch bản: trình duyệt huỷ request (chuyển trang, bấm gửi hai lần) trong lúc route còn đang `await keys.open`, `readerOf`, `scopeFilter` (`ask-routes.ts:222-226`) hoặc `openDocument`/`findLatestVersion` (`translate-routes.ts:71-77`). Sự kiện `close` đã phát trước khi listener được gắn, nên `signal` không bao giờ abort: server vẫn tìm kiếm, gọi Jev, gọi nhà cung cấp (tính tiền key người dùng), lưu lịch sử hoặc lưu bản dịch, dù không ai đọc. Cửa sổ thời gian nhỏ (vài chục ms) nhưng rất dễ xảy ra khi bấm hai lần.
- Cách sửa: trong `openEventStream`, sau khi gắn listener, abort ngay nếu `res.destroyed || req.socket.destroyed` (truyền `req` vào), hoặc gắn listener `close` ngay đầu handler.

### M3. Dịch sửa `translationGroupId` của tài liệu gốc mà người dịch chỉ có quyền đọc

- Vị trí: `apps/server/src/access/translation-write.ts:32-38`.
- Kịch bản: bất kỳ tài khoản nào đọc được một bài đã duyệt của người khác (chưa có nhóm) đều ghi được vào hàng `documents` của bài đó (`translation_group_id = id`). Hiện chưa lộ dữ liệu, vì bản nháp vẫn lọc theo `visibleTo`. Nhưng đây là lần ghi đầu tiên mà quyền **đọc** đủ để sửa tài liệu của người khác; không đổi `updatedAt`, không đưa vào `sync`, và thay đổi cách `content-routes.ts:163,246` gom bài với mọi người đọc. Phase sau dựa vào "cùng nhóm = bản dịch đã được công nhận" sẽ hiểu sai.
- Cách sửa: chấp nhận và ghi rõ trong đặc tả (nhóm bằng chính id là trung tính), hoặc không sửa bài gốc: lưu bản dịch với `translationGroupId = source.translationGroupId ?? source.id` và để route đọc tìm theo `translationGroupId = id` lẫn `id = groupId`. Cần chủ dự án chọn.

## Low

### L1. Key đã chọn không giải mã được thì lượt đó tự chuyển sang key của nhà cung cấp khác

- Vị trí: `apps/server/src/user-keys/key-store.ts:110-128`.
- Mô tả: key được chọn bị đánh dấu `unreadable` rồi vòng lặp chọn key `ok` tiếp theo ngay trong cùng lượt. Việc này khớp quy tắc `active` của hợp đồng, nhưng lệch câu "Key hỏng thì lượt dừng kèm câu báo sửa key, không chuyển sang nguồn nào khác". Người dùng chỉ biết qua `done.provider`/`last4`. Chưa có lời gọi nhà cung cấp nào trước khi chuyển, nên rủi ro thấp.
- Cách sửa: nếu muốn bám sát spec, khi key ưu tiên `unreadable` thì trả 403 `NO_USER_KEY` (hoặc mã riêng `USER_KEY_UNREADABLE`) trong lượt này; lượt sau dùng `active` mới.

### L2. Phạm vi Collection không được lọc ở Meilisearch

- Vị trí: `apps/server/src/access/search.ts:110-117` (chỉ có `inSpace`, `inDocuments`); bước lọc lại ở `:131-135` có lọc `collectionIds`, nên **không lộ dữ liệu**.
- Kịch bản: Space có nhiều Collection, 50 kết quả từ khoá (`KEYWORD_HITS`) bị các Collection khác chiếm hết, lọc lại thì còn 0. Khi Jev tắt, kết quả là `NO_ANSWER` sai.
- Cách sửa: thêm `collectionId IN [...]` vào bộ lọc Meili (cần `collectionId` là filterable attribute của index).

### L3. Kiểm trích dẫn cắt ở 30 cặp làm thiếu số trong sự kiện `check`

- Vị trí: `apps/server/src/copilot/citation-check.ts:60-62`.
- Mô tả: số `[n]` có thật nhưng chỉ xuất hiện sau cặp thứ 30 thì không có verdict nào, nên vắng mặt trong `check.citations`. Client không biết nó là "chưa kiểm" hay "được ủng hộ".
- Cách sửa: chọn cặp sao cho mỗi số có ít nhất một cặp trước, hoặc trả `supported: null` cho số chưa kiểm (cần cập nhật hợp đồng).

### L4. `explain`/`summarize` bỏ qua phán quyết "không đủ" của Jev

- Vị trí: `apps/server/src/copilot/ask-routes.ts:163`.
- Mô tả: với hai tác vụ này, provider luôn được gọi kể cả khi Jev nói kho không đủ hoặc không có đoạn nào (`Sources: none.`). Hợp lý vì đầu vào chính là đoạn người đọc chọn, và báo cáo implementer có ghi; nhưng spec bước 1 không nêu ngoại lệ. Cần chủ dự án xác nhận.

### L5. Server không có Jev (`TYPESAFE_API_KEY` trống) thì bỏ hẳn bước 1

- Vị trí: `ask-routes.ts:146-163`. Khi `jev === null`, mọi kết quả từ khoá đều dẫn tới lời gọi nhà cung cấp. Đúng trạng thái F02 E, nhưng prod cần luôn có Jev để quy tắc NO_ANSWER có tác dụng; nên ghi vào `docs/deployment-guide.md`.

### L6. Ghi lỗi DB trong `reportProviderFailure` làm mất mã lỗi key

- Vị trí: `apps/server/src/copilot/provider-failure.ts:19-20`. `keys.mark` lỗi thì ném ra ngoài, client nhận `INTERNAL` thay vì `USER_KEY_REJECTED`/`USER_KEY_NO_CREDIT`. Cách sửa: bọc `mark` trong try/catch, log `safeErrorText`, vẫn trả mã đúng.

### L7. Hai lần dịch đồng thời cùng tài liệu và ngôn ngữ tạo hai bản nháp

- Vị trí: `apps/server/src/access/translation-write.ts:39-82`. Hai transaction READ COMMITTED đều không thấy `existing`, nên đều insert. Cách sửa: `pg_advisory_xact_lock(hashtext(groupId || lang || authorId))` đầu transaction, hoặc unique index một phần trên (`translation_group_id`, `lang`, `author_id`) `WHERE ai_translated AND status = 'draft' AND deleted_at IS NULL`.

### L8. Lịch sử giữ chữ trả lời trích từ tài liệu đã bị ẩn sau đó

- Vị trí: `ask-routes.ts:267-281`. Nguồn không còn đọc được đã bị xoá tiêu đề, nhưng `answer` vẫn chứa nội dung tóm từ tài liệu đó. Người hỏi đã có quyền đọc lúc hỏi, nên chỉ là ghi chú về lưu giữ dữ liệu; nếu quy trình ẩn bài dùng cho nội dung nhạy cảm thì cần quyết định có xoá hay che câu trả lời liên quan hay không.

### L9. Chi phí Jev phía server cho mỗi câu hỏi

- Mỗi lần hỏi gọi Jev 2–3 lần trên key TypeSafe của server (tìm theo nghĩa, `ask-passages`, `ask-check`), kể cả khi kết quả là `NO_ANSWER`. Giới hạn 20/phút mỗi tài khoản chặn lạm dụng ở mức chấp nhận được; nên theo dõi qua `JevUsageStore`.

## Kết quả theo từng trọng tâm

1. **Bảo mật key**: đạt.
   - Key chỉ đi trong header (`providers.ts:57-66`); URL Gemini chỉ có model đã mã hoá và `alt=sse`.
   - Thân lỗi của nhà cung cấp chỉ dùng để phân loại, không log, không trả về (`stream-text.ts:187-193,219`; `key-check.ts:37-44`).
   - Log chỉ có provider, model, status, outcome. Lỗi fetch bị nuốt thành `ProviderError`. `parseBody` không trả thông điệp zod. `onError` dùng `safeErrorText`, nên lỗi drizzle không in tham số (và tham số khi lưu chỉ là bản mã).
   - Response và SSE chỉ có `last4`.
   - AES-256-GCM: nonce ngẫu nhiên 96 bit mỗi lần lưu; tag 16 byte nối sau và kiểm `authTagLength`; AAD có nhãn phiên bản, userId và provider; kiểm cỡ secret và nonce trước khi giải mã.
   - Tệp bí mật: kiểm `isFile`, quyền `& 0o077`, đúng 32 byte, lỗi không lộ nội dung; thiếu tệp thì tính năng tắt, server vẫn chạy.
   - `mark` khớp theo `nonce`, nên lần lưu lại không bị đánh dấu nhầm.
   - Ký tự key giới hạn ở ASCII in được, nên không gây lỗi header kèm giá trị.
2. **Phân quyền**: đạt.
   - Phạm vi: `listSpaces`/`findCollection`/`findDocument` theo viewer, 404 trước khi stream.
   - Đoạn văn: `searchChunks` lọc lại bằng `visibleTo` và `documentFilter`; `layeredSearch` đọc lại mọi tài liệu qua `findDocumentsByIds`; `passagesOf`/`firstPassages` qua `readableIds`.
   - Lịch sử lọc `userId` ở cả danh sách lẫn chi tiết; nguồn hết quyền thì bị che.
   - Dịch dùng `openDocument` và `findLatestVersion` theo viewer.
   - Bản nháp chỉ hiện với tác giả và admin (`visibility.ts:33-39`).
   - Chưa có test cho trường hợp tài khoản khác mở lịch sử, cũng như phạm vi Collection hay tài liệu nháp của người khác. Code đúng, nhưng nên thêm test để giữ hành vi này.
3. **NO_ANSWER / không fallback**: đạt với `answer`. Jev nói không đủ thì trả `NO_ANSWER` trước mọi lời gọi (có test đếm 0 request). Lỗi nhà cung cấp kết thúc lượt, không thử key khác. Ngoại lệ xem L1, L4, L5.
4. **SSE**: client ngắt kết nối sau khi stream mở thì huỷ fetch, không lưu gì. Lỗi sau khi mở stream thì gửi `error` rồi `end`. Giới hạn 5/phút (lưu key) và 20/phút (hỏi + dịch dùng chung) đặt sau `signedIn`, khoá theo userId. Lỗ hổng: M2 (ngắt trước khi mở stream), H1 (kết thúc cụt). Chưa có test cho việc ngắt kết nối và cho 429 của `/api/ask`.
5. **Migration 0008**: an toàn với prod (0 hàng `user_keys`).
   - `DELETE` chạy trước `ADD COLUMN nonce NOT NULL`. Enum `ai_provider` đã có từ trước. Hai bảng mới có FK `ON DELETE CASCADE` và index (`user_id`, `created_at`) cho lịch sử.
   - Migrator drizzle chạy cả lô trong transaction.
   - Rollback code về bản trước vẫn chạy được, vì bản trước không đọc hay ghi `user_keys`. Muốn khôi phục cột `iv`/`auth_tag` thì phải sửa schema tay.
6. **Đúng sai khác**: H1, M1, L2, L3, L6, L7.

## Việc nên làm (theo thứ tự)

1. Sửa H1 (nhận biết lý do kết thúc và EOF thiếu dấu kết thúc; không lưu bản dịch hay câu trả lời bị cụt) kèm test máy chủ giả.
2. Sửa M2 (abort ngay khi kết nối đã đóng trước lúc mở stream).
3. Sửa M1 (giới hạn kích thước hoặc số nhóm khi dịch).
4. Chủ dự án quyết M3, L1, L4.
5. Thêm test: lịch sử của tài khoản khác trả 404, phạm vi Collection, ngắt kết nối giữa stream thì fake provider thấy request bị huỷ, 429 thứ 21 của `/api/ask`.
6. Các mục Low còn lại khi tiện.

## Số liệu

- Typecheck/lint/test: không chạy lại (báo cáo implementer ghi typecheck sạch, eslint 0/0, 503 test qua). Reviewer chỉ chạy một script thăm dò cho H1.
- Độ phủ test: không đo.

## Câu hỏi còn mở

- M3: chấp nhận việc người dịch ghi `translationGroupId` lên bài gốc của người khác, hay đổi cách gom nhóm?
- L1: key ưu tiên `unreadable` thì dừng lượt (đúng câu chữ spec) hay tự dùng key `ok` khác (đúng quy tắc `active`)?
- L4: `explain`/`summarize` được phép gọi nhà cung cấp khi Jev nói kho không đủ?
