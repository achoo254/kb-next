# Triển khai KnowFlow (`kb.hoandat.com`)

Runbook deploy của repo này. Chạy trên production từ 04/11/2026. Quy tắc chung của hệ sinh thái (tên, IdP, brand, box
`.65` dùng chung): `docs/ecosystem-architecture.md` của workspace `hoandat-app`. Repo public: không ghi IP, cổng SSH
hay user máy chủ vào đây; dùng alias SSH (`SSH_TARGET`) và placeholder như `<SERVER_65_IP>`, `<SSH_PORT>`.
`pnpm check:public` (trong `pnpm lint`) chặn địa chỉ IP và cổng SSH viết ra trong repo.

## Kiến trúc chạy

| Phần | Ở đâu |
|---|---|
| Web (React + Vite, tĩnh) | `/var/www/kb/current/apps/web/dist`, nginx phục vụ trực tiếp |
| API (Node, Express 5, một file bundle) | systemd `kb-server`, loopback `127.0.0.1:5320`, Node 22 ở `/opt/node22`, `MemoryHigh=300M`, `MemoryMax=400M` |
| Tìm kiếm | Meilisearch riêng của kb, container Docker `kb-meili` (bản ghim `v1.56.1`), loopback `127.0.0.1:5322`, `--memory=512m`, dữ liệu `/var/lib/kb/meili` (mục Meilisearch) |
| Database | Postgres dùng chung trên `.65`, database `kb`, role `kb` (dòng `host kb kb 127.0.0.1/32 scram-sha-256` trong `pg_hba.conf`); migration chạy khi server khởi động |
| Đường vào | Cloudflare (bản ghi `A` `kb.hoandat.com` proxied, SSL "full") → nginx `conf.d/kb.hoandat.com.conf` (chứng chỉ origin dùng chung `/etc/pki/nginx/server.crt`) → `/api/`, `/auth/`, `/healthz` sang API |
| Đăng nhập | client `kb-web` trên `auth.hoandat.com` (mục Đăng nhập) |

Link chia sẻ `/l/<token>` mang token trong đường dẫn: nginx phục vụ trang web cho nó như mọi trang nhưng `access_log off`
và `error_log … crit`. Các trang khác ghi log theo định dạng `kb_notoken` (chỉ `$uri`, không query string, không
`Referer`); cả site gửi `Referrer-Policy: no-referrer`. Test `apps/web/index-html.test.ts` giữ CSP của `/l/` và `/` như
nhau và giữ các luật log này.

Các file: [`infra/nginx/kb.hoandat.com.conf`](../infra/nginx/kb.hoandat.com.conf),
[`infra/kb-server.service`](../infra/kb-server.service), [`infra/deploy.sh`](../infra/deploy.sh),
[`infra/activate-incoming.sh`](../infra/activate-incoming.sh), [`infra/setup-deploy-user.sh`](../infra/setup-deploy-user.sh),
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

## Cổng

| Phần | Dev (máy dev) | Production (`.65`, loopback) |
|---|---|---|
| API `@kb/server` | `127.0.0.1:5320` | `127.0.0.1:5320` |
| Web `@kb/web` (Vite) | `http://localhost:5321` | nginx phục vụ tĩnh, không cổng riêng |
| Meilisearch | `127.0.0.1:5322` (`pnpm meili`; test: cổng ngẫu nhiên) | `127.0.0.1:5322` → cổng 7700 trong container `kb-meili` |
| IdP giả của E2E | `127.0.0.1:5325` | — |

Cổng `5320` đã kiểm còn trống trên `.65` ngày 04/11/2026 (`5300` của `truyen-server`, `5310` của `lockin-server`). Đổi
cổng thì đổi cùng lúc ở `infra/nginx/kb.hoandat.com.conf`, `infra/activate-incoming.sh` (`PORT`), `PORT` của env
production, `apps/server/src/config.ts` (mặc định), `apps/web/vite.config.ts` (proxy dev), `apps/web/e2e/e2e-env.ts` và
mục này.

## Đăng nhập

| Client trên `auth.hoandat.com` | Dùng ở | Callback | Back-channel logout |
|---|---|---|---|
| `kb-web` (confidential, BFF) | production | `https://kb.hoandat.com/auth/callback` | `https://kb.hoandat.com/auth/backchannel-logout` |
| `kb-web-dev` (confidential, loopback) | máy dev | `http://localhost:5321/auth/callback` | không (IdP không gọi được máy dev) |

Cả hai đã bật trên IdP (04/11/2026; biến `KB_WEB_*` và `KB_WEB_DEV_*` trong `.env` của IdP, mục "Client của KnowFlow"
trong runbook của `auth-next`). Scope `openid profile email`. Khi người dùng đăng xuất ở IdP, IdP gửi logout token (ký
ES256) tới `/auth/backchannel-logout`; server kiểm chữ ký bằng JWKS của IdP rồi xoá các phiên đăng nhập từ đúng phiên IdP
đó (`sessions.idp_sid`), hoặc mọi phiên của tài khoản khi token không có `sid`. Route này nằm trước bước kiểm Origin.

## Biến môi trường

Mẫu: [`.env.example`](../.env.example). Trên server: `/etc/kb/production.env` (`root:kb`, 640). Bản sao ở thư mục env
trên iCloud (`ENV production/kb-next/`), không bao giờ trong repo. Env dev của máy: bản development trong cùng thư mục,
chép thành file env của `apps/server`.

| Biến | Production |
|---|---|
| `NODE_ENV` | `production` (bắt buộc có `DATABASE_URL`, `AUTH_CLIENT_SECRET`, `MEILI_URL`, `MEILI_MASTER_KEY`, `PUBLIC_URL` https) |
| `PORT` | `5320` |
| `PUBLIC_URL` | `https://kb.hoandat.com` |
| `DATABASE_URL` | `postgres://kb:<mật khẩu>@127.0.0.1:5432/kb` |
| `AUTH_ISSUER` | `https://auth.hoandat.com` |
| `AUTH_CLIENT_ID` | `kb-web` |
| `AUTH_CLIENT_SECRET` | secret của client `kb-web`, cùng giá trị với `KB_WEB_CLIENT_SECRET` trên IdP (≥ 32 ký tự) |
| `ADMIN_SUBS` | `sub` IdP của các quản trị, cách nhau bằng dấu phẩy (không có đường tự nâng quyền) |
| `MEILI_URL` | `http://127.0.0.1:5322` |
| `MEILI_MASTER_KEY` | khoá ngẫu nhiên sinh trên server (≥ 16 ký tự, nên `openssl rand -hex 32`); container `kb-meili` đọc cùng dòng này |
| `HOC_CLOUD_URL` | không cần đặt: lệnh nhập Học Cloud mặc định đọc `https://hoc-cloud.inetdev.io.vn` (API công khai) |

Thiếu biến bắt buộc hay sai dạng thì server từ chối khởi động, log nêu tên biến (không bao giờ in giá trị).

## Meilisearch

Chỉ mục tìm kiếm của kb: `kb_public` (đoạn của bài đã duyệt, không ẩn) và `kb_private` (đoạn của các bài còn lại,
luôn lọc theo tác giả). Postgres là nguồn chuẩn: server ghi Postgres trước rồi đẩy sang Meilisearch qua hàng đợi
trong tiến trình (lỗi thì log mã lỗi và thử lại); mỗi ngày server so số đoạn giữa hai bên và log khi lệch. Không
cần sao lưu dữ liệu Meilisearch: mất hay lệch thì dựng lại bằng `reindex` (sao lưu Postgres là đủ).

**Lần đầu** (trước khi push bản cần `MEILI_*`, vì server production từ chối khởi động khi thiếu):

```sh
# trên server, quyền root
ss -ltn | grep -q ':5322 ' && echo "5322 đang bận: chọn cổng khác và đổi ở mọi chỗ trong mục Cổng"
key=$(openssl rand -hex 32)
printf 'ADMIN_SUBS=<sub quản trị>\nMEILI_URL=http://127.0.0.1:5322\nMEILI_MASTER_KEY=%s\n' "$key" >>/etc/kb/production.env
mkdir -p /var/lib/kb/meili
docker run -d --name kb-meili --restart unless-stopped \
  --memory=512m \
  -p 127.0.0.1:5322:7700 \
  -v /var/lib/kb/meili:/meili_data \
  -e MEILI_ENV=production -e MEILI_NO_ANALYTICS=true \
  -e MEILI_MAX_INDEXING_MEMORY=256MiB -e MEILI_MAX_INDEXING_THREADS=2 \
  --env-file <(grep '^MEILI_MASTER_KEY=' /etc/kb/production.env) \
  --health-cmd 'wget -q -O /dev/null http://127.0.0.1:7700/health' \
  getmeili/meilisearch:v1.56.1@sha256:b7ba431bf6f9b26cc86132798f3640964147a699cf23f026b74c6c05dbb1d60d
curl -fsS http://127.0.0.1:5322/health
```

Kiểm tra sức khoẻ gọi `127.0.0.1`, không gọi `localhost` (Meilisearch của Học Cloud từng báo "unhealthy" vì
`localhost` đi qua IPv6). Cổng chỉ mở trên loopback; không có đường từ ngoài vào.

**Dựng lại chỉ mục** (sau lần đầu deploy, sau khi xoá chỉ mục, hay khi log báo lệch):

```sh
ssh <alias> 'systemd-run --uid=kb --gid=kb -p EnvironmentFile=/etc/kb/production.env --pipe --wait \
  /opt/node22/bin/node /var/www/kb/current/apps/server/dist/server/reindex.mjs'
```

Lệnh dựng vào chỉ mục `*_rebuild` rồi đổi chỗ một bước, nên tìm kiếm vẫn chạy trong lúc dựng.

**Nâng phiên bản:** đổi cùng lúc tag và digest ở mục này, `.github/workflows/ci.yml` và `scripts/meili-binary.ts`
(phiên bản và sha256 từng binary). Trên server: `docker rm -f kb-meili`, xoá `/var/lib/kb/meili` (dữ liệu của bản cũ
có thể không đọc được ở bản mới), chạy lại lệnh `docker run` ở trên, rồi dựng lại chỉ mục.

**RAM:** `docker stats --no-stream kb-meili` (trần 512 MB).

## Nhập nội dung Học Cloud

Lệnh nhập đọc API công khai của Học Cloud (lab, bài tập) và `content/` đi kèm bản release (trang học hàng tuần đã chỉnh,
bản dịch EN, `content/summaries.json`, cách xếp Space và Collection trong `content/hoc-cloud/curation.json`, đoạn mở đầu bước lab viết lại trong
`content/hoc-cloud/step-intros.json`), ghi qua
tầng dữ liệu trong một transaction, rồi đẩy các bài đổi sang Meilisearch. Bài nhập vào là "Chính thức", đã duyệt, tác
giả là tài khoản hệ thống `system:hoc-cloud` (không đăng nhập được). Địa chỉ máy chủ trong bài gốc được thay bằng
`<ADDR-n>` trước khi ghi. Chạy lại an toàn: bài không đổi thì không ghi, bài đổi (nguồn hay curation) thêm đúng một phiên
bản; API trả sai định dạng thì dừng trước khi ghi gì.

```sh
# trên server, sau khi sao lưu database kb
ssh <alias> 'systemd-run --uid=kb --gid=kb -p EnvironmentFile=/etc/kb/production.env --pipe --wait \
  /opt/node22/bin/node /var/www/kb/current/apps/server/dist/server/import-hoc-cloud.mjs'
```

Kết quả in số lab, bài tập, trang tuần, bản dịch đã đọc, số bài tạo, cập nhật, giữ nguyên, và cảnh báo (bài mới trên Học
Cloud chưa có trong curation, bản dịch cũ hơn bản gốc, đoạn viết lại mà Học Cloud đã sửa nguồn: khi đó hiện lại
bản gốc cho tới khi xem lại). Máy dev: `pnpm import:hoc-cloud` (PGlite dev hoặc
`DATABASE_URL`, cùng `MEILI_*` nếu có).

## Lần đầu (đã làm 04/11/2026)

1. **DNS:** bản ghi `A` `kb.hoandat.com` **proxied** trỏ về `<SERVER_65_IP>` (cùng đích với các app khác trên `.65`).
2. **RAM, cổng, đĩa:** `free -m`, `ss -ltn`, `df -h /` trước khi cài.
3. **Database:** sao lưu cả cụm trước (`sudo -u postgres pg_dumpall | gzip > /root/pg-backups/all-<stamp>.sql.gz`), rồi
   tạo role `kb` (mật khẩu ngẫu nhiên sinh trên server), `createdb -O kb kb`, thêm dòng `pg_hba.conf` cạnh các sản
   phẩm khác, `systemctl reload postgresql`. Không tạo instance Postgres mới.
4. **Env và IdP:** sinh secret `kb-web` trên server, ghi `/etc/kb/production.env`, cùng giá trị vào `KB_WEB_CLIENT_SECRET`
   (kèm `KB_WEB_URL=https://kb.hoandat.com`) trong `.env` của IdP, reload IdP; `seed-clients` phải liệt kê `kb-web`.
5. **Unit và nginx:** `SSH_TARGET=<alias> bash infra/deploy.sh setup`.
6. **Release:** `SSH_TARGET=<alias> bash infra/deploy.sh`.
7. **User CI:** `kb-deploy` và secret của repo (mục Deploy tự động).

## Deploy tự động (CI)

**Mỗi lần push lên `main` là tự deploy.** `ci` (lint, typecheck, test, build) xanh thì `deploy.yml` chạy: job `build`
(không có secret) gói `apps/web/dist`, `apps/server/dist`, `apps/server/drizzle` thành artifact; job `deploy`
(environment `production`) rsync lên `/var/www/kb/ci-incoming/<mã bản>` bằng user `kb-deploy` rồi chạy lệnh sudo duy
nhất user đó có: `sudo -n /usr/local/sbin/kb-activate-incoming <mã bản>` (bản cài của `infra/activate-incoming.sh`).
Lệnh đó kiểm bản, chuyển sang `releases/<mã bản>`, trỏ `current`, restart `kb-server`, kiểm `/healthz` và origin; hỏng
thì quay về bản trước. Cuối job kiểm từ ngoài: `/` trả 200, `/healthz` trả `ok`, `/RELEASE` đúng mã bản.

Secret của repo: `DEPLOY_SSH_KEY` (khoá riêng ed25519 của `kb-deploy`), `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`,
`DEPLOY_PORT`. Đổi khoá (khi lộ):

```sh
ssh-keygen -t ed25519 -N '' -C kb-deploy -f kb-deploy
ssh <alias> 'bash /var/www/kb/infra/setup-deploy-user.sh' < kb-deploy.pub   # ghi đè khoá cũ
gh secret set DEPLOY_SSH_KEY -R achoo254/kb-next < kb-deploy
rm kb-deploy kb-deploy.pub
```

Deploy tay khi: đổi unit hay nginx (`setup`), sửa `infra/activate-incoming.sh`, hoặc CI hỏng.

## Release tay

```sh
SSH_TARGET=<alias> [SSH_OPTS="-F <ssh_config>"] bash infra/deploy.sh
```

Script từ chối chạy khi cây làm việc còn thay đổi chưa commit, chạy `pnpm lint`, `typecheck`, `test`, `build` trên máy
dev, rồi đổi bản như CI. Giữ 5 bản gần nhất. Server không cần `pnpm install`: bundle đã gồm mọi thư viện.

Kiểm sau release: `curl -fsS https://kb.hoandat.com/healthz` trả `ok`; `/RELEASE` trả mã bản đang chạy; RAM:
`systemctl show kb-server -p MemoryCurrent` (bản đầu: khoảng 83 MB).

## Rollback

Release hỏng tự quay về bản trước. Quay về tay:

```sh
ssh <alias> 'cd /var/www/kb && ls -1dt releases/*/'
ssh <alias> 'cd /var/www/kb && ln -sfn releases/<bản trước> current && systemctl restart kb-server'
```

Gỡ hẳn: `systemctl disable --now kb-server`, xoá `/etc/nginx/conf.d/kb.hoandat.com.conf` (`nginx -t`, reload), xoá cặp
`KB_WEB_*` khỏi `.env` của IdP rồi reload IdP, xoá bản ghi DNS. Database `kb` giữ lại cho đến khi chắc chắn.
