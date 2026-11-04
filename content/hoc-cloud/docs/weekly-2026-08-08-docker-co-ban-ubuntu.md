# 08-08 · Thực hành Docker cơ bản trên Ubuntu 24.04

Buổi học ngày 08/08/2026 đi trọn một vòng Docker cơ bản trên một máy Ubuntu Server 24.04 LTS có Internet và quyền `sudo`: cài Docker Engine từ APT repository chính thức, quản lý image và container, publish port, dùng volume, bind mount và user-defined network, theo dõi log, sự kiện và tài nguyên, build image bằng `Dockerfile`, chạy ứng dụng bằng Docker Compose, kiểm thử end-to-end rồi dọn dẹp. Bài nâng cao cùng ngày là [[08-08 · Docker nâng cao: Docker Hub, Compose, VictoriaLogs và Vector]].

Quy ước của tài liệu:

- **Không dùng biến môi trường.** Mọi giá trị đều được viết thẳng (`8080`, `lab-web`, `~/docker-lab`…). Học viên đóng terminal, mở lại vẫn chạy tiếp được từ bất kỳ mục nào.
- Mỗi bài dùng **tên container riêng, cố định**. Không đổi tên container giữa chừng.
- Khối lệnh nào cũng chạy được độc lập bằng cách copy–paste.

## 1. Mục tiêu

Sau khi hoàn thành, học viên có thể:

- Hiểu các thành phần cơ bản của Docker.
- Cài Docker Engine trên Ubuntu Server 24.04 từ repository chính thức.
- Tải, tạo, chạy và quản lý image/container.
- Publish port và truy cập ứng dụng trong container.
- Sử dụng volume, bind mount và user-defined network.
- Theo dõi log, sự kiện và tài nguyên container.
- Tạo image bằng `Dockerfile`.
- Quản lý ứng dụng bằng Docker Compose.
- Dọn dẹp tài nguyên Docker an toàn.

## 2. Mô hình lab

### 2.1 Giả định

| Thuộc tính | Giá trị |
| --- | --- |
| Môi trường | Lab |
| Số node | 1 |
| Hệ điều hành | Ubuntu Server 24.04 LTS (Noble), 64-bit |
| Kết nối | Có Internet |
| Kiểu cài đặt | Docker APT repository chính thức |
| Người dùng | Có quyền `sudo` |
| Docker data | `/var/lib/docker` |
| Docker config | `/etc/docker` |

### 2.2 Bảng tài nguyên dùng trong toàn bộ tài liệu

Thay vì khai báo biến, học viên tra bảng này khi cần:

| Hạng mục | Giá trị cố định | Dùng ở mục |
| --- | --- | --- |
| Thư mục lab | `~/docker-lab` | 19, 21, 24 |
| Port web trên host | `8080` | 10 → 25 |
| Container web đầu tiên | `lab-web` | 10 – 17 |
| Container bind mount | `lab-web-bind` | 19 |
| Container server trong network | `web-server` | 20 |
| Container chạy image tự build | `lab-web-custom` | 23 |
| Container do Compose tạo | `compose-web` | 24, 25 |
| Image tự build | `docker-lab-web:1.0` | 21 – 23 |
| Network | `lab-network` | 20, 23 |
| Volume | `lab-nginx-data` | 18 |

> **Lưu ý:** Nếu port `8080` đã bận trên máy của bạn, hãy chọn một port khác **một lần duy nhất** và thay tất cả chỗ xuất hiện `8080` trong tài liệu.

### 2.3 Kiểm tra môi trường trước khi bắt đầu

```bash
hostnamectl
ip -brief address
lsb_release -a
uname -m
```

Kết quả cần xác nhận:

- Ubuntu 24.04 LTS.
- Kiến trúc 64-bit (`x86_64` hoặc `aarch64`).
- Máy truy cập được Internet.

Kiểm tra port `8080` còn trống:

```bash
sudo ss -lntp | grep ':8080 ' || echo "Port 8080 dang trong"
```

## 3. Docker hoạt động như thế nào?

```text
Docker CLI
    |
    | Unix socket: /var/run/docker.sock
    v
Docker daemon (dockerd)
    |
    +-- Images
    +-- Containers
    +-- Networks
    +-- Volumes
```

| Thành phần | Mô tả |
| --- | --- |
| Docker CLI | Lệnh `docker` được người dùng thực thi |
| Docker daemon | Tiến trình `dockerd` quản lý tài nguyên Docker |
| Image | Mẫu chỉ đọc dùng để tạo container |
| Container | Một tiến trình được tạo từ image |
| Registry | Nơi lưu trữ và phân phối image |
| Volume | Vùng dữ liệu do Docker quản lý |
| Network | Kết nối giữa các container và bên ngoài |

Container **không phải** máy ảo đầy đủ. Container chia sẻ kernel với Docker host nhưng có filesystem, process và network namespace riêng.

Phần lý thuyết sâu hơn (namespaces, cgroups, layer, luồng pull và build) nằm ở [[Docker: nền tảng và kiến trúc container]].

## 4. Gỡ các package có thể gây xung đột

Kiểm tra package hiện có:

```bash
dpkg -l | grep -E 'docker|containerd|runc|podman'
```

Gỡ các package xung đột (chạy được cả khi package không tồn tại):

```bash
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt-get remove -y "$pkg"
done
```

Lệnh trên **không** xóa dữ liệu trong `/var/lib/docker`.

> **Cảnh báo:** Không xóa `/var/lib/docker` trên máy đã có container hoặc volume cần giữ lại.

## 5. Cấu hình Docker APT repository

Cài dependency:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
```

Tạo thư mục keyring và tải GPG key:

```bash
sudo install -m 0755 -d /etc/apt/keyrings

sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc

sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Khai báo repository (định dạng deb822, chuẩn của Ubuntu 24.04):

```bash
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

> **Lưu ý:** Ở đây `EOF` **không** đặt trong dấu nháy, nên hai lệnh `$( ... )` được shell thực thi trước khi ghi file. Trên Ubuntu 24.04 kết quả là `noble` và `amd64` (hoặc `arm64`).

Kiểm tra file vừa tạo và cập nhật metadata:

```bash
cat /etc/apt/sources.list.d/docker.sources
sudo apt-get update
apt-cache policy docker-ce
```

## 6. Cài Docker Engine

Xem các phiên bản đang có:

```bash
apt list --all-versions docker-ce
```

Cài bản stable hiện hành:

```bash
sudo apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
```

Kiểm tra:

```bash
dpkg -l | grep -E 'docker-ce|containerd.io|docker-buildx|docker-compose'
sudo docker version
sudo docker compose version
sudo docker buildx version
```

## 7. Kiểm tra Docker daemon

```bash
sudo systemctl status docker --no-pager
sudo systemctl status containerd --no-pager

sudo systemctl is-enabled docker
sudo systemctl is-enabled containerd
```

Bật và khởi động service:

```bash
sudo systemctl enable --now docker.service
sudo systemctl enable --now containerd.service
```

Kiểm tra process và socket:

```bash
pgrep -a dockerd
pgrep -a containerd
sudo ls -l /var/run/docker.sock
sudo docker info
```

> **Lưu ý:** **Không kết luận Docker hoạt động chỉ vì service ở trạng thái `active`.** Phải chạy container kiểm thử.

```bash
sudo docker run --rm hello-world
```

Kết quả kỳ vọng:

- Image `hello-world` được tải về.
- Container được tạo và chạy.
- Thông báo xác nhận Docker hoạt động được hiển thị.
- Container tự xóa nhờ `--rm`.

## 8. Cho phép user chạy Docker không cần sudo

> **Cảnh báo bảo mật:** Thành viên nhóm `docker` có quyền tương đương `root` trên Docker host. Chỉ thêm tài khoản quản trị được tin cậy.

```bash
getent group docker >/dev/null || sudo groupadd docker
sudo usermod -aG docker "$USER"
```

Áp dụng group:

```bash
newgrp docker
```

> **Lưu ý:** `newgrp` chỉ mở một shell con đã có group `docker`. Để áp dụng vĩnh viễn cho mọi phiên, hãy **đăng xuất và đăng nhập lại** (hoặc `sudo reboot`).

Kiểm tra:

```bash
id
docker version
docker run --rm hello-world
```

Từ mục này trở đi, tài liệu không dùng `sudo` với lệnh `docker` nữa.

## 9. Quản lý image

Các mục 9 đến 16 là phần image, vòng đời container, log và giám sát; giải thích khái niệm đầy đủ ở [[Docker: image và vòng đời container]], bài tập tương ứng là [[Bài tập: vòng đời container và tính bất biến của image]].

### 9.1 Tải image

```bash
docker pull nginx:alpine
docker pull ubuntu:24.04
```

### 9.2 Liệt kê

```bash
docker image ls
```

### 9.3 Xem chi tiết

```bash
docker image inspect nginx:alpine

docker image inspect nginx:alpine \
  --format 'OS={{.Os}} Architecture={{.Architecture}}'

docker image history nginx:alpine
```

### 9.4 Tạo tag mới

```bash
docker image tag nginx:alpine nginx:lab
docker image ls nginx
```

Hai dòng kết quả có cùng `IMAGE ID`: tag chỉ là một cái tên trỏ vào cùng một image.

### 9.5 Xóa tag thử nghiệm

```bash
docker image rm nginx:lab
```

Lệnh này chỉ gỡ tag `nginx:lab`, image gốc `nginx:alpine` vẫn còn.

## 10. Chạy container đầu tiên

```bash
docker run -d \
  --name lab-web \
  --hostname lab-web \
  --restart unless-stopped \
  -p 127.0.0.1:8080:80 \
  nginx:alpine
```

| Tham số | Mục đích |
| --- | --- |
| `-d` | Chạy dưới nền |
| `--name lab-web` | Đặt tên container |
| `--hostname lab-web` | Đặt hostname bên trong container |
| `--restart unless-stopped` | Tự khởi động lại trừ khi bị dừng thủ công |
| `-p 127.0.0.1:8080:80` | Ánh xạ port 8080 của host sang port 80 của container |

> **Lưu ý:** Dạng `127.0.0.1:8080:80` chỉ cho phép truy cập **từ chính Docker host**. Nếu viết `8080:80`, Docker publish trên mọi địa chỉ của host và máy khác trong mạng có thể truy cập được.

Kiểm tra:

```bash
docker container ls
docker container ls --all
docker container port lab-web
sudo ss -lntp | grep ':8080 '
curl --fail --show-error http://127.0.0.1:8080/
```

Kết quả kỳ vọng: trả về trang HTML mặc định của Nginx.

## 11. Vòng đời container

### 11.1 Dừng container

```bash
docker container stop lab-web
docker container ls --all
```

Kiểm tra HTTP — **lần này lỗi mới là đúng**:

```bash
curl --fail --show-error http://127.0.0.1:8080/ \
  || echo "Ket qua dung: container da dung nen khong con ai lang nghe port 8080"
```

> **Lưu ý:** `curl` trả exit code `7` (không kết nối được). Đây là kết quả mong đợi, không phải sự cố.

### 11.2 Khởi động lại

```bash
docker container start lab-web
docker container ls
curl --fail --show-error http://127.0.0.1:8080/
```

### 11.3 Restart

```bash
docker container restart lab-web
```

### 11.4 Tạm dừng tiến trình

```bash
docker container pause lab-web
docker container ls
docker container unpause lab-web
```

### 11.5 Đổi tên container

```bash
docker container rename lab-web lab-web-tam
docker container ls

# Đổi lại tên cũ để các mục sau vẫn dùng đúng tên "lab-web"
docker container rename lab-web-tam lab-web
docker container ls
```

> **Sửa so với bản gốc:** Tài liệu gốc đổi tên rồi giữ nguyên tên mới cho các mục sau. Ở đây ta đổi và trả lại ngay, để tên container luôn khớp với bảng ở mục 2.2.

## 12. Thực thi lệnh bên trong container

```bash
docker container top lab-web
docker container exec lab-web hostname
docker container exec lab-web ls -la /usr/share/nginx/html
```

Mở shell:

```bash
docker container exec -it lab-web /bin/sh
```

Trong container, thử:

```sh
id
hostname
ps
cat /etc/os-release
cat /usr/share/nginx/html/index.html
exit
```

> **Lưu ý:** Không nên sửa ứng dụng trực tiếp trong container đang chạy. Thay đổi sẽ mất khi container bị xóa và tạo lại.

## 13. Inspect container

```bash
docker container inspect lab-web

docker container inspect lab-web \
  --format 'Status={{.State.Status}} StartedAt={{.State.StartedAt}}'

docker container inspect lab-web \
  --format 'HostPID={{.State.Pid}}'

docker container inspect lab-web \
  --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'

docker container inspect lab-web \
  --format 'RestartPolicy={{.HostConfig.RestartPolicy.Name}}'
```

## 14. Theo dõi log container

```bash
docker container logs lab-web
docker container logs --tail 20 lab-web
docker container logs --follow lab-web
```

Nhấn `Ctrl+C` để thoát chế độ theo dõi — container **không** bị dừng.

Sinh access log:

```bash
for i in 1 2 3 4 5; do
  curl --silent --output /dev/null "http://127.0.0.1:8080/?request_id=$i"
done
```

Đọc lại log kèm timestamp:

```bash
docker container logs --timestamps --since 5m lab-web
```

> **Lưu ý:** `docker logs` đọc dữ liệu mà tiến trình chính trong container ghi ra `stdout` và `stderr`.

Kiểm tra logging driver và đường dẫn file log:

```bash
docker container inspect lab-web --format 'LogDriver={{.HostConfig.LogConfig.Type}}'
docker container inspect lab-web --format 'LogPath={{.LogPath}}'
```

> **Lưu ý:** Không chỉnh sửa trực tiếp file log trong `/var/lib/docker`.

## 15. Theo dõi tài nguyên

```bash
docker stats
docker stats lab-web
docker stats --no-stream lab-web

docker stats --no-stream \
  --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}'
```

## 16. Theo dõi sự kiện Docker

Mục này cần **hai terminal**.

Terminal 1 — theo dõi:

```bash
docker events --filter container=lab-web
```

Terminal 2 — sinh sự kiện:

```bash
docker container restart lab-web
docker container stop lab-web
docker container start lab-web
```

Quan sát ở Terminal 1 các event: `stop`, `die`, `start`, `restart`. Nhấn `Ctrl+C` để kết thúc.

## 17. Xem mức sử dụng dung lượng

Các mục 17 đến 19 thuộc phần lưu trữ; khái niệm volume, bind mount và giới hạn log được trình bày đầy đủ ở [[Docker: lưu trữ dữ liệu và log tập trung]], bài tập tương ứng là [[Bài tập: volume, bind mount và thu log tập trung]].

```bash
docker system df
docker system df --verbose
docker info --format 'DockerRootDir={{.DockerRootDir}}'
sudo du -sh /var/lib/docker
```

## 18. Named volume

Volume là vùng lưu trữ do Docker quản lý, vẫn tồn tại sau khi container bị xóa.

```bash
docker volume create lab-nginx-data
docker volume ls
docker volume inspect lab-nginx-data
```

Ghi dữ liệu bằng container thứ nhất:

```bash
docker run --rm \
  --mount type=volume,source=lab-nginx-data,target=/data \
  alpine:3.22 \
  sh -c 'date -Iseconds > /data/created-at.txt && cat /data/created-at.txt'
```

Đọc lại bằng container thứ hai (mount chỉ đọc):

```bash
docker run --rm \
  --mount type=volume,source=lab-nginx-data,target=/data,readonly \
  alpine:3.22 \
  cat /data/created-at.txt
```

Kết quả kỳ vọng: container thứ hai đọc được dữ liệu do container thứ nhất tạo, dù cả hai đều đã bị xóa.

## 19. Bind mount

Tạo thư mục và trang web trên host:

```bash
mkdir -p ~/docker-lab/html

cat > ~/docker-lab/html/index.html <<'EOF'
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Docker Lab</title>
</head>
<body>
  <h1>Docker Lab tren Ubuntu 24.04</h1>
  <p>Noi dung duoc cung cap tu bind mount.</p>
</body>
</html>
EOF
```

Dừng container cũ để giải phóng port `8080`:

```bash
docker container rm --force lab-web
```

Chạy container mới với bind mount chỉ đọc:

```bash
docker run -d \
  --name lab-web-bind \
  --restart unless-stopped \
  -p 127.0.0.1:8080:80 \
  --mount type=bind,source="$HOME/docker-lab/html",target=/usr/share/nginx/html,readonly \
  nginx:alpine
```

> **Lưu ý:** `--mount type=bind` bắt buộc `source` là **đường dẫn tuyệt đối**, nên ở đây dùng `$HOME` thay vì `~`.

Kiểm tra:

```bash
curl --fail --show-error http://127.0.0.1:8080/
```

Sửa file trên host rồi đọc lại (không restart container):

```bash
sed -i 's/Noi dung duoc cung cap tu bind mount./Noi dung da duoc cap nhat tren Docker host./' \
  ~/docker-lab/html/index.html

curl --fail --show-error http://127.0.0.1:8080/
```

> **Lưu ý:** Bind mount phù hợp khi cần quản lý file trực tiếp từ Docker host. Volume phù hợp hơn khi muốn Docker quản lý nơi lưu dữ liệu.

## 20. User-defined bridge network

User-defined bridge network cung cấp DNS nội bộ: các container gọi nhau bằng **tên service**, không cần IP.

```bash
docker network create --driver bridge lab-network
docker network ls
docker network inspect lab-network
```

Dọn container đang chiếm port `8080` và chạy Nginx trong network:

```bash
docker container rm --force lab-web-bind

docker run -d \
  --name web-server \
  --network lab-network \
  nginx:alpine
```

> **Lưu ý:** Container `web-server` **không publish port** ra host. Nó chỉ được truy cập từ trong `lab-network`.

Gọi Nginx từ một container client:

```bash
docker run --rm \
  --network lab-network \
  busybox:1.37 \
  wget -qO- http://web-server/
```

Kiểm tra DNS nội bộ:

```bash
docker run --rm \
  --network lab-network \
  busybox:1.37 \
  nslookup web-server
```

Xem danh sách container trong network:

```bash
docker network inspect lab-network --format '{{range .Containers}}{{.Name}} {{end}}'
```

Kết quả kỳ vọng:

- `web-server` xuất hiện trong network.
- Client phân giải được tên `web-server`.
- Client nhận được HTML từ Nginx.
- Không cần publish port vì hai container cùng network.

## 21. Chuẩn bị ứng dụng

Các mục 21 đến 23 là phần tạo image bằng `Dockerfile`; cách viết Dockerfile, `.dockerignore`, đọc output build và đưa image lên registry được trình bày đầy đủ ở [[Docker: Dockerfile, build image và registry]].

```bash
mkdir -p ~/docker-lab/image-lab
cd ~/docker-lab/image-lab
```

Nội dung web:

```bash
cat > index.html <<'EOF'
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Custom Docker Image</title>
</head>
<body>
  <h1>Image duoc build bang Dockerfile</h1>
</body>
</html>
EOF
```

`Dockerfile`:

```bash
cat > Dockerfile <<'EOF'
FROM nginx:alpine

LABEL org.opencontainers.image.title="docker-lab-web"
LABEL org.opencontainers.image.description="Image thuc hanh Docker co ban"

COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80
EOF
```

`.dockerignore`:

```bash
cat > .dockerignore <<'EOF'
.git
*.log
EOF
```

## 22. Build image

```bash
cd ~/docker-lab/image-lab
cat Dockerfile
cat .dockerignore

docker build --pull --tag docker-lab-web:1.0 .
```

Kiểm tra:

```bash
docker image ls docker-lab-web
docker image inspect docker-lab-web:1.0
docker image history docker-lab-web:1.0
```

## 23. Chạy image vừa tạo

Xóa container `web-server` để giải phóng tên và tài nguyên của bài trước:

```bash
docker container rm --force web-server 2>/dev/null \
  || echo "Container web-server khong ton tai"
```

Chạy container mới:

```bash
docker run -d \
  --name lab-web-custom \
  --network lab-network \
  -p 127.0.0.1:8080:80 \
  docker-lab-web:1.0
```

Kiểm tra:

```bash
docker container ls --filter name=lab-web-custom
docker container logs lab-web-custom
curl --fail --show-error http://127.0.0.1:8080/
```

> **Lưu ý:** Không dừng lại ở việc container ở trạng thái `running`. **Phản hồi HTTP mới chứng minh ứng dụng đang phục vụ yêu cầu.**

## 24. Ứng dụng Compose đơn giản

Khái niệm Compose (validate, vòng đời project, nhiều service, cách ly network) được trình bày đầy đủ ở [[Docker Compose: một file, nhiều container]]; trong lớp chỉ dựng một service web.

```bash
mkdir -p ~/docker-lab/compose-lab/html
cd ~/docker-lab/compose-lab
```

Trang web:

```bash
cat > html/index.html <<'EOF'
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Docker Compose Lab</title>
</head>
<body>
  <h1>Ung dung duoc quan ly bang Docker Compose</h1>
</body>
</html>
EOF
```

`compose.yaml` — dùng `'EOF'` có nháy đơn nên file được ghi **nguyên văn**, không phụ thuộc biến shell nào:

```bash
cat > compose.yaml <<'EOF'
services:
  web:
    image: nginx:alpine
    container_name: compose-web
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
EOF
```

Validate cấu hình:

```bash
docker compose config
```

Giải phóng port `8080` khỏi container của bài trước:

```bash
docker container rm --force lab-web-custom 2>/dev/null \
  || echo "Container lab-web-custom khong ton tai"
```

Khởi động và kiểm tra:

```bash
docker compose up -d
docker compose ps
docker compose logs
curl --fail --show-error http://127.0.0.1:8080/
```

Vòng đời Compose:

```bash
docker compose logs --follow web   # Ctrl+C de thoat
docker compose stop                # dung nhung giu container
docker compose start               # chay lai container da co
docker compose down                # xoa container va network cua project
```

| Lệnh | Container | Network | Dữ liệu bind mount |
| --- | --- | --- | --- |
| `docker compose stop` | Giữ (đã dừng) | Giữ | Giữ |
| `docker compose down` | Xóa | Xóa | Giữ |

## 25. Bài thực hành tổng hợp: kiểm thử end-to-end

```bash
cd ~/docker-lab/compose-lab
docker compose up -d
```

### Bước 1 — Docker daemon phản hồi

```bash
docker info >/dev/null && echo "Docker daemon phan hoi thanh cong"
```

### Bước 2 — Container

```bash
docker compose ps
```

### Bước 3 — Port

```bash
sudo ss -lntp | grep ':8080 '
```

### Bước 4 — HTTP request

```bash
curl --silent \
  --output /tmp/docker-lab-response.html \
  --write-out 'HTTP status: %{http_code}\n' \
  http://127.0.0.1:8080/

cat /tmp/docker-lab-response.html
```

Kết quả kỳ vọng:

```text
HTTP status: 200
```

### Bước 5 — Access log

```bash
docker compose logs --since 2m web
```

### Bước 6 — Tài nguyên

```bash
docker stats --no-stream compose-web
```

> **Sửa so với bản gốc:** Tài liệu gốc dùng `docker compose stats`. Lệnh này chỉ có ở các bản Compose plugin mới và dễ báo lỗi `unknown command`. Dùng `docker stats <ten-container>` cho chắc chắn.

### Bước 7 — Mount

```bash
docker container inspect compose-web --format '{{json .Mounts}}'
```

### Bước 8 — Restart

```bash
docker container restart compose-web
sleep 2
curl --fail --show-error http://127.0.0.1:8080/
```

Luồng đã kiểm thử:

```text
curl
  -> Port 127.0.0.1:8080 tren Docker host
  -> Docker port mapping
  -> Nginx container
  -> Bind-mounted index.html
  -> HTTP response
  -> Nginx access log
```

## 26. Dọn tài nguyên lab

Thứ tự bắt buộc: **container → image → network → volume**.

Dừng ứng dụng Compose:

```bash
cd ~/docker-lab/compose-lab
docker compose down
```

Xóa các container lab còn lại:

```bash
docker container rm --force \
  lab-web \
  lab-web-bind \
  web-server \
  lab-web-custom \
  compose-web 2>/dev/null \
  || echo "Khong con container lab can xoa"
```

Xóa image tự build (phải xóa sau khi container dùng nó đã biến mất):

```bash
docker image rm docker-lab-web:1.0
```

Xóa network:

```bash
docker network rm lab-network 2>/dev/null \
  || echo "Network lab-network khong ton tai hoac dang duoc su dung"
```

Xóa volume:

> **Cảnh báo:** Lệnh sau xóa vĩnh viễn dữ liệu trong volume lab.

```bash
docker volume inspect lab-nginx-data
docker volume rm lab-nginx-data
```

Kiểm tra phần còn lại:

```bash
docker container ls --all
docker image ls
docker volume ls
docker network ls
docker system df
```

> **Lưu ý:** Không chạy `docker system prune --all --volumes` trên hệ thống dùng chung hoặc Production khi chưa kiểm tra kỹ — lệnh này xóa image, network, cache và volume không còn được tham chiếu.

## 27. Lỗi thường gặp

### 27.1 Permission denied với Docker socket

```text
permission denied while trying to connect to the Docker daemon socket
```

Kiểm tra và khắc phục:

```bash
id
ls -l /var/run/docker.sock

sudo usermod -aG docker "$USER"
newgrp docker
docker version
```

Nếu vẫn lỗi ở terminal khác: đăng xuất và đăng nhập lại.

### 27.2 Docker daemon không phản hồi

```bash
sudo systemctl status docker --no-pager
sudo journalctl -u docker --since "15 minutes ago" --no-pager
sudo systemctl status containerd --no-pager

sudo systemctl restart containerd
sudo systemctl restart docker

docker info
docker run --rm hello-world
```

### 27.3 Port 8080 đã được sử dụng

```bash
sudo ss -lntp | grep ':8080 '
docker container ls --format 'table {{.Names}}\t{{.Ports}}'
```

Xử lý theo một trong hai hướng:

- Xóa container đang chiếm port: `docker container rm --force <ten-container>`.
- Hoặc chọn port khác và thay **toàn bộ** `8080` trong tài liệu bằng port mới.

### 27.4 Container thoát ngay sau khi chạy

```bash
docker container ls --all
docker container logs <ten-container>
docker container inspect <ten-container> \
  --format 'ExitCode={{.State.ExitCode}} Error={{.State.Error}}'
```

Container chỉ tồn tại trong khi tiến trình chính (PID 1) còn chạy. Khi tiến trình chính kết thúc, container chuyển sang `exited`.

### 27.5 Không truy cập được ứng dụng

Kiểm tra theo đúng thứ tự:

```bash
docker container ls
docker container port <ten-container>
docker container logs <ten-container>
sudo ss -lntp | grep ':8080 '
curl --verbose http://127.0.0.1:8080/
```

Nếu cần truy cập từ máy khác, phải publish port trên IP phù hợp (bỏ `127.0.0.1:`) và kiểm tra firewall. Không mở port ra toàn mạng khi chưa xác định phạm vi truy cập.

## 28. Checklist nghiệm thu

- [ ] Ubuntu Server 24.04 được xác nhận.
- [ ] Docker được cài từ repository chính thức.
- [ ] `docker version` hiển thị cả Client và Server.
- [ ] `docker run --rm hello-world` thành công.
- [ ] Tải và inspect được image.
- [ ] Tạo, dừng, chạy lại và xóa được container.
- [ ] Truy cập được ứng dụng qua published port.
- [ ] Sử dụng được `docker exec`.
- [ ] Đọc được log bằng `docker logs`.
- [ ] Theo dõi được CPU và memory bằng `docker stats`.
- [ ] Sử dụng được named volume.
- [ ] Sử dụng được bind mount.
- [ ] Hai container giao tiếp qua user-defined network bằng tên.
- [ ] Build được image từ `Dockerfile`.
- [ ] Validate và chạy được `docker compose`.
- [ ] Kiểm thử HTTP end-to-end trả về mã `200`.
- [ ] Access log ghi nhận request thử nghiệm.
- [ ] Tài nguyên lab được dọn dẹp đúng phạm vi.

## 29. Ghi chú khi chuyển sang Production

- Cố định và quản lý phiên bản Docker Engine.
- Có chính sách cập nhật bản vá bảo mật.
- Không cấp quyền nhóm `docker` đại trà.
- Giới hạn CPU và memory cho container.
- Cấu hình log rotation (`/etc/docker/daemon.json`).
- Backup và **kiểm thử restore** volume.
- Quản lý secret thay vì ghi secret trong image hoặc Compose file.
- Chỉ bind service trên IP cần thiết.
- Thiết lập firewall và kiểm tra chuỗi `DOCKER-USER` của iptables.
- Sử dụng registry riêng và image scanning.
- Theo dõi daemon, container, filesystem và dung lượng.
- Thiết lập health check cho ứng dụng.
- Có quy trình rollback image.
- Không dùng tag không cố định như `latest` trong quy trình phát hành.

## 30. Nguồn tham khảo chính thức

- Docker Engine — Install on Ubuntu: [https://docs.docker.com/engine/install/ubuntu/](https://docs.docker.com/engine/install/ubuntu/)
- Docker Engine — Linux post-installation steps: [https://docs.docker.com/engine/install/linux-postinstall/](https://docs.docker.com/engine/install/linux-postinstall/)
- Docker — Port publishing: [https://docs.docker.com/engine/network/#published-ports](https://docs.docker.com/engine/network/#published-ports)
- Docker — Volumes: [https://docs.docker.com/engine/storage/volumes/](https://docs.docker.com/engine/storage/volumes/)
- Docker — Bridge network driver: [https://docs.docker.com/engine/network/drivers/bridge/](https://docs.docker.com/engine/network/drivers/bridge/)
- Docker Compose: [https://docs.docker.com/compose/](https://docs.docker.com/compose/)

## Phụ lục A — Những điểm đã sửa so với bản gốc

| # | Vấn đề trong bản gốc | Xử lý |
| --- | --- | --- |
| 1 | 9 biến `export` (`APP_DIR`, `CONTAINER_NAME`, `WEB_PORT`…); mất khi đóng terminal | Bỏ hoàn toàn, dùng giá trị literal + bảng tra cứu ở mục 2.2 |
| 2 | `export CONTAINER_NAME="${CONTAINER_NAME}-renamed"` rồi đổi tiếp thành `lab-web-bind` — tên container thay đổi ngầm giữa các mục | Mỗi bài một tên cố định; mục rename đổi và trả lại tên cũ ngay |
| 3 | `LAB_HOSTNAME`, `LAB_IP` khai báo nhưng gần như không dùng | Bỏ |
| 4 | Khối `dpkg --get-selections \| awk` để gỡ package xung đột — dài và khó đọc | Thay bằng vòng `for` đơn giản theo Docker docs |
| 5 | `docker compose stats --no-stream` (mục 25, Bước 6) — không có ở nhiều bản Compose plugin | Đổi sang `docker stats --no-stream compose-web` |
| 6 | Danh sách dọn container liệt kê `lab-web-renamed` **hai lần** | Sửa lại danh sách, bỏ trùng |
| 7 | "Dọn container cũ có thể chiếm port: `docker container rm web-server`" — `web-server` chạy **không** publish port nào | Sửa lại lý do và dọn đúng container đang giữ port 8080 |
| 8 | `curl --fail` sau khi stop container → exit code 7, học viên tưởng hỏng | Thêm `\|\| echo` và giải thích đây là kết quả đúng |
| 9 | `curlimages/curl:8.17.0` — pin một tag rất dễ lệch, lại thêm 1 image chỉ để gọi HTTP | Dùng `busybox:1.37` + `wget -qO-` (đã dùng busybox cho `nslookup`) |
| 10 | Xóa image tự build trước khi chắc chắn container dùng nó đã bị xóa | Ghi rõ thứ tự dọn: container → image → network → volume |
| 11 | `--mount type=bind,source=${APP_DIR}/html` — nếu biến rỗng thì `source` thành đường dẫn tương đối và Docker báo lỗi | Dùng `$HOME/docker-lab/html` và ghi chú `source` phải tuyệt đối |
| 12 | Checklist bị chèn đầy `<!-- -->` khi xuất từ Word | Viết lại thành checkbox markdown |
| 13 | `newgrp docker` không được giải thích là chỉ có tác dụng trong shell con | Thêm ghi chú đăng xuất/đăng nhập lại |
| 14 | `compose.yaml` ghi bằng heredoc **không** quote, phụ thuộc `${WEB_PORT}` | Dùng `<<'EOF'` để ghi nguyên văn |
