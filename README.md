# KnowFlow

Thư mục repo: `kb-next` (tên hiển thị lấy từ [`brand.config.json`](brand.config.json), không có hậu tố `-next`).
Chạy tại `https://kb.hoandat.com`, thuộc hệ sinh thái hoandat.com.

Knowledge base công khai, song ngữ Anh – Việt: tri thức cloud, mạng, Linux và DevOps xếp thành một "Universe" để đọc,
tìm và hỏi AI. Giao diện bám sát bộ mock Universe đã chốt (51 board trong [`design/`](design)).

**Trạng thái:** nền móng. Đăng nhập bằng tài khoản hoandat.com chạy được (kể cả đăng xuất từ IdP), mọi route đã có
và hiện nền Universe kèm mã board; nội dung các màn được dựng dần theo mock.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| [`apps/web`](apps/web) | `@kb/web`: React 19 + Vite, i18n vi/en (cookie `hd_lang` dùng chung của hệ sinh thái), font Space Grotesk + Inter tự host, nền Universe, bộ kiểm giống mock (Playwright project `parity`) |
| [`apps/server`](apps/server) | `@kb/server`: Express 5 + drizzle + Postgres (PGlite khi dev/test). Đăng nhập BFF qua auth-next (client `kb-web`, máy dev dùng `kb-web-dev`), phiên riêng (bảng `users`, `sessions`), back-channel logout của IdP, kiểm Origin, helmet, giới hạn tần suất, `/healthz` |
| [`design`](design) | Mock đã chốt: mã nguồn board (`mock/*.dc.html`, `canvas.json`), ảnh chuẩn từng board (`mock-png/`, dùng cho kiểm giống mock), bộ phong cách bắt buộc `KIT-universe-style.txt`, bảng ánh xạ ảnh `blob-map.json` |
| [`brand`](brand) | Biểu tượng vector (logo của mock) và các file sinh từ nó (`pnpm brand:gen`) |
| [`scripts`](scripts) | `brand-gen`, `check-tokens` (màu chỉ ở `tokens.css`, tương phản WCAG AA cả Tối lẫn Sáng), `check-public-info` (không lộ địa chỉ máy chủ, cổng SSH) |

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

Đăng nhập khi dev: chép [`.env.example`](.env.example) thành file env của `apps/server`, đặt `AUTH_CLIENT_ID=kb-web-dev`
và `AUTH_CLIENT_SECRET` (lấy từ thư mục env ngoài repo). Không đặt thì app vẫn chạy, các trang cần đăng nhập dừng ở
`/login` với thông báo "đăng nhập chưa mở".

## Kiểm tra

```sh
pnpm lint        # eslint + check:brand + check:tokens + check:public
pnpm typecheck
pnpm test        # vitest: server (PGlite, IdP giả), web (jsdom), script
pnpm e2e         # Playwright: luồng đăng nhập/đăng xuất (project chromium) và kiểm giống mock (project parity)
pnpm build       # web (vite) + bundle server (esbuild)
pnpm brand:gen   # sau khi đổi biểu tượng, màu hay brand.config.json
```

Máy dev dùng chung: không chạy hai việc nặng (test, build, install) cùng lúc.
