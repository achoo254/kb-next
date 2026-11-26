---
title: Volume có tên và bind mount: dữ liệu sống ở đâu khi container bị xoá
tags: docker, volume, bind mount, sao lưu, quyền tệp
type: note
---

> [!TLDR]
> - Lớp ghi của container biến mất cùng container; dữ liệu cần giữ phải nằm trong volume có tên hoặc bind mount.
> - Volume có tên do Docker quản lý, hợp cho dữ liệu của ứng dụng; bind mount trỏ thẳng vào thư mục trên máy chủ, hợp cho mã nguồn hoặc cấu hình.
> - Sao lưu một volume bằng một container tạm chạy `tar`; chạy không bằng root thì phải chú ý chủ sở hữu tệp.

## Mở đầu

Khi bạn xoá một container, mọi thứ ứng dụng đã ghi vào hệ tệp của nó (lớp ghi) mất theo. Với một máy chủ web không trạng thái thì không sao, nhưng với cơ sở dữ liệu, tệp tải lên hay chứng chỉ thì đó là thảm hoạ. Docker có hai cách chính để đặt dữ liệu **ra ngoài** vòng đời của container: volume có tên và bind mount. Bài này giải thích khác biệt, cách chọn, cách sao lưu và vì sao quyền tệp hay gây rắc rối.

## Ba nơi dữ liệu có thể sống

1. **Lớp ghi của container**: tạm thời, mất khi container bị xoá (`docker rm`) và chậm hơn so với volume khi ghi nhiều.
2. **Volume**: một thư mục do Docker tạo và quản lý trên máy chủ (với driver `local`, nằm dưới thư mục dữ liệu của Docker). Có tên thì dễ gọi lại; không đặt tên thì Docker đặt tên ngẫu nhiên và gọi là volume ẩn danh.
3. **Bind mount**: bạn chỉ định một đường dẫn có sẵn trên máy chủ, ví dụ `/srv/app/config`, và gắn nó vào container.

## Volume có tên

Tạo và dùng:

```bash
docker volume create pgdata
docker run -d --name db -e POSTGRES_PASSWORD=doi-mat-khau-nay \
  -v pgdata:/var/lib/postgresql/data postgres:16
```

Tuỳ chọn `-v pgdata:/var/lib/postgresql/data` gắn volume `pgdata` vào đường dẫn dữ liệu của PostgreSQL 16. Thử xoá container rồi chạy lại với cùng volume:

```bash
docker rm -f db
docker run -d --name db -e POSTGRES_PASSWORD=doi-mat-khau-nay \
  -v pgdata:/var/lib/postgresql/data postgres:16
```

Cơ sở dữ liệu cũ vẫn còn nguyên. Một số lệnh hữu ích:

```bash
docker volume ls
docker volume inspect pgdata
```

`inspect` cho biết `Mountpoint`, tức nơi volume nằm trên máy chủ. Bạn nên coi đó là chi tiết nội bộ của Docker và thao tác qua Docker, không sửa tệp trực tiếp ở đó.

Trong tệp Compose, viết như sau:

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Dùng Compose thì tên volume thật được thêm tiền tố là tên dự án, ví dụ `demo_pgdata`; hãy xem tên đúng bằng `docker volume ls`.

**Xoá container không xoá volume có tên.** Volume chỉ mất khi bạn tự tay xoá bằng `docker volume rm`, bằng `docker compose down -v`, hoặc bằng `docker volume prune`. Về `prune`: mặc định lệnh chỉ dọn volume **ẩn danh** không được container nào dùng; thêm `--all` (`-a`) thì dọn cả volume có tên không dùng. **Cảnh báo:** các lệnh này xoá dữ liệu vĩnh viễn, hãy đọc kỹ danh sách trước khi xác nhận.

## Bind mount

Bind mount hợp khi bạn muốn container thấy một thư mục cụ thể của máy chủ, như tệp cấu hình hay mã nguồn khi phát triển:

```bash
mkdir -p /srv/app/config
docker run -d --name web \
  --mount type=bind,src=/srv/app/config,dst=/etc/app,readonly \
  nginx:stable
```

Cú pháp `--mount` rõ ràng hơn `-v`, và có một khác biệt đáng nhớ: nếu đường dẫn nguồn chưa tồn tại, `--mount type=bind` báo lỗi, còn `-v /duong/dan:/dich` sẽ lặng lẽ tạo thư mục đó (thường thuộc sở hữu root). Thêm `readonly` khi container chỉ cần đọc. Hãy nhớ rằng bind mount phụ thuộc cấu trúc thư mục của máy chủ nên kém di động hơn volume.

| Tiêu chí | Volume có tên | Bind mount |
| --- | --- | --- |
| Ai quản lý | Docker | Bạn |
| Đường dẫn trên máy chủ | Do Docker chọn | Do bạn chọn |
| Hợp cho | Dữ liệu ứng dụng, cơ sở dữ liệu | Cấu hình, mã nguồn khi phát triển |
| Sao lưu | Qua Docker (xem dưới) | Sao lưu thư mục như thường |

## Quyền tệp khi chạy không root

Khi container chạy bằng người dùng thường (cách làm tốt, xem [[Chạy container không bằng root và thêm HEALTHCHECK để biết ứng dụng còn sống]]), quyền ghi vào chỗ gắn là chuyện hay gặp lỗi "Permission denied":

- **Volume có tên mới, còn trống**: Docker sao nội dung và quyền của thư mục đích trong image vào volume lần đầu. Nếu image đã `chown` thư mục đó cho người dùng không root thì mọi thứ êm.
- **Bind mount**: container thấy đúng chủ sở hữu và quyền của thư mục trên máy chủ, tính theo **số UID/GID**, không theo tên. Nếu container chạy với UID 1000 mà thư mục thuộc root, việc ghi sẽ thất bại.

Cách xử lý: tạo thư mục trước và đặt chủ sở hữu khớp với UID mà container dùng, ví dụ:

```bash
sudo mkdir -p /srv/app/data
sudo chown 1000:1000 /srv/app/data
docker run --rm --user 1000:1000 \
  --mount type=bind,src=/srv/app/data,dst=/data \
  ubuntu:24.04 touch /data/thu.txt
```

Tránh "chữa cháy" bằng `chmod 777`, vì mọi tiến trình trên máy chủ sẽ ghi được vào thư mục đó.

## Sao lưu và khôi phục một volume

Vì volume do Docker quản lý, cách gọn là dùng một container tạm gắn volume ở chế độ chỉ đọc cùng một bind mount để lấy tệp nén ra:

```bash
mkdir -p ~/backup
docker run --rm \
  --mount type=volume,src=pgdata,dst=/data,readonly \
  --mount type=bind,src="$HOME/backup",dst=/backup \
  ubuntu:24.04 tar czf /backup/pgdata.tar.gz -C /data .
```

Khôi phục vào một volume **trống** (ở đây là `pgdata_moi`):

```bash
docker volume create pgdata_moi
docker run --rm \
  --mount type=volume,src=pgdata_moi,dst=/data \
  --mount type=bind,src="$HOME/backup",dst=/backup,readonly \
  ubuntu:24.04 tar xzf /backup/pgdata.tar.gz -C /data
```

Lưu ý quan trọng: chép tệp của cơ sở dữ liệu đang chạy có thể cho bản sao không nhất quán. Với cơ sở dữ liệu, nên dừng container trước khi nén, hoặc tốt hơn là dùng công cụ riêng của nó như `pg_dump`. Bản sao lưu cũng cần được thử khôi phục định kỳ, nếu không bạn chưa biết nó có dùng được hay không.

## Kiểm tra

- `docker volume ls` thấy volume bạn đặt tên.
- Xoá container rồi chạy lại: dữ liệu còn.
- `tar tzf ~/backup/pgdata.tar.gz | head` liệt kê được tệp trong bản sao lưu.

## Lỗi hay gặp

- **Mất dữ liệu vì dùng volume ẩn danh**: image khai `VOLUME` mà bạn không đặt tên, sau này không biết volume nào là của ai. Luôn gắn volume có tên cho đường dẫn dữ liệu.
- **Gắn bind mount đè lên thư mục có sẵn trong image**: nội dung của image ở đường dẫn đó bị che đi, container chỉ thấy thư mục của máy chủ.
- **`Permission denied` khi ghi**: UID trong container không khớp chủ sở hữu thư mục; xem phần quyền tệp ở trên.
- **`docker compose down -v` hoặc `volume prune` xoá nhầm**: kiểm tra danh sách và có bản sao lưu trước.

## Tóm lại

Container là thứ dùng rồi bỏ, dữ liệu thì không. Dùng volume có tên cho dữ liệu của ứng dụng, bind mount cho cấu hình và mã nguồn, khớp UID khi chạy không root, và sao lưu bằng một container tạm. Nếu chưa có Docker, bắt đầu từ [[Cài Docker Engine trên Ubuntu 24.04 từ kho apt chính thức của Docker]].

## Tham khảo

- [Volumes](https://docs.docker.com/engine/storage/volumes/)
- [Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- [Compose file reference: volumes](https://docs.docker.com/reference/compose-file/volumes/)
