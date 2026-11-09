# Knowledge Base

Thư mục repo: `kb-next` (tên hiển thị lấy từ [`brand.config.json`](brand.config.json), không có hậu tố `-next`).
Chạy tại `https://kb.hoandat.com`, thuộc hệ sinh thái hoandat.com.

Knowledge base công khai, song ngữ Anh – Việt về đủ mọi chủ đề (công việc, đời sống, học tập, công nghệ…), xếp thành một
"Universe" để đọc, tìm và hỏi AI. kb tự giữ nội dung trong database: bài chính thức sửa bằng trình soạn hoặc API quản trị ([`docs/admin-api.md`](docs/admin-api.md)); về sau AI tìm và bổ sung nội dung từ web. Giao diện bám sát bộ mock Universe đã chốt (51 board trong [`design/`](design)).

**Trạng thái:** nền móng. Đăng nhập bằng tài khoản hoandat.com chạy được (kể cả đăng xuất từ IdP), mọi route đã có
và hiện nền Universe kèm mã board; nội dung các màn được dựng dần theo mock.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| [`apps/web`](apps/web) | `@kb/web`: React 19 + Vite, i18n vi/en (cookie `hd_lang` dùng chung của hệ sinh thái), font Space Grotesk + Inter tự host, nền Universe, bộ kiểm giống mock (Playwright project `parity`) |
| [`apps/server`](apps/server) | `@kb/server`: Express 5 + drizzle + Postgres (PGlite khi dev/test). Đăng nhập BFF qua auth-next (client `kb-web`, máy dev dùng `kb-web-dev`), phiên riêng (bảng `users`, `sessions`), back-channel logout của IdP, kiểm Origin, helmet, giới hạn tần suất, `/healthz`. Dữ liệu nội dung (Space, bộ sưu tập, tài liệu, đoạn, liên kết…) trong `src/db/schema.ts`; mọi lượt đọc tài liệu, đoạn, liên kết và tìm kiếm đi qua `src/access/` (quy tắc quyền đặt ở một chỗ); viết bài: tạo, sửa (tự lưu, gộp phiên bản trong 2 phút), thùng rác 30 ngày (tự xoá hẳn hằng ngày, `src/authoring/trash-purge.ts`; xoá hẳn sớm theo ý người dùng), yêu thích, Space riêng và Collection (`src/api/authoring-routes.ts`, `my-content-routes.ts`), lịch sử và so sánh phiên bản (`src/api/history-routes.ts`); Graph của Space và cạnh "liên quan" (`src/api/graph-routes.ts`), Canvas của từng người (`src/api/canvas-routes.ts`), Jev chỉ gợi ý, người dùng bấm mới nối; lối đi tri thức (C07 dựng, Flow chạy: `src/api/journey-routes.ts`): lối đi là tài liệu loại `journey` nên tác giả đăng như mọi bài, các bước ở `journey_steps`, tiến độ từng người ở `journey_progress` (bước xong khi bấm "Xong" hoặc đọc hết tài liệu của bước), Jev gợi ý bước tiếp bằng `choice` trong các tài liệu cùng Space; chỉ mục Meilisearch `kb_public`/`kb_private` có trường Telex `tx` để phân biệt dấu (`src/search/`) |
| [`design`](design) | Mock đã chốt: mã nguồn board (`mock/*.dc.html`, `canvas.json`), ảnh chuẩn từng board (`mock-png/`, dùng cho kiểm giống mock), bộ phong cách bắt buộc `KIT-universe-style.txt`, bảng ánh xạ ảnh `blob-map.json` |
| [`brand`](brand) | Biểu tượng vector (logo của mock) và các file sinh từ nó (`pnpm brand:gen`) |
| [`scripts`](scripts) | `brand-gen`, `check-tokens` (màu chỉ ở `tokens.css`, tương phản WCAG AA cả Tối lẫn Sáng), `check-public-info` (không lộ địa chỉ máy chủ, cổng SSH), `meili-dev` + `meili-binary` (Meilisearch cho dev và test) |

Route của web và board tương ứng: [`apps/web/src/routes.ts`](apps/web/src/routes.ts). Đọc không cần tài khoản (chủ dự
án chốt 07/11/2026): khách mở được Universe `/u` (C09), Space `/s/<slug>` (C10), bài `/d/<id>` (C11), tìm kiếm (C12) và
Graph (C13), cùng trang `/spaces` (mọi hệ, hệ có bài mới nhất trước; quỹ đạo Universe chỉ hiện vài hệ sôi động nhất), thấy mọi bài công khai (đã đăng, không ẩn); bài công khai hay riêng tư do người đăng chọn, quản trị quản
lý mọi bài. Viết, lưu, yêu thích, bình luận, hỏi AI, cài đặt và trạm quản trị cần đăng nhập; khách thấy nút "Đăng
nhập" ở thanh trên, đăng nhập xong quay về đúng trang. `/sitemap.xml` do server dựng từ các Space và bài công khai.
Ngoài app còn trang giới thiệu `/` (S01), `/login` (S02), link chia sẻ `/l/<token>` (H02), trang lỗi (X02) và hai trang
pháp lý song ngữ không có board: `/privacy` (quyền riêng tư: câu hỏi AI đi tới nhà cung cấp người dùng chọn bằng key riêng,
Jev xử lý tìm kiếm phía server, cookie, link chia sẻ, sao lưu, cách xoá dữ liệu) và `/terms` (điều khoản sử dụng).
Chữ ở [`apps/web/src/pages/legal-docs.ts`](apps/web/src/pages/legal-docs.ts); mọi thời hạn lưu giữ in từ
[`apps/server/src/retention.ts`](apps/server/src/retention.ts), cùng hằng số server dùng. Đổi cách app giữ hay gửi dữ
liệu thì sửa trang này cùng lúc. Link tới hai trang ở chân landing, trang đăng nhập, H02 và H03.

Ảnh AI trong `apps/web/public/art/`: xem [`CREDITS.md`](CREDITS.md). Deploy: [`docs/deployment-guide.md`](docs/deployment-guide.md).
Kiểm giống mock: [`docs/parity-testing.md`](docs/parity-testing.md); chỗ buộc phải khác mock: [`docs/mock-deviations.md`](docs/mock-deviations.md).
Trình soạn bài (C02, TipTap, Markdown, tự lưu và offline, tài liệu từ mẫu): [`docs/editor.md`](docs/editor.md).
Trích chữ và OCR tệp tải lên (Tika, chọn trang OCR, cờ chất lượng, hàng đợi): [`docs/text-extraction.md`](docs/text-extraction.md).
Tải tệp, Trung tâm nhập, trình sửa Office nhúng và đồng bộ offline (C03, C16, H04, ranuts/document ở tên miền riêng):
[`docs/office-editor.md`](docs/office-editor.md).
Xuất bản (tác giả tự đăng công khai hay giữ riêng tư, không qua duyệt), link chia sẻ, quản lý bài của quản trị,
thông báo, API đăng bài bằng token quản trị (C04–C06, C18, H02, C20, A02–A03):
[`docs/admin-api.md`](docs/admin-api.md).
Trình bày (C21, `/d/<id>/present`): mọi bài mở được thành bộ slide dọc kiểu Stories, chiếu 16:9 trên màn ngang, ai đọc
được bài thì xem được slide. Slide cắt lúc mở từ các phần `##` của bản mới nhất, giữ toàn văn
([`present-slides.ts`](apps/web/src/pages/present-slides.ts)); khối `> [!TLDR]` đầu bài thành slide 2, sau đó là mục lục.
Phím ←/→, T (mục lục), F (toàn màn hình), N (màn người nói: đoạn gốc, slide kế, đồng hồ; đồng bộ hai cửa sổ cùng trình
duyệt bằng `BroadcastChannel`), `#n` là slide đang xem. Mỗi lượt xem gửi một beacon (slide xa nhất, tổng số slide, không
ghi người xem) vào bảng `present_views`, giữ 180 ngày; số liệu ở `GET /api/admin/stats/present`
([`docs/admin-api.md`](docs/admin-api.md)).
Cài đặt cá nhân và workspace, vai trò (Quản trị, Thành viên), mời bằng link, nhật ký kiểm toán, giao diện
Sáng/Tối, xoá dữ liệu của tôi (H03, C19): [`docs/settings-and-roles.md`](docs/settings-and-roles.md).
Tablet và điện thoại: tablet (641–1279px) dựng Universe và reader trên board 1180×820 (T01, T02: 3D nhẹ, mục lục
dạng ngăn kéo); điện thoại (đến 640px) có bố cục riêng, chỉ 2D, thanh pill dưới thay lens rail cho Universe, tạo bài,
đăng bài, Copilot, reader và tìm kiếm (Mobile, M02–M06), kể cả trình soạn, các bước đăng bài, trình dựng và chạy lối đi; không có Canvas,
Graph chỉ xem, tệp Office chỉ tải lên và đọc:
[`docs/board-frame.md`](docs/board-frame.md#tablet-và-điện-thoại).
Chuyển màn trong app không tải lại trang (khung app giữ nguyên, thanh tiến trình, prefetch, Back/Forward):
[`docs/navigation.md`](docs/navigation.md).

## Chạy

Cần Node và pnpm theo `engines`, `packageManager` trong [`package.json`](package.json).

```sh
pnpm install
pnpm dev          # API ở 127.0.0.1:5320 (PGlite trong .data/), web ở http://localhost:5321
```

Tìm kiếm và dữ liệu mẫu khi dev (máy dev không có Docker):

```sh
pnpm meili        # Meilisearch bản ghim ở 127.0.0.1:5322, dữ liệu trong .data/meili/data (Ctrl-C để dừng)
pnpm seed         # 7 Space của board C09/C10 + tài liệu, rồi dựng chỉ mục nếu có MEILI_URL
pnpm reindex      # dựng lại kb_public và kb_private từ database (khi chỉ mục lệch hoặc bị xoá)
```

Lần đầu `pnpm meili` tải binary Meilisearch (khoảng 350 MB) vào `.data/meili/` và chỉ giữ khi sha256 khớp giá trị
ghim trong [`scripts/meili-binary.ts`](scripts/meili-binary.ts). Server đọc `MEILI_URL`, `MEILI_MASTER_KEY` từ file env
(mẫu trong [`.env.example`](.env.example), khoá dev mặc định khớp với `pnpm meili`); không đặt thì server vẫn chạy, chỉ
tắt đồng bộ chỉ mục. Muốn Space "Vũ trụ của bạn" và các bài riêng tư thuộc tài khoản dev của mình: chạy
`SEED_OWNER_SUB=<sub của bạn> pnpm seed`. Quản trị gốc: `ADMIN_SUBS` (danh sách `sub`, cách nhau bằng dấu phẩy); quản trị khác cấp ở C19.

Đăng nhập khi dev: chép [`.env.example`](.env.example) thành file env của `apps/server`, đặt `AUTH_CLIENT_ID=kb-web-dev`
và `AUTH_CLIENT_SECRET` (lấy từ thư mục env ngoài repo). Không đặt thì app vẫn chạy, các trang cần đăng nhập dừng ở
`/login` với thông báo "đăng nhập chưa mở".

## Kiểm tra

```sh
pnpm lint        # eslint + check:brand + check:tokens + check:public
pnpm typecheck
pnpm test        # vitest: server (PGlite, IdP giả, Meilisearch thật), web (jsdom), script
pnpm e2e         # Playwright: luồng đăng nhập/đăng xuất (project chromium) và kiểm giống mock (project parity)
pnpm build       # web (vite) + bundle server (esbuild)
pnpm brand:gen   # sau khi đổi biểu tượng, màu hay brand.config.json
```

Test tìm kiếm chạy trên Meilisearch thật: mỗi file test tự bật một bản từ binary đã ghim (cổng ngẫu nhiên, dữ liệu
tạm, tự tắt khi xong; thiếu binary thì tự tải và kiểm sha256), hoặc dùng `MEILI_URL` khi có (CI dùng service
container cùng phiên bản).

Máy dev dùng chung: không chạy hai việc nặng (test, build, install) cùng lúc.
