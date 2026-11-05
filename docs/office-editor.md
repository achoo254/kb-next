# Trình sửa Office (ranuts/document)

Kết quả spike bước 1 của phase 10, chạy ngày 05/11/2026: dựng ranuts/document, đo dung lượng tải đầu, thử lấy nội dung
đã sửa từ iframe. Cả hai câu hỏi đều có câu trả lời là **được**: trang cha nạp file bằng bytes và nhận lại bytes của file
đã sửa qua `postMessage`. Phase đi tiếp được. Chỗ host đã chốt là tên miền riêng (mục Tự host); cách KnowFlow dùng
editor ở mục Trong KnowFlow.

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

**Chủ dự án chốt 05/11/2026: editor ở tên miền riêng `kb-office.hoandat.com`, dùng nguyên bản build** (không fork, không
đặt dưới `/editor/` của kb). Lý do ở mục con dưới; origin của editor là cấu hình `OFFICE_EDITOR_ORIGIN` của server
(mục Trong KnowFlow).

### Vì sao không đặt ở `/editor/` của kb

Mã của editor dùng đường dẫn tuyệt đối từ gốc tên miền: `/sdkjs/common/wasm/x2t/x2t.worker.js`
(`lib/onlyoffice/guards/x2t-worker.ts`), `/sw.js` và `HEAD /editor` (`lib/offline-worker-control.ts`), và service worker
chỉ nhận `/editor`, `/editor.html` là trang editor. Đã thử đặt `dist/` dưới `/editor/`:

- Không thêm gì: mở docx lỗi `X2T module failed to instantiate: worker error` (404 ở `/sdkjs/...`).
- Thêm một location `/sdkjs/` trỏ vào `dist/sdkjs/`: mở, sửa, lưu được, nhưng service worker sẽ đăng ký `/sw.js` ở gốc kb
  (kb không có tệp này, SPA fallback trả `index.html`), nên **không có offline**.

Đặt ở `/editor/` thì phải fork, sửa ít nhất 4 chỗ đường dẫn tuyệt đối và phạm vi service worker, công khai bản fork (AGPL)
và đối chiếu lại mỗi lần lên bản mới. Tên miền riêng dùng nguyên bản build, service worker và offline chạy như upstream,
`frame-ancestors 'none'` của kb không đụng tới editor; đổi lại cần một bản ghi DNS và một server block nginx, và CSP của kb
thêm `frame-src` cho tên miền đó.

### nginx và DNS

- Server block: [`infra/nginx/kb-office.hoandat.com.conf`](../infra/nginx/kb-office.hoandat.com.conf) (gốc
  `/var/www/kb-office/current` là `dist/` của bản build; `x2t.wasm.br` gửi kèm `Content-Encoding: br` và không nén lại;
  `fonts/` là `font/ttf`; `sw.js` không cache). `deploy.sh setup` không cài tệp này: chép tay vào
  `/etc/nginx/conf.d/`, `nginx -t`, reload (mục Triển khai editor).
- Chỉ kb nhúng được: header `Content-Security-Policy: frame-ancestors 'self' https://kb.hoandat.com` (`'self'` vì editor tự nhúng khung con cùng origin của nó). CSP của chính editor nằm
  sẵn trong thẻ `<meta>` của `editor.html` (`script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self' blob:`,
  `frame-src 'self' blob:`); không thêm CSP header nào chặn `wasm-unsafe-eval`.
- CSP của kb ([`infra/nginx/kb.hoandat.com.conf`](../infra/nginx/kb.hoandat.com.conf)) có
  `frame-src https://kb-office.hoandat.com`. Đổi tên miền editor thì đổi cùng lúc ở đó, ở `OFFICE_EDITOR_ORIGIN` và ở
  `frame-ancestors` của editor.
- DNS: bản ghi `A` `kb-office.hoandat.com` **proxied** trỏ về `<SERVER_65_IP>` (một cấp dưới `hoandat.com`, chứng chỉ
  Cloudflare phủ được; nginx dùng chứng chỉ origin chung).
- Upstream gửi `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` chỉ để chạy luồng WASM của trợ lý AI cục bộ.
  Spike chạy không có hai header này, mở/sửa/lưu đều được; kb không cần.
- Mọi URL editor tải là cùng origin. Trong cả lượt đo không có request nào ra ngoài (không CDN, không font Google);
  `static.cloudflareinsights.com` chỉ có trong CSP, không được gọi.

### Triển khai editor

Trên máy build (Node 24, pnpm 11.4), theo tag và commit ở mục Phiên bản:

```bash
git clone --depth 1 --branch v0.0.9 https://github.com/ranuts/document.git && cd document
git rev-parse HEAD          # phải là cf4e9a7f10fd8581740f453c33c01900e94dbfdf
pnpm install --frozen-lockfile && pnpm run build
rsync -rlz --delete dist/ <alias>:/var/www/kb-office/releases/v0.0.9/
ssh <alias> 'ln -sfn /var/www/kb-office/releases/v0.0.9 /var/www/kb-office/current'
```

`dist/` khoảng 556 MB; giữ bản trước để quay lại bằng cách trỏ `current` về nó. Nâng bản: chạy lại spike
(`open-buffer` → sửa → `save` → kiểm zip) trước khi trỏ `current` sang bản mới.


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

## Trong KnowFlow

Phase 10 dùng editor như sau (mã ở [`apps/web/src/pages/office-view.tsx`](../apps/web/src/pages/office-view.tsx),
[`office-editor-bridge.ts`](../apps/web/src/pages/office-editor-bridge.ts), [`office-store.ts`](../apps/web/src/pages/office-store.ts),
[`office-sync.ts`](../apps/web/src/pages/office-sync.ts)):

- **Cấu hình**: `OFFICE_EDITOR_ORIGIN` của server (production mặc định `https://kb-office.hoandat.com`; dev và test không
  đặt thì không có editor, tệp Office chỉ đọc phần chữ đã trích). Phải là `https` (dev được `http` trên loopback) và khác
  origin của kb. Web đọc nó qua `GET /api/office-editor` (`{origin, maxBytes}`).
- **Nhúng**: trong C11, tệp docx, xlsx, pptx có thẻ tệp và nút "Mở để sửa" (hay "Mở xem" khi người đọc không sửa được).
  Iframe chỉ nạp khi bấm (tải đầu 16–24 MB), `src` là `<origin>/editor?embed=1&embedOrigin=<origin của kb>`. PDF và md
  chỉ đọc phần chữ.
- **Kiểm origin**: trang chỉ đọc tin nhắn có `event.origin` đúng bằng origin của editor **và** `event.source` là đúng
  cửa sổ của iframe; mọi tin khác trên kênh `message` bị bỏ. Trang gửi lệnh bằng `postMessage(…, origin của editor)`,
  không bao giờ `'*'`.
- **Mở**: bản nháp chưa đồng bộ trên máy (nếu có) được mở trước; không thì tải `GET /api/files/:id` (có cookie) rồi gửi
  bytes bằng `document:open-buffer` sau `document:ready`, đồng thời giữ một bản trên máy để mở lại khi offline.
- **Theo tài khoản**: mỗi bản trên máy thuộc tài khoản đã lưu nó (khoá `<id tài khoản>|<id tài liệu>`, id lấy từ
  `GET /api/session`, nhớ trong trình duyệt để mở và liệt kê được khi offline; đăng xuất thì quên). Tài khoản khác đăng
  nhập trên cùng trình duyệt không thấy, không mở, không gửi bản của người kia; bản đó nằm yên tới khi chủ của nó quay lại.
  Phiên hết hạn (401) thì việc gửi tạm dừng, không bản nào bị đánh dấu lỗi; đăng nhập lại là gửi tiếp.
- **Một lượt đồng bộ một lúc**, kể cả giữa các tab (Web Locks; trình duyệt không có thì một lượt mỗi tab). Mỗi lần lưu
  tăng `revision` của bản; gửi xong, bản chỉ thành "đã đồng bộ" nếu vẫn là revision đã gửi (cùng một transaction đọc và
  ghi). Lưu thêm trong lúc gửi thì bản vẫn là bản nháp, dựa trên phiên bản server vừa tạo, và lên ở lượt sau.
- **Lưu**: `document:save` → `document:saved` (`payload.file`) → ghi IndexedDB `kb-office` (bản nháp không bao giờ bị
  xoá trước khi server có) → có mạng thì `PUT /api/files/:id` (`:id` là tệp bản nháp mở từ đó) thành phiên bản mới, server
  trích chữ lại. Server có bản mới hơn thì trả 409 kèm phiên bản hiện tại; bản nháp thành "xung đột" và H04 (`/sync`) cho
  chọn giữ bản này, bản kia hoặc cả hai (bản trên máy thành tài liệu mới "… (bản offline).docx"), hai bản đặt cạnh nhau ở
  đoạn đầu tiên khác nhau (trang tự đọc chữ docx, xlsx, pptx).
- **Hạn mức**: lúc giữ bản đầu tiên gọi `navigator.storage.persist()`; chỉ dùng tới 80% hạn mức
  `navigator.storage.estimate()` trừ 100 MB để dành cache của editor (khác origin, `estimate()` không thấy); đầy thì xoá
  bản đã đồng bộ ít dùng nhất trước (mỗi bản được kiểm lại ngay trong transaction xoá nó: bản vừa thành bản nháp ở tab
  khác thì giữ), không bao giờ xoá bản nháp; quá 90% phần được dùng thì H04 cảnh báo. Khi so hai bản ở H04, mỗi phần
  của tệp chỉ được giải nén tối đa 2 MB.
- **Offline của editor**: chỉ chắc với loại tệp đã mở ít nhất một lần khi có mạng (mục Offline). Không làm bước "mở ẩn
  để làm nóng" (cần một tệp trống mỗi loại và tải thêm 16–24 MB mỗi loại); thay vào đó trình duyệt nhớ loại nào đã mở
  khi có mạng, và H04 ghi rõ giới hạn này kèm các loại đã sẵn sàng.

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
- Tên miền riêng đã chốt (05/11/2026): thêm một bản ghi DNS và một server block phải giữ khớp với CSP của kb.
- Offline chỉ chắc với loại file đã mở khi có mạng (mục Offline).
- Spike chỉ thử file nhỏ tự tạo và mẫu pptx của vendor; chưa thử file 25 MB, file có ảnh nhiều, file CJK, Safari.

## Ghi nhận khi nghiệm thu trên prod (05/11/2026)

- Lần đầu nhúng, khung editor trống với biểu tượng "bị chặn": editor tự nhúng khung con cùng origin, nên
  `frame-ancestors` phải có `'self'`. Trình duyệt đã mở editor trước khi sửa header giữ bản cũ trong cache của
  service worker; xoá dữ liệu site `kb-office.hoandat.com` (hoặc đợi service worker cập nhật) là hết.
- Docx tạo bằng python-docx (theme có font Đông Á để trống) hiện dòng tiêu đề thành ký tự rác trong editor; thân bài
  hiển thị và lưu đúng. Chưa gặp với file Word thật; gặp thì báo upstream kèm file mẫu.
