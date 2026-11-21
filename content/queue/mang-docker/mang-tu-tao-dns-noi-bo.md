---
title: Mạng bridge tự tạo trong Docker: container gọi nhau bằng tên nhờ DNS nội bộ
tags: docker, networking, user-defined-bridge, dns, ubuntu
type: lab
---

> [!TLDR]
> - Trên mạng bridge tự tạo (`docker network create`), container phân giải được nhau theo tên hoặc bí danh; trên mạng mặc định thì không.
> - Mạng tự tạo cách ly tốt hơn: chỉ container cùng mạng mới thấy nhau, và có thể gắn hoặc gỡ container khỏi mạng khi đang chạy.
> - Ứng dụng nên gọi `http://web` thay vì địa chỉ IP, vì IP của container có thể đổi sau mỗi lần tạo lại.

## Mục tiêu

Bạn sẽ tạo một mạng bridge riêng, chạy hai container trong đó và cho chúng gọi nhau bằng tên. Bạn cũng sẽ thấy rõ vì sao nên dùng mạng tự tạo thay vì mạng mặc định cho các ứng dụng gồm nhiều container.

## Chuẩn bị

- Docker Engine trên Ubuntu 24.04 LTS (bài viết kiểm theo bản 29).
- Đã đọc [[Mạng bridge mặc định của Docker và cách publish cổng bằng -p]] để biết mạng `bridge` mặc định hoạt động ra sao.
- Có kết nối Internet để tải image `nginx` và `busybox`.

## Vì sao mạng mặc định chưa đủ

Theo tài liệu Docker, mạng bridge tự tạo có những ưu điểm so với mạng mặc định:

- **Phân giải tên tự động.** Trên mạng mặc định, container chỉ thấy nhau qua địa chỉ IP (trừ khi dùng cờ `--link`, được tài liệu xếp vào loại cũ, legacy). Trên mạng tự tạo, container tra nhau theo tên hoặc bí danh.
- **Cách ly tốt hơn.** Mọi container không chỉ định `--network` đều rơi vào mạng mặc định, nên các dịch vụ chẳng liên quan vẫn có thể nói chuyện với nhau. Mạng tự tạo giữ mỗi ứng dụng trong vòng riêng.
- **Gắn và gỡ khi đang chạy.** Với mạng tự tạo, bạn có thể `connect` hoặc `disconnect` container ngay khi nó đang chạy. Muốn đưa container ra khỏi mạng mặc định thì phải dừng và tạo lại.

Điểm đầu tiên là điểm bạn dùng hằng ngày: địa chỉ IP của container do Docker cấp và có thể đổi khi container được tạo lại, còn tên thì bạn tự đặt và ổn định.

## Các bước

### 1. Tạo mạng

```bash
docker network create app-net
docker network ls
```

Không chỉ định driver thì Docker dùng driver `bridge`. Muốn tự chọn dải địa chỉ, thêm `--subnet 192.0.2.0/24` (ở đây dùng dải ví dụ; trên máy thật hãy chọn dải riêng tư không đụng mạng của bạn).

### 2. Chạy container trong mạng đó

```bash
docker run -d --name web --network app-net nginx
```

Tên container `web` chính là tên DNS trong mạng `app-net`. Lưu ý theo tài liệu: dịch vụ phân giải tự động chỉ nhận các tên bạn đặt (và bí danh), không nhận tên ngẫu nhiên Docker tự sinh.

### 3. Gọi bằng tên từ container khác

Chạy một container tạm cùng mạng để gọi `web`. Cờ `--rm` tự xoá container tạm khi nó kết thúc:

```bash
docker run --rm --network app-net busybox wget -qO- http://web
```

Bạn sẽ nhận về nội dung trang chào của nginx. Không cần biết IP của `web`, và cũng không cần publish cổng: giao tiếp giữa container cùng mạng đi thẳng qua cầu ảo.

### 4. Bí danh mạng

Một container có thể có thêm tên gọi trong một mạng bằng `--network-alias`:

```bash
docker run -d --name web2 --network app-net --network-alias frontend nginx
docker run --rm --network app-net busybox wget -qO- http://frontend
```

Bí danh hữu ích khi ứng dụng được cấu hình sẵn một tên như `db` hay `cache` còn tên container thật khác.

### 5. Gắn thêm một mạng khi đang chạy

Giả sử có container cần nói chuyện với hai ứng dụng khác nhau. Tạo mạng thứ hai rồi gắn vào:

```bash
docker network create other-net
docker network connect other-net web
docker network inspect other-net
```

Giờ `web` có mặt ở cả hai mạng, và các container ở `other-net` gọi được `web` theo tên. Muốn gỡ: `docker network disconnect other-net web`.

## Kiểm tra

- `docker network inspect app-net` liệt kê các container đang gắn kèm địa chỉ của chúng.
- Thử đối chứng trên mạng mặc định: `docker run --rm busybox wget -qO- http://web` sẽ thất bại vì tên `web` không được phân giải ở đó (container tạm không cùng mạng `app-net`).
- Lệnh `docker ps` cho thấy `web` không có cổng publish nào, nhưng truy cập từ container cùng mạng vẫn hoạt động.

Dọn dẹp (các lệnh này **xoá container và mạng**; dữ liệu trong container sẽ mất):

```bash
docker rm -f web web2
docker network rm app-net other-net
```

`docker network rm` chỉ chạy được khi không còn container nào dùng mạng đó.

## Lỗi hay gặp

- **Gọi theo tên không được**: hai container không cùng một mạng tự tạo, hoặc bạn đang ở mạng `bridge` mặc định. Kiểm tra bằng `docker network inspect`.
- **Dùng tên tự sinh để gọi**: tên ngẫu nhiên Docker sinh khi bạn không đặt `--name` không được phân giải; hãy tự đặt tên.
- **Tên mạng đã tồn tại**: `docker network create` báo lỗi nếu trùng; đặt tên khác hoặc dùng mạng có sẵn.
- **Xung đột dải địa chỉ**: dải do bạn chọn bằng `--subnet` trùng với mạng đã có trên máy hoặc mạng nội bộ của bạn; chọn dải khác.
- **Nhầm hai mạng cách ly là chặn được truy cập từ ngoài**: cách ly này chỉ nói về container với nhau. Cổng đã publish bằng `-p` vẫn mở ra theo cách đã nêu ở bài trước.

## Tóm lại

Hãy xem mạng tự tạo là mặc định tốt cho mọi ứng dụng nhiều container: mỗi ứng dụng một mạng, container gọi nhau bằng tên, và chỉ publish cổng của dịch vụ cần phục vụ người dùng. Khi nào mới nên bỏ hẳn lớp mạng ảo này? Bài tiếp theo nói về mạng host.

## Tham khảo

- [Bridge network driver, Docker Docs](https://docs.docker.com/engine/network/drivers/bridge/)
- [Networking overview, Docker Docs](https://docs.docker.com/engine/network/)
- [docker network create, Docker Docs](https://docs.docker.com/reference/cli/docker/network/create/)
- [Networking using a standalone container, Docker Docs](https://docs.docker.com/engine/network/tutorials/standalone/)
