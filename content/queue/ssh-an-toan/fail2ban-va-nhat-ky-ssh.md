---
title: Chặn dò mật khẩu SSH bằng fail2ban và đọc nhật ký đăng nhập trên Ubuntu 24.04
tags: fail2ban, ssh, nhật ký, journalctl, ubuntu
type: lab
---

> [!TLDR]
> - fail2ban theo dõi nhật ký của `ssh` và chặn tạm các địa chỉ đoán sai nhiều lần bằng tường lửa.
> - Đọc nhật ký đăng nhập bằng `journalctl -u ssh`, và xem lịch sử bằng `last` để biết ai đã vào máy.
> - fail2ban là lớp bổ sung, không thay thế khoá SSH và việc tắt mật khẩu.

## Mục tiêu

Máy chủ có cổng SSH mở ra Internet sẽ nhận rất nhiều lần đăng nhập thất bại từ các chương trình dò tự động. Khi đã dùng khoá và tắt mật khẩu, những lần thử này không vào được, nhưng chúng vẫn tốn tài nguyên và làm nhật ký đầy rác. Bài này hướng dẫn cài fail2ban (bản 1.0.2 trong kho Ubuntu 24.04) để chặn tạm các địa chỉ đó, và cách đọc nhật ký đăng nhập để phát hiện điều bất thường.

## Chuẩn bị

- Ubuntu 24.04 LTS có `sudo`, SSH đã cấu hình theo hai bài trước của hành tinh này.
- Biết cổng SSH đang dùng (mặc định 22) và địa chỉ bạn hay đăng nhập từ đó để không tự chặn mình.
- Địa chỉ trong bài là ví dụ theo vùng dành cho tài liệu: `198.51.100.7`, `192.0.2.0/24`.

## Các bước

### Bước 1: Cài fail2ban

```bash
sudo apt update
sudo apt install fail2ban
```

### Bước 2: Tạo tệp cấu hình riêng

Không sửa `jail.conf` vì tệp này có thể bị ghi đè khi nâng cấp gói. Hãy tạo `/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
# Địa chỉ không bao giờ bị chặn (máy bạn, mạng văn phòng)
ignoreip = 127.0.0.1/8 ::1 192.0.2.0/24

# Thời gian bị chặn, khung thời gian đếm và số lần sai cho phép
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
backend = systemd
# Nếu bạn đã đổi cổng SSH, bỏ dấu # và sửa số:
# port = 2222
```

Ý nghĩa: nếu một địa chỉ đăng nhập sai quá `maxretry` lần trong `findtime`, nó bị chặn trong `bantime`. `backend = systemd` bảo fail2ban đọc nhật ký từ journal, phù hợp với Ubuntu 24.04 vì máy tối giản có thể không có tệp `/var/log/auth.log`.

### Bước 3: Bật và khởi động dịch vụ

```bash
sudo systemctl enable --now fail2ban
```

## Kiểm tra

Xem trạng thái jail `sshd`:

```bash
sudo fail2ban-client status sshd
```

Kết quả cho biết số lần thất bại đã đếm, số địa chỉ đang bị chặn và danh sách của chúng. Nếu muốn bỏ chặn một địa chỉ (ví dụ chính bạn gõ sai nhiều lần):

```bash
sudo fail2ban-client set sshd unbanip 198.51.100.7
```

## Đọc nhật ký đăng nhập SSH

Trên Ubuntu, dịch vụ SSH tên là `ssh`, nên nhật ký của nó đọc bằng `journalctl` (cách lọc theo dịch vụ và thời gian được giải thích kỹ trong bài [[journalctl: lọc log theo dịch vụ và theo thời gian trên Ubuntu 24.04]]):

```bash
# Nhật ký SSH trong 1 giờ qua
sudo journalctl -u ssh --since "1 hour ago"

# Chỉ các dòng đăng nhập thất bại
sudo journalctl -u ssh --since today -g 'Failed password|Invalid user'
```

Các dòng đáng chú ý:

- `Accepted publickey for deploy from ...`: đăng nhập thành công bằng khoá. Hãy kiểm xem tên người dùng và địa chỉ nguồn có đúng là của bạn không.
- `Failed password for ...` hoặc `Invalid user ...`: có ai đó đang thử đoán. Chỉ đáng lo nếu số lượng lớn từ một nguồn mà fail2ban chưa chặn, hoặc nếu tên người dùng bị thử là tài khoản có thật.
- Muốn nhật ký ghi thêm dấu vân tay khoá đã dùng, có thể đặt `LogLevel VERBOSE` trong cấu hình sshd.

Xem lịch sử đăng nhập đã kết thúc:

```bash
last -n 10
sudo lastb -n 10
```

`last` liệt kê các lần đăng nhập thành công gần đây. `lastb` liệt kê các lần thất bại; lệnh này đọc `/var/log/btmp` và có thể trống nếu hệ thống không ghi vào tệp đó. Nếu bạn thấy một lần đăng nhập thành công mà mình không nhận ra, hãy xem đó là sự cố: đổi khoá và kiểm tra `~/.ssh/authorized_keys` xem có dòng lạ nào không.

## Lỗi hay gặp

- **Tự chặn mình**: gõ sai khoá nhiều lần hoặc dùng mạng chung địa chỉ. Thêm địa chỉ tin cậy vào `ignoreip`, hoặc dùng `unbanip` như trên. Vì thế nên giữ một đường vào dự phòng (bảng điều khiển của nhà cung cấp).
- **Jail không bắt được gì**: kiểm tra `sudo systemctl status fail2ban` và xem `backend` có khớp nơi sshd thực sự ghi nhật ký. Nếu đã đổi cổng SSH, nhớ khai `port`.
- **Cấu hình sai khiến dịch vụ không khởi động**: đọc lỗi bằng `sudo journalctl -u fail2ban -e`.
- **Tin rằng fail2ban là đủ**: không phải. Nó chỉ làm chậm kẻ đoán mật khẩu; nền tảng vẫn là khoá SSH và tắt mật khẩu.

Lưu ý: bài chỉ nêu cấu hình tối thiểu. Hãy đọc tài liệu của fail2ban trước khi dùng các hành động chặn nâng cao.

## Tóm lại

fail2ban đọc nhật ký SSH và chặn tạm các địa chỉ thử sai nhiều lần; `journalctl -u ssh`, `last` và `lastb` giúp bạn tự kiểm tra ai đã thử và ai đã vào. Kết hợp với khoá SSH, `sshd_config` chặt chẽ và việc đọc nhật ký đều đặn, bạn có một lớp phòng thủ nhiều tầng cho cổng SSH.

## Tham khảo

- [fail2ban-client(1) trên Ubuntu 24.04 (noble)](https://manpages.ubuntu.com/manpages/noble/man1/fail2ban-client.1.html)
- [jail.conf(5) trên Ubuntu 24.04 (noble)](https://manpages.ubuntu.com/manpages/noble/man5/jail.conf.5.html)
- [OpenSSH server, tài liệu Ubuntu Server](https://documentation.ubuntu.com/server/how-to/security/openssh-server/)
