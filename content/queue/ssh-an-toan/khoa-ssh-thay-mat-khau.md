---
title: Khoá SSH thay mật khẩu trên Ubuntu 24.04: tạo, cài đặt và kiểm tra khoá ed25519
tags: ssh, khoá ssh, ed25519, ubuntu, bảo mật
type: lab
---

> [!TLDR]
> - Khoá SSH gồm một khoá riêng (giữ kín) và một khoá công khai (đặt lên máy chủ), khó bị dò hơn mật khẩu rất nhiều.
> - Tạo khoá bằng `ssh-keygen -t ed25519`, đặt passphrase, rồi đưa khoá công khai lên máy chủ bằng `ssh-copy-id`.
> - Kiểm tra đăng nhập bằng khoá thành công rồi mới tắt mật khẩu ở bước sau.

## Mục tiêu

Sau bài này bạn sẽ đăng nhập vào một máy chủ Ubuntu 24.04 LTS bằng khoá SSH thay cho mật khẩu. Bài dùng OpenSSH 9.6 (bản đi kèm Ubuntu 24.04). Địa chỉ trong bài chỉ là ví dụ: `example.com` và người dùng `deploy`.

Vì sao nên bỏ mật khẩu? Máy chủ nào mở cổng SSH ra Internet cũng bị các chương trình tự động thử đoán mật khẩu liên tục. Mật khẩu có thể bị đoán, bị lộ hoặc dùng lại ở nơi khác. Khoá SSH hoạt động theo cách khác: máy chủ chỉ giữ khoá công khai, còn khoá riêng nằm trên máy của bạn và không bao giờ được gửi đi. Khi đăng nhập, máy bạn chứng minh là đang giữ khoá riêng mà không để lộ nó.

## Chuẩn bị

- Một máy chủ Ubuntu 24.04 có cài `openssh-server` và một tài khoản thường (ở đây là `deploy`) đang đăng nhập được bằng mật khẩu.
- Máy của bạn (Linux, macOS hoặc Windows có OpenSSH) với lệnh `ssh-keygen`.
- Nên mở sẵn một phiên SSH cũ trên máy chủ để dự phòng nếu có sự cố.

## Các bước

### Bước 1: Tạo cặp khoá trên máy của bạn

```bash
ssh-keygen -t ed25519 -C "laptop-cua-toi"
```

Lệnh hỏi nơi lưu khoá (mặc định `~/.ssh/id_ed25519`) rồi hỏi passphrase. Hãy đặt một passphrase: nếu ai đó lấy được tệp khoá riêng, họ vẫn không dùng được nếu không biết cụm mật khẩu này. Tuỳ chọn `-t ed25519` chọn thuật toán Ed25519, hiện đại, khoá ngắn và được OpenSSH hỗ trợ từ lâu. Tuỳ chọn `-C` chỉ là chú thích để bạn nhận ra khoá.

Kết quả là hai tệp: `~/.ssh/id_ed25519` (khoá riêng) và `~/.ssh/id_ed25519.pub` (khoá công khai).

### Bước 2: Đưa khoá công khai lên máy chủ

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@example.com
```

Lệnh sẽ hỏi mật khẩu lần cuối, rồi thêm nội dung khoá công khai vào tệp `~/.ssh/authorized_keys` của người dùng `deploy` trên máy chủ. Lệnh này chỉ thêm khoá, không xoá gì.

Nếu máy của bạn không có `ssh-copy-id`, có thể làm tay: dán nội dung tệp `.pub` vào cuối `~/.ssh/authorized_keys` trên máy chủ, mỗi khoá một dòng. Chỉ dán khoá công khai (tệp `.pub`), tuyệt đối không dán khoá riêng.

### Bước 3: Kiểm tra quyền thư mục trên máy chủ

OpenSSH từ chối khoá nếu thư mục của nó quá "thoáng" về quyền. Trên máy chủ, đặt:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### Bước 4: Dùng ssh-agent để không phải gõ passphrase mãi

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

`ssh-agent` giữ khoá đã mở khoá trong bộ nhớ trong phiên làm việc, nên bạn chỉ nhập passphrase một lần. Nhiều môi trường desktop đã chạy sẵn một agent.

## Kiểm tra

Mở một cửa sổ terminal mới và đăng nhập, ép chương trình không được dùng mật khẩu:

```bash
ssh -o PasswordAuthentication=no -l deploy example.com
```

Nếu vào được, khoá đã hoạt động. Muốn xem chi tiết quá trình, thêm `-v`: bạn sẽ thấy dòng cho biết khoá nào được máy chủ chấp nhận. Chỉ khi bước này thành công bạn mới nên chuyển sang tắt mật khẩu, việc được hướng dẫn trong bài [[sshd_config cần chỉnh trên Ubuntu 24.04: tắt đăng nhập root, giới hạn người dùng và chuyện đổi cổng]].

## Lỗi hay gặp

- **`Permission denied (publickey)`**: máy chủ không nhận khoá. Kiểm tra quyền `~/.ssh` (700) và `authorized_keys` (600), và chắc chắn bạn đang đăng nhập đúng tài khoản. Chạy `ssh -v` để xem máy bạn đã thử khoá nào.
- **Bị hỏi passphrase liên tục**: chưa chạy `ssh-add`, hoặc agent chưa chạy.
- **Mất khoá riêng**: không có cách khôi phục. Vì vậy hãy cài sẵn ít nhất hai khoá (ví dụ một khoá dự phòng cất kỹ) trước khi tắt mật khẩu.
- **Khoá riêng bị lộ** (đưa nhầm vào kho mã, gửi qua chat): coi như đã mất an toàn. Xoá dòng khoá công khai tương ứng khỏi `authorized_keys` và tạo khoá mới. Cách xử lý bí mật trong kho mã được nói rõ ở bài [[Quản lý bí mật trong kho mã và CI/CD: không commit khoá, quét rò rỉ và xoay vòng khi lộ]].

Lưu ý an toàn: lệnh `ssh-keygen` ghi đè khoá cũ nếu bạn chọn trùng tên tệp (nó sẽ hỏi xác nhận). Đừng trả lời "y" nếu khoá cũ đang còn dùng.

## Tóm lại

Khoá SSH thay một bí mật dễ đoán bằng một cặp khoá toán học: khoá công khai ở máy chủ, khoá riêng ở máy bạn. Hãy tạo khoá ed25519 có passphrase, đưa khoá công khai lên bằng `ssh-copy-id`, giữ đúng quyền thư mục và luôn kiểm tra đăng nhập bằng khoá thành công trước khi tắt mật khẩu.

## Tham khảo

- [ssh-keygen(1), OpenBSD manual](https://man.openbsd.org/ssh-keygen)
- [ssh-agent(1), OpenBSD manual](https://man.openbsd.org/ssh-agent)
- [OpenSSH server, tài liệu Ubuntu Server](https://documentation.ubuntu.com/server/how-to/security/openssh-server/)
