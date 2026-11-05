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
| Tệp tải lên | `/var/lib/kb/files` (`FILES_DIR`), `kb:nginx` `2750`, tệp `0640`; nginx gửi tệp tải về qua `X-Accel-Redirect` (mục Tệp tải lên) |
| Trình sửa Office | `kb-office.hoandat.com`, bản build nguyên của ranuts/document ở `/var/www/kb-office/current`, nginx phục vụ tĩnh ([office-editor.md](office-editor.md)) |
| Trích chữ tệp tải lên | Apache Tika 2.9.3 dùng chung trên `.65` (loopback `127.0.0.1:9998`, có Tesseract `vie`/`eng`), gọi từ ngay process `kb-server`, một tệp một lúc ([text-extraction.md](text-extraction.md)) |
| Database | Postgres dùng chung trên `.65`, database `kb`, role `kb` (dòng `host kb kb 127.0.0.1/32 scram-sha-256` trong `pg_hba.conf`); migration chạy khi server khởi động |
| Đường vào | Cloudflare (bản ghi `A` `kb.hoandat.com` proxied, SSL "full") → nginx `conf.d/kb.hoandat.com.conf` (chứng chỉ origin dùng chung `/etc/pki/nginx/server.crt`) → `/api/`, `/auth/`, `/l/`, `/healthz` sang API |
| Đăng nhập | client `kb-web` trên `auth.hoandat.com` (mục Đăng nhập) |

Việc định kỳ chạy ngay trong process `kb-server` (không cần cron): dọn phiên hết hạn (lúc khởi động, rồi mỗi giờ), xoá
vĩnh viễn bài nằm trong thùng rác từ 30 ngày (lúc khởi động, rồi mỗi ngày; log `trash purge: deleted N document(s)…`,
lỗi thì `trash purge failed` và lần sau thử lại), kiểm lệch chỉ mục Meilisearch (mỗi ngày). Bài bị xoá hẳn được gỡ khỏi
chỉ mục, tệp tải lên của bài đó (mọi phiên bản) bị xoá khỏi `/var/lib/kb/files`. Job không chạy với `KB_SEED=mock`
(dev/E2E): thùng rác của seed ghi ngày theo board (03/11/2026).

Link chia sẻ mang token trong đường dẫn: trang `/l/<token>` (server render `index.html` của bản build kèm thẻ xem trước
OG, mục Link chia sẻ) và API mở link `/api/l/<token>` đều sang API, với `access_log off` và `error_log … crit`. Các
trang khác ghi log theo định dạng `kb_notoken` (chỉ `$uri`, không query string, không `Referer`); cả site gửi
`Referrer-Policy: no-referrer`. Test `apps/web/index-html.test.ts` giữ các luật log này và thứ tự location;
`apps/server/src/share/og-page.test.ts` giữ CSP server gửi cho `/l/` bằng đúng CSP của `location /`.

Các file: [`infra/nginx/kb.hoandat.com.conf`](../infra/nginx/kb.hoandat.com.conf),
[`infra/nginx/kb-office.hoandat.com.conf`](../infra/nginx/kb-office.hoandat.com.conf) (trình sửa Office),
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
| `TYPESAFE_API_KEY` | không bắt buộc: key TypeSafe cho Jev (chọn chú thích dưới pha lê ở Universe). Không đặt thì chú thích là "<số> bài" |
| `USER_KEYS_SECRET_PATH` | `/etc/kb-keys/user-keys-secret` (mục Key riêng). Không bắt buộc: không đặt, thiếu tệp hay tệp sai thì Key riêng, Copilot và dịch bằng AI tắt (503), phần còn lại vẫn chạy |
| `TIKA_URL` | không cần đặt: mặc định `http://127.0.0.1:9998` (Tika dùng chung); `http` chỉ được trên loopback |
| `FILES_DIR` | không cần đặt: mặc định `/var/lib/kb/files` (tệp tải lên, đọc để trích chữ; [text-extraction.md](text-extraction.md)) |
| `FILE_DELIVERY` | không cần đặt: production mặc định `x-accel` (nginx gửi tệp, mục Tệp tải lên); `node` chỉ dùng khi không có nginx phía trước (dev, test) |
| `OFFICE_EDITOR_ORIGIN` | không cần đặt: production mặc định `https://kb-office.hoandat.com`; phải `https` và khác origin của kb. **Phải trùng** origin trong `frame-src` của CSP ở `infra/nginx/kb.hoandat.com.conf` và `frame-ancestors` của `infra/nginx/kb-office.hoandat.com.conf`: đổi một chỗ mà không đổi chỗ kia thì khung editor bị chặn ([office-editor.md](office-editor.md)) |
| `KB_SEED` | không đặt: chỉ dùng khi dev/E2E (`mock` nạp dữ liệu mẫu lúc khởi động); production từ chối khởi động nếu có |

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

## Key riêng

Người dùng tự lưu key AI của mình (OpenAI, Gemini, Claude) ở trang Key riêng; Copilot (`POST /api/ask`) và dịch bằng
AI (`POST /api/documents/:id/translate`) chỉ chạy bằng key đó, gọi thẳng từ server ra API của nhà cung cấp (HTTPS đi
ra). Server không có biến môi trường key AI nào; Jev (`TYPESAFE_API_KEY`) là ngoại lệ duy nhất. Key được mã hoá
AES-256-GCM bằng một bí mật 32 byte nằm trong tệp riêng, ngoài database: lộ riêng database hay bản sao lưu database
không lộ key. API chỉ trả 4 ký tự cuối; key không vào log. Câu trả lời stream bằng `text/event-stream`, server gửi
`X-Accel-Buffering: no` nên nginx không cần sửa.

Server đọc tệp lúc khởi động. Thiếu tệp, khác 32 byte hay quyền rộng hơn 600 thì tính năng tắt (API trả 503
`USER_KEYS_DISABLED`) và server vẫn chạy; log khởi động ghi `own AI keys: on` hoặc lý do tắt. Service chạy bằng user
`kb` nên tệp thuộc `kb:kb`, quyền 600 (không dùng `root:kb` 640 như `production.env`: server từ chối mọi quyền của
nhóm hay người khác). Tệp nằm trong thư mục riêng `/etc/kb-keys` (`kb:kb` 700), không nằm trong `/etc/kb`: thư mục đó
là `root:root` 700 (systemd đọc `production.env` bằng root), user `kb` không vào được và server báo `EACCES` (gặp lúc
bật lần đầu, 05/11/2026).

**Lần đầu** (không ghi đè tệp đã có: tạo lại là mọi key đã lưu không giải mã được nữa; đã làm 05/11/2026):

```sh
# trên server, quyền root
install -d -o kb -g kb -m 700 /etc/kb-keys
if [ -e /etc/kb-keys/user-keys-secret ]; then
  echo "đã có tệp bí mật: giữ nguyên"
else
  (umask 077 && head -c 32 /dev/urandom > /etc/kb-keys/user-keys-secret)
  chown kb:kb /etc/kb-keys/user-keys-secret
  chmod 600 /etc/kb-keys/user-keys-secret
fi
stat -c '%U:%G %a %s' /etc/kb-keys/user-keys-secret   # kb:kb 600 32
grep -q '^USER_KEYS_SECRET_PATH=' /etc/kb/production.env || echo 'USER_KEYS_SECRET_PATH=/etc/kb-keys/user-keys-secret' >>/etc/kb/production.env
systemctl restart kb-server
journalctl -u kb-server -n 30 --no-pager | grep 'own AI keys'
```

**Sao lưu:** chép tệp bí mật ra nơi riêng, tách khỏi bản sao lưu database (thư mục env trên iCloud,
`ENV production/kb-next/user-keys-secret`; đã chép 05/11/2026, sha256 khớp bản trên server). Không in nội dung tệp ra
màn hình hay log. Mất hoặc đổi tệp thì các key đã lưu thành
`unreadable` và người dùng phải nhập lại; không có cách khôi phục từ database.

**Kiểm sau deploy:** đăng nhập rồi mở `/api/me/keys`: `available` là `true`.

**Jev và quy tắc "kho chưa có":** Copilot chỉ trả "kho chưa có" (không gọi nhà cung cấp của người dùng) khi Jev xác
nhận kho không đủ. Thiếu `TYPESAFE_API_KEY` thì Copilot chạy chế độ chỉ theo từ khoá: tìm được đoạn nào là gọi nhà
cung cấp. Production luôn đặt `TYPESAFE_API_KEY`.

**Chỉ mục có thêm `collectionId`** (lọc phạm vi Collection của Copilot ngay trong Meilisearch): sau lần deploy đầu
tiên có trường này, chạy lệnh dựng lại chỉ mục ở mục Meilisearch một lần. Chưa dựng lại thì hỏi trong phạm vi
Collection chỉ còn tìm theo nghĩa (đoạn cũ trong chỉ mục chưa có `collectionId`).

## Trích chữ tệp tải lên

Tệp tải lên (docx, xlsx, pptx, pdf, md, tối đa 25 MB) đi qua dây chuyền trích chữ trong process `kb-server`: Tika dùng
chung trên `.65` đọc chữ có sẵn và OCR trang quét bằng Tesseract `vie`, kb chấm chất lượng, chia đoạn, Jev gợi ý
Collection, rồi lập chỉ mục. Một tệp một lúc, tối đa 3 lượt, trạng thái ở bảng `extract_jobs`; khởi động lại thì chạy
tiếp các job dở. Chi tiết (thông số Tika, cách chọn trang OCR, cờ chất lượng, mã lỗi, hợp đồng cho API tải lên):
[text-extraction.md](text-extraction.md).

Log khởi động ghi `text extraction: Tika at <TIKA_URL>, files in <FILES_DIR>`. Tika không phản hồi thì API vẫn chạy:
job chờ rồi thử lại, log `extract: file <id> will retry (tika-unavailable …)`. Không restart hay đổi cấu hình Tika khi
chưa kiểm RAM trống của máy: các app khác cũng dùng nó.

## Tệp tải lên

Tải lên (C03, C16) và lưu từ trình sửa Office đi qua `POST /api/files`, `PUT /api/files/:id`: một tệp mỗi request,
ghi thẳng ra đĩa theo luồng (sha256 tính trên đường đi, không giữ cả tệp trong RAM), dừng ngay khi quá 25 MB, chỉ nhận
docx, xlsx, pptx, pdf, md và kiểm nội dung thật (đầu `%PDF-`, cấu trúc zip của OOXML, md là UTF-8 không ký tự điều
khiển; Office có mật khẩu bị từ chối với cách sửa). Tên trên đĩa là khoá ngẫu nhiên 32 ký tự, không bao giờ là tên người
dùng gửi.

| Việc | Cấu hình |
|---|---|
| Thư mục | `install -d -m 2750 -o kb -g nginx /var/lib/kb/files` (`deploy.sh setup` làm việc này): `kb` ghi, nhóm `nginx` đọc, bit setgid để tệp mới mang nhóm `nginx` |
| Tệp | `0640` (server tự đặt): chủ `kb` đọc ghi, nhóm `nginx` đọc, người khác không |
| Unit | `ReadWritePaths=/var/lib/kb/files` ([`infra/kb-server.service`](../infra/kb-server.service)): ngoài thư mục này hệ thống vẫn chỉ đọc (`ProtectSystem=strict`) |
| Tải lên | nginx `location ^~ /api/files`: `client_max_body_size 26m`, `proxy_request_buffering off` (server nhận theo luồng và cắt ở 25 MB thay vì nginx ghi tạm cả tệp) |
| Tải về | `GET /api/files/:id` kiểm quyền (người đọc khác chỉ tải được phiên bản hiện tại) rồi trả `X-Accel-Redirect: /_kb_files/<khoá>`; nginx `location ^~ /_kb_files/ { internal; alias /var/lib/kb/files/; }` gửi tệp. Gọi thẳng `/_kb_files/…` từ ngoài là 404 |

Tệp tải về qua nginx mang `Content-Type`, `Content-Disposition` (attachment), `Cache-Control` của server và
`X-Content-Type-Options: nosniff`; ETag là của nginx (server không gửi ETag ở cả hai cách gửi). SELinux trên `.65` đang
`Disabled` (kiểm 05/11/2026), nên nginx đọc được `/var/lib/kb/files` chỉ nhờ nhóm; bật SELinux về sau thì phải gắn nhãn
`httpd_sys_content_t` cho thư mục này (`semanage fcontext` + `restorecon`) trước khi bật.

Đọc PDF chạy trong worker thread riêng của mỗi job (heap tối đa 160 MB, [text-extraction.md](text-extraction.md#pdf-trong-luồng-riêng)):
bundle phải có `apps/server/dist/server/pdf-worker.mjs` cạnh `index.mjs` (`pnpm build` tạo cả hai).

Kiểm sau khi deploy: `sudo -u nginx test -r /var/lib/kb/files/<một khoá>` đúng; tải một tệp từ C11 trả 200 và log
`kb-server` không có dòng nào của request đó ngoài API. Xoá vĩnh viễn một bài trong thùng rác xoá cả các tệp của nó.

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

1. **DNS:** bản ghi `A` `kb.hoandat.com` **proxied** trỏ về `<SERVER_65_IP>` (cùng đích với các app khác trên `.65`);
   thêm `kb-office.hoandat.com` cùng kiểu cho trình sửa Office (05/11/2026, mục Trình sửa Office).
2. **RAM, cổng, đĩa:** `free -m`, `ss -ltn`, `df -h /` trước khi cài.
3. **Database:** sao lưu cả cụm trước (`sudo -u postgres pg_dumpall | gzip > /root/pg-backups/all-<stamp>.sql.gz`), rồi
   tạo role `kb` (mật khẩu ngẫu nhiên sinh trên server), `createdb -O kb kb`, thêm dòng `pg_hba.conf` cạnh các sản
   phẩm khác, `systemctl reload postgresql`. Không tạo instance Postgres mới.
4. **Env và IdP:** sinh secret `kb-web` trên server, ghi `/etc/kb/production.env`, cùng giá trị vào `KB_WEB_CLIENT_SECRET`
   (kèm `KB_WEB_URL=https://kb.hoandat.com`) trong `.env` của IdP, reload IdP; `seed-clients` phải liệt kê `kb-web`.
5. **Unit và nginx:** `SSH_TARGET=<alias> bash infra/deploy.sh setup`.
6. **Release:** `SSH_TARGET=<alias> bash infra/deploy.sh`.
7. **User CI:** `kb-deploy` và secret của repo (mục Deploy tự động).

## Link chia sẻ

Tác giả hay quản trị tạo link cho bài đã duyệt và đang hiện (C18, chi tiết API ở [admin-api.md](admin-api.md#link-chia-sẻ)).
Database chỉ giữ sha256 của token và 4 ký tự cuối; token không bao giờ vào log của server hay nginx.

- `GET /l/<token>`: route của server (`apps/server/src/share/og-page.ts`) đọc `apps/web/dist/index.html` của chính bản
  release (production đọc một lần, release mới khởi động lại server) rồi thêm `og:title` (tiêu đề bài, chỉ khi link còn
  chạy và bài công khai), `og:image` = `https://kb.hoandat.com/og-share.png` (ảnh `ill-doc-planet`, 1200 × 630, nằm
  trong `apps/web/public`), `noindex`, `Cache-Control: no-store`. Link sai, hết hạn, đã thu hồi hay bài đã bị ẩn đều
  nhận đúng trang chung của app, không lộ tiêu đề; đường dẫn khác dưới `/l/` nhận trang đó với mã 404. Lấy trang xem
  trước không tính là lượt mở. Trang gửi cùng CSP và `Permissions-Policy` như `location /`; tối đa 120 lần mỗi phút mỗi IP.
- `GET /api/l/<token>`: mở link (web H02), ghi lượt mở (giờ và tài khoản, khách thì trống); giới hạn 60 lần mỗi phút
  mỗi IP. Lượt mở cũ hơn 90 ngày bị xoá trong việc dọn hằng giờ.

**Khi deploy bản có link chia sẻ** (thay đổi nginx: `location ~ ^/(api/)?l/` thay cho `location ^~ /l/` cũ): deploy
code trước (migration `0014` chạy khi server khởi động), rồi mới chép `infra/nginx/kb.hoandat.com.conf` lên
`/etc/nginx/conf.d/` và `nginx -t && systemctl reload nginx`. Làm ngược lại thì `/l/` tới server cũ chưa có route,
trả 404. Kiểm tra: `curl -sS https://kb.hoandat.com/l/xxxx | grep -c 'name="robots" content="noindex"'` ra `1`, và
`grep -c '/l/' /var/log/nginx/kb.hoandat.com.access.log` không tăng sau khi mở một link.

## Trình sửa Office

Một lần (và mỗi lần nâng bản editor), theo [office-editor.md](office-editor.md#triển-khai-editor):

1. DNS `kb-office.hoandat.com` (proxied, như trên).
2. Dựng bản build ở tag và commit đã ghim, `rsync` `dist/` sang `/var/www/kb-office/releases/<tag>/`, trỏ
   `/var/www/kb-office/current` vào đó.
3. Chép [`infra/nginx/kb-office.hoandat.com.conf`](../infra/nginx/kb-office.hoandat.com.conf) vào
   `/etc/nginx/conf.d/`, `nginx -t`, reload (`deploy.sh setup` chỉ cài site của kb).
4. Site của kb (`deploy.sh setup`) đã có `frame-src https://kb-office.hoandat.com` trong CSP.

Kiểm: mở một docx ở C11, bấm "Mở để sửa", sửa, "Lưu" thì C17 có phiên bản mới; tắt mạng, sửa, lưu (báo "Đã lưu trên
máy"), bật mạng thì bản đó lên server (H04 `/sync` hết hàng chờ).

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
