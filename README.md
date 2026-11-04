# KnowFlow

Thư mục repo: `kb-next` (tên hiển thị lấy từ [`brand.config.json`](brand.config.json), không có hậu tố `-next`).
Chạy tại `https://kb.hoandat.com`, thuộc hệ sinh thái hoandat.com.

Knowledge base công khai, song ngữ Anh – Việt, đủ thể loại nhưng phần lớn về công nghệ thông tin, xếp thành một
"Universe" để đọc, tìm và hỏi AI. Nguồn đầu tiên là nội dung Học Cloud; về sau AI tìm và bổ sung nội dung từ web. Giao diện bám sát bộ mock Universe đã chốt (51 board trong [`design/`](design)).

**Trạng thái:** nền móng. Đăng nhập bằng tài khoản hoandat.com chạy được (kể cả đăng xuất từ IdP), mọi route đã có
và hiện nền Universe kèm mã board; nội dung các màn được dựng dần theo mock.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| [`apps/web`](apps/web) | `@kb/web`: React 19 + Vite, i18n vi/en (cookie `hd_lang` dùng chung của hệ sinh thái), font Space Grotesk + Inter tự host, nền Universe, bộ kiểm giống mock (Playwright project `parity`) |
| [`apps/server`](apps/server) | `@kb/server`: Express 5 + drizzle + Postgres (PGlite khi dev/test). Đăng nhập BFF qua auth-next (client `kb-web`, máy dev dùng `kb-web-dev`), phiên riêng (bảng `users`, `sessions`), back-channel logout của IdP, kiểm Origin, helmet, giới hạn tần suất, `/healthz`. Dữ liệu nội dung (Space, bộ sưu tập, tài liệu, đoạn, liên kết…) trong `src/db/schema.ts`; mọi lượt đọc tài liệu, đoạn, liên kết và tìm kiếm đi qua `src/access/` (quy tắc quyền đặt ở một chỗ); chỉ mục Meilisearch `kb_public`/`kb_private` có trường Telex `tx` để phân biệt dấu (`src/search/`) |
| [`design`](design) | Mock đã chốt: mã nguồn board (`mock/*.dc.html`, `canvas.json`), ảnh chuẩn từng board (`mock-png/`, dùng cho kiểm giống mock), bộ phong cách bắt buộc `KIT-universe-style.txt`, bảng ánh xạ ảnh `blob-map.json` |
| [`brand`](brand) | Biểu tượng vector (logo của mock) và các file sinh từ nó (`pnpm brand:gen`) |
| [`scripts`](scripts) | `brand-gen`, `check-tokens` (màu chỉ ở `tokens.css`, tương phản WCAG AA cả Tối lẫn Sáng), `check-public-info` (không lộ địa chỉ máy chủ, cổng SSH), `meili-dev` + `meili-binary` (Meilisearch cho dev và test) |

Route của web và board tương ứng: [`apps/web/src/routes.ts`](apps/web/src/routes.ts). Mọi trang cần đăng nhập trừ
trang giới thiệu `/` (S01), `/login` (S02), link chia sẻ `/l/<token>` (H02) và trang lỗi (X02).

Ảnh AI trong `apps/web/public/art/`: xem [`CREDITS.md`](CREDITS.md). Deploy: [`docs/deployment-guide.md`](docs/deployment-guide.md).
Kiểm giống mock: [`docs/parity-testing.md`](docs/parity-testing.md); chỗ buộc phải khác mock: [`docs/mock-deviations.md`](docs/mock-deviations.md).

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
pnpm import:hoc-cloud  # nhập lab, bài tập, trang tuần của Học Cloud theo content/hoc-cloud/curation.json
```

Lần đầu `pnpm meili` tải binary Meilisearch (khoảng 350 MB) vào `.data/meili/` và chỉ giữ khi sha256 khớp giá trị
ghim trong [`scripts/meili-binary.ts`](scripts/meili-binary.ts). Server đọc `MEILI_URL`, `MEILI_MASTER_KEY` từ file env
(mẫu trong [`.env.example`](.env.example), khoá dev mặc định khớp với `pnpm meili`); không đặt thì server vẫn chạy, chỉ
tắt đồng bộ chỉ mục. Muốn Space "Vũ trụ của bạn" và các bài riêng tư thuộc tài khoản dev của mình: chạy
`SEED_OWNER_SUB=<sub của bạn> pnpm seed`. Quản trị: `ADMIN_SUBS` (danh sách `sub`, cách nhau bằng dấu phẩy).

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
