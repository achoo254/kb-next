---
title: systemctl trên Ubuntu 24.04: bật, tắt, khởi động lại dịch vụ và xem trạng thái
tags: systemctl, systemd, dịch vụ, ubuntu, dòng lệnh
type: lab
---

> [!TLDR]
> - `start`/`stop`/`restart` tác động ngay lúc này; `enable`/`disable` quyết định dịch vụ có tự chạy khi khởi động hay không.
> - `systemctl status` cho biết dịch vụ đang chạy hay lỗi, kèm vài dòng log mới nhất.
> - `enable --now` làm cả hai việc cùng lúc; `mask` chặn hẳn một dịch vụ, nên dùng thận trọng.

## Mục tiêu

Sau bài này bạn biết điều khiển một dịch vụ trên Ubuntu 24.04 LTS (systemd 255) bằng `systemctl`: xem trạng thái, khởi động, dừng, khởi động lại, và đặt cho nó tự chạy khi bật máy. Nếu bạn chưa quen khái niệm unit, hãy đọc trước [[systemd và unit file trên Ubuntu 24.04: dịch vụ được mô tả và khởi chạy như thế nào]].

## Chuẩn bị

- Một máy Ubuntu 24.04 và tài khoản có quyền `sudo`.
- Các ví dụ dùng hai tên dịch vụ: `systemd-resolved.service` (có sẵn, chỉ để xem) và `hello.service` (dịch vụ tự viết, giả định bạn đã tạo như bài trước). Hãy thay bằng tên dịch vụ thật của bạn.
- Bạn có thể bỏ đuôi `.service`: `systemctl status hello` và `systemctl status hello.service` như nhau.

## Các bước

### Bước 1: Xem trạng thái

```bash
systemctl status systemd-resolved
```

Kết quả có vài phần đáng chú ý: dòng `Loaded:` cho biết tệp unit nào đang dùng và dịch vụ có được bật (`enabled`) hay không; dòng `Active:` cho biết `active (running)`, `inactive (dead)` hay `failed`; bên dưới là vài dòng log mới nhất. Nếu kết quả mở trong trang cuộn, nhấn `q` để thoát, hoặc thêm `--no-pager`.

Ba lệnh ngắn hơn, tiện dùng trong script:

```bash
systemctl is-active hello      # in ra active, inactive, failed...
systemctl is-enabled hello     # in ra enabled, disabled, masked...
systemctl list-units --failed  # liệt kê các unit đang ở trạng thái lỗi
```

### Bước 2: Khởi động và dừng

```bash
sudo systemctl start hello
sudo systemctl stop hello
```

Hai lệnh này chỉ tác động lên lần chạy hiện tại: sau khi khởi động lại máy, dịch vụ trở về theo cài đặt `enable`/`disable`.

### Bước 3: Khởi động lại và nạp lại cấu hình

```bash
sudo systemctl restart hello
sudo systemctl reload hello
sudo systemctl reload-or-restart hello
```

- `restart` dừng rồi chạy lại: có khoảng gián đoạn ngắn.
- `reload` yêu cầu chính chương trình đọc lại cấu hình mà không dừng, nhưng chỉ dùng được nếu dịch vụ có khai báo cách nạp lại (`ExecReload=`).
- `reload-or-restart` nạp lại nếu được, nếu không thì khởi động lại; hợp khi bạn không chắc.

Nhớ phân biệt hai thứ dễ nhầm: `systemctl daemon-reload` nạp lại *tệp unit* của systemd, còn `reload` nạp lại *cấu hình của dịch vụ*.

### Bước 4: Bật và tắt tự chạy khi khởi động

```bash
sudo systemctl enable hello
sudo systemctl disable hello
```

`enable` tạo liên kết theo phần `[Install]` của tệp unit nhưng không khởi động dịch vụ ngay. Muốn vừa bật vừa chạy luôn, dùng cờ `--now`:

```bash
sudo systemctl enable --now hello
sudo systemctl disable --now hello
```

Bản thứ hai vừa bỏ tự chạy vừa dừng dịch vụ ngay.

### Bước 5: Chặn hẳn một dịch vụ bằng mask

```bash
sudo systemctl mask hello
sudo systemctl unmask hello
```

`mask` làm cho unit không thể khởi động, kể cả khi unit khác đòi nó hay bạn gõ `start`. Cảnh báo: chỉ mask khi bạn hiểu dịch vụ đó; mask nhầm một dịch vụ hệ thống có thể làm các chức năng phụ thuộc ngừng hoạt động. Gặp tình huống đó, `unmask` là cách quay lại.

### Bước 6: Dọn trạng thái lỗi

Khi một dịch vụ lỗi, systemd ghi nhớ trạng thái `failed`. Sau khi đã sửa, xoá dấu đó bằng:

```bash
sudo systemctl reset-failed hello
```

## Kiểm tra

Thử một chu trình nhỏ với `hello`:

```bash
sudo systemctl enable --now hello
systemctl is-active hello      # kỳ vọng: active
systemctl is-enabled hello     # kỳ vọng: enabled
sudo systemctl restart hello
systemctl status hello --no-pager
```

Nếu `status` hiện `active (running)` và có thời gian bắt đầu mới sau `restart`, mọi thứ đã đúng. Muốn xem chi tiết lý do khi có lỗi, đọc log theo hướng dẫn trong bài sau về `journalctl`.

## Lỗi hay gặp

- **`Failed to enable unit: Unit file hello.service does not exist`:** tên sai hoặc tệp chưa nằm trong `/etc/systemd/system/`; chạy `sudo systemctl daemon-reload` sau khi tạo tệp.
- **`Access denied` hoặc đòi xác thực:** thiếu `sudo` cho lệnh thay đổi trạng thái.
- **Dịch vụ `enable` rồi mà vẫn không chạy lúc khởi động:** `enable` không chạy ngay; hãy kiểm tra `systemctl is-enabled` và log của lần khởi động.
- **Vừa `restart` đã thấy `failed`:** xem log; nguyên nhân thường là sai đường dẫn trong `ExecStart=` hoặc cấu hình hỏng.
- **Tự khởi động lại liên tục:** `Restart=always` có thể che lỗi thật; systemd còn có giới hạn số lần thử, và khi vượt thì dịch vụ vào trạng thái `failed`.

## Tóm lại

Hãy nhớ hai nhóm lệnh: `start`/`stop`/`restart`/`reload` cho việc ngay bây giờ, `enable`/`disable` cho việc lúc khởi động, và `--now` để gộp hai nhóm. Dùng `status`, `is-active`, `is-enabled` để biết trạng thái, và `mask` chỉ khi thật sự cần.

## Tham khảo

- [systemctl — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)
- [systemd.service — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd — Wikipedia](https://en.wikipedia.org/wiki/Systemd)
