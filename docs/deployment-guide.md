# Triển khai KnowFlow (`kb.hoandat.com`)

Chưa deploy. Tài liệu này giữ những gì đã chốt cho lúc chạy thật; runbook đầy đủ (nginx, systemd, Meilisearch, sao
lưu) viết khi dựng hạ tầng, theo khuôn `lockin-next/docs/deployment-guide.md`.

Quy tắc chung của hệ sinh thái (tên, IdP, brand, box `.65` dùng chung): `docs/ecosystem-architecture.md` của workspace
`hoandat-app`. Repo public: không ghi IP, cổng SSH hay user máy chủ vào đây; dùng alias SSH (`SSH_TARGET`) và
placeholder như `<SERVER_65_IP>`, `<SSH_PORT>`. `pnpm check:public` (trong `pnpm lint`) chặn địa chỉ IP và cổng SSH
viết ra trong repo.

## Cổng

| Phần | Dev (máy dev) | Production (`.65`, loopback) |
|---|---|---|
| API `@kb/server` | `127.0.0.1:5320` | `127.0.0.1:5320` |
| Web `@kb/web` (Vite) | `http://localhost:5321` | nginx phục vụ tĩnh, không cổng riêng |
| IdP giả của E2E | `127.0.0.1:5325` | — |

Cổng `5320` đã kiểm còn trống trên `.65` ngày 04/11/2026 (`5300` của `truyen-server`, `5310` của `lockin-server`).
Kiểm lại ngay trước khi deploy. Đổi cổng thì đổi cùng lúc ở `PORT` của env production, `apps/server/src/config.ts`
(mặc định), `apps/web/vite.config.ts` (proxy dev), `apps/web/e2e/e2e-env.ts` và mục này.

## Đăng nhập

| Client trên `auth.hoandat.com` | Dùng ở | Callback | Back-channel logout |
|---|---|---|---|
| `kb-web` (confidential, BFF) | production | `https://kb.hoandat.com/auth/callback` | `https://kb.hoandat.com/auth/backchannel-logout` |
| `kb-web-dev` (confidential, loopback) | máy dev | `http://localhost:5321/auth/callback` | không (IdP không gọi được máy dev) |

Scope `openid profile email`. Khi người dùng đăng xuất ở IdP, IdP gửi logout token (ký ES256) tới
`/auth/backchannel-logout`; server kiểm chữ ký bằng JWKS của IdP rồi xoá các phiên đăng nhập từ đúng phiên IdP đó
(`sessions.idp_sid`), hoặc mọi phiên của tài khoản khi token không có `sid`.

## Biến môi trường

Mẫu: [`.env.example`](../.env.example). Giá trị thật nằm ở thư mục env trên iCloud (`ENV production/kb-next/`), không
bao giờ trong repo.

| Biến | Production |
|---|---|
| `NODE_ENV` | `production` (bắt buộc có `DATABASE_URL`, `AUTH_CLIENT_SECRET`, `PUBLIC_URL` https) |
| `PORT` | `5320` |
| `PUBLIC_URL` | `https://kb.hoandat.com` |
| `DATABASE_URL` | `postgres://kb:<mật khẩu>@127.0.0.1:5432/kb` |
| `AUTH_ISSUER` | `https://auth.hoandat.com` |
| `AUTH_CLIENT_ID` | `kb-web` |
| `AUTH_CLIENT_SECRET` | secret của client `kb-web`, cùng giá trị với `KB_WEB_CLIENT_SECRET` trên IdP (≥ 32 ký tự) |

Thiếu biến bắt buộc hay sai dạng thì server từ chối khởi động, log nêu tên biến (không bao giờ in giá trị).
