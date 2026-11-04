# 08-08 · Docker nâng cao: Docker Hub, Compose, VictoriaLogs và Vector

Phần nâng cao của buổi học ngày 08/08/2026, nối tiếp [[08-08 · Thực hành Docker cơ bản trên Ubuntu 24.04]]. Trên một Docker host Ubuntu Server 24.04 LTS đã cài Docker Engine và Compose plugin, lớp build một web image bằng `Dockerfile`, chạy nó bằng Compose với bind mount, push lên Docker Hub rồi pull lại, dựng một web Compose độc lập, sau đó triển khai stack thu log VictoriaLogs + Vector bằng Compose, gửi log qua HTTP, truy vấn bằng LogsQL và kiểm thử persistence.

Quy ước của tài liệu:

- **Chỉ còn đúng một biến shell:** `DOCKERHUB_USER` (vì username Docker Hub của mỗi người khác nhau). Mọi giá trị còn lại được viết thẳng.
- Ba bài lab nằm ở ba thư mục riêng: `web-image`, `compose-web`, `observability-lab`.
- **Ba bài lab đầu đều dùng port `8080`.** Phải `docker compose down` bài trước rồi mới sang bài sau.

## 1. Mục tiêu

Sau khi hoàn thành, học viên có thể:

- Tạo web image bằng `Dockerfile` và chạy thử image.
- Sử dụng bind mount từ thư mục hiện tại vào container.
- Publish port của web application ra Docker host.
- Đăng nhập Docker Hub, tag image và push image lên repository cá nhân.
- Phân biệt và dùng đúng `docker compose up` / `stop` / `down`.
- Tạo một ứng dụng web cơ bản bằng Docker Compose.
- Triển khai VictoriaLogs và Vector bằng Docker Compose.
- Publish port `9428` (VictoriaLogs), `8686` (Vector API) và `9000` (Vector HTTP source).
- Gửi log vào Vector và xác minh log được chuyển tiếp sang VictoriaLogs.
- Kiểm tra container, port, bind mount, log và luồng kết nối end-to-end.

## 2. Phạm vi và giả định

| Thuộc tính | Giá trị |
| --- | --- |
| Hệ điều hành | Ubuntu Server 24.04 LTS |
| Docker | Đã cài Docker Engine + Compose plugin |
| Thư mục lab | `~/docker-practice` |
| Web public port | `8080/TCP` |
| VictoriaLogs public port | `9428/TCP` |
| Vector API public port | `8686/TCP` |
| Vector HTTP input port | `9000/TCP` |
| Internet | Cần để pull image và push Docker Hub |

### 2.1 Bảng tài nguyên

| Bài | Thư mục | Container | Image | Port host |
| --- | --- | --- | --- | --- |
| 1–3 | `~/docker-practice/web-image` | `web-lab` | `docker-web-lab:1.0` (tự build) | 8080 |
| 4 | `~/docker-practice/compose-web` | `compose-basic-web` | `nginx:alpine` | 8080 |
| 5–10 | `~/docker-practice/observability-lab` | `victorialogs-lab`, `vector-lab` | `victoria-logs:v1.52.0`, `vector:0.57.0-debian` | 9428, 8686, 9000 |

### 2.2 Chuẩn bị

```bash
mkdir -p ~/docker-practice
cd ~/docker-practice

docker version
docker compose version
sudo ss -lntp | grep -E ':(8080|9428|8686|9000) ' || echo "Cac port deu dang trong"
```

> **Lưu ý:** Docker không có lệnh `docker up`. Với Docker Compose, lệnh đúng là `docker compose up`. Trong tài liệu này, "up" luôn nghĩa là `docker compose up`.

## 3. Bài 1 — Tạo web image bằng Dockerfile

Bài 1 đến bài 3 dùng chung thư mục `web-image`. Cách viết Dockerfile, build, tag và push được trình bày đầy đủ ở [[Docker: Dockerfile, build image và registry]]; bài tập cùng chủ đề là [[Bài tập: viết Dockerfile, build và push image]].

### 3.1 Cấu trúc thư mục

```bash
mkdir -p ~/docker-practice/web-image/html
cd ~/docker-practice/web-image
pwd
```

Cấu trúc mong muốn sau khi làm xong mục 4.1:

```text
web-image/
├── Dockerfile
├── compose.yaml
├── .dockerignore
└── html/
    └── index.html
```

### 3.2 Tạo trang web

```bash
cat > html/index.html <<'EOF'
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Docker Web Lab</title>
</head>
<body>
  <h1>Docker Web Lab</h1>
  <p>Trang web dang chay tu image tu build.</p>
  <p>Bind mount cho phep thay doi noi dung truc tiep tu Docker host.</p>
</body>
</html>
EOF
```

### 3.3 Tạo Dockerfile

```bash
cat > Dockerfile <<'EOF'
FROM nginx:alpine

LABEL org.opencontainers.image.title="docker-web-lab"
LABEL org.opencontainers.image.description="Basic web image for Docker practice"

COPY html/ /usr/share/nginx/html/

EXPOSE 80
EOF
```

### 3.4 Tạo .dockerignore

```bash
cat > .dockerignore <<'EOF'
.git
*.log
compose.yaml
EOF
```

### 3.5 Build image

```bash
cd ~/docker-practice/web-image
docker build --pull --tag docker-web-lab:1.0 .

docker image ls docker-web-lab
docker image history docker-web-lab:1.0
```

## 4. Bài 2 — Chạy image bằng Compose + bind mount thư mục hiện tại

### 4.1 Tạo compose.yaml

Compose dùng image vừa build, publish port `8080` và mount `./html` vào Nginx.

```bash
cd ~/docker-practice/web-image

cat > compose.yaml <<'EOF'
services:
  web:
    image: docker-web-lab:1.0
    container_name: web-lab
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
EOF
```

> **Sửa so với bản gốc:** Bản gốc đặt `container_name: docker-web-lab` trùng với tên image, rất dễ nhầm khi đọc log và lệnh `docker inspect`. Ở đây container tên `web-lab`, image tên `docker-web-lab:1.0`.

### 4.2 Validate

```bash
docker compose config
```

### 4.3 Khởi động

```bash
docker compose up -d
```

| Thành phần | Ý nghĩa |
| --- | --- |
| `docker compose` | Gọi Docker Compose plugin |
| `up` | Tạo/cập nhật container, network và khởi động service |
| `-d` | Chạy dưới nền (detached mode) |

### 4.4 Kiểm tra web và port

```bash
docker compose ps
docker compose logs --tail 20 web
sudo ss -lntp | grep ':8080 '
curl --fail --show-error http://127.0.0.1:8080/
```

Truy cập từ máy khác trong mạng lab: `http://<IP_DOCKER_HOST>:8080/`

```bash
ip -brief address   # xem IP cua Docker host
```

> **Lưu ý:** Publish dạng `"8080:80"` bind trên **mọi interface** của Docker host. Chỉ dùng trong mạng lab hoặc khi firewall đã được kiểm soát. Muốn giới hạn về localhost, viết `"127.0.0.1:8080:80"`.

### 4.5 Kiểm chứng bind mount

```bash
sed -i 's/Trang web dang chay tu image tu build./Noi dung da duoc thay doi tu Docker host qua bind mount./' \
  html/index.html

curl --fail --show-error http://127.0.0.1:8080/
```

Không cần build lại image: Nginx đọc trực tiếp nội dung từ `./html` trên host.

### 4.6 Vòng đời Compose

```bash
docker compose stop        # dung service nhung giu container
docker compose ps --all

docker compose start       # chay lai container da ton tai

docker compose logs --follow web   # Ctrl+C de thoat

docker compose down        # xoa container va network do Compose tao
```

| Lệnh | Container | Network | Thư mục `./html` |
| --- | --- | --- | --- |
| `stop` | Giữ (đã dừng) | Giữ | Giữ |
| `down` | Xóa | Xóa | Giữ |

## 5. Bài 3 — Push image lên Docker Hub

### 5.1 Khai báo username

Tạo repository trên Docker Hub (ví dụ `docker-web-lab`), sau đó:

```bash
export DOCKERHUB_USER="<dockerhub-username-cua-ban>"
echo "$DOCKERHUB_USER"
```

> **Lưu ý:** Đây là **biến duy nhất** của tài liệu. Nếu mở terminal mới, hãy chạy lại dòng `export` này.

### 5.2 Đăng nhập

```bash
docker login
```

> **Lưu ý:** Nên dùng Personal Access Token của Docker Hub thay cho mật khẩu. Không ghi credential vào `Dockerfile` hay `compose.yaml`.

### 5.3 Tag image theo namespace Docker Hub

```bash
docker tag docker-web-lab:1.0 "$DOCKERHUB_USER/docker-web-lab:1.0"
docker image ls | grep docker-web-lab
```

Định dạng bắt buộc: `<username>/<repository>:<tag>`.

### 5.4 Push

```bash
docker push "$DOCKERHUB_USER/docker-web-lab:1.0"
```

### 5.5 Kiểm thử pull lại

Muốn kiểm thử **thật sự**, phải xóa cả hai tag đang trỏ vào cùng image ID, nếu không Docker chỉ dùng lại layer đã có trong máy:

```bash
cd ~/docker-practice/web-image
docker compose down

docker image rm "$DOCKERHUB_USER/docker-web-lab:1.0" docker-web-lab:1.0
docker image ls | grep docker-web-lab || echo "Da xoa het tag local"
```

> **Sửa so với bản gốc:** **Đây là điểm bản gốc bỏ sót.** Bản gốc chỉ xóa tag Docker Hub, còn tag local `docker-web-lab:1.0` vẫn giữ image trong máy, nên lệnh `docker pull` sau đó không tải gì cả và bài kiểm thử mất ý nghĩa.

Pull về và chạy thử:

```bash
docker pull "$DOCKERHUB_USER/docker-web-lab:1.0"

docker run -d \
  --name dockerhub-web-test \
  -p 8081:80 \
  "$DOCKERHUB_USER/docker-web-lab:1.0"

curl --fail --show-error http://127.0.0.1:8081/
docker logs dockerhub-web-test
docker rm -f dockerhub-web-test
```

> **Sửa so với bản gốc:** Bản gốc dùng `docker run --rm -d`. Khi container lỗi, `--rm` xóa nó ngay và mất luôn log để chẩn đoán. Ở đây chạy không `--rm` rồi xóa thủ công.

### 5.6 Kết quả cần đạt

- Image build thành công từ `Dockerfile`.
- Container web truy cập được qua port `8080`.
- Thay đổi `./html/index.html` được phản ánh ngay qua bind mount.
- Sử dụng được `docker compose up -d`.
- Image được tag đúng `<username>/<repository>:<tag>`.
- Push lên Docker Hub thành công và pull lại chạy được.

## 6. Bài 4 — Web application độc lập bằng Compose

Bài này **không** phụ thuộc image tự build ở phần trước: dùng `nginx:alpine` chính thức và bind mount nội dung web. Phần khái niệm Compose (validate, vòng đời project, nhiều service) có ở [[Docker Compose: một file, nhiều container]].

### 6.1 Chuẩn bị

> **Lưu ý:** Trước tiên đảm bảo bài 2 đã tắt để trả lại port `8080`.

```bash
cd ~/docker-practice/web-image && docker compose down
```

```bash
mkdir -p ~/docker-practice/compose-web/html
cd ~/docker-practice/compose-web

cat > html/index.html <<'EOF'
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Compose Web App</title>
</head>
<body>
  <h1>Web application bang Docker Compose</h1>
  <p>Source duoc mount tu ./html tren Docker host.</p>
</body>
</html>
EOF
```

### 6.2 Tạo compose.yaml

```bash
cat > compose.yaml <<'EOF'
services:
  web:
    image: nginx:alpine
    container_name: compose-basic-web
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    networks:
      - web-net

networks:
  web-net:
    driver: bridge
EOF
```

### 6.3 Khởi động và kiểm thử

```bash
docker compose config
docker compose up -d
docker compose ps
curl --fail --show-error http://127.0.0.1:8080/
docker compose logs --tail 20 web
```

### 6.4 Thay đổi nội dung, không restart container

```bash
cat >> html/index.html <<'EOF'
<p>Noi dung moi duoc cap nhat tu host.</p>
EOF

curl --fail --show-error http://127.0.0.1:8080/
```

### 6.5 Dọn bài lab

```bash
docker compose down
```

## 7. Kiến trúc bài lab VictoriaLogs + Vector

Các mục 7 đến 13 dựng stack thu log. Bản đầy đủ hơn của stack này (thêm nguồn `docker_logs` và syslog từ máy client qua rsyslog) nằm ở [[Compose stack thu log: VictoriaLogs, Vector và rsyslog]]; bài tập tương ứng là [[Bài tập: dựng stack thu log bằng Compose]]. Trong lớp chỉ dùng nguồn HTTP.

```text
curl / ung dung test
        |
        | HTTP :9000
        v
+-------------------+
| Vector            |
| API        :8686  |
| HTTP source:9000  |
+---------+---------+
          |
          | HTTP JSON qua Docker network
          | http://victorialogs:9428/insert/jsonline
          v
+-------------------+
| VictoriaLogs      |
| HTTP       :9428  |
+---------+---------+
          |
          v
./victoria-logs-data  (bind mount tren Docker host)
```

Trong Docker network, Vector gửi log tới **tên service** `victorialogs:9428`, không dùng IP container.

## 8. Bài 5 — Chuẩn bị VictoriaLogs + Vector

### 8.1 Cấu trúc thư mục

```bash
mkdir -p ~/docker-practice/observability-lab/victoria-logs-data
cd ~/docker-practice/observability-lab
```

Cấu trúc mong muốn:

```text
observability-lab/
├── compose.yaml
├── vector.yaml
└── victoria-logs-data/
```

### 8.2 Cấu hình Vector

Vector mở API quản trị ở `8686` và một HTTP source ở `9000`. Log nhận tại HTTP source được gửi sang VictoriaLogs qua JSON line API.

```bash
cat > vector.yaml <<'EOF'
api:
  enabled: true
  address: 0.0.0.0:8686

sources:
  http_input:
    type: http_server
    address: 0.0.0.0:9000
    decoding:
      codec: json

transforms:
  normalize:
    type: remap
    inputs:
      - http_input
    source: |
      .timestamp = now()
      .host = "docker-lab"
      .source = "vector-http"
      if !exists(.message) {
        .message = encode_json(.)
      }

sinks:
  victorialogs:
    type: http
    inputs:
      - normalize
    uri: http://victorialogs:9428/insert/jsonline?_stream_fields=host,source&_msg_field=message&_time_field=timestamp
    compression: gzip
    encoding:
      codec: json
    framing:
      method: newline_delimited
    healthcheck:
      enabled: false
EOF
```

Giải thích ba tham số quan trọng trên `uri`:

| Tham số | Ý nghĩa |
| --- | --- |
| `_msg_field=message` | Trường `message` của event trở thành `_msg` trong VictoriaLogs |
| `_time_field=timestamp` | Trường `timestamp` trở thành `_time` |
| `_stream_fields=host,source` | Hai trường này định danh log stream |

> **Sửa so với bản gốc — hai điểm cần chú ý:**
>
> 1. Bản gốc dùng `encoding: json` cho `http_server` source. Đây là tên tùy chọn cũ, đã được thay bằng `decoding.codec` — bản trên dùng cú pháp hiện hành.
> 2. `.timestamp = now()` **ghi đè** trường `timestamp` nếu client tự gửi lên. Trong lab thì đúng ý (mọi log lấy thời gian nhận). Ở môi trường thật, thường phải giữ timestamp gốc của ứng dụng.

### 8.3 Tạo compose.yaml

```bash
cat > compose.yaml <<'EOF'
services:
  victorialogs:
    image: docker.io/victoriametrics/victoria-logs:v1.52.0
    container_name: victorialogs-lab
    restart: unless-stopped
    command:
      - -storageDataPath=/victoria-logs-data
      - -retentionPeriod=7d
    ports:
      - "9428:9428"
    volumes:
      - ./victoria-logs-data:/victoria-logs-data
    networks:
      - observability-net

  vector:
    image: timberio/vector:0.57.0-debian
    container_name: vector-lab
    restart: unless-stopped
    depends_on:
      - victorialogs
    ports:
      - "8686:8686"
      - "9000:9000"
    volumes:
      - ./vector.yaml:/etc/vector/vector.yaml:ro
    networks:
      - observability-net

networks:
  observability-net:
    driver: bridge
EOF
```

> **Lưu ý:** Phiên bản được cố định để bài lab tái lập được. Khi đổi tag, đọc release notes trước.

`-retentionPeriod=7d` là giá trị mặc định của VictoriaLogs, ghi tường minh để học viên biết chỗ điều chỉnh.

## 9. Bài 6 — Validate và khởi động stack

### 9.1 Validate Compose

```bash
cd ~/docker-practice/observability-lab
docker compose config
```

### 9.2 Validate cấu hình Vector bằng container tạm

```bash
docker run --rm \
  -v "$PWD/vector.yaml:/etc/vector/vector.yaml:ro" \
  timberio/vector:0.57.0-debian \
  validate /etc/vector/vector.yaml
```

Bước này bắt lỗi cú pháp **trước khi** khởi động stack — rất đáng làm mỗi lần sửa `vector.yaml`.

### 9.3 Khởi động

```bash
docker compose up -d
docker compose ps
sudo ss -lntp | grep -E ':(9428|8686|9000) '
```

### 9.4 Kiểm tra VictoriaLogs

```bash
curl --fail --show-error http://127.0.0.1:9428/
```

Web UI tích hợp sẵn (mở bằng trình duyệt):

```text
http://<IP_DOCKER_HOST>:9428/select/vmui
```

### 9.5 Kiểm tra Vector API

```bash
curl --fail --show-error http://127.0.0.1:8686/health
```

> **Lưu ý:** Vector API **không có authentication**. Chỉ publish port `8686` trong mạng lab hoặc vùng mạng tin cậy.

## 10. Bài 7 — Gửi log vào Vector và kiểm tra trên VictoriaLogs

### 10.1 Gửi một bản tin JSON

```bash
curl --fail --show-error \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello from docker vector lab","level":"info","app":"demo-web"}' \
  http://127.0.0.1:9000/
```

### 10.2 Gửi nhiều bản tin

```bash
for i in 1 2 3 4 5; do
  curl --silent --show-error \
    -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"message\":\"docker lab event $i\",\"level\":\"info\",\"app\":\"demo-web\"}" \
    http://127.0.0.1:9000/
done
echo "Da gui 5 ban tin"
```

> **Sửa so với bản gốc:** **Đây là lỗi nặng nhất của bản gốc.** Bản gốc viết:
>
> ```bash
> -d "{"message":"docker lab event ${i}", ...}"
> ```
>
> Nháy kép lồng trong nháy kép làm shell "nuốt" mất dấu nháy, Vector nhận về chuỗi không phải JSON hợp lệ. Cách sửa: escape thành `\"` như trên (bắt buộc dùng nháy kép ngoài vì cần khai triển `$i`).

### 10.3 Kiểm tra log của Vector

```bash
docker compose logs --tail 50 vector
```

Không được có dòng `ERROR` liên quan tới sink `victorialogs`.

### 10.4 Query log trên VictoriaLogs

Lớp truy vấn qua API `http://127.0.0.1:9428/select/logsql/query` bằng `curl --get --fail --show-error` với `--data-urlencode 'limit=20'`, lần lượt ba query: toàn bộ log gần đây (`query=*`), lọc theo nội dung message (`query=_msg:"docker lab"`) và lọc theo log stream (`query={host="docker-lab"}`). Các lệnh `curl` đầy đủ và cách đọc kết quả trên vmui nằm ở [[Compose stack thu log: VictoriaLogs, Vector và rsyslog]].

### 10.5 Kiểm chứng dữ liệu nằm trên bind mount

```bash
du -sh ./victoria-logs-data
find ./victoria-logs-data -maxdepth 2 -type d | head -30
```

Thư mục dữ liệu nằm ngay trong project và **vẫn tồn tại** sau `docker compose down`.

## 11. Bài 8 — Kiểm thử persistence

### 11.1 Ghi log trước khi recreate

```bash
curl --fail --show-error \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"message":"persistent-log-before-recreate","level":"info"}' \
  http://127.0.0.1:9000/

sleep 3
```

### 11.2 Xóa và tạo lại container

```bash
docker compose down
docker compose up -d
sleep 5
```

### 11.3 Query lại

```bash
curl --get --fail --show-error \
  http://127.0.0.1:9428/select/logsql/query \
  --data-urlencode 'query=_msg:"persistent-log-before-recreate"' \
  --data-urlencode 'limit=20'
```

Kỳ vọng: log vẫn truy vấn được, vì dữ liệu VictoriaLogs nằm trong `./victoria-logs-data` trên Docker host chứ không nằm trong lớp ghi của container.

## 12. Bài 9 — Quan sát network và mount

### 12.1 Network do Compose tạo

Compose đặt tên network theo dạng `<ten-thu-muc>_<ten-network>`, ở đây là `observability-lab_observability-net`:

```bash
docker network ls | grep observability-net
docker network inspect observability-lab_observability-net
```

Xem container nào đang nằm trong network:

```bash
docker network inspect observability-lab_observability-net \
  --format '{{range .Containers}}{{.Name}} {{end}}'
```

> **Sửa so với bản gốc:** Bản gốc dùng `docker network inspect "$(docker network ls --format '{{.Name}}' | grep observability | head -1)"`. Lệnh này chạy được nhưng khó đọc và sẽ chọn nhầm nếu máy có nhiều network chứa chữ "observability".

### 12.2 Kiểm tra mount

```bash
docker inspect victorialogs-lab --format '{{json .Mounts}}'
docker inspect vector-lab --format '{{json .Mounts}}'
```

### 12.3 DNS nội bộ giữa các container

```bash
docker compose exec vector getent hosts victorialogs
```

> **Lưu ý:** Chỉ chạy được trên container `vector` (base image Debian). Container `victorialogs` dùng base image **distroless — không có shell**, nên `docker compose exec victorialogs sh` sẽ luôn báo lỗi. Đó là thiết kế của image, không phải sự cố.

Thực chất, việc Vector gửi log thành công sang VictoriaLogs đã là bằng chứng DNS/network nội bộ hoạt động.

## 13. Bài 10 — Theo dõi log và tài nguyên

```bash
docker compose logs --tail 50
docker compose logs --follow vector    # Ctrl+C de thoat

docker stats --no-stream victorialogs-lab vector-lab
```

## 14. Bài tập 1 — Thay đổi web bằng bind mount

1. Vào `~/docker-practice/compose-web`, khởi động bằng `docker compose up -d`.
2. Truy cập web qua port `8080`.
3. Sửa `html/index.html` trên Docker host mà **không** restart container.
4. Xác minh nội dung mới xuất hiện qua `curl` hoặc trình duyệt.
5. Dùng `docker inspect compose-basic-web --format '{{json .Mounts}}'` để chỉ ra `Source` và `Destination` của bind mount.

## 15. Bài tập 2 — Build và push phiên bản 1.1

1. Sửa giao diện trang web trong `~/docker-practice/web-image/html/index.html`.
2. Build image với tag `1.1`.
3. Chạy container từ tag `1.1` trên port `8081`.
4. Tag theo namespace Docker Hub và push.
5. Pull lại image và xác minh HTTP trả về nội dung mới.

```bash
cd ~/docker-practice/web-image      # buoc nay ban goc bo sot

docker build --tag docker-web-lab:1.1 .
docker run -d --name web-lab-11 -p 8081:80 docker-web-lab:1.1
curl --fail --show-error http://127.0.0.1:8081/

docker tag docker-web-lab:1.1 "$DOCKERHUB_USER/docker-web-lab:1.1"
docker push "$DOCKERHUB_USER/docker-web-lab:1.1"

docker rm -f web-lab-11
```

> **Sửa so với bản gốc:** `docker build` bắt buộc phải chạy từ đúng thư mục chứa `Dockerfile` (build context là dấu `.`). Bản gốc đưa thẳng lệnh `docker build` mà không có bước `cd`.

## 16. Bài tập 3 — Kiểm thử end-to-end Vector → VictoriaLogs

1. Khởi động observability stack bằng `docker compose up -d`.
2. Xác minh port `9428`, `8686`, `9000` đang listen.
3. Gửi 10 log JSON có trường `app`, `level`, `message` vào Vector port `9000`.
4. Dùng `docker compose logs vector` xác minh không có lỗi gửi dữ liệu.
5. Query VictoriaLogs tìm các message vừa gửi.
6. Chạy `docker compose down` rồi `docker compose up -d`.
7. Xác minh log cũ vẫn còn nhờ bind mount `./victoria-logs-data`.

## 17. Bài tập 4 — Thay đổi port public

Đổi port host, giữ nguyên port container:

```text
Web:          18080 -> 80
VictoriaLogs: 19428 -> 9428
Vector API:   18686 -> 8686
Vector HTTP:  19000 -> 9000
```

Sửa `compose.yaml`, chạy lại `docker compose up -d` và xác minh bằng `ss` và `curl`.

> **Lưu ý:** Chỉ sửa **vế trái** của `ports`. Nếu đổi vế phải, phải sửa cả `vector.yaml` (`address: 0.0.0.0:9000`) và `uri` trỏ tới VictoriaLogs.

## 18. Xử lý sự cố — Port đã được sử dụng

```bash
sudo ss -lntp | grep -E ':(8080|9428|8686|9000) '
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Xử lý: đổi host port trong `compose.yaml`, hoặc `docker compose down` project đang chiếm port.

> **Lưu ý:** Lỗi hay gặp nhất trong tài liệu này: quên tắt bài 2 (`web-image`) trước khi chạy bài 4 (`compose-web`) — cả hai đều dùng `8080`.

## 19. Xử lý sự cố — Vector không khởi động

```bash
docker compose ps --all
docker compose logs vector

docker run --rm \
  -v "$PWD/vector.yaml:/etc/vector/vector.yaml:ro" \
  timberio/vector:0.57.0-debian \
  validate /etc/vector/vector.yaml
```

## 20. Xử lý sự cố — Vector chạy nhưng VictoriaLogs không có log

```bash
docker compose logs --tail 100 vector
docker compose logs --tail 100 victorialogs
curl --fail --show-error http://127.0.0.1:9428/
curl --fail --show-error http://127.0.0.1:8686/health
```

Kiểm tra `uri` trong `vector.yaml` phải dùng hostname service `victorialogs`, **không** dùng `127.0.0.1`. Bên trong container Vector, `127.0.0.1` chính là container Vector.

Bật debug phía VictoriaLogs bằng cách thêm `&debug=1` vào cuối `uri`, rồi xem `docker compose logs victorialogs` để biết VictoriaLogs hiểu các trường như thế nào.

## 21. Xử lý sự cố — VictoriaLogs không ghi được vào `./victoria-logs-data`

Triệu chứng: container `victorialogs-lab` restart liên tục, log có `permission denied`.

```bash
docker compose logs victorialogs
ls -ld ./victoria-logs-data
```

Xử lý: cấp quyền ghi cho thư mục bind mount trên host.

```bash
sudo chown -R "$(id -u):$(id -g)" ./victoria-logs-data
chmod 755 ./victoria-logs-data
docker compose up -d
```

## 22. Xử lý sự cố — Bind mount không cập nhật

```bash
pwd
ls -la
cat compose.yaml
docker inspect web-lab --format '{{json .Mounts}}'
```

Đảm bảo chạy `docker compose` từ **đúng thư mục project** — đường dẫn `./...` trong `compose.yaml` được tính tương đối so với vị trí file `compose.yaml`.

## 23. Xử lý sự cố — Docker Hub push bị denied

```bash
docker logout
docker login
echo "$DOCKERHUB_USER/docker-web-lab:1.0"
docker image ls | grep docker-web-lab
```

Kiểm tra: username có đúng không, repository đã tồn tại chưa, tài khoản có quyền push không, và tag image đã đúng dạng `<username>/<repository>:<tag>` chưa.

## 24. Dọn tài nguyên web lab

```bash
cd ~/docker-practice/web-image
docker compose down 2>/dev/null || true

cd ~/docker-practice/compose-web
docker compose down 2>/dev/null || true

docker rm -f dockerhub-web-test web-lab-11 2>/dev/null || true
```

## 25. Dọn VictoriaLogs + Vector

```bash
cd ~/docker-practice/observability-lab
docker compose down
```

> **Lưu ý:** `docker compose down` **không** xóa thư mục bind mount `./victoria-logs-data`. Muốn xóa dữ liệu lab phải xóa thủ công, sau khi chắc chắn không cần nữa.

```bash
# CHI dung khi chac chan muon xoa toan bo du lieu lab
# rm -rf ~/docker-practice/observability-lab/victoria-logs-data
```

Xóa image nếu muốn thu hồi dung lượng:

```bash
docker image rm docker-web-lab:1.0 docker-web-lab:1.1 2>/dev/null || true
docker system df
```

## 26. Checklist nghiệm thu

- [ ] Build được web image từ `Dockerfile`.
- [ ] Chạy được web bằng `docker compose up -d`.
- [ ] Web truy cập được qua public port `8080`.
- [ ] Bind mount `./html` hoạt động (sửa file, không restart, nội dung đổi ngay).
- [ ] Tag và push image lên Docker Hub thành công.
- [ ] Xóa cả tag local, pull lại từ Docker Hub và chạy được.
- [ ] Compose web cơ bản hoạt động độc lập với image tự build.
- [ ] VictoriaLogs chạy và public port `9428`.
- [ ] Vector API chạy và public port `8686`.
- [ ] Vector HTTP source chạy và public port `9000`.
- [ ] `vector.yaml` được bind mount từ thư mục hiện tại.
- [ ] `vector validate` chạy sạch, không lỗi cú pháp.
- [ ] Dữ liệu VictoriaLogs nằm trong `./victoria-logs-data`.
- [ ] Gửi log vào Vector thành công (một bản tin và vòng lặp 5 bản tin).
- [ ] Vector chuyển log sang VictoriaLogs, log Vector không có `ERROR`.
- [ ] Query được log bằng LogsQL, cả `_msg:` và `{host="..."}`.
- [ ] Log vẫn tồn tại sau `docker compose down` rồi `up -d`.

## 27. Ghi chú khi chuyển từ Lab sang Production

- **Không** public Vector API `8686` ra mạng không tin cậy — API không có authentication.
- Không publish mọi service trên `0.0.0.0` nếu không có nhu cầu; bind về IP cụ thể.
- Dùng firewall/ACL giới hạn nguồn truy cập.
- Pin version image thay vì `latest`.
- Thiết lập giới hạn CPU/memory và `healthcheck`.
- Thiết lập retention, dung lượng và backup cho VictoriaLogs (`-retentionPeriod`, `-storage.minFreeDiskSpaceBytes`).
- Quản lý credential Docker Hub bằng cơ chế secret phù hợp.
- Không đưa password, token, secret vào `Dockerfile`/image.
- Cân nhắc named volume hoặc storage chuyên dụng thay cho bind mount.
- Bổ sung TLS/authentication hoặc reverse proxy khi service ra mạng không tin cậy.
- Cân nhắc giữ timestamp gốc của ứng dụng thay vì `now()` trong `remap`.

## 28. Nguồn tham khảo chính thức

- Docker — Dockerfile / Build / Port publishing / Bind mounts / Compose: [https://docs.docker.com/](https://docs.docker.com/)
- VictoriaLogs — Quick Start (bao gồm lệnh Docker chuẩn): [https://docs.victoriametrics.com/victorialogs/quickstart/](https://docs.victoriametrics.com/victorialogs/quickstart/)
- VictoriaLogs — Data Ingestion: Vector Setup: [https://docs.victoriametrics.com/victorialogs/data-ingestion/vector/](https://docs.victoriametrics.com/victorialogs/data-ingestion/vector/)
- VictoriaLogs — LogsQL: [https://docs.victoriametrics.com/victorialogs/logsql/](https://docs.victoriametrics.com/victorialogs/logsql/)
- Vector — Install on Docker: [https://vector.dev/docs/setup/installation/platforms/docker/](https://vector.dev/docs/setup/installation/platforms/docker/)
- Vector — `http_server` source: [https://vector.dev/docs/reference/configuration/sources/http_server/](https://vector.dev/docs/reference/configuration/sources/http_server/)

## Phụ lục A — Những điểm đã sửa so với bản gốc

| # | Vấn đề trong bản gốc | Mức độ | Xử lý |
| --- | --- | --- | --- |
| 1 | Vòng lặp gửi log: `-d "{"message":"docker lab event ${i}", ...}"` — nháy kép lồng nhau, shell phá vỡ JSON | **Nghiêm trọng** | Escape thành `\"` (mục 10.2) |
| 2 | Bài tập 2 gọi `docker build -t ... .` mà không có bước `cd` vào `web-image` | **Nghiêm trọng** | Thêm `cd ~/docker-practice/web-image` |
| 3 | Kiểm thử pull lại chỉ xóa tag Docker Hub, tag local `docker-web-lab:1.0` vẫn giữ image → `docker pull` không tải gì, bài kiểm thử vô nghĩa | Cao | Xóa cả hai tag trước khi pull |
| 4 | 7 biến `export` (`LAB_DIR`, `WEB_PORT`, `VLOGS_PORT`…) — mất khi mở terminal mới | Cao | Bỏ hết, chỉ giữ `DOCKERHUB_USER` |
| 5 | Ba bài lab đều dùng port `8080` nhưng không có cảnh báo phải `down` bài trước | Cao | Thêm cảnh báo ở đầu tài liệu, mục 6.1 và mục 18 |
| 6 | `sources.http_input.encoding: json` — tùy chọn cũ của `http_server` | Trung bình | Đổi sang `decoding.codec: json` |
| 7 | `docker ps --format 'table {{.Names}}<TAB>{{.Ports}}'` — ký tự tab thật, hỏng khi copy | Trung bình | Đổi thành `\t` |
| 8 | `container_name: docker-web-lab` trùng tên image | Trung bình | Đổi container thành `web-lab` |
| 9 | `docker network inspect "$(docker network ls ... \| grep ... \| head -1)"` — khó đọc, dễ chọn nhầm | Trung bình | Dùng thẳng tên `observability-lab_observability-net` + giải thích quy tắc đặt tên |
| 10 | `docker run --rm -d` cho container test: lỗi là mất luôn log | Thấp | Bỏ `--rm`, xóa thủ công sau khi xem log |
| 11 | Không nhắc image VictoriaLogs là **distroless** (không có shell) → `exec sh` luôn thất bại | Thấp | Ghi chú ở mục 12.3 |
| 12 | Không có mục xử lý lỗi permission trên bind mount `./victoria-logs-data` | Thấp | Thêm mục 21 |
| 13 | Không nhắc `.timestamp = now()` ghi đè timestamp gốc của ứng dụng | Thấp | Thêm ghi chú ở mục 8.2 và phần Production |
| 14 | Không giới thiệu Web UI `/select/vmui` của VictoriaLogs | Thấp | Bổ sung ở mục 9.4 |
| 15 | Compose file ghi bằng heredoc không quote, phụ thuộc biến shell | Thấp | Dùng `<<'EOF'` ghi nguyên văn |
| 16 | Danh sách mục tiêu và checklist bị vỡ định dạng khi xuất từ Word | Thấp | Viết lại thành list/checkbox markdown |
