---
title: sshd_config cần chỉnh trên Ubuntu 24.04: tắt đăng nhập root, giới hạn người dùng và chuyện đổi cổng
tags: sshd, sshd_config, ubuntu, bảo mật, cấu hình
type: lab
---

> [!TLDR]
> - Đặt cấu hình riêng trong `/etc/ssh/sshd_config.d/`, tắt đăng nhập root và đăng nhập bằng mật khẩu, chỉ cho phép người dùng cần thiết.
> - Luôn chạy `sshd -t` để kiểm cú pháp và thử đăng nhập bằng một phiên mới trước khi đóng phiên cũ.
> - Đổi cổng SSH chỉ giảm bớt nhật ký rác, không phải biện pháp bảo mật thực sự.

## Mục tiêu

Sau khi đã đăng nhập được bằng khoá (bài đầu của hành tinh này), bước tiếp theo là siết cấu hình máy chủ SSH. Bài này dùng OpenSSH 9.6 trên Ubuntu 24.04 LTS và chỉnh những mục có ích nhất, cùng giải thích vì sao.

## Chuẩn bị

- Đã đăng nhập bằng khoá thành công với một tài khoản thường có quyền `sudo`.
- **Mở sẵn một phiên SSH thứ hai và giữ nguyên nó** trong suốt bài. Nếu cấu hình sai, phiên này giúp bạn sửa lại mà không bị khoá ngoài máy chủ.
- Nếu máy chủ ở xa và chỉ có SSH để vào, hãy đặc biệt cẩn thận ở mọi bước dưới đây.

## Các bước

### Bước 1: Dùng tệp cấu hình riêng trong sshd_config.d

Tệp chính `/etc/ssh/sshd_config` trên Ubuntu 24.04 có dòng `Include /etc/ssh/sshd_config.d/*.conf` ở đầu. Vì vậy bạn không cần sửa tệp gốc mà tạo tệp riêng, dễ theo dõi và không bị ghi đè khi nâng cấp gói.

Có một điểm cần nhớ: với đa số mục, sshd dùng giá trị **đầu tiên** nó đọc được, và các tệp `.conf` được đọc theo thứ tự tên. Một số ảnh máy chủ đám mây có sẵn tệp như `50-cloud-init.conf` đặt `PasswordAuthentication yes`. Vì thế hãy đặt tên tệp của bạn có số nhỏ hơn, ví dụ `10-hardening.conf`, để giá trị của bạn thắng.

```bash
sudo nano /etc/ssh/sshd_config.d/10-hardening.conf
```

Nội dung ví dụ:

```text
# Không cho root đăng nhập trực tiếp
PermitRootLogin no

# Chỉ dùng khoá, tắt mật khẩu
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes

# Chỉ những người dùng này được vào (thay bằng tên thật của bạn)
AllowUsers deploy

# Giới hạn số lần thử và thời gian chờ
MaxAuthTries 3
LoginGraceTime 30
```

Ý nghĩa từng mục:

- `PermitRootLogin no`: tài khoản `root` có tên cố định ai cũng biết, nên là mục tiêu số một. Giá trị mặc định của OpenSSH là `prohibit-password` (root chỉ vào được bằng khoá); đặt `no` là chặn hẳn, bạn đăng nhập bằng tài khoản thường rồi dùng `sudo`.
- `PasswordAuthentication no` và `KbdInteractiveAuthentication no`: tắt cả hai đường đăng nhập bằng mật khẩu. Chỉ bật sau khi đã kiểm tra khoá hoạt động.
- `AllowUsers`: danh sách trắng. Người dùng không có trong danh sách không vào được dù đúng mật khẩu hay khoá.
- `MaxAuthTries`: số lần thử xác thực tối đa trong một kết nối (mặc định 6). `LoginGraceTime`: thời gian tối đa để hoàn tất đăng nhập (mặc định 120 giây).

### Bước 2: Kiểm cú pháp trước khi áp dụng

```bash
sudo sshd -t
```

Không in gì nghĩa là cú pháp hợp lệ. Để xem giá trị thực sự đang có hiệu lực (sau khi gộp mọi tệp):

```bash
sudo sshd -T | grep -Ei 'permitrootlogin|passwordauthentication|allowusers|maxauthtries'
```

### Bước 3: Nạp lại dịch vụ và thử bằng phiên mới

Trên Ubuntu, dịch vụ tên là `ssh`:

```bash
sudo systemctl reload ssh
```

Rồi **mở một cửa sổ terminal mới** và đăng nhập. Chỉ khi phiên mới vào được bạn mới đóng phiên cũ. Phiên đang mở không bị ngắt khi nạp lại cấu hình.

## Chuyện đổi cổng: có đáng không?

Nhiều người đổi cổng 22 sang cổng khác (ví dụ 2222). Thực tế: kẻ quét mạng quét cả dải cổng, nên đổi cổng không ngăn được ai quyết tâm tấn công. Lợi ích có thật nhưng nhỏ: nhật ký bớt rác vì các chương trình dò tự động chỉ thử cổng 22. Đổi cổng không thay được khoá SSH, tắt mật khẩu hay tường lửa.

Nếu vẫn muốn đổi, hãy làm đúng thứ tự để khỏi tự khoá mình:

1. Mở cổng mới trên tường lửa trước (và giữ cổng 22 cho đến khi thử xong).
2. Thêm `Port 2222` vào tệp cấu hình. Trên Ubuntu 24.04, sshd được khởi động qua `ssh.socket` (kích hoạt theo kết nối), nên sau khi đổi cổng hãy chạy `sudo systemctl daemon-reload` rồi `sudo systemctl restart ssh.socket`.
3. Kiểm tra cổng đang nghe bằng `sudo ss -tlnp | grep -E 'sshd|ssh'`.
4. Đăng nhập thử bằng `ssh -o Port=2222 -l deploy example.com` từ phiên mới, rồi mới đóng cổng 22.

## Kiểm tra

- `sudo sshd -T` cho thấy giá trị mong muốn.
- Đăng nhập bằng khoá vào tài khoản trong `AllowUsers` thành công.
- Thử `ssh -l root example.com` bị từ chối; thử với `-o PubkeyAuthentication=no` cũng bị từ chối vì mật khẩu đã tắt.

## Lỗi hay gặp

- **Tự khoá mình ngoài máy chủ**: do tắt mật khẩu khi khoá chưa chạy, hoặc `AllowUsers` thiếu tên của chính bạn. Luôn giữ phiên cũ và thử bằng phiên mới. Nếu là máy ảo, bảng điều khiển của nhà cung cấp thường là đường vào cứu hộ.
- **Cấu hình không có hiệu lực**: một tệp `.conf` có số nhỏ hơn đặt giá trị khác. Dùng `sshd -T` để xem giá trị cuối cùng và `grep -r PasswordAuthentication /etc/ssh/` để tìm ai đặt.
- **Đổi cổng mà không thấy tác dụng**: quên `daemon-reload` và khởi động lại `ssh.socket`, hoặc tường lửa chưa mở cổng mới.

## Tóm lại

Đặt cấu hình trong một tệp riêng ở `sshd_config.d`, tắt đăng nhập root và mật khẩu, giới hạn người dùng bằng `AllowUsers`, kiểm bằng `sshd -t` và luôn thử bằng phiên mới. Đổi cổng chỉ là chi tiết phụ. Bước cuối là chặn những kẻ cố dò đoán, xem bài [[Chặn dò mật khẩu SSH bằng fail2ban và đọc nhật ký đăng nhập trên Ubuntu 24.04]].

## Tham khảo

- [sshd_config(5), OpenBSD manual](https://man.openbsd.org/sshd_config)
- [sshd_config(5) trên Ubuntu 24.04 (noble)](https://manpages.ubuntu.com/manpages/noble/man5/sshd_config.5.html)
- [OpenSSH server, tài liệu Ubuntu Server](https://documentation.ubuntu.com/server/how-to/security/openssh-server/)
- [sshd dùng kích hoạt theo socket trên Ubuntu](https://discourse.ubuntu.com/t/sshd-now-uses-socket-based-activation-ubuntu-22-10-and-later/30189)
