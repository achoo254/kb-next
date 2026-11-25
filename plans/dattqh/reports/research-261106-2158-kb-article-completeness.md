---
title: "KnowFlow: các bài hiện có đã trọn vẹn chưa, cần bổ sung gì"
date: 2026-11-06 22:05 (Asia/Saigon)
scope: 37 tài liệu nhập từ Học Cloud (34 bài tiếng Việt + 3 bản tiếng Anh: http, dns, tcp-udp)
method: dựng lại đúng markdown kb hiển thị bằng prepareImport (HOC_CLOUD_URL mặc định, curation.json hiện tại), 5 agent đọc toàn văn theo chủ đề, tác giả báo cáo kiểm lại mẫu
---

# KnowFlow: các bài hiện có đã trọn vẹn chưa

## Kết luận

Chưa. Không bài nào hỏng hoàn toàn: 22/37 bài chỉ thiếu nhỏ, nhưng 15/37 bài thiếu lớn. Có 19 lỗi P1 khiến người đọc chỉ có kb
**không làm hết được bài**, 122 lỗi P2 (thiếu phần một bài trọn vẹn nên có) và 120 lỗi P3 (trau chuốt).

Nguyên nhân chia làm ba nhóm, và nên sửa theo thứ tự này:

1. **Lỗi do khâu nhập vào kb** (sửa một lần trong bộ import, hết ở mọi bài).
2. **Bài vẫn dựa vào app Học Cloud** (playground, ô nhập, tab Upload, file giảng viên phát, ảnh trên host Học Cloud).
3. **Nội dung sai hoặc cũ tính đến 11/2026** (lệnh không chạy, phiên bản đã hết vá).

Sau đó mới tới phần bổ sung bài mới cho trọn lộ trình (mục 5).

**Quyết định của chủ dự án (06/11/2026):** kb chỉ chép nội dung phù hợp từ Học Cloud, không ghi nguồn và không link về
Học Cloud. Học Cloud là lịch sử, không sửa gì ở đó. Mọi bản sửa làm trong kb.

Hiện kb còn 5 dấu vết Học Cloud phải gỡ:
- Dòng "Mở playground trên Học Cloud" ở 33 bài (53 link).
- `sourceUrl` của mỗi bài trỏ về trang Học Cloud.
- Tác giả hệ thống tên "Học Cloud" (`SYSTEM_NAME` trong `apps/server/src/import/hoc-cloud/prepare.ts`).
- Ô tích hợp "Học Cloud" trên màn Workspace (`ws.int.hoc-cloud`).
- 20 ảnh đặt trên host Học Cloud. Học Cloud tắt là ảnh mất, nên mục này nâng lên P1.

Lệnh `import:hoc-cloud` đang đọc API Học Cloud mỗi lần chạy, nên sửa tay trong kb sẽ bị lần nhập sau ghi đè. Vì vậy phải
chốt nguồn chuẩn mới cho 37 bài trước khi sửa nội dung (mục 7).

## Mục lục

1. [Lỗi do khâu nhập (sửa trong bộ import)](#1-lỗi-do-khâu-nhập)
2. [Bài còn dựa vào app Học Cloud](#2-bài-còn-dựa-vào-app-học-cloud)
3. [19 lỗi P1: người đọc không làm hết bài](#3-19-lỗi-p1)
4. [Nội dung cũ hoặc sai cần cập nhật (P2 tiêu biểu)](#4-nội-dung-cũ-hoặc-sai)
5. [Bài nên viết thêm cho trọn lộ trình](#5-bài-nên-viết-thêm)
6. [Bảng từng bài](#6-bảng-từng-bài)
7. [Việc tiếp theo](#7-việc-tiếp-theo)

## 1. Lỗi do khâu nhập

Đã kiểm lại trực tiếp trên bản dựng:

| Lỗi | Phạm vi | Ghi chú |
|---|---|---|
| Che địa chỉ máy chủ (`<ADDR-n>`) làm hỏng lệnh: mất cổng NodePort, dính chữ `x` (`<ADDR-1>x`), số thứ tự lệch giữa hai bài weekly, chỗ che chỗ không (`.182`) | Kubernetes (5 bài) | Bộ che nên giữ nguyên cổng, thay bằng tên máy dễ hiểu (`cp-1`, `worker-1`) thống nhất toàn kb |
| HTML entity còn trong code block (`-&gt;`, `=&gt;`) | 10 bài | Giải mã entity trước khi lưu |
| Câu dẫn mỗi bước bị cụt, chỉ còn `— ...` | Bài tập Docker Compose | Mất phần tên hành động khi ghép |
| Biến mẫu chưa thay `${DOC_INSPECT}` | docker-compose-basics | Link bấm không ra trang |
| Câu giải thích tiếng Việt nằm trong khối ```` ```bash ```` ("Quan sát bằng") | Hầu hết bài lab | Copy chạy sẽ lỗi; tách lệnh khỏi lời giải thích |
| Chữ trong ngoặc nhọn bị mất khi hiển thị (`<pod>`, `<ADDR-1>`, `<registry>` ngoài khối code) | 42 dòng | Reader bỏ HTML (`skipHtml`) nên các chữ này biến mất; đã kiểm bằng chính react-markdown của kb. Sửa bằng `\<…>` |
| nginx giới hạn thân request API 48 KB | toàn site | Trình soạn và API quản trị không lưu được bài dài hơn 48 KB (server cho 1 MB); canvas, lối đi, viết AI cũng bị chặn sớm |
| "Bài liên quan" rỗng hoặc ghi chú biên tập nội bộ lọt vào bài | dhcp | |

## 2. Bài còn dựa vào app Học Cloud

33/37 bài có link sang `hoc-cloud.inetdev.io.vn`. Theo quyết định ở trên, mọi link và lời nhắc này đều phải bỏ. Các chỗ
dưới đây khó hơn vì **bước làm cần app đó**, nên phải viết lại bằng cách khác chứ không chỉ xoá link:

- **subnet-cidr** Bước 7: "dán vào ô input playground" → thay bằng `ipcalc` hoặc script Python có sẵn trong bài, kèm output mẫu.
- **http** (vi + en) Bước 8 và bài tập 8: "tab Upload .pcap / SEE section" → hướng dẫn mở pcap bằng Wireshark/`tshark`, kèm output mẫu.
- **docker-fundamentals** Bước 1: ô "Quan sát bằng" chỉ trỏ playground, không có lệnh.
- **docker-image-build-push**: sản phẩm nộp cần `inet-web-landing.html` do giảng viên phát → nhúng một landing mẫu bằng heredoc.
- **docker-compose-basics**: nhắc "buổi học trên lớp".
- **k8s-fundamentals**: dựa vào "hình tham chiếu" không có trong bài.
- **dhcp**, **linux-boot-process**, **linux-swap**, **syslog**: ảnh chụp màn hình nằm trên host Học Cloud; nếu Học Cloud
  đổi hoặc tắt, ảnh mất. Nên chép ảnh vào kho tệp của kb khi nhập.

## 3. 19 lỗi P1

| Bài | Lỗi | Cách sửa |
|---|---|---|
| dns (vi + en) | Lệnh "bypass cache" hỏi `ns1.example.com`, không phải NS thật (NS thật hiện là `*.ns.cloudflare.com`, đã kiểm bằng `dig`) | `NS=$(dig +short NS example.com \| head -1); dig @$NS example.com A`, sửa output mẫu |
| dhcp | VM server chỉ có mạng host-only (không internet) nhưng Thực hành 2 chạy `apt install` | Cài gói khi còn ở NAT rồi mới chuyển VMnet1 |
| dhcp | Tự mâu thuẫn: systemd-networkd có gửi DHCPDECLINE hay không | Chạy lại trên Ubuntu 24.04, thống nhất một kết luận |
| docker-image-lifecycle, docker-lifecycle-immutability | `ip a` trong container nginx: image không có `iproute2` → "not found" | `hostname -i` / `cat /etc/hosts` hoặc `docker inspect` từ host |
| docker-image-build-push | Cần file giảng viên phát | Nhúng landing mẫu |
| docker-volume-bind-logging | Nghiệm thu cần Vector nhưng không có bước cài và viết `/etc/vector/vector.yaml` | Thêm bước cài + `sudo tee` cấu hình |
| docker-compose-basics | Link `${DOC_INSPECT}` | Link docs `docker inspect` |
| docker-build-run-compose | Không có `mkdir`/ghi file; JS, JSON, Dockerfile, nginx.conf, compose.yaml nhét chung khối bash | `mkdir -p ~/docker-lab/demo`, mỗi file một heredoc hoặc khối có ngôn ngữ đúng |
| victorialogs | Cài đặt không đủ: thiếu giải nén, cài binary, thư mục dữ liệu, unit systemd đầy đủ, daemon-reload | Khối cài đặt hoàn chỉnh |
| k8s-cluster-bootstrap | Thiếu khai kho apt `pkgs.k8s.io` → không cài được kubeadm | Thêm keyring + sources.list (bài weekly đã có, dùng chung) |
| k8s-cluster-bootstrap | Thiếu nạp `br_netfilter`/`overlay` và sysctl | Thêm bước modules-load + sysctl + kiểm |
| k8s-cluster-bootstrap | Deploy `hello-app.yml` nhưng không có nội dung file | Dán YAML Deployment + Service NodePort |
| weekly dựng cụm k8s | Mặc định máy đã có containerd | Thêm bước cài containerd (không gỡ docker-ce) |
| linux-login-shell-cmdlog | Bước 7/8 lệch cấu trúc, câu văn trong khối code | Sắp lại bước, tách khối RHEL |
| linux-login-shell-cmdlog | `chown syslog:syslog` trên RHEL (không có user syslog) | Chỉ áp cho Debian/Ubuntu |
| cmdlog-rsyslog | Dùng lại script mà bài kia đã chứng minh sai trên Ubuntu 24.04 | Dùng bản đã sửa, hai bài chung một khối script |
| cmdlog-rsyslog | Bước 3 không thực sự ghi khối PROMPT_COMMAND; sửa `/etc/skel` sai | `sudo tee -a /etc/bash.bashrc` (Ubuntu) / `/etc/bashrc` (RHEL) |

## 4. Nội dung cũ hoặc sai

77 lỗi loại này. Các nhóm đáng sửa nhất:

- **Phiên bản hết vá:** Kubernetes 1.31 (bootstrap + weekly) đã EOL, không cảnh báo; `nginx:1.27-alpine`, `node:20` (EOL
  30/04/2026); output mẫu Docker 27.x, builder cũ ("Successfully tagged"); gọi "Compose v2"; VictoriaLogs v1.50 và v1.52
  lệch nhau giữa các bài. Nên có **một bảng phiên bản chung** cho mỗi Space và cập nhật một lần.
- **Lệnh kiểu cũ trên Ubuntu 24.04:** `systemd-resolve` → `resolvectl`; `dhclient` → systemd-networkd; ghi thẳng
  `/etc/resolv.conf` (là symlink tới stub 127.0.0.53); `listen 443 ssl http2` → `http2 on;`; IMDSv1 trả 401 trên EC2 mới;
  `v1 Endpoints` deprecated từ 1.33; iptables `-A` sau rule DROP.
- **Sai kiến thức:** test MTU bằng `ping -s 1472` thiếu `-M do`; security group "chặn ở L2"; handshake TCP "3 RTT";
  RTO tối thiểu "1 giây" (Linux là 200 ms); dải ephemeral mâu thuẫn; thời gian ARP REACHABLE; mục Wildcard mask chép nhầm
  nội dung CIDR; `sort by (count)` sai tên cột trong LogsQL; "TLD cần 24–48h".
- **Thiếu `sudo`** khi ghi file hệ thống (nhiều bài Linux, Compose); logrotate thiếu `postrotate`; rule `local6` thiếu `stop`.
- **Thứ tự bước sai:** docker-compose-observability chạy `compose exec` trước khi viết compose.yaml, curl cổng 8080 khi
  không có web service, publish cổng API Vector 8686 không xác thực.

Ngoài ra lặp lại ở đa số bài: thiếu mục "Chuẩn bị" (hệ điều hành, gói cần cài), thiếu dọn dẹp, thiếu "Bài tiếp theo".

## 5. Bài nên viết thêm

Chỉ giữ các chỗ trống rõ ràng mà bài hiện có đã dùng tới nhưng chưa giải thích:

| Space | Bài thiếu | Vì sao |
|---|---|---|
| Networking | Cấu hình mạng Ubuntu hiện đại (netplan, networkd, resolvectl) | DHCP, DNS, boot đều dùng mà không có bài nền |
| Networking | Định tuyến, NAT, firewall (ip route, nftables/ufw, DROP vs REJECT, security group) | Gần như mọi bài debug dựa vào |
| Networking | tcpdump/Wireshark | Công cụ dùng ở mọi bài |
| Networking | nginx reverse proxy + TLS (certbot) | Cầu nối HTTP → Docker/K8s |
| Networking | IPv6 cơ bản | Subnet chỉ có IPv4, DNS/HTTP nhắc AAAA |
| Linux | systemd và journalctl | Boot, syslog dùng mà không giải thích |
| Linux | Đĩa, LVM, fstab | Boot thấy LVM, swap sửa fstab |
| Linux | auditd làm bước sau cmd-log | PROMPT_COMMAND dễ bị vượt |
| Docker | Cài Docker Engine (repo chính thức, post-install) | Chỉ có trong weekly 08-08 |
| Docker | Docker networking | Nằm giữa lưu trữ và Compose |
| Docker | Dockerfile nâng cao (multi-stage, USER non-root, HEALTHCHECK) | Bước sau bài build trang tĩnh |
| Docker | Healthcheck + `depends_on: service_healthy`; `.env`/secrets; cập nhật stack | Ba bài Compose đều nhắc mà không có ví dụ chạy được |
| Kubernetes | Rolling update/rollback; ConfigMap/Secret + PV/PVC | Pod lifecycle nhắc tới |
| Kubernetes | Backup/restore etcd; `kubeadm upgrade` | Fundamentals nhấn mạnh; cụm đang 1.31 EOL |
| Mọi Space | Trang tổng quan + lộ trình đọc ("Bài tiếp theo") | Hiện không có; KnowFlow đã có tính năng lối đi (journey), nên dựng một lối đi cho mỗi Space |

Bản dịch tiếng Anh: 31 bài chưa có. Đây là P3 so với các lỗi trên; nên dịch sau khi nội dung tiếng Việt đã sửa, tránh dịch hai lần.

## 6. Bảng từng bài

| Bài | Đánh giá | P1 | P2 | P3 |
|---|---|---|---|---|
| tcp-ip-packet-journey | thiếu nhỏ | 0 | 6 | 4 |
| subnet-cidr | thiếu nhỏ | 0 | 3 | 4 |
| arp | thiếu nhỏ | 0 | 4 | 4 |
| icmp-ping | thiếu nhỏ | 0 | 5 | 3 |
| dhcp | **thiếu lớn** | 2 | 8 | 3 |
| dns (vi) / (en) | **thiếu lớn** | 1 / 1 | 4 / 2 | 2 / 1 |
| tcp-udp (vi) / (en) | thiếu nhỏ | 0 / 0 | 3 / 1 | 3 / 1 |
| http (vi) / (en) | thiếu nhỏ | 0 / 0 | 4 / 2 | 2 / 0 |
| docker-fundamentals | thiếu nhỏ | 0 | 6 | 4 |
| docker-image-lifecycle | **thiếu lớn** | 1 | 4 | 3 |
| docker-lifecycle-immutability | **thiếu lớn** | 1 | 3 | 3 |
| docker-image-build | thiếu nhỏ | 0 | 3 | 3 |
| docker-image-build-push | **thiếu lớn** | 1 | 3 | 4 |
| docker-storage-logging | **thiếu lớn** | 0 | 4 | 4 |
| docker-volume-bind-logging | **thiếu lớn** | 1 | 3 | 4 |
| docker-compose-basics | thiếu nhỏ | 1 | 3 | 3 |
| docker-compose-multi-web-network | thiếu nhỏ | 0 | 2 | 4 |
| docker-compose-observability | thiếu nhỏ | 0 | 5 | 4 |
| docker-compose-log-stack | thiếu nhỏ | 0 | 2 | 5 |
| docker-build-run-compose | **thiếu lớn** | 1 | 4 | 4 |
| victorialogs | **thiếu lớn** | 1 | 3 | 5 |
| weekly docker cơ bản | thiếu nhỏ | 0 | 0 | 4 |
| weekly docker nâng cao | thiếu nhỏ | 0 | 1 | 4 |
| k8s-fundamentals | thiếu nhỏ | 0 | 5 | 3 |
| k8s-cluster-bootstrap | **thiếu lớn** | 3 | 4 | 2 |
| k8s-pod-lifecycle | thiếu nhỏ | 0 | 5 | 3 |
| weekly kiến trúc cụm k8s | thiếu nhỏ | 0 | 1 | 3 |
| weekly dựng cụm k8s | **thiếu lớn** | 1 | 3 | 2 |
| cloud-nist-model | thiếu nhỏ | 0 | 2 | 3 |
| linux-boot-process | **thiếu lớn** | 0 | 3 | 4 |
| linux-swap | thiếu nhỏ | 0 | 2 | 4 |
| syslog | thiếu nhỏ | 0 | 2 | 4 |
| linux-login-shell-cmdlog | **thiếu lớn** | 2 | 4 | 3 |
| cmdlog-rsyslog | **thiếu lớn** | 2 | 3 | 4 |

Chi tiết từng lỗi (trích dẫn, đề xuất sửa): `review.json` trong scratchpad của phiên này (không đưa vào repo public).

## 7. Việc tiếp theo

1. **Nguồn chuẩn mới của 37 bài: database kb tự giữ** (chủ dự án chọn 06/11/2026). Kéo theo: chạy import lần cuối có bước
   gỡ dấu vết Học Cloud và chép ảnh, rồi bỏ lệnh `import:hoc-cloud` (và đoạn tương ứng trong `docs/deployment-guide.md`);
   thêm endpoint sửa nội dung (tạo phiên bản mới) vào API quản trị để agent sửa hàng loạt; sao lưu database trước khi
   ghi. Các phương án Jev đã cân nhắc (độ tin 0,30):
   - `repo_markdown` 0,53: chụp 37 bài và 20 ảnh thành tệp trong `kb-next/content`, import đọc từ repo; mỗi bản sửa là
     một commit có review, chạy import để tạo phiên bản mới. Không còn phụ thuộc Học Cloud.
   - `db_owned` 0,47: chạy import lần cuối rồi bỏ lệnh; database là nguồn chuẩn, sửa qua trình soạn trong app hoặc thêm
     endpoint sửa nội dung vào API quản trị (hiện chỉ sửa được tiêu đề, ẩn).
   - Giữ import đọc API Học Cloud: 0,00, loại.
2. **Gỡ dấu vết Học Cloud và sửa lỗi do khâu nhập** trong cùng một lần: bỏ link/playground, `sourceUrl`, đổi tác giả hệ
   thống, bỏ ô tích hợp Workspace, chép ảnh về kb; sửa cách che địa chỉ (giữ cổng, tên máy thống nhất), giải mã HTML
   entity, câu dẫn bị cụt, `${DOC_*}`, tách lời giải thích khỏi khối bash, xác nhận và bỏ H1 trùng.
3. Sửa 19 lỗi P1, rồi nhóm phiên bản hết vá (K8s 1.31, nginx 1.27, node 20) bằng bảng phiên bản chung.
4. Thêm "Chuẩn bị", "Dọn dẹp", "Bài tiếp theo" và một lối đi cho mỗi Space.
5. Viết bài mới theo mục 5, ưu tiên các bài nền mà nhiều bài đang dựa vào: netplan/networkd, systemd/journalctl,
   cài Docker Engine, Docker networking.
6. Dịch tiếng Anh sau cùng.

## Câu hỏi còn mở

- (Đã đóng) H1 trùng: không có. kb lưu dòng `# tiêu đề` ở đầu bài và tự tách khi hiển thị; chỗ trùng là do bản xuất để chấm.
- Báo cáo chấm bản dựng lại từ Học Cloud hiện tại, không đọc thẳng database prod (máy Mac không có alias SSH tới .65). Nếu
  prod chưa nhập lại sau thay đổi gần nhất của Học Cloud, nội dung trên kb có thể lệch nhẹ. Prod có 41 tài liệu, nhiều
  hơn 37 bài nhập: 4 tài liệu còn lại (có thể là bài người dùng viết hoặc dữ liệu mẫu) chưa được chấm.
