---
title: Dockerfile nhiều tầng (multi-stage): build nặng, image chạy nhẹ
tags: docker, dockerfile, multi-stage, image, build
type: lab
---

> [!TLDR]
> - Dockerfile nhiều tầng dùng nhiều lệnh `FROM`: tầng đầu build, tầng cuối chỉ chứa thứ cần để chạy.
> - `COPY --from=<tầng>` chép đúng kết quả build sang image cuối; công cụ biên dịch ở lại phía sau.
> - `docker build --target` cho phép dừng ở một tầng để gỡ lỗi hoặc kiểm thử.

## Mục tiêu

Khi mới học Docker, nhiều người viết một Dockerfile duy nhất: bắt đầu từ image có đủ trình biên dịch, cài thư viện, build, rồi chạy ngay trong đó. Image làm ra chạy được nhưng rất nặng, vì mang theo cả những thứ chỉ cần lúc build. Bài này giới thiệu **multi-stage build** (build nhiều tầng) để tách việc "build" khỏi việc "chạy", giúp image cuối nhỏ hơn và có ít thứ thừa hơn.

Bạn sẽ tự đóng gói một máy chủ web nhỏ viết bằng Go, build bằng hai tầng, rồi so sánh kích thước. Nếu bạn chưa có Docker, hãy xem [[Cài Docker Engine trên Ubuntu 24.04 từ kho apt chính thức của Docker]] trước.

## Chuẩn bị

- Docker Engine đã cài (bài trước dùng `sudo`; nếu bạn chưa thêm mình vào nhóm `docker` thì hãy thêm `sudo` trước mỗi lệnh `docker` dưới đây).
- Một thư mục trống, ví dụ `~/hello-docker`.
- Kết nối Internet để tải image `golang` và `alpine` từ Docker Hub.

Go chỉ là ví dụ, vì Go biên dịch ra một tệp chạy độc lập. Ý tưởng multi-stage áp dụng cho mọi ngôn ngữ cần bước build, như Java, Rust, hay front-end cần đóng gói JavaScript.

## Các bước

### Bước 1: Viết ứng dụng

Trong thư mục `~/hello-docker`, tạo `go.mod`:

```text
module example.com/hello

go 1.24
```

và `main.go`:

```go
package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "Xin chào từ container")
	})
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	log.Fatal(http.ListenAndServe(":8080", nil))
}
```

Chương trình lắng nghe cổng 8080, trả một câu chào ở `/` và trả mã 200 ở `/healthz`. Đường dẫn thứ hai sẽ hữu ích ở bài sau.

### Bước 2: Viết Dockerfile một tầng để làm mốc so sánh

Tạo `Dockerfile.single`:

```dockerfile
FROM golang:1.24
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /usr/local/bin/hello .
EXPOSE 8080
ENTRYPOINT ["hello"]
```

Build và xem kích thước:

```bash
docker build -f Dockerfile.single -t hello:single .
docker image ls hello
```

Image này gồm cả bộ công cụ Go, mã nguồn và các lớp (layer) của hệ điều hành nền: kích thước lên tới hàng trăm MB, dù chương trình thật chỉ là một tệp nhỏ.

### Bước 3: Viết Dockerfile nhiều tầng

Tạo `Dockerfile`:

```dockerfile
# Tầng 1: build
FROM golang:1.24 AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/hello .

# Tầng 2: chạy
FROM alpine:3.20
COPY --from=build /out/hello /usr/local/bin/hello
EXPOSE 8080
ENTRYPOINT ["hello"]
```

Có ba điểm cần để ý:

1. **Mỗi `FROM` mở một tầng mới.** `AS build` đặt tên cho tầng đầu để tham chiếu về sau. Image cuối cùng của lần build là tầng sau cùng.
2. **`COPY --from=build`** chép một tệp từ tầng `build` sang tầng hiện tại. Mọi thứ khác của tầng `build` (trình biên dịch, mã nguồn, bộ nhớ đệm) không đi theo.
3. **`CGO_ENABLED=0`** bảo Go tạo tệp chạy không phụ thuộc thư viện C của hệ thống, nên nó chạy được trên cả nền `alpine` (dùng musl thay vì glibc).

Mẹo thứ tự: chép `go.mod` và tải phụ thuộc *trước* khi chép toàn bộ mã nguồn. Docker lưu bộ nhớ đệm theo từng lớp, nên nếu bạn chỉ sửa `main.go`, bước `go mod download` được dùng lại và build nhanh hơn rất nhiều.

### Bước 4: Build và so sánh

```bash
docker build -t hello:multi .
docker image ls hello
```

Bạn sẽ thấy hai dòng: `hello:single` và `hello:multi`. Bản `multi` nhỏ hơn rất nhiều vì chỉ gồm nền `alpine` nhỏ cộng một tệp chạy. Con số cụ thể phụ thuộc vào phiên bản image nền tại thời điểm bạn build, nên hãy tự nhìn kết quả trên máy mình thay vì tin một con số cố định.

Muốn biết các lớp của image cuối gồm những gì, dùng:

```bash
docker history hello:multi
```

## Kiểm tra

Chạy container và gọi thử:

```bash
docker run -d --name hello -p 8080:8080 hello:multi
curl http://127.0.0.1:8080/
curl -i http://127.0.0.1:8080/healthz
```

Lệnh đầu in "Xin chào từ container"; lệnh sau trả dòng trạng thái `HTTP/1.1 200 OK`. Dọn dẹp khi xong:

```bash
docker rm -f hello
```

Lệnh `docker rm -f` dừng và xoá container tên `hello`; dữ liệu nào chỉ nằm trong container sẽ mất, ở đây không có gì cần giữ.

### Dừng ở một tầng với `--target`

Đôi khi bạn muốn xem tầng build, ví dụ để chạy kiểm thử hoặc gỡ lỗi:

```bash
docker build --target build -t hello:build .
docker run --rm hello:build go version
```

Cờ `--target` bảo Docker chỉ build tới tầng có tên đó. Đây là cách gọn để dùng chung một Dockerfile cho cả môi trường phát triển lẫn sản phẩm.

### Thêm `.dockerignore`

Khi `COPY . .` chép cả thư mục, những tệp không cần (như `.git`, tệp tạm) cũng bị đưa vào ngữ cảnh build. Tạo tệp `.dockerignore` cạnh Dockerfile:

```text
.git
*.md
Dockerfile*
```

Tệp này làm ngữ cảnh build gọn hơn và tránh vô tình chép tệp nhạy cảm vào image.

## Lỗi hay gặp

- **`exec /usr/local/bin/hello: no such file or directory`** khi chạy container: tệp Go được build có liên kết động với thư viện C mà nền `alpine` không có. Hãy chắc rằng bạn đặt `CGO_ENABLED=0`.
- **`COPY --from=build` báo không tìm thấy tệp**: đường dẫn nguồn là đường dẫn *bên trong tầng build*, không phải trên máy bạn. Kiểm tra `-o /out/hello` và đường dẫn trong `COPY` có khớp nhau không.
- **Build chậm mãi dù chỉ sửa một dòng**: kiểm tra thứ tự lệnh. Nếu `COPY . .` đứng trước bước tải phụ thuộc, mọi thay đổi nhỏ đều làm mất bộ nhớ đệm của bước đó.
- **Tên tầng viết sai**: `--from` và `--target` phải khớp đúng tên sau `AS`. Nếu không đặt tên, bạn có thể dùng số thứ tự tầng bắt đầu từ 0, nhưng đặt tên dễ đọc và bền hơn.
- **Image nền thay đổi theo thời gian**: thẻ như `alpine:3.20` vẫn nhận bản vá. Muốn build lặp lại được tuyệt đối, hãy ghim thêm digest của image, và nhớ cập nhật định kỳ để không bỏ lỡ bản vá bảo mật.

## Tóm lại

Multi-stage build giải quyết một vấn đề đơn giản: công cụ cần để *làm ra* chương trình không nên nằm trong image dùng để *chạy* nó. Bạn viết nhiều `FROM`, đặt tên cho tầng, rồi `COPY --from` đúng thứ cần mang đi. Kết quả là image nhỏ hơn, ít thứ thừa hơn và build lại nhanh hơn nhờ bộ nhớ đệm. Image nhỏ chưa đồng nghĩa với an toàn: bài kế tiếp sẽ xem cách chạy chính container này bằng một người dùng thường và thêm kiểm tra sức khoẻ.

## Tham khảo

- [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/) – Docker Docs
- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/) – Docker Docs
- [Building best practices](https://docs.docker.com/build/building/best-practices/) – Docker Docs
