---
title: Gom log journald về Loki bằng Grafana Alloy: nhãn log đặt sao cho rẻ
tags: loki, alloy, journald, log, nhãn log
type: lab
---

> [!TLDR]
> - Loki lưu log theo luồng, mỗi tổ hợp nhãn là một luồng; nhãn nhiều giá trị khác nhau làm chỉ mục phình to và truy vấn chậm.
> - Promtail đã hết vòng đời từ 2/3/2026; thay bằng Grafana Alloy, đọc journald qua `loki.source.journal`.
> - Chỉ giữ vài nhãn ổn định như máy và dịch vụ; phần còn lại để lọc lúc truy vấn.

## Mục tiêu

Bài này đưa log của journald trên một hay nhiều máy Ubuntu 24.04 LTS về một nơi là Loki, rồi xem được trong Grafana. Quan trọng hơn việc chạy được là việc đặt nhãn: nhãn đặt sai là nguồn gốc chính khiến hệ thống log chậm và tốn kém. Nội dung đối chiếu với tài liệu chính thức của Grafana, tính đến tháng 11/2026.

Bạn nên biết cách đọc log trên một máy bằng `journalctl`, xem [[journalctl: lọc log theo dịch vụ và theo thời gian trên Ubuntu 24.04]]. Bài này nối nhiều máy lại với nhau.

## Chuẩn bị

- Một máy chạy Loki (gọi là máy log) và một hay nhiều máy cần thu log, đều Ubuntu 24.04 LTS có `sudo`. Có thể là cùng một máy khi thử nghiệm.
- Máy cần thu log tới được máy log qua cổng 3100 (cổng HTTP mặc định của Loki). Trong ví dụ dưới đây máy log có địa chỉ `192.0.2.10`.
- Grafana đã cài, theo hướng dẫn cài Grafana từ kho APT chính thức ở bài trước trong chuỗi.

Loki không có xác thực tích hợp sẵn. Tài liệu chính thức khuyên đặt một reverse proxy có xác thực (ví dụ nginx) phía trước; đừng để cổng 3100 mở cho mạng không tin cậy.

## Các bước

### Bước 1: cài Loki

Thêm kho APT của Grafana (các lệnh `wget` khoá và dòng `deb` giống bài cài Grafana), sau đó:

```bash
sudo apt-get update
sudo apt-get install loki
sudo systemctl enable --now loki
curl -s http://localhost:3100/ready
```

Tài liệu Loki cho phép cài bằng gói `loki` từ kho này, hoặc tải tệp nhị phân từ trang phát hành. Lệnh `curl` tới `/ready` trả về `ready` khi Loki đã sẵn sàng (có thể phải chờ chừng một phút sau khi khởi động). Gói đi kèm một tệp cấu hình cho chạy một tiến trình; với môi trường thật hãy xem lại nơi lưu dữ liệu và thời gian giữ log. Với lưu trữ trên ổ đĩa, Loki chỉ xoá theo cấu hình lưu giữ (retention), không xoá khi đĩa đầy, nên bạn phải tự canh dung lượng.

### Bước 2: vì sao là Alloy chứ không phải Promtail

Promtail là tác tử thu log cũ của Loki. Tài liệu chính thức ghi rõ Promtail đã hết vòng đời (EOL) từ ngày 2/3/2026, không còn cập nhật, và khuyên chuyển sang Grafana Alloy hoặc tác tử được hỗ trợ khác. Vì vậy mọi cài đặt mới nên dùng Alloy. Nếu đang dùng Promtail, tài liệu Alloy có công cụ chuyển cấu hình Promtail sang cấu hình Alloy.

### Bước 3: cài Alloy trên máy cần thu log

```bash
sudo apt install gpg
sudo mkdir -p /etc/apt/keyrings
sudo wget -O /etc/apt/keyrings/grafana.asc https://apt.grafana.com/gpg-full.key
sudo chmod 644 /etc/apt/keyrings/grafana.asc
echo "deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt-get update
sudo apt-get install alloy
```

Dịch vụ tên là `alloy`. Tệp cấu hình mặc định là `/etc/alloy/config.alloy`.

### Bước 4: viết cấu hình thu log journald

Mở `/etc/alloy/config.alloy` và đặt nội dung sau (thay địa chỉ máy log cho đúng):

```alloy
loki.relabel "journal" {
  forward_to = []

  rule {
    source_labels = ["__journal__systemd_unit"]
    target_label  = "unit"
  }
}

loki.source.journal "read" {
  forward_to    = [loki.write.local.receiver]
  relabel_rules = loki.relabel.journal.rules
  labels        = { host = "may-01", job = "journald" }
}

loki.write "local" {
  endpoint {
    url = "http://192.0.2.10:3100/loki/api/v1/push"
  }
}
```

Giải thích từng khối:

- `loki.source.journal` đọc journald (mặc định từ `/var/log/journal` và `/run/log/journal`) rồi chuyển các dòng log tới nơi ghi trong `forward_to`. Tuỳ chọn `max_age` mặc định là 7 giờ: Alloy chỉ đọc log cũ nhất trong khoảng đó tính từ lúc tiến trình chạy.
- Mỗi trường của journald trở thành một nhãn nội bộ tên `__journal_TÊNTRƯỜNG`. Trường `_systemd_unit` có dấu gạch dưới đầu nên nhãn có hai gạch dưới sau `__journal`. Nhãn bắt đầu bằng `__` bị loại bỏ trước khi gửi đi, nên khối `loki.relabel` đổi nó thành nhãn `unit` để giữ lại.
- `labels` gắn nhãn cố định cho mọi dòng log: ở đây tên máy (`host`) và `job`.
- `loki.write` gửi log tới địa chỉ đẩy của Loki.

Áp dụng cấu hình:

```bash
sudo systemctl enable --now alloy
sudo systemctl reload alloy
sudo journalctl -u alloy -n 20
```

Sau khi sửa tệp cấu hình, `systemctl reload alloy` đủ để Alloy nạp lại. Nếu log của `alloy` báo không đọc được journal, hãy kiểm quyền của tài khoản chạy Alloy: để đọc journal, tài khoản thường cần thuộc nhóm `systemd-journal`.

### Bước 5: thêm nguồn dữ liệu Loki trong Grafana

Trong Grafana, vào **Connections** → **Add new connection**, chọn **Loki**, điền URL `http://192.0.2.10:3100` (hoặc `http://localhost:3100` khi cùng máy), bấm **Save & test**. Sau đó mở **Explore**, chọn nguồn Loki và chạy truy vấn đơn giản:

```logql
{job="journald", unit="ssh.service"}
```

## Nhãn log: đặt sao cho rẻ

Đây là phần dễ sai nhất. Loki chỉ lập chỉ mục theo nhãn, không lập chỉ mục nội dung dòng log. Mỗi tổ hợp giá trị nhãn tạo ra một luồng (stream) riêng. Theo hướng dẫn chính thức:

- Nhãn tĩnh, có giới hạn rõ (môi trường, cụm, máy, ứng dụng) rất phù hợp.
- Nhãn động nên dùng ít. Nhiều luồng làm chỉ mục lớn hơn và các khối dữ liệu nhỏ hơn, gây hại cho hiệu năng. Nên giữ số giá trị ở mức vài chục trở xuống.
- Đừng dùng giá trị chỉ sống ngắn như mã theo dõi hay mã đơn hàng làm nhãn.
- Đừng thêm nhãn khi chưa cần: bộ lọc nội dung như `|= "chuỗi"` thường đã đủ nhanh.
- Giá trị gần như không lặp lại (kiểu `requestId`) không thuộc về nhãn; hãy lọc theo nó lúc truy vấn.

Áp vào bài này: `host`, `job` và `unit` là bộ nhãn hợp lý vì số giá trị bị chặn bởi số máy và số dịch vụ. Tránh sao chép mọi trường journald thành nhãn (như mã tiến trình PID), vì PID thay đổi liên tục và sẽ sinh vô số luồng. Có thể kiểm tra luồng và nhãn đang có bằng API Series hoặc `logcli series --analyze-labels`.

## Kiểm tra

- `curl -s http://192.0.2.10:3100/ready` từ máy thu log trả về `ready`.
- `systemctl is-active alloy` trả về `active` và `journalctl -u alloy` không báo lỗi gửi.
- Truy vấn `{job="journald"}` trong Explore trả về các dòng log gần đây, có nhãn `unit`.

## Lỗi hay gặp

- **Không có log:** kiểm URL `loki.write`, tường lửa tới cổng 3100, và quyền đọc journal.
- **Chỉ thấy log cũ hoặc thiếu log:** nhớ `max_age` mặc định là 7 giờ.
- **Truy vấn chậm, Loki tốn bộ nhớ:** thường do quá nhiều nhãn hoặc nhãn có quá nhiều giá trị.
- **Nhãn `unit` không xuất hiện:** viết sai tên nhãn nguồn; phải là `__journal__systemd_unit` với hai gạch dưới.

## Tóm lại

Log tập trung cần ba mảnh: Loki để lưu, Alloy để thu (thay Promtail đã hết vòng đời) và Grafana để xem. Thành bại nằm ở nhãn: ít, ổn định, bị chặn số giá trị; còn lại để bộ lọc lúc truy vấn lo. Có log trong Loki rồi, bước tiếp theo là biết hỏi nó: xem [[LogQL cơ bản và cảnh báo từ log: khi nào dùng metric thay vì log]].

## Tham khảo

- [Cài Loki cục bộ](https://grafana.com/docs/loki/latest/setup/install/local/)
- [Cài Grafana Alloy trên Linux](https://grafana.com/docs/alloy/latest/set-up/install/linux/)
- [Cấu hình Alloy trên Linux](https://grafana.com/docs/alloy/latest/configure/linux/)
- [Thành phần loki.source.journal](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.journal/)
- [Thành phần loki.write](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.write/)
- [Thực hành tốt về nhãn trong Loki](https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/)
- [Promtail đã hết vòng đời](https://grafana.com/docs/loki/latest/send-data/promtail/)
