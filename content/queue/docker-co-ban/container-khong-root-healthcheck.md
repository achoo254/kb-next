---
title: Chạy container không bằng root và thêm HEALTHCHECK để biết ứng dụng còn sống
tags: docker, bảo mật, healthcheck, non-root, container
type: lab
---

> [!TLDR]
> - Mặc định tiến trình trong container chạy bằng root của container; chỉ thị `USER` đổi sang người dùng thường.
> - `HEALTHCHECK` cho Docker biết ứng dụng có thật sự phục vụ được hay chỉ đang "chạy" suông.
> - Thêm `--read-only`, `--cap-drop ALL` và `no-new-privileges` để thu hẹp thêm những gì container được làm.

## Mục tiêu

Ở bài trước ta đã có một image nhỏ gọn nhờ build nhiều tầng. Nhưng image nhỏ không tự động an toàn hay đáng tin. Bài này làm hai việc với chính ứng dụng Go đó:

1. Chạy nó bằng một người dùng không phải root, để nếu ứng dụng bị khai thác thì kẻ tấn công có ít quyền hơn.
2. Thêm `HEALTHCHECK`, để Docker và bạn biết ứng dụng đang khoẻ hay đã treo dù tiến trình chưa thoát.

Bài viết dựa trên dự án mẫu trong [[Dockerfile nhiều tầng (multi-stage): build nặng, image chạy nhẹ]]. Nếu bạn chưa cài Docker thì xem [[Cài Docker Engine trên Ubuntu 24.04 từ kho apt chính thức của Docker]].

## Chuẩn bị

- Docker Engine đã cài và thư mục `~/hello-docker` có `main.go`, `go.mod`, `Dockerfile` như bài trước. Ứng dụng đó đã có đường dẫn `/healthz` trả mã 200.
- Công cụ `curl` trên máy để thử.

Một lưu ý quan trọng: root *trong* container vẫn là một tiến trình trên máy chủ thật, chỉ bị cô lập bởi các cơ chế của nhân Linux (namespace, cgroup, capability). Cô lập tốt, nhưng không phải vô địch; vì vậy nguyên tắc "đặc quyền tối thiểu" vẫn đáng áp dụng.

## Các bước

### Bước 1: Xem container đang chạy bằng ai

Với image `hello:multi` của bài trước:

```bash
docker run -d --name hello -p 8080:8080 hello:multi
docker exec hello id
```

Kết quả có `uid=0(root)`: ứng dụng đang chạy bằng root của container, vì Dockerfile chưa nói gì khác. Dừng và xoá nó:

```bash
docker rm -f hello
```

### Bước 2: Tạo người dùng riêng và dùng `USER`

Sửa tầng cuối của `Dockerfile` thành:

```dockerfile
FROM alpine:3.20
RUN addgroup -S app && adduser -S -G app app
COPY --from=build /out/hello /usr/local/bin/hello
USER app
EXPOSE 8080
ENTRYPOINT ["hello"]
```

`addgroup -S` và `adduser -S` là cú pháp của BusyBox trên Alpine, tạo nhóm và người dùng *hệ thống* tên `app`, không có mật khẩu. Chỉ thị `USER app` khiến các lệnh sau nó, cùng tiến trình chính khi chạy, dùng người dùng này. Cổng 8080 lớn hơn 1024 nên không cần đặc quyền để lắng nghe.

Trên các nền khác như Debian hoặc Ubuntu, lệnh tạo người dùng là `groupadd` và `useradd`; hãy xem tài liệu của image nền bạn dùng.

### Bước 3: Thêm HEALTHCHECK

Thêm vào tầng cuối, sau `USER`:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
```

Lệnh sau `CMD` chạy *bên trong container*. Nếu nó thoát với mã 0, lần kiểm tra thành công; mã 1 nghĩa là thất bại. Các tuỳ chọn:

| Tuỳ chọn | Ý nghĩa | Mặc định |
| --- | --- | --- |
| `--interval` | Cách bao lâu chạy kiểm tra một lần | 30 giây |
| `--timeout` | Quá thời gian này thì tính là thất bại | 30 giây |
| `--start-period` | Thời gian khởi động, thất bại trong lúc này chưa bị tính | 0 giây |
| `--retries` | Số lần thất bại liên tiếp để coi là `unhealthy` | 3 |

Ta dùng `wget` vì nó có sẵn trong BusyBox của Alpine, khỏi cài thêm gì. Nếu image của bạn không có công cụ như vậy, hãy cho chính ứng dụng một chế độ tự kiểm tra, hoặc cài công cụ nhỏ cần thiết.

### Bước 4: Build lại

```bash
docker build -t hello:safe .
```

## Kiểm tra

Chạy container:

```bash
docker run -d --name hello -p 8080:8080 hello:safe
docker exec hello id
```

Lần này `uid` khác 0 và tên là `app`. Tiếp theo xem sức khoẻ:

```bash
docker ps --filter name=hello
docker inspect --format '{{.State.Health.Status}}' hello
```

Ngay sau khi chạy, cột trạng thái ghi `(health: starting)`; sau lần kiểm tra thành công đầu tiên thì thành `(healthy)`. Lệnh `inspect` in `starting`, `healthy` hoặc `unhealthy`. Để thấy lịch sử các lần kiểm tra:

```bash
docker inspect --format '{{json .State.Health}}' hello
```

Muốn thấy trạng thái `unhealthy`, bạn có thể thử đổi đường dẫn trong `HEALTHCHECK` thành một đường dẫn không tồn tại, build lại và chờ qua các lần thử.

### Thu hẹp thêm quyền khi chạy

Ngoài `USER`, Docker cho phép hạn chế container ngay lúc chạy. Dừng container cũ rồi thử:

```bash
docker rm -f hello
docker run -d --name hello -p 8080:8080 \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  hello:safe
```

- `--read-only` gắn hệ thống tệp gốc của container ở chế độ chỉ đọc. Ứng dụng nào cần ghi tệp tạm thì thêm `--tmpfs /tmp`.
- `--cap-drop ALL` bỏ toàn bộ Linux capability. Chương trình ví dụ không cần cái nào. Nếu ứng dụng của bạn cần một quyền cụ thể, thêm lại đúng cái đó bằng `--cap-add`.
- `--security-opt no-new-privileges` ngăn tiến trình giành thêm đặc quyền qua các tệp setuid.

Ứng dụng nhỏ của ta vẫn chạy bình thường; hãy gọi `curl http://127.0.0.1:8080/` để chắc chắn. Với ứng dụng thật, bạn thêm từng hạn chế một và thử, vì có chương trình cần ghi đĩa hoặc cần capability.

Dọn dẹp khi xong:

```bash
docker rm -f hello
```

## Lỗi hay gặp

- **`HEALTHCHECK` không tự khởi động lại container.** Với Docker Engine thông thường, trạng thái `unhealthy` chỉ là một nhãn để bạn và các công cụ khác đọc. Chính sách `--restart` phản ứng với việc tiến trình thoát, không phản ứng với `unhealthy`. Một số bộ điều phối (như Docker Swarm) dùng nhãn này để thay container; bạn cần biết công cụ mình dùng làm gì.
- **Luôn `unhealthy` ngay từ đầu**: kiểm tra lệnh có chạy được trong container không (`docker exec hello wget -q -O /dev/null http://127.0.0.1:8080/healthz; echo $?`), cổng và đường dẫn có đúng, và công cụ như `wget` hoặc `curl` có tồn tại trong image không.
- **Lỗi `permission denied` khi ứng dụng ghi tệp**: người dùng `app` không có quyền ghi vào thư mục đó. Dùng `COPY --chown=app:app` hoặc `RUN chown`, hay một volume có quyền phù hợp. Đừng "chữa" bằng cách quay lại root.
- **Ứng dụng báo không ghi được khi dùng `--read-only`**: hãy xác định thư mục nó cần ghi (thường `/tmp`) và gắn `--tmpfs` hoặc volume cho đúng thư mục đó.
- **Kiểm tra quá nặng hay quá thường xuyên**: một `HEALTHCHECK` chạy truy vấn lớn mỗi vài giây có thể tự làm hại ứng dụng. Giữ nó nhẹ và chỉ kiểm tra việc cốt lõi.

## Tóm lại

Hai thói quen nhỏ làm Dockerfile của bạn chín hơn rất nhiều: dùng `USER` để không chạy bằng root, và dùng `HEALTHCHECK` để biết ứng dụng thật sự phục vụ được. Cộng thêm `--read-only`, `--cap-drop ALL` và `no-new-privileges` khi chạy, bạn đã thu hẹp đáng kể những gì một container bị chiếm quyền có thể làm. Đây không phải toàn bộ bảo mật container, nhưng là nền tảng vững để bắt đầu.

## Tham khảo

- [Dockerfile reference: USER và HEALTHCHECK](https://docs.docker.com/reference/dockerfile/) – Docker Docs
- [Docker run reference](https://docs.docker.com/engine/containers/run/) – Docker Docs
- [Docker Engine security](https://docs.docker.com/engine/security/) – Docker Docs
- [Building best practices](https://docs.docker.com/build/building/best-practices/) – Docker Docs
