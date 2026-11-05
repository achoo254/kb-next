# Trích chữ tệp tải lên

Dây chuyền biến một tệp người dùng tải lên (docx, xlsx, pptx, pdf, md) thành các đoạn tìm được ở C12 và Copilot đọc
được. Mã nằm ở [`apps/server/src/extract/`](../apps/server/src/extract); mọi lượt đọc tệp, tài liệu và lượt ghi đoạn đi
qua [`apps/server/src/access/extraction.ts`](../apps/server/src/access/extraction.ts). Trạng thái từng tệp nằm ở bảng
`extract_jobs` (migration `0011_extract-jobs`), C16 đọc từ đó.

Bản hiện tại chạy hết trên `.65`, dùng Tika có sẵn và Tesseract của nó, không thêm model OCR nào. OCR chất lượng cao
hơn (PaddleOCR, PP-StructureV3, VietOCR trên một VPS riêng) chờ có chi phí VPS.

## Apache Tika trên `.65`

Đã kiểm ngày 05/11/2026:

| Mục | Giá trị |
|---|---|
| Phiên bản | Apache Tika server 2.9.3, bản standard |
| Địa chỉ | loopback `127.0.0.1:9998` (`TIKA_URL`, mặc định đúng giá trị này) |
| Dùng chung | nhiều app trên `.65` cùng gọi; kb không sở hữu, không restart |
| Bộ nhớ | tiến trình fork, heap 512 MB |
| OCR | có `TesseractOCRParser`; tesseract 4.1.1, gói ngôn ngữ `eng` và `vie` (`vie` cài ngày 05/11/2026) |

Vì Tika dùng chung và RAM của máy chật (khoảng 2,5 GB trống), kb chỉ gửi **một tệp một lúc**, tối đa 25 MB, và chia
trang cần OCR thành từng lượt 4 trang. Muốn đổi cấu hình hay nâng heap của Tika thì kiểm RAM trống của máy trước, vì các
app khác cũng đang dùng.

Các request kb gửi (`PUT /tika`, `Accept: text/html`):

| Việc | Header |
|---|---|
| Đọc chữ có sẵn (Office, PDF có lớp chữ) | `X-Tika-OCRskipOcr: true`; PDF thêm `X-Tika-PDFOcrStrategy: no_ocr` |
| OCR trang PDF | `X-Tika-PDFOcrStrategy: ocr_only`, `X-Tika-OCRLanguage: vie+eng`, `X-Tika-OCRoutputType: hocr` |
| Đoán loại tệp khi MIME đã lưu không rõ | `PUT /detect/stream` |

Tika trả XHTML: PDF có một `<div class="page">` cho mỗi trang; OCR ở dạng hOCR nên mỗi từ kèm độ tin cậy `x_wconf`
của Tesseract. Nội dung tệp không bao giờ vào log.

## Cấu hình

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `TIKA_URL` | `http://127.0.0.1:9998` | Tika. `http` chỉ được trên loopback; địa chỉ khác phải `https` |
| `FILES_DIR` | production `/var/lib/kb/files`, dev `.data/files` | thư mục tệp tải lên, tệp nằm ở `<FILES_DIR>/<storageKey>`; phải là đường dẫn tuyệt đối |

Unit `kb-server` có `ProtectSystem=strict`: server chỉ cần đọc `FILES_DIR` để trích chữ; API tải lên (C03) ghi vào đó
thì cần thêm `ReadWritePaths=/var/lib/kb/files` vào unit.

## Các bước (C16)

| Bước | Việc |
|---|---|
| Tải lên (`upload`) | kiểm lại thứ đã tải lên: tệp còn trên đĩa, gắn với tài liệu còn sống, không quá 25 MB, đúng loại nhận (MIME đã lưu, không rõ thì hỏi Tika). Lỗi ở đây hiện ở bước này |
| OCR (`ocr`) | chỉ PDF: PDF Inspector đo từng trang, Decision Engine chọn trang cần OCR, Tesseract của Tika đọc, Quality Validator chấm. Office, md, PDF toàn chữ: bỏ qua |
| Đọc cấu trúc (`structure`) | Office và trang PDF có lớp chữ: XHTML của Tika (giữ tiêu đề, bảng); md: đọc nguyên văn, không qua Tika |
| Chia đoạn (`chunk`) | Document Normalizer: Markdown theo thứ tự trang, mỗi đoạn một `anchor` |
| Jev phân loại (`classify`) | gợi ý Collection và thẻ, chờ chủ tệp chấp nhận |
| Lập chỉ mục (`index`) | thay các đoạn của tài liệu trong bảng `chunks`, rồi đẩy sang Meilisearch qua hàng đợi đồng bộ có sẵn |

Mỗi bước có trạng thái `pending`, `running`, `done`, `failed` hoặc `skipped`, kèm `detail` khi có (số trang, trang đã
OCR, điểm chất lượng, trang chất lượng thấp, số đoạn, lý do bỏ qua).

## Trang nào phải OCR

PDF Inspector dùng pdf.js (không render) đo mỗi trang: lớp chữ (chữ chọn được) và tỷ lệ diện tích ảnh phủ trang.
Decision Engine quyết theo luật:

- Lớp chữ dưới 40 ký tự và ảnh phủ từ 5% trang trở lên: OCR (trang quét, kể cả trang chỉ có số trang hay con dấu).
  Không chữ, không ảnh: trang trống. Ít chữ, không ảnh: dùng lớp chữ.
- Lớp chữ có từ 75% trở lên là từ tiếng Việt hoặc tiếng Anh hợp lệ, và không phải "ít chữ trên trang gần như toàn
  ảnh": dùng lớp chữ. Lớp chữ ẩn do máy quét tự OCR cũng tính.
- Còn lại là trường hợp lưng chừng (lớp chữ rác, bảng mã cũ như TCVN3, vài dòng chú thích trên ảnh cả trang): hỏi Jev
  `noul` "lớp chữ này có đọc được không", từ 0,5 trở lên thì dùng lớp chữ, dưới thì OCR. Không có Jev hoặc Jev lỗi thì
  theo tỷ lệ từ: dưới 50% là OCR, ít chữ trên trang phần lớn là ảnh cũng OCR.

PDF toàn chữ không có trang nào bị gửi OCR. Chỉ các trang cần OCR được chép sang một PDF nhỏ (pdf-lib) rồi gửi Tika,
nên PDF trộn chỉ tốn OCR cho đúng trang quét.

## Chất lượng OCR

Mỗi trang OCR được chấm từ tối đa ba tín hiệu, mỗi cái 0–1, điểm trang là trung bình các tín hiệu có:

- độ tin cậy trung bình của Tesseract (`x_wconf` trong hOCR), khi Tika trả kèm;
- tỷ lệ từ hợp lệ tiếng Việt / tiếng Anh (âm tiết tiếng Việt đúng cấu trúc, từ tiếng Anh có nguyên âm, viết tắt như
  DNS, số, tên lệnh như `eth0`);
- Jev `score` "đoạn chữ này có mạch lạc không" (4 mức), khi Jev bật.

Trang **chất lượng thấp** khi điểm dưới 0,55, khi dưới 50% là từ hợp lệ, hoặc khi OCR gần như không đọc được gì (dưới
20 ký tự). Trang đó **không vào chỉ mục**; các trang khác của tệp vẫn được lập chỉ mục. C16 gắn cờ trang ở bước OCR
(`detail.lowQualityPages`: số trang, điểm, cách sửa). Điểm trung bình các trang OCR nằm ở `detail.quality`.

Chữ viết tay và bảng phức tạp chưa xử lý: nếu ra chữ rác thì trang bị gắn cờ, không đưa rác vào chỉ mục.

## Mã lỗi và cách sửa

Giao diện dịch mã cách sửa (`hint`) theo ngôn ngữ người dùng.

| Mã lỗi | Khi nào | Thử lại tự động | Cách sửa (`hint`) |
|---|---|---|---|
| `too-large` | tệp trên 25 MB | không | `smaller-file`: tách nhỏ hoặc nén dưới 25 MB |
| `encrypted` | tệp có mật khẩu | không | `remove-password`: bỏ mật khẩu rồi lưu lại |
| `corrupt` | tệp hỏng, Tika không đọc được | không | `resave-file`: mở bằng ứng dụng gốc rồi lưu lại |
| `unsupported-type` | không phải docx, xlsx, pptx, pdf, md | không | `convert-format`: lưu thành một trong các loại đó |
| `file-missing` | tệp không còn trên đĩa | không | `upload-again`: tải lên lại |
| `no-document` | tệp không gắn với tài liệu nào còn sống | không | `upload-again` |
| `tika-unavailable` | Tika không phản hồi, trả 5xx | có | `retry-later` |
| `timeout` | quá hạn một lượt (15 phút) | có | `retry-later` |
| `internal` | lỗi bất ngờ | có | `retry-later` |

Cờ trang chất lượng thấp dùng `rescan` (quét lại rõ hơn) hoặc `export-text-pdf` (xuất PDF có chữ từ ứng dụng gốc,
khi trang vốn có lớp chữ nhưng là rác).

## Jev phân loại

Sau khi chia đoạn, một lượt gọi Jev gồm: `choice` chọn Collection trong các Collection của những Space chủ tệp thấy
được (mọi Space công khai và Space riêng của họ), có lựa chọn "không hợp Collection nào"; và một `noul` cho mỗi thẻ ứng
viên. KnowFlow chưa có bộ thẻ riêng nên thẻ ứng viên lấy từ chính văn bản: tối đa 8 thuật ngữ lặp từ 2 lần (viết tắt như
DNS, tên riêng viết hoa giữa câu như Kubernetes). Thẻ có `noul` từ 0,5 trở lên được gợi ý.

Kết quả lưu ở `extract_jobs.suggestions` với `status: "pending"` cho tới khi chủ tệp chấp nhận hay bỏ qua trên C16.
Chạy cho mọi người bằng key Jev của server (`TYPESAFE_API_KEY`), không dùng key riêng của người dùng. Jev tắt hoặc lỗi
thì bước này `skipped`, tệp vẫn được lập chỉ mục. Lượt gọi Jev của dây chuyền tính vào báo cáo chi phí theo `purpose`
`extract-ocr-decision`, `extract-quality`, `extract-classify`.

## Đoạn và anchor

Đoạn theo cùng quy tắc với bài viết: mỗi tiêu đề `##`/`###` một đoạn, anchor là tiêu đề viết không dấu, duy nhất trong
tài liệu. Tiêu đề trong tệp hạ một cấp (`#` của Word thành `##`) vì tên tài liệu là trường riêng. Mỗi trang PDF mở đầu
bằng tiêu đề `## Trang N` (`## Page N` với tài liệu tiếng Anh), nên trích dẫn chỉ đúng trang. Mục dài quá 4.000 ký tự
được cắt ở chỗ xuống đoạn thành các phần `<anchor>--2`, `<anchor>--3`…

Đoạn chỉ được ghi khi tệp vẫn là phiên bản mới nhất của tài liệu và tài liệu không nằm trong thùng rác; tệp đã bị phiên
bản sau thay thì bước lập chỉ mục `skipped` (`superseded`).

## Hàng đợi

- Trong tiến trình `kb-server`, một tệp một lúc, trạng thái nằm ở `extract_jobs` (`queued`, `running`, `waiting`,
  `done`, `failed`).
- Tối đa 3 lượt mỗi tệp. Lỗi tạm (Tika không phản hồi, quá hạn, lỗi bất ngờ) thì chờ 30 giây rồi 2 phút
  (`waiting`, `nextAttemptAt`); lỗi do chính tệp thì `failed` ngay. Client Tika tự thử lại 2 lần (1 s, 3 s) khi Tika
  từ chối kết nối hay trả 502–504.
- Mỗi lượt có hạn 15 phút; mỗi request OCR có hạn 1 phút cộng 1 phút mỗi trang.
- Khởi động lại server: job đang chạy dở trở về hàng đợi (lượt dở vẫn được đếm, nên tệp làm sập server không chạy mãi),
  các job đến hạn chạy tiếp.
- Tika chết không làm treo API: tệp nằm ở `waiting` rồi `failed` sau 3 lượt; người dùng bấm "Thử lại" là chạy lại từ
  đầu với 3 lượt mới.

Log (không có tên hay nội dung tệp): `extract: file <id> will retry|failed (<mã>, attempt n/3): …`,
`extract: resumed N interrupted job(s)`. Lần đầu đọc một PDF, pdf.js in vài dòng `Warning: Cannot load
"@napi-rs/canvas"…`, `Cannot polyfill ImageData/Path2D`: vô hại, kb không render PDF (bundle production không kèm gói
native; `DOMMatrix` cần cho việc đọc được thay bằng bản 2D trong `src/extract/dom-matrix.ts`).

## Hợp đồng cho API tải lên và C16

Từ [`apps/server/src/extract/index.ts`](../apps/server/src/extract/index.ts):

```ts
const extraction = await startExtraction({ config, db, jev, sync }); // server.ts đã khởi động sẵn
await extraction.enqueueExtraction(fileId);          // sau khi ghi tệp, dòng `files` (có documentId) và phiên bản trỏ tới tệp
const status = await extraction.extractionStatus(viewer, fileId); // null: chưa có job, hoặc không phải chủ tệp / admin
```

- Trước khi gọi `enqueueExtraction`: tệp nằm ở `<FILES_DIR>/<storageKey>` (`storageKey` ngẫu nhiên, 8–128 ký tự
  `[A-Za-z0-9_-]`), dòng `files` có `documentId`, và phiên bản mới nhất của tài liệu (`document_versions.file_id`) trỏ
  tới tệp đó. Gọi lại với cùng `fileId` là chạy lại từ đầu (nút "Thử lại"); job đang chạy thì giữ nguyên. Id không phải
  uuid hay tệp không tồn tại thì promise bị từ chối.
- `ExtractionStatus`: `status`, `steps` (6 bước theo thứ tự C16, mỗi bước `state` và `detail`), `attempts`,
  `maxAttempts` (3), `error` (`code`, `hint`), `suggestions` (`collection` gồm `collectionId`, `spaceId`,
  `probability`; `tags` gồm `tag`, `probability`; `status` `pending`/`accepted`/`dismissed`), `nextAttemptAt`,
  `updatedAt`, `finishedAt`.
- `MAX_FILE_BYTES` (25 MB) và `routeFor(mime)` (loại tệp nhận) cũng xuất từ đây để API tải lên kiểm cùng giới hạn.
