---
title: Mạng bridge mặc định của Docker và cách publish cổng bằng -p
tags: docker, networking, bridge, port-publishing, ubuntu
type: lab
---

> [!TLDR]
> - Container không gắn `--network` nào sẽ vào mạng `bridge` mặc định, nối với máy chủ qua cầu ảo `docker0`.
> - Cổng trong container không tự mở ra ngoài; muốn truy cập từ ngoài phải publish bằng `-p cổng_host:cổng_container`.
> - `-p 8080:80` mở cổng trên mọi địa chỉ của máy chủ, còn `-p 127.0.0.1:8080:80` chỉ cho chính máy chủ truy cập.

## Mục tiêu

Sau bài này bạn hiểu container "nằm ở đâu" trên mạng khi vừa chạy `docker run`, biết xem mạng bridge mặc định, và publish một cổng ra ngoài đúng cách, kể cả cách giới hạn chỉ cho máy chủ truy cập. Đây là bài đầu của chuỗi về mạng trong Docker; hai bài sau nói về mạng tự tạo và mạng host.

## Chuẩn bị

- Ubuntu 24.04 LTS đã cài Docker Engine. Nếu chưa, xem [[Cài Docker Engine trên Ubuntu 24.04 từ kho apt chính thức của Docker]]. Bài viết kiểm theo Docker Engine 29.
- Quyền chạy lệnh `docker` (người dùng thuộc nhóm `docker` hoặc dùng `sudo`).
- Cổng 8080 trên máy chủ đang trống. Nếu chưa chắc, bạn có thể xem cách kiểm tra cổng đang nghe ở [[Kiểm tra kết nối mạng trên Ubuntu bằng ip, ss, ping và tracepath]].

## Mạng bridge mặc định là gì

Khi cài xong, Docker tạo sẵn ba mạng. Hãy xem:

```bash
docker network ls
```

Bạn sẽ thấy ba mạng tên `bridge`, `host` và `none`. Mạng tên `bridge` dùng driver `bridge` và là mạng **mặc định**: mọi container chạy mà không có tuỳ chọn `--network` đều được gắn vào đó.

Về bản chất, driver bridge là một chiếc cầu nối (bridge) phần mềm trong nhân Linux. Các container cùng gắn vào một cầu có thể nói chuyện với nhau, đồng thời được cách ly khỏi container ở cầu khác. Với mạng mặc định, cầu ấy hiện trên máy chủ dưới tên `docker0`:

```bash
ip addr show docker0
```

Mỗi container nhận một địa chỉ IP riêng trong dải riêng tư của cầu. Địa chỉ này chỉ có nghĩa bên trong máy chủ. Để xem cầu có những container nào và dải địa chỉ ra sao, dùng:

```bash
docker network inspect bridge
```

Đầu ra là JSON; hãy nhìn các mục `IPAM` (dải địa chỉ) và `Containers` (danh sách container đang gắn).

Hai điều cần nhớ về mạng mặc định:

1. Container ra ngoài Internet được, vì Docker dùng NAT (masquerade) để địa chỉ của container được thay bằng địa chỉ của máy chủ khi đi ra.
2. Container trên mạng mặc định chỉ thấy nhau qua địa chỉ IP, không tra được nhau theo tên. Chuyện này sẽ giải quyết ở bài kế tiếp.

## Các bước: publish một cổng

Chạy một máy chủ web nginx ở chế độ nền:

```bash
docker run -d --name web nginx
```

Nginx trong container nghe ở cổng 80, nhưng cổng đó chỉ tồn tại bên trong mạng bridge. Từ trình duyệt hay từ máy khác, bạn không với tới nó. Để mở cổng, hãy publish.

Xoá container cũ (lệnh này **xoá container `web`**; dữ liệu nằm trong container, nếu có, sẽ mất) rồi chạy lại với `-p`:

```bash
docker rm -f web
docker run -d --name web -p 8080:80 nginx
```

Cú pháp là `-p cổng_host:cổng_container`. Ở đây cổng 8080 của máy chủ được ánh xạ tới cổng 80 của container. Docker thực hiện ánh xạ bằng các quy tắc tường lửa (NAT và chuyển tiếp gói), không phải bằng việc "mở" cổng trong container.

Liệt kê các ánh xạ của container:

```bash
docker port web
```

### Chỉ cho máy chủ truy cập

Theo tài liệu của Docker, `-p 8080:80` tạo ánh xạ cho **mọi địa chỉ** của máy chủ (`0.0.0.0` và `[::]`), nghĩa là có thể truy cập từ bên ngoài nếu mạng cho phép. Nếu chỉ cần máy chủ tự gọi tới, ví dụ vì phía trước đã có một reverse proxy cùng máy, hãy ghi rõ địa chỉ:

```bash
docker rm -f web
docker run -d --name web -p 127.0.0.1:8080:80 nginx
```

Giờ chỉ truy cập được qua địa chỉ loopback của chính máy chủ. Có thể đặt cả cổng IPv6 loopback bằng `-p '[::1]:8080:80'`.

### Chọn cổng ngẫu nhiên

Nếu không cần cổng cố định, bỏ phần cổng host: `-p 80` sẽ để Docker chọn một cổng trống trên máy chủ. Tuỳ chọn viết hoa `-P` publish mọi cổng mà image khai báo bằng `EXPOSE` ra các cổng ngẫu nhiên. Cần phân biệt: chỉ dòng `EXPOSE` trong Dockerfile **không** publish gì cả, nó chỉ ghi chú cổng mà ứng dụng dùng.

## Kiểm tra

Từ chính máy chủ:

```bash
curl -I http://127.0.0.1:8080
```

Bạn sẽ nhận phản hồi HTTP 200 từ nginx. Với kiểu `-p 8080:80` (không giới hạn địa chỉ), thử gọi từ một máy khác trong cùng mạng tới `http://địa-chỉ-máy-chủ:8080` cũng sẽ thấy trang nginx; với kiểu `127.0.0.1:8080:80` thì lệnh đó phải thất bại. Dùng `docker ps` để xem cột PORTS khớp với những gì bạn đã đặt.

Dọn dẹp khi xong (xoá container `web`):

```bash
docker rm -f web
```

## Lỗi hay gặp

- **`port is already allocated` hoặc `address already in use`**: cổng host đã có chương trình khác dùng. Chọn cổng khác hoặc dừng chương trình đó.
- **Gọi từ ngoài không được dù đã `-p`**: kiểm tra container có đang chạy (`docker ps`), ứng dụng trong container có nghe ở mọi địa chỉ chứ không chỉ `127.0.0.1` của chính container, và tường lửa của mạng phía trước.
- **Tưởng `ufw` chặn được cổng đã publish**: tài liệu Docker nêu rõ Docker và `ufw` dùng quy tắc tường lửa theo cách không tương thích; gói đi qua bảng nat của Docker bị chuyển hướng trước khi tới các chuỗi mà `ufw` quản lý, nên các quy tắc `ufw` thường không áp dụng cho cổng đã publish. Muốn chặn truy cập từ ngoài, hãy publish vào `127.0.0.1` hoặc đọc kỹ trang tài liệu về tường lửa ở phần Tham khảo.
- **Nhầm `EXPOSE` với `-p`**: như đã nói, `EXPOSE` chỉ là tài liệu, `-p` mới tạo ánh xạ.

## Tóm lại

Mạng `bridge` mặc định nối container với máy chủ qua `docker0`, cho phép ra Internet nhưng giữ cổng của container ở bên trong. Muốn truy cập từ ngoài, publish bằng `-p`; muốn an toàn hơn thì gắn vào `127.0.0.1`. Container trên mạng mặc định chưa gọi nhau bằng tên được, nên bài sau sẽ tạo mạng riêng để giải quyết.

## Tham khảo

- [Networking overview, Docker Docs](https://docs.docker.com/engine/network/)
- [Bridge network driver, Docker Docs](https://docs.docker.com/engine/network/drivers/bridge/)
- [Port publishing and mapping, Docker Docs](https://docs.docker.com/engine/network/port-publishing/)
- [Packet filtering and firewalls, Docker Docs](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
