---
title: Cảnh báo với Prometheus và Alertmanager: metric khác log thế nào
tags: prometheus, alertmanager, cảnh báo, metric, log
type: process
---

> [!TLDR]
> - Metric là con số theo thời gian, rẻ và hợp để biết "có vấn đề không"; log là bản ghi từng sự kiện, hợp để biết "vấn đề là gì".
> - Prometheus đánh giá luật cảnh báo (biểu thức PromQL kèm `for`) rồi gửi cảnh báo đến Alertmanager.
> - Alertmanager gom nhóm, giảm lặp và chuyển thông báo đến nơi nhận như webhook; luôn thử bằng cách tắt hẳn một exporter.

## Metric và log: hai loại dữ liệu bổ sung nhau

**Metric** là các con số lấy mẫu theo thời gian: CPU 80%, 12 nghìn yêu cầu mỗi phút. Dung lượng nhỏ, truy vấn nhanh, hợp để vẽ biểu đồ và đặt ngưỡng cảnh báo. Nhưng metric chỉ cho biết *có gì đó bất thường*, hiếm khi cho biết nguyên nhân.

**Log** là bản ghi chi tiết từng sự kiện: ai gọi gì, lỗi nào, lúc nào. Log trả lời "chuyện gì đã xảy ra", nhưng đọc và lưu nhiều log thì tốn kém hơn.

Cách làm quen thuộc: dùng metric để *phát hiện* và cảnh báo, rồi dùng log để *điều tra*. Ví dụ, cảnh báo cho biết dịch vụ ngừng phản hồi; bạn mở log của dịch vụ đó bằng các cách lọc trong [[journalctl: lọc log theo dịch vụ và theo thời gian trên Ubuntu 24.04]] để tìm lý do.

## Mục tiêu

Dựng một luật cảnh báo trong Prometheus, cho Alertmanager nhận cảnh báo và chuyển đến một webhook, rồi thử bằng cách làm cho một target ngừng chạy. Bài dùng các truy vấn đã học ở [[PromQL cơ bản: counter, gauge, rate và sum by qua ví dụ CPU, RAM, ổ đĩa]].

## Chuẩn bị

- Prometheus và node_exporter đã chạy; `promtool` có sẵn (xem hai bài trước).
- Cài Alertmanager: tải tệp `alertmanager-*.linux-amd64.tar.gz` từ `https://prometheus.io/download/`, chép binary `alertmanager` và `amtool` vào `/usr/local/bin`, rồi tạo unit file tương tự như Prometheus. Alertmanager nghe ở cổng 9093.
- Một nơi nhận để thử. Trong bài ta dùng địa chỉ webhook giả `http://localhost:5001/alerts`; bạn có thể thay bằng dịch vụ của mình.

## Các bước

### Bước 1: viết luật cảnh báo

Tạo `/etc/prometheus/rules.yml`:

```yaml
groups:
  - name: host
    rules:
      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Target {{ $labels.instance }} không phản hồi"

      - alert: LowMemory
        expr: node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes < 0.10
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "RAM còn dùng được của {{ $labels.instance }} dưới 10%"
```

Giải thích: `alert` là tên; `expr` là biểu thức PromQL, chuỗi nào cho kết quả thì cảnh báo đang "hoạt động"; `for` bắt biểu thức phải đúng liên tục suốt khoảng đó mới "bắn" (trước đó cảnh báo ở trạng thái *pending*), tránh báo giả vì một nhịp dao động; `labels` gắn nhãn dùng để định tuyến; `annotations` là thông tin cho người đọc, có thể chèn `{{ $labels.tên_nhãn }}` và `{{ $value }}` (giá trị của biểu thức). Giá trị `for: 1m` ở `InstanceDown` là để thử cho nhanh; môi trường thật thường dùng khoảng dài hơn.

Kiểm tra cú pháp:

```bash
promtool check rules /etc/prometheus/rules.yml
```

### Bước 2: nối Prometheus với luật và Alertmanager

Thêm vào `/etc/prometheus/prometheus.yml`:

```yaml
rule_files:
  - /etc/prometheus/rules.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']
```

Kiểm tra rồi nạp lại:

```bash
promtool check config /etc/prometheus/prometheus.yml
sudo systemctl kill -s SIGHUP prometheus
```

### Bước 3: cấu hình Alertmanager

Tạo `/etc/alertmanager/alertmanager.yml`:

```yaml
route:
  receiver: default-webhook
  group_by: [alertname, instance]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: default-webhook
    webhook_configs:
      - url: 'http://localhost:5001/alerts'
        send_resolved: true
```

Ý nghĩa: `group_by` gom các cảnh báo cùng nhãn thành một thông báo, tránh bị dội hàng loạt; `group_wait` là thời gian chờ trước thông báo đầu tiên của một nhóm để gom thêm cảnh báo liên quan; `group_interval` là khoảng giữa các thông báo khi nhóm có thay đổi; `repeat_interval` là khoảng nhắc lại khi cảnh báo vẫn chưa hết (các giá trị trên là mặc định, ghi ra cho rõ); `send_resolved` gửi thêm thông báo khi vấn đề đã hết.

Kiểm tra bằng công cụ đi kèm rồi chạy:

```bash
amtool check-config /etc/alertmanager/alertmanager.yml
```

Khi thành công, lệnh in `SUCCESS` cùng tóm tắt các phần tìm thấy. Sau đó khởi động Alertmanager bằng systemd với `--config.file=/etc/alertmanager/alertmanager.yml`.

## Kiểm tra

1. Mở `http://localhost:9090/alerts` để xem trạng thái luật: Inactive, Pending hoặc Firing.
2. Dừng node_exporter để tạo sự cố giả: `sudo systemctl stop node_exporter`. Chỉ làm trên máy thử.
3. Chờ khoảng hơn 1 phút: `InstanceDown` chuyển Pending rồi Firing. Sau thời gian `group_wait`, Alertmanager gửi thông báo đến webhook. Có thể xem cảnh báo ở giao diện `http://localhost:9093`.
4. Bật lại bằng `sudo systemctl start node_exporter`; cảnh báo hết và (nhờ `send_resolved`) bạn nhận thông báo "đã giải quyết".

## Lỗi hay gặp

- **Không có cảnh báo dù biểu thức đúng**: có thể `for` chưa đủ thời gian, hoặc chưa nạp `rule_files`. Chạy biểu thức `expr` ở trang Graph để xem có cho ra kết quả không.
- **Prometheus thấy cảnh báo nhưng không có thông báo**: kiểm tra đoạn `alerting` trỏ đúng địa chỉ Alertmanager và Alertmanager đang chạy.
- **Dội thông báo liên tục**: `group_by` quá chi tiết hoặc `repeat_interval` quá ngắn.
- **Cảnh báo "nhấp nháy"**: tăng `for`, hoặc dùng `rate()` với khoảng dài hơn thay cho `irate()`.
- **Mở Alertmanager ra internet không xác thực**: giao diện cho phép tạo "silence" (tắt tiếng cảnh báo), nên hãy giới hạn truy cập.

## Tóm lại

Metric giúp bạn biết sớm có chuyện, log giúp bạn hiểu chuyện gì. Prometheus đánh giá luật với `for` để tránh báo giả; Alertmanager lo gom nhóm, giảm lặp và chuyển đến nơi nhận. Luôn thử bằng một sự cố có kiểm soát để chắc rằng thông báo thực sự đến nơi.

## Tham khảo

- Prometheus: [Alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- Prometheus: [Alertmanager configuration](https://prometheus.io/docs/alerting/latest/configuration/)
- Prometheus: [Alertmanager overview](https://prometheus.io/docs/alerting/latest/alertmanager/)
- Prometheus: [Recording rules best practices](https://prometheus.io/docs/practices/rules/)
