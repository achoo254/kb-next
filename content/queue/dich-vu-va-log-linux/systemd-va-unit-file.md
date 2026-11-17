---
title: systemd và unit file trên Ubuntu 24.04: dịch vụ được mô tả và khởi chạy như thế nào
tags: systemd, unit file, dịch vụ, ubuntu, linux
type: note
---

> [!TLDR]
> - systemd là chương trình đầu tiên chạy khi Ubuntu khởi động; nó quản lý các dịch vụ và các "đơn vị" (unit) khác.
> - Mỗi dịch vụ được mô tả bằng một tệp unit dạng `.service` với ba phần chính: `[Unit]`, `[Service]`, `[Install]`.
> - Tệp của gói nằm ở `/usr/lib/systemd/system/`; tệp bạn tự viết hoặc ghi đè nằm ở `/etc/systemd/system/`.

## Mở đầu

Khi bật máy chủ Ubuntu, có rất nhiều thứ phải chạy: dịch vụ mạng, ghi log, lập lịch, máy chủ web... Ai quyết định thứ tự khởi động, ai chạy lại một dịch vụ khi nó bị sập? Trên Ubuntu 24.04 LTS, đó là **systemd** (bản đi kèm là 255). Bài này giải thích khái niệm cốt lõi là *unit* và *unit file*. Bài tiếp theo, bài về `systemctl`, sẽ dùng chúng trong thực tế.

## systemd làm gì

systemd là tiến trình số 1 (PID 1) của hệ thống. Nó khởi động các dịch vụ song song khi có thể, theo thứ tự phụ thuộc mà từng dịch vụ khai báo, và theo dõi chúng sau đó: dịch vụ nào chết thì có thể được chạy lại. Ngoài dịch vụ, systemd còn quản lý nhiều loại đơn vị khác.

## Các loại unit

Mỗi loại được nhận ra qua phần đuôi của tên tệp:

- `.service`: một dịch vụ, ví dụ một máy chủ web hay một chương trình chạy nền.
- `.socket`: một ổ cắm mạng hoặc cục bộ; systemd lắng nghe giúp rồi mới chạy dịch vụ khi có kết nối.
- `.timer`: hẹn giờ chạy một dịch vụ, gần giống cron.
- `.target`: một nhóm unit đóng vai "mốc" khi khởi động, ví dụ `multi-user.target` là trạng thái hệ thống nhiều người dùng, dòng lệnh.
- `.mount`: một điểm gắn kết ổ đĩa.

Trong bài này ta chỉ đi sâu vào `.service`, loại bạn gặp nhiều nhất.

## Unit file nằm ở đâu

systemd đọc tệp unit từ nhiều thư mục; ba thư mục đáng nhớ nhất:

- `/usr/lib/systemd/system/`: tệp do các gói phần mềm cài vào. Đừng sửa trực tiếp, vì bản cập nhật gói có thể ghi đè.
- `/etc/systemd/system/`: tệp của người quản trị. Tệp ở đây được ưu tiên hơn tệp cùng tên trong `/usr/lib/systemd/system/`.
- `/run/systemd/system/`: tệp tạm, mất khi khởi động lại.

Để xem tệp mà systemd đang thực sự dùng cho một dịch vụ (kể cả phần ghi đè), chạy:

```bash
systemctl cat systemd-resolved.service
```

Dòng đầu của kết quả cho biết đường dẫn tệp gốc.

## Giải phẫu một tệp .service

Dưới đây là một tệp ví dụ đơn giản cho một chương trình tên `hello` (đây chỉ là ví dụ minh hoạ, bạn thay bằng chương trình của mình):

```ini
[Unit]
Description=Chương trình hello minh hoạ
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/hello --port 8080
Restart=on-failure
User=hello

[Install]
WantedBy=multi-user.target
```

### Phần [Unit]

Chứa mô tả và quan hệ với unit khác. `Description=` là dòng chữ hiện khi xem trạng thái. `After=network.target` nghĩa là "hãy khởi động sau khi mốc mạng đã đạt". Lưu ý `After=` chỉ quy định *thứ tự*; muốn kéo thêm một unit cùng chạy, ta dùng `Wants=` (yếu, nếu nó lỗi thì dịch vụ ta vẫn chạy) hoặc `Requires=` (chặt hơn).

### Phần [Service]

Mô tả cách chạy tiến trình:

- `ExecStart=` là lệnh khởi chạy; nên dùng đường dẫn đầy đủ tới chương trình.
- `Type=` cho systemd biết khi nào coi dịch vụ là "đã khởi động xong". `simple` (mặc định khi có `ExecStart=` mà không có `Type=` hay `BusName=`) coi tiến trình chính là dịch vụ; `forking` dành cho chương trình tự tách tiến trình con rồi thoát; `oneshot` dành cho việc chạy một lần rồi kết thúc.
- `Restart=on-failure` bảo systemd chạy lại khi tiến trình kết thúc bất thường. Các giá trị thường dùng khác là `no` (mặc định) và `always`.
- `User=` cho chương trình chạy dưới một tài khoản thường thay vì root, một thói quen tốt về an toàn.

### Phần [Install]

Phần này chỉ có tác dụng khi bạn chạy `systemctl enable`. `WantedBy=multi-user.target` nghĩa là khi bật (enable), systemd tạo một liên kết để dịch vụ được kéo vào mỗi lần hệ thống đạt `multi-user.target`, tức là tự chạy lúc khởi động.

## Tự viết một dịch vụ: các bước tổng quát

1. Tạo tệp `/etc/systemd/system/hello.service` (cần quyền `sudo`).
2. Nhờ systemd đọc lại cấu hình: `sudo systemctl daemon-reload`.
3. Kiểm tra cú pháp tệp: `systemd-analyze verify /etc/systemd/system/hello.service`.
4. Khởi động và bật dịch vụ, việc sẽ được hướng dẫn ở bài sau.

Mỗi lần sửa tệp unit, bạn phải chạy lại `daemon-reload` thì thay đổi mới được áp dụng.

## Ghi đè một phần mà không sửa tệp gốc

Muốn đổi một thiết lập của dịch vụ do gói cài, hãy dùng **drop-in**:

```bash
sudo systemctl edit hello.service
```

Lệnh mở trình soạn thảo và lưu phần bạn viết vào `/etc/systemd/system/hello.service.d/override.conf`. Bạn chỉ cần ghi những dòng muốn đổi, ví dụ:

```ini
[Service]
Restart=always
```

Cách này an toàn hơn sửa tệp gốc vì gói cập nhật không xoá thay đổi của bạn.

## Lỗi hay gặp

- **Sửa tệp rồi mà không thấy tác dụng:** quên `sudo systemctl daemon-reload`.
- **Dịch vụ không chạy vì đường dẫn:** `ExecStart=` nên là đường dẫn tuyệt đối, và tệp chương trình phải có quyền chạy.
- **Nhầm `After=` với `Requires=`:** `After=` chỉ sắp thứ tự, không tự kéo unit kia lên.
- **Quên phần `[Install]`:** dịch vụ vẫn chạy được bằng tay nhưng không thể `enable` để tự chạy lúc khởi động.

## Tóm lại

systemd quản lý dịch vụ qua các tệp unit. Tệp `.service` chia ba phần: `[Unit]` cho mô tả và thứ tự, `[Service]` cho cách chạy, `[Install]` cho việc tự chạy khi khởi động. Tệp của gói nằm ở `/usr/lib/systemd/system/`, tệp của bạn ở `/etc/systemd/system/`, và `systemctl edit` giúp ghi đè an toàn. Sau mỗi thay đổi nhớ `daemon-reload`.

## Tham khảo

- [systemd.unit — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html)
- [systemd.service — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd — Wikipedia](https://en.wikipedia.org/wiki/Systemd)
