---
title: Cài Docker Engine trên Ubuntu 24.04 từ kho apt chính thức của Docker
tags: docker, ubuntu, cài đặt, apt, container
type: lab
---

> [!TLDR]
> - Cài Docker Engine từ kho apt chính thức của Docker để nhận bản mới và bản vá bảo mật.
> - Gỡ các gói cũ trước, thêm khoá GPG và nguồn `docker.sources`, rồi cài năm gói cần thiết.
> - Kiểm tra bằng `sudo docker run hello-world`; nhóm `docker` tiện nhưng gần như tương đương quyền root.

## Mục tiêu

Sau bài này bạn có Docker Engine chạy trên Ubuntu 24.04 LTS (tên mã `noble`), cài từ kho apt chính thức của Docker chứ không phải gói `docker.io` có sẵn trong kho của Ubuntu. Bạn cũng biết cách kiểm tra Docker đã chạy đúng, cách cập nhật sau này và cách gỡ khi không cần nữa.

Vì sao nên dùng kho của Docker? Gói trong kho Ubuntu được đóng băng theo từng bản phát hành, còn kho của Docker cập nhật theo nhịp của chính dự án. Tài liệu chính thức của Docker hướng dẫn cài từ kho apt của họ cho Ubuntu, nên bài này làm theo cách đó.

## Chuẩn bị

- Một máy Ubuntu 24.04 LTS 64-bit, có quyền `sudo` và truy cập Internet.
- Máy chưa chạy container quan trọng nào. Lệnh gỡ gói cũ ở bước 1 không xoá image hay container trong `/var/lib/docker/`, nhưng bạn vẫn nên biết máy mình đang chạy gì.
- Nếu máy bật tường lửa `ufw`, hãy biết rằng cổng bạn công bố bằng `-p` của Docker có thể đi vòng qua luật `ufw`. Tài liệu của Docker có phần riêng về chuyện này; bài này chưa đi vào.

Nếu bạn cần ôn lại cách quản lý dịch vụ trên Ubuntu, hãy đọc [[systemctl trên Ubuntu 24.04: bật, tắt, khởi động lại dịch vụ và xem trạng thái]]. Docker chạy như một dịch vụ systemd và ta sẽ dùng chính các lệnh đó.

## Các bước

### Bước 1: Gỡ các gói không chính thức

Ubuntu có sẵn vài gói cùng chức năng nhưng do bên khác đóng gói. Chúng xung đột với bản chính thức, nên gỡ trước:

```bash
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt-get remove -y "$pkg"
done
```

Nếu apt báo chưa cài gói nào thì không sao. Lệnh này không động tới `/var/lib/docker/`, nên image và volume cũ (nếu có) vẫn còn.

### Bước 2: Thêm khoá GPG của Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Khoá này để apt xác minh chữ ký của các gói tải từ kho Docker. Thư mục `/etc/apt/keyrings` là nơi dành cho khoá của kho bên thứ ba.

### Bước 3: Khai báo kho apt

```bash
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
```

Đây là định dạng nguồn kiểu deb822 (tệp `.sources`). Biểu thức trong dấu `$(...)` đọc tên mã bản phát hành từ `/etc/os-release`; trên Ubuntu 24.04 nó cho ra `noble`. Sau `apt-get update`, bạn sẽ thấy dòng truy cập `download.docker.com` trong kết quả.

### Bước 4: Cài các gói

```bash
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Năm gói này gồm:

| Gói | Vai trò |
| --- | --- |
| `docker-ce` | Dịch vụ nền (daemon `dockerd`) |
| `docker-ce-cli` | Lệnh `docker` bạn gõ hằng ngày |
| `containerd.io` | Runtime chạy container ở tầng thấp |
| `docker-buildx-plugin` | Lệnh `docker buildx`, bộ máy build hiện đại |
| `docker-compose-plugin` | Lệnh `docker compose` |

Trên Ubuntu, dịch vụ Docker được bật và khởi động ngay sau khi cài.

## Kiểm tra

Xem phiên bản và trạng thái dịch vụ:

```bash
docker --version
sudo systemctl status docker --no-pager
```

Chạy container thử, một image rất nhỏ chỉ in lời chào rồi thoát:

```bash
sudo docker run hello-world
```

Lần đầu Docker tải image `hello-world` từ Docker Hub, tạo container, in ra thông báo bắt đầu bằng "Hello from Docker!" rồi dừng. Thấy dòng đó nghĩa là cả chuỗi client, daemon, tải image và chạy container đều hoạt động. Bạn xem container đã thoát bằng `sudo docker ps -a`.

Kiểm tra hai plugin:

```bash
docker buildx version
docker compose version
```

### Chạy docker không cần sudo?

Mặc định chỉ root và thành viên nhóm `docker` mới nói chuyện được với daemon. Nhiều hướng dẫn bảo bạn thêm mình vào nhóm này:

```bash
sudo usermod -aG docker "$USER"
newgrp docker
```

Hãy hiểu cái giá: tài liệu của Docker nói rõ nhóm `docker` cấp quyền tương đương root, vì người dùng trong nhóm có thể chạy container gắn cả thư mục gốc của máy vào. Trên máy cá nhân hay máy thử nghiệm của riêng bạn thì chấp nhận được; trên máy dùng chung hoặc máy chủ thật, hãy cân nhắc kỹ, hoặc tìm hiểu chế độ rootless trong tài liệu Docker. Đăng xuất rồi đăng nhập lại để nhóm mới có hiệu lực ở mọi phiên.

## Cập nhật và gỡ cài đặt

Vì Docker nay là một kho apt như các kho khác, cập nhật chỉ là:

```bash
sudo apt-get update
sudo apt-get install --only-upgrade docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Cập nhật daemon có thể khởi động lại dịch vụ Docker, nên các container không đặt chính sách khởi động lại có thể bị dừng. Hãy chọn thời điểm phù hợp trên máy chủ thật.

Muốn gỡ các gói:

```bash
sudo apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Lệnh `purge` không xoá image, container và volume trong `/var/lib/docker`. Việc xoá chúng là thao tác riêng, và CẢNH BÁO: đã xoá thì không khôi phục được, nên chỉ làm khi bạn chắc chắn không cần dữ liệu đó nữa.

## Lỗi hay gặp

- **`E: Unable to locate package docker-ce`**: bước 3 chưa đúng hoặc chưa chạy `apt-get update`. Kiểm tra tệp `/etc/apt/sources.list.d/docker.sources` có đủ bốn dòng và dòng `Suites:` hiện `noble`.
- **Lỗi chữ ký (`NO_PUBKEY` hoặc "not signed")**: tệp khoá thiếu hoặc không đọc được. Tải lại khoá và nhớ `chmod a+r`.
- **`permission denied while trying to connect to the Docker daemon socket`**: bạn chưa là thành viên nhóm `docker` hoặc chưa đăng nhập lại sau khi thêm. Dùng `sudo` hoặc làm phần trên.
- **`Cannot connect to the Docker daemon`**: dịch vụ chưa chạy. Thử `sudo systemctl start docker` rồi xem log bằng `journalctl -u docker`.
- **Cài song song `docker.io` và `docker-ce`**: hãy gỡ bản không chính thức như ở bước 1 để tránh xung đột.

## Tóm lại

Cài Docker Engine từ kho chính thức gồm bốn việc: gỡ gói cũ, thêm khoá, khai báo kho, cài năm gói. Kiểm tra bằng `hello-world`, nhớ rằng nhóm `docker` gần như là quyền root, và giữ Docker cập nhật bằng apt như mọi phần mềm khác. Từ đây bạn đã sẵn sàng để tự đóng gói một ứng dụng nhỏ gọn bằng Dockerfile.

## Tham khảo

- [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/) – Docker Docs
- [Linux post-installation steps for Docker Engine](https://docs.docker.com/engine/install/linux-postinstall/) – Docker Docs
- [Docker Engine security](https://docs.docker.com/engine/security/) – Docker Docs
