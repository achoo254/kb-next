---
title: Docker Compose chạy ứng dụng nhiều dịch vụ: depends_on chờ healthy và tệp .env
tags: docker, docker compose, depends_on, healthcheck, biến môi trường
type: lab
---

> [!TLDR]
> - Một tệp `compose.yaml` mô tả cả ứng dụng (web, cơ sở dữ liệu...) và `docker compose up` dựng tất cả cùng lúc.
> - `depends_on` với `condition: service_healthy` làm dịch vụ chờ phụ thuộc thật sự sẵn sàng, không chỉ "đã khởi động".
> - Giá trị thay đổi theo máy (mật khẩu, cổng) để trong tệp `.env`, không ghi cứng và không đưa lên kho mã.

## Mục tiêu

Chạy một ứng dụng gồm hai dịch vụ, `app` và `db` (PostgreSQL), bằng một lệnh duy nhất. Bạn sẽ thấy `app` chỉ khởi động khi `db` báo khoẻ, và mật khẩu nằm trong `.env` thay vì trong tệp cấu hình.

## Chuẩn bị

- Ubuntu 24.04 LTS đã cài Docker Engine kèm plugin Compose (xem [[Cài Docker Engine trên Ubuntu 24.04 từ kho apt chính thức của Docker]]). Kiểm tra bằng `docker compose version`; bài này thử với Compose v5.
- Một thư mục dự án trống, ví dụ `~/demo`, và một ứng dụng có Dockerfile. Nếu muốn ứng dụng gọn, xem cách làm image nhẹ ở [[Dockerfile nhiều tầng (multi-stage): build nặng, image chạy nhẹ]].

## Vì sao cần Compose

Chạy từng container bằng `docker run` với hàng chục tuỳ chọn rất dễ sai và khó nhớ. Compose đặt mọi thứ vào một tệp: image nào, cổng nào, biến môi trường nào, dịch vụ nào phụ thuộc dịch vụ nào. Tệp này nằm cạnh mã nguồn, nên cả nhóm chạy giống nhau. Tên tệp nên dùng là `compose.yaml`; trường `version` ở đầu tệp đã lỗi thời và có thể bỏ.

Compose cũng tạo sẵn một mạng riêng cho dự án. Các dịch vụ gọi nhau bằng **tên dịch vụ**: `app` kết nối tới cơ sở dữ liệu ở địa chỉ `db`, cổng 5432, không cần biết IP.

## Các bước

### Bước 1: viết tệp compose.yaml

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD:?hãy đặt DB_PASSWORD trong .env}
      POSTGRES_DB: appdb
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d appdb"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s

  app:
    build: .
    ports:
      - "${APP_PORT:-8080}:8080"
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/appdb
    depends_on:
      db:
        condition: service_healthy
```

Một vài điểm cần hiểu:

- `${APP_PORT:-8080}` nghĩa là "lấy biến `APP_PORT`, nếu chưa đặt thì dùng 8080".
- `${DB_PASSWORD:?...}` buộc biến phải có; thiếu thì Compose dừng và in thông báo, tránh chạy cơ sở dữ liệu với mật khẩu rỗng.
- `healthcheck` của `db` dùng `pg_isready`, công cụ có sẵn trong image PostgreSQL, để biết máy chủ đã nhận kết nối chưa. Ý tưởng HEALTHCHECK giống bài [[Chạy container không bằng root và thêm HEALTHCHECK để biết ứng dụng còn sống]].

### Bước 2: tạo tệp .env

Cùng thư mục với `compose.yaml`, tạo `.env`:

```bash
DB_PASSWORD=doi-mat-khau-nay
APP_PORT=8080
```

Compose tự đọc tệp `.env` ở thư mục dự án để thay các `${...}` trong `compose.yaml`. Hãy thêm `.env` vào `.gitignore`; nếu cần chia sẻ mẫu, commit một tệp `.env.example` chỉ có giá trị giả.

Lưu ý hai việc khác nhau: `.env` dùng để **thay giá trị trong tệp compose**, còn mục `env_file:` của một dịch vụ mới là nạp biến **vào bên trong container**. Muốn biến từ `.env` có mặt trong container, bạn phải khai ở `environment:` như ví dụ trên (hoặc dùng `env_file:`).

### Bước 3: xem kết quả sau khi thay biến

```bash
docker compose config
```

Lệnh in tệp cấu hình cuối cùng với mọi biến đã được thay. Nó cũng báo lỗi cú pháp, nên nên chạy trước khi `up`. Lưu ý đầu ra chứa mật khẩu thật, đừng dán vào chỗ công khai.

### Bước 4: chạy

```bash
docker compose up -d --wait
```

`-d` chạy nền; `--wait` khiến lệnh chờ tới khi các dịch vụ ở trạng thái running (hoặc healthy nếu có healthcheck), rồi mới trả về. Nếu có dịch vụ không khoẻ, lệnh báo lỗi, rất tiện cho script triển khai.

## Điều gì xảy ra với depends_on

Dạng viết ngắn `depends_on: [db]` chỉ đảm bảo container `db` được **bắt đầu** trước `app`. Mà PostgreSQL cần vài giây để khởi tạo, nên `app` có thể mở kết nối quá sớm và lỗi. Dạng đầy đủ ở trên có ba điều kiện:

| Điều kiện | Ý nghĩa |
| --- | --- |
| `service_started` | Container đã được khởi động (mặc định) |
| `service_healthy` | Healthcheck của dịch vụ đã báo khoẻ |
| `service_completed_successfully` | Dịch vụ chạy xong và thoát với mã 0, hợp cho bước migrate cơ sở dữ liệu |

Điều kiện `service_healthy` chỉ dùng được khi dịch vụ phụ thuộc **có** `healthcheck`. Ứng dụng của bạn vẫn nên biết thử lại kết nối khi cơ sở dữ liệu chập chờn; `depends_on` chỉ lo thứ tự lúc khởi động.

## Kiểm tra

```bash
docker compose ps
docker compose logs --tail 20 app
```

Cột trạng thái của `db` phải là `healthy`, và `app` là `running`. Thử bỏ dòng `DB_PASSWORD` khỏi `.env` rồi chạy lại `docker compose config`: bạn sẽ thấy thông báo lỗi đã đặt ở `:?`.

Khi xong việc:

```bash
docker compose down
```

Lệnh này dừng và xoá container cùng mạng của dự án. Dữ liệu trong volume vẫn còn; thêm `-v` sẽ xoá cả volume, nên **cảnh báo**: `docker compose down -v` xoá vĩnh viễn dữ liệu cơ sở dữ liệu.

## Lỗi hay gặp

- **`app` lỗi kết nối dù đã có `depends_on`**: bạn dùng dạng ngắn, hoặc `db` thiếu `healthcheck`. Chuyển sang `condition: service_healthy`.
- **Biến trống trong container**: biến chỉ có trong `.env` mà chưa khai ở `environment:` hay `env_file:`.
- **Sửa `.env` mà không có tác dụng**: chạy lại `docker compose up -d` để Compose tạo lại container với giá trị mới.
- **Mật khẩu đã bị lộ vào kho mã**: đổi mật khẩu ngay, rồi thêm `.env` vào `.gitignore`.
- **Đổi mật khẩu trong `.env` nhưng cơ sở dữ liệu vẫn nhận mật khẩu cũ**: PostgreSQL chỉ đọc `POSTGRES_PASSWORD` lần đầu khởi tạo thư mục dữ liệu; dữ liệu đã nằm trong volume thì phải đổi mật khẩu bằng lệnh SQL. Chuyện dữ liệu nằm ở đâu được giải thích trong [[Volume có tên và bind mount: dữ liệu sống ở đâu khi container bị xoá]].

## Tóm lại

Compose gom cả ứng dụng vào một tệp: dùng `depends_on` với `service_healthy` để chờ đúng lúc, `.env` cho giá trị riêng từng máy, và `docker compose config` để soát lại trước khi chạy. Bước tiếp theo hợp lý là hiểu dữ liệu của `db` được lưu ở đâu.

## Tham khảo

- [Control startup and shutdown order in Compose](https://docs.docker.com/compose/how-tos/startup-order/)
- [Set environment variables in Compose](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)
- [Interpolation in Compose files](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Compose file reference: services](https://docs.docker.com/reference/compose-file/services/)
- [docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/)
