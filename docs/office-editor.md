# Trình sửa Office (ranuts/document)

Kết quả spike bước 1 của phase 10, chạy ngày 05/11/2026: dựng ranuts/document, đo dung lượng tải đầu, thử lấy nội dung
đã sửa từ iframe. Cả hai câu hỏi đều có câu trả lời là **được**: trang cha nạp file bằng bytes và nhận lại bytes của file
đã sửa qua `postMessage`. Phase đi tiếp được. Riêng chỗ host thì phải chọn lại, xem mục Tự host.

## Phiên bản

| | |
|---|---|
| Nguồn | [github.com/ranuts/document](https://github.com/ranuts/document), không có gói npm |
| Bản đã thử | tag `v0.0.9` (02/11/2026), commit `cf4e9a7f10fd8581740f453c33c01900e94dbfdf` |
| Lõi | ONLYOFFICE sdkjs + web-apps 9.3.0 (build 133), bản build offline có sẵn trong `public/sdkjs`, `public/web-apps`; bộ chuyển đổi x2t là WebAssembly lấy từ `cryptpad/onlyoffice-x2t-wasm` |
| Giấy phép | AGPL-3.0 (kèm điều khoản Section 7 của ONLYOFFICE, xem mục AGPL) |

Không phải dựng sdkjs của ONLYOFFICE: repo đã có sẵn bản biên dịch của vendor. Bước build chỉ đóng gói phần vỏ
(TypeScript + Vite) rồi chép cả cây vendor sang `dist/`.

## Dựng

Cần Node 24 và pnpm 11.4 (corepack tự lấy theo `packageManager`).

```bash
git clone --depth 1 --branch v0.0.9 https://github.com/ranuts/document.git
cd document
pnpm install --frozen-lockfile
pnpm run build          # bin/build.sh → dist/
```

- `dist/` nặng **556 MB** (`fonts/` 193 MB, `web-apps/` 146 MB, `sdkjs/` 133 MB), khoảng 2.600 tệp. Trình duyệt chỉ tải
  một phần nhỏ (mục Dung lượng), nhưng đĩa máy chủ và mỗi lần deploy phải chứa đủ.
- `dist/sdkjs/common/wasm/x2t/x2t.wasm.br` là tệp duy nhất đã nén sẵn (brotli, 6,9 MB; giải nén 42,1 MB). Máy chủ phải
  gửi nó với `Content-Encoding: br` và không nén lại. Chrome không giải brotli trên `http://` thường; kb chạy https nên
  dùng được (Dockerfile của upstream đổi sang gzip cho trường hợp http, bằng `bin/prepare-docker-wasm.mjs`).
- Thư mục `fonts/` là các tệp không đuôi: đặt `Content-Type: font/ttf` để nginx nén gzip được.

## Tự host

### Không đặt được ở `/editor/` của kb nếu không sửa mã

Mã của editor dùng đường dẫn tuyệt đối từ gốc tên miền: `/sdkjs/common/wasm/x2t/x2t.worker.js`
(`lib/onlyoffice/guards/x2t-worker.ts`), `/sw.js` và `HEAD /editor` (`lib/offline-worker-control.ts`), và service worker
chỉ nhận `/editor`, `/editor.html` là trang editor. Đã thử đặt `dist/` dưới `/editor/`:

- Không thêm gì: mở docx lỗi `X2T module failed to instantiate: worker error` (404 ở `/sdkjs/...`).
- Thêm một location `/sdkjs/` trỏ vào `dist/sdkjs/`: mở, sửa, lưu được, nhưng service worker sẽ đăng ký `/sw.js` ở gốc kb
  (kb không có tệp này, SPA fallback trả `index.html`), nên **không có offline**.

Hai cách:

| Cách | Được | Mất |
|---|---|---|
| **Tên miền riêng** cho editor (khuyên dùng), ví dụ `kb-office.hoandat.com`, nginx phục vụ `dist/` ở gốc | Dùng nguyên bản build, không sửa mã nên không phải công khai bản sửa; service worker và offline chạy như upstream (đã đo); `frame-ancestors 'none'` của kb không đụng tới editor | Thêm bản ghi DNS (một cấp dưới `hoandat.com` để chứng chỉ Cloudflare phủ được), thêm server block nginx; trang kb phải thêm `frame-src` cho tên miền đó |
| Đặt ở `/editor/` như plan | Cùng origin với kb | Phải fork, sửa ít nhất 4 chỗ đường dẫn tuyệt đối và phạm vi service worker, công khai bản fork (AGPL) và đối chiếu lại mỗi lần lên bản mới |

Thử nghiệm của spike chạy theo cách thứ nhất: trang cha và editor ở hai origin khác nhau (khác cổng, cùng site), nhắn
nhau qua `postMessage` có kiểm `origin`.

### nginx (tên miền riêng)

```nginx
root /var/www/kb-office/current;           # dist/ của ranuts/document
add_header Cache-Control "no-cache" always;
location / { try_files $uri $uri.html $uri/ =404; }
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable" always; }
location /fonts/  { types {} default_type font/ttf;
                    add_header Cache-Control "public, max-age=31536000, immutable" always; }
location = /sdkjs/common/wasm/x2t/x2t.wasm.br {
    gzip off; types {} default_type application/octet-stream;
    add_header Content-Encoding br always;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}
location = /sw.js { add_header Cache-Control "no-cache" always; }
gzip on; gzip_comp_level 6;
gzip_types text/css text/javascript application/javascript application/json image/svg+xml font/ttf application/wasm;
```

- CSP của editor nằm sẵn trong thẻ `<meta>` của `editor.html` (`script-src 'self' 'wasm-unsafe-eval'`,
  `worker-src 'self' blob:`, `frame-src 'self' blob:`). Không thêm CSP header nào chặn `wasm-unsafe-eval`. Thêm
  `frame-ancestors https://kb.hoandat.com` ở header để chỉ kb nhúng được.
- Upstream gửi `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` chỉ để chạy luồng WASM của trợ lý AI cục bộ.
  Spike chạy không có hai header này, mở/sửa/lưu đều được; kb không cần.
- Mọi URL editor tải là cùng origin. Trong cả lượt đo không có request nào ra ngoài (không CDN, không font Google);
  `static.cloudflareinsights.com` chỉ có trong CSP, không được gọi.

## Dung lượng tải lần đầu

Đo bằng Chromium headless (Playwright), bộ nhớ đệm trống, nginx gzip mức 6 và x2t gửi brotli như trên; số "trên dây"
lấy từ `$bytes_sent` của nginx. "Thô" là tổng kích thước giải nén. Hai cột cuối là ước tính khi nén toàn bộ bằng gzip-6
hoặc brotli-11 (nginx của `.65` chưa có module brotli, nên con số áp dụng là cột "trên dây").

| Mở một tệp (service worker tắt) | Request | Trên dây | Thô | Tất cả gzip-6 | Tất cả brotli-11 |
|---|---|---|---|---|---|
| docx | 95 | **16,1 MB** | 74,9 MB | 19,2 MB | 13,9 MB |
| xlsx | 80 | 15,2 MB | 74,7 MB | 18,3 MB | 13,1 MB |
| pptx (3 slide mẫu) | 93 | 17,4 MB | 76,9 MB | 20,5 MB | 15,0 MB |
| docx, service worker bật (lượt đầu tiên) | 276 | **24,2 MB** | 96,1 MB | 24,5 MB | 18,0 MB |
| docx, mở lại khi đã có cache | 35 | 8 KB (toàn 304) | | | |

Lượt đầu với service worker nặng hơn vì nó tải sẵn vỏ của cả ba trình (Word, Excel, PowerPoint) và các asset của app.

Tệp lớn nhất (lượt docx):

| Tệp | Thô | gzip-6 | brotli |
|---|---|---|---|
| `sdkjs/common/wasm/x2t/x2t.wasm.br` (bộ chuyển đổi) | 42,1 MB | 10,1 MB | **6,9 MB** (gửi thế này) |
| `sdkjs/word/sdk-all.js` (`cell/` 16,1 MB, `slide/` 14,4 MB) | 14,3 MB | **3,0 MB** | 2,2 MB |
| `sdkjs/common/libfont/engine/fonts.wasm` | 3,6 MB | 1,4 MB | 1,1 MB |
| `fonts/*` (13 tệp cho một docx Latin; tài liệu CJK cần nhiều hơn) | 4,6 MB | 2,5 MB | |
| `web-apps/apps/documenteditor/main/app.js` | 2,2 MB | 0,5 MB | 0,4 MB |
| `sdkjs/word/sdk-all-min.js` | 2,0 MB | 0,4 MB | 0,3 MB |

Thời gian mở trên máy (mạng loopback): khoảng 0,8 s tới `document:opened` khi service worker bật. Trên mạng thật, thời
gian chủ yếu là tải ~16–24 MB lượt đầu.

## Nạp và lấy file (iframe `postMessage`)

Editor có sẵn API nhúng ([`docs/embed-api.md`](https://github.com/ranuts/document/blob/v0.0.9/docs/embed-api.md) của
upstream, mã `lib/embed-api.ts`). Bật bằng `?embed=1` hoặc khi trang nằm trong iframe. Trang cha:

- nạp file: `document:open-buffer` (`ArrayBuffer`/`Uint8Array`), `document:open-file` (`File`/`Blob`) hoặc
  `document:open-url` (URL phải cho CORS; với `GET /api/files/:id` cần cookie nên trang cha tự tải rồi gửi bytes);
- lưu: `document:save` → nhận `document:saved` có `payload.file` là `File` của bản đã sửa, cùng định dạng với file mở
  (`targetExt` để đổi), và `payload.dirty` (có sửa mới trong lúc xuất thì vẫn `true`);
- theo dõi: `document:dirty-changed` (`{ dirty }`, chỉ khi cờ đổi), `document:get-state`, `document:set-readonly`,
  lỗi trả về `document:error`.

Đã chứng minh trên máy: nạp docx bằng bytes, gõ chữ vào tài liệu, gửi `document:save`, nhận `File` 25 KB, giải nén thấy
`word/document.xml` có cả đoạn cũ lẫn chữ vừa gõ; nạp lại chính bytes đó vào editor mở được. Xlsx: chữ gõ vào ô nằm trong
`xl/sharedStrings.xml` của file trả về. Pptx: lưu trả về `.pptx` hợp lệ (có `ppt/presentation.xml`).

```ts
const EDITOR_ORIGIN = 'https://kb-office.hoandat.com';
// <iframe id="office" src="${EDITOR_ORIGIN}/editor?embed=1&embedOrigin=${location.origin}">
const frame = document.querySelector<HTMLIFrameElement>('#office');
type EditorReply = { type: string; id?: string; payload?: { file?: File; dirty?: boolean; message?: string } };
const waiting = new Map<string, (reply: EditorReply) => void>();

window.addEventListener('message', (event) => {
  if (event.origin !== EDITOR_ORIGIN || event.source !== frame?.contentWindow) return;
  const reply = event.data as EditorReply;
  if (typeof reply?.type !== 'string' || !reply.type.startsWith('document:')) return;
  const resolve = reply.id ? waiting.get(reply.id) : undefined;
  if (resolve && reply.id) { waiting.delete(reply.id); resolve(reply); }
});

function send(type: string, payload: object = {}): Promise<EditorReply> {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    frame?.contentWindow?.postMessage({ id, type, payload }, EDITOR_ORIGIN);
  });
}

// Mở: trang cha tự lấy file (có cookie), gửi bytes vào editor.
const buffer = await (await fetch(`/api/files/${fileId}`)).arrayBuffer();
await send('document:open-buffer', { fileName: 'bao-cao.docx', buffer, readonly: false });

// Lưu: nhận File đã sửa, ghi IndexedDB rồi đồng bộ lên server.
const saved = await send('document:save');
const file = saved.type === 'document:saved' ? saved.payload?.file : undefined;
if (!file) throw new Error(saved.payload?.message ?? 'Lưu thất bại');
// file: .docx/.xlsx/.pptx hoàn chỉnh
```

Đợi `document:ready` trước khi gửi lệnh đầu tiên. Không dùng `file.size` để biết file có đổi không (zip có thể giữ nguyên
kích thước); dùng `document:dirty-changed`. Trong chế độ nhúng editor không tự lưu lịch sử vào IndexedDB của nó
(`lib/history/autosave.ts` bỏ qua khi `isEmbedMode()`), nên bản nháp chỉ nằm ở chỗ kb giữ.

## Offline

Editor có service worker riêng (`sw.js`) với hai cache: `document-editor-core-<build>` (vỏ app, đặt trước lúc cài) và
`document-editor-runtime-<hash vendor>` (sdkjs, web-apps, font, lấy dần khi dùng). Lượt đầu, editor chờ service worker
nhận quyền điều khiển rồi mới tải lõi, nên mọi thứ lượt đầu tải đều vào cache.

Đã thử: mở docx khi có mạng, rồi cắt mạng và tải lại iframe. Editor lên từ cache, mở docx, sửa, lưu, file trả về có chữ
vừa gõ; không request nào tới máy chủ.

Cần lo trong phase:

- Cache runtime chỉ có những gì đã dùng. Thử mở docx khi có mạng rồi mở xlsx khi offline: editor bảng tính đứng ở khung
  xám, lưu báo `Save request timed out` (thiếu `sdkjs/cell/sdk-all.js`). Muốn offline cho cả ba loại thì lúc có mạng phải
  mở trước mỗi loại một lần (ví dụ nạp một file trống ẩn) hoặc tự tải trước danh sách tệp vendor của từng loại.
- Font chỉ có những mặt chữ đã dùng; tài liệu dùng font khác khi offline sẽ thay font khác.
- Nếu trình duyệt chặn service worker (một số chế độ riêng tư), mỗi lần mở `/editor` sẽ chờ 15 s
  (`waitForAppWorkerControl`) rồi mới chạy, và không có offline.
- Cache của editor nằm ở origin của editor, tính chung hạn mức với bản nháp trong IndexedDB của kb nếu cùng site. Phần
  `navigator.storage.estimate()` của kb không thấy phần đó nếu khác origin; cộng thêm khoảng 100 MB cho editor khi tính.

## AGPL

- Giữ nguyên `LICENSE` và `NOTICE` trong `dist/` (bản build đã chép sẵn hai tệp này, phục vụ ở `/LICENSE`, `/NOTICE`).
  Không xoá phần About của editor: nó hiện bản quyền, giấy phép và link mã nguồn (`lib/onlyoffice/guards/about-source.ts`).
- Dùng nguyên bản build thì nghĩa vụ là cho người dùng lấy được đúng mã nguồn: ghi rõ tag và commit đang chạy (bản build
  tự ghi `/build-identity.json` có `revision`), link tới repo upstream.
- Sửa bất kỳ chỗ nào (kể cả để đặt ở `/editor/`) thì phải: công khai bản sửa dưới AGPL-3.0 (fork public), ghi ngày và nội
  dung sửa (Section 5a, cách upstream làm trong `NOTICE`), và đổi link mã nguồn trong About sang fork (Section 13: người
  dùng qua mạng phải lấy được mã của bản đang chạy).
- Giao diện, icon của ONLYOFFICE theo CC BY-SA 4.0; không dùng tên, logo ONLYOFFICE để quảng bá (Section 7e). Upstream đã
  bỏ logo ONLYOFFICE dựa trên quan điểm của FSF (04/2026); ONLYOFFICE không đồng ý. Kb dùng nguyên bản build thì kế thừa
  lựa chọn đó, cần chủ dự án biết.
- Trang kb chỉ nhúng editor qua iframe và nhắn tin, không trộn mã editor vào bundle của kb, nên mã kb không bị AGPL kéo
  theo. Repo kb vốn public nên không vướng.

## Rủi ro

- **Tải đầu 16–24 MB** (đã nén) cho người dùng mở Office lần đầu; mạng chậm sẽ chờ lâu. Nên chỉ nạp iframe khi người dùng
  mở một file Office, không nạp sẵn ở trang khác.
- **Bộ nhớ**: x2t khai báo 283 MB bộ nhớ ban đầu (tối đa 2 GB) theo tài liệu của upstream; máy yếu và điện thoại có thể
  không mở được file lớn.
- Dự án một người duy trì, ra bản liên tục (v0.0.6 → v0.0.9 trong 2 tháng), chưa có bản 1.0. Ghim theo commit, nâng cấp
  có chủ đích và chạy lại spike (`open-buffer` → sửa → `save` → kiểm zip) mỗi lần nâng.
- Đặt ở `/editor/` cùng origin cần fork (mục Tự host). Plan đang ghi `/editor/`; cần chủ dự án chọn giữa tên miền riêng
  và fork.
- Offline chỉ chắc với loại file đã mở khi có mạng (mục Offline).
- Spike chỉ thử file nhỏ tự tạo và mẫu pptx của vendor; chưa thử file 25 MB, file có ảnh nhiều, file CJK, Safari.
