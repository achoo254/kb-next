---
title: journalctl: lọc log theo dịch vụ và theo thời gian trên Ubuntu 24.04
tags: journalctl, log, systemd, ubuntu, khắc phục sự cố
type: lab
---

> [!TLDR]
> - `journalctl -u <dịch-vụ>` chỉ hiện log của một dịch vụ; `-f` theo dõi trực tiếp, `-n` giới hạn số dòng.
> - `--since` và `--until` lọc theo khoảng thời gian; `-p err` chỉ giữ lỗi; `-b` giới hạn trong một lần khởi động.
> - Log chiếm đĩa: kiểm tra bằng `--disk-usage` và dọn bằng `--vacuum-time`, nhớ đọc cảnh báo trước khi dọn.

## Mục tiêu

systemd gom log của mọi dịch vụ về một chỗ gọi là *journal*, và `journalctl` là công cụ đọc nó. Sau bài này bạn lọc được log theo dịch vụ, theo thời gian, theo mức độ nghiêm trọng, và biết cách giữ dung lượng log trong tầm kiểm soát. Bài này tiếp nối [[systemctl trên Ubuntu 24.04: bật, tắt, khởi động lại dịch vụ và xem trạng thái]]: khi `systemctl status` báo lỗi, `journalctl` cho biết vì sao.

## Chuẩn bị

- Ubuntu 24.04 LTS (systemd 255) và tài khoản có `sudo`.
- Người dùng thường chỉ đọc được log của chính mình; để đọc log hệ thống, dùng `sudo` hoặc thêm tài khoản vào nhóm `systemd-journal` (hay `adm`).
- Ví dụ dùng `systemd-resolved` (có sẵn) và `hello` (dịch vụ tự viết). Hãy thay bằng dịch vụ của bạn.
- Mặc định `journalctl` mở trang cuộn: nhấn `q` để thoát, hoặc thêm `--no-pager`.

## Các bước

### Bước 1: Xem log của một dịch vụ

```bash
sudo journalctl -u systemd-resolved
```

Cờ `-u` (`--unit`) lọc theo tên unit. Bạn có thể lặp cờ để xem nhiều dịch vụ trong cùng một dòng thời gian, ví dụ `-u hello -u systemd-resolved`.

### Bước 2: Giới hạn số dòng và theo dõi trực tiếp

```bash
sudo journalctl -u hello -n 50
sudo journalctl -u hello -f
```

`-n 50` chỉ hiện 50 dòng cuối. `-f` (`--follow`) giữ màn hình mở và in thêm dòng mới ngay khi xuất hiện, giống `tail -f`; nhấn `Ctrl+C` để dừng. Cách này rất hữu ích: mở một cửa sổ chạy `-f`, cửa sổ kia chạy `systemctl restart hello` và xem chuyện gì xảy ra.

Muốn thấy dòng mới nhất ở trên cùng, thêm `-r` (`--reverse`).

### Bước 3: Lọc theo thời gian

```bash
sudo journalctl -u hello --since "1 hour ago"
sudo journalctl -u hello --since "2026-11-01 08:00:00" --until "2026-11-01 09:00:00"
sudo journalctl --since yesterday --until today
```

`--since` (`-S`) và `--until` (`-U`) nhận ngày giờ dạng `YYYY-MM-DD HH:MM:SS` hoặc cách nói tương đối như `"1 hour ago"`, `yesterday`, `today`. Thời gian hiển thị theo múi giờ của máy; thêm `--utc` nếu muốn xem theo UTC.

### Bước 4: Lọc theo mức độ nghiêm trọng

```bash
sudo journalctl -u hello -p err
sudo journalctl -p warning -b
```

`-p` (`--priority`) lọc theo mức: `emerg`, `alert`, `crit`, `err`, `warning`, `notice`, `info`, `debug`. Khi nêu một mức, kết quả gồm mức đó và các mức nghiêm trọng hơn. Vì vậy `-p err` cho lỗi trở lên, rất tiện để lướt nhanh.

### Bước 5: Giới hạn theo lần khởi động

```bash
sudo journalctl -b
sudo journalctl -b -1
sudo journalctl --list-boots
```

`-b` là lần khởi động hiện tại, `-b -1` là lần ngay trước đó. Chỉ xem được các lần khởi động cũ khi journal được lưu bền trên đĩa (thư mục `/var/log/journal` tồn tại); nếu journal chỉ nằm trong bộ nhớ thì nó mất khi khởi động lại. `--list-boots` cho biết những lần khởi động nào còn log.

### Bước 6: Tìm theo từ khoá và xem log nhân

```bash
sudo journalctl -u hello -g "timeout"
sudo journalctl -k
```

`-g` (`--grep`) lọc theo mẫu trong nội dung thông điệp; `-k` (`--dmesg`) chỉ hiện log của nhân Linux trong lần khởi động hiện tại, thay cho lệnh `dmesg`.

### Bước 7: Kiểm soát dung lượng

```bash
journalctl --disk-usage
sudo journalctl --vacuum-time=2weeks
sudo journalctl --vacuum-size=500M
```

`--disk-usage` cho biết log đang chiếm bao nhiêu. Hai lệnh `--vacuum-*` **xoá vĩnh viễn** các tệp journal cũ (theo tuổi hoặc theo tổng dung lượng) và không hoàn tác được. Chỉ chạy khi bạn chắc không cần giữ những log đó cho việc điều tra; nếu cần, hãy sao lưu trước. Muốn đặt giới hạn lâu dài thay vì dọn tay, xem các tuỳ chọn như `SystemMaxUse=` trong tệp cấu hình `journald.conf`.

## Kiểm tra

Một cách tự thử nhanh: cho `hello` khởi động lại, rồi xem log của nó trong 5 phút vừa qua.

```bash
sudo systemctl restart hello
sudo journalctl -u hello --since "5 minutes ago" --no-pager
```

Nếu thấy các dòng ghi nhận việc dừng và khởi động ("Stopping", "Started"), bạn đã đọc đúng log của dịch vụ. Cũng có thể thử kết hợp: `-u`, `-p err`, `--since` trong cùng một lệnh để thu hẹp tối đa.

Journal còn hữu ích khi chẩn đoán mạng: nếu bạn vừa dùng các công cụ trong [[Kiểm tra kết nối mạng trên Ubuntu bằng ip, ss, ping và tracepath]] mà vẫn chưa rõ vì sao tên miền không phân giải, thử `sudo journalctl -u systemd-resolved --since "10 minutes ago"` để xem dịch vụ phân giải tên báo gì.

## Lỗi hay gặp

- **Không thấy gì hoặc chỉ thấy log của mình:** thiếu `sudo` hay quyền nhóm `systemd-journal`.
- **`-b -1` báo không có dữ liệu:** journal không được lưu bền, nên chỉ có log của lần khởi động hiện tại.
- **Không khớp tên dịch vụ:** kiểm tra bằng `systemctl list-units --type=service`; tên đúng thường kết thúc bằng `.service`.
- **Khoảng thời gian trống:** `--since`/`--until` dùng múi giờ máy; thử `--utc` để so sánh.
- **Dọn log quá tay:** `--vacuum-*` không hoàn tác được, hãy chọn giá trị vừa phải.

## Tóm lại

`journalctl -u` chọn dịch vụ, `-n` và `-f` chọn cách đọc, `--since`/`--until` chọn thời gian, `-p` chọn mức độ, `-b` chọn lần khởi động. Kết hợp các cờ này, bạn tìm ra nguyên nhân sự cố nhanh hơn nhiều so với lật từng tệp log, và nhớ quản lý dung lượng journal để đĩa không đầy.

## Tham khảo

- [journalctl — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html)
- [journald.conf — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html)
- [journalctl(1) — Ubuntu 24.04 manpages](https://manpages.ubuntu.com/manpages/noble/man1/journalctl.1.html)
