---
title: PromQL cơ bản: counter, gauge, rate và sum by qua ví dụ CPU, RAM, ổ đĩa
tags: prometheus, promql, node_exporter, counter, gauge
type: note
---

> [!TLDR]
> - Counter chỉ tăng (có thể về 0 khi khởi động lại) nên phải bọc bằng `rate()`; gauge lên xuống tự do nên dùng trực tiếp.
> - `sum by (...)` và `avg by (...)` gộp nhiều chuỗi thời gian lại theo nhãn bạn chọn.
> - Ba ví dụ với node_exporter: phần trăm CPU đang dùng, RAM còn trống, ổ đĩa còn trống.

## Mở đầu

PromQL là ngôn ngữ truy vấn của Prometheus. Nó không giống SQL: bạn viết một biểu thức, và kết quả là một tập chuỗi thời gian. Bài này giả định bạn đã có Prometheus kéo số đo từ node_exporter như ở [[Cài node_exporter và Prometheus trên Ubuntu 24.04 chạy như dịch vụ systemd]]. Hãy mở trang `http://localhost:9090/graph` và gõ thử từng biểu thức bên dưới.

## Chuỗi thời gian và nhãn

Một chuỗi thời gian gồm tên metric và các nhãn, ví dụ `node_filesystem_avail_bytes{device="/dev/sda1", mountpoint="/"}`. Tên và nhãn xác định chuỗi; Prometheus lưu giá trị của nó theo thời gian.

Ghi tên metric trần, như `node_load1`, trả về **instant vector**: với mỗi chuỗi có đúng một giá trị, là mẫu gần nhất tại thời điểm truy vấn (nếu mẫu đó nằm trong khoảng nhìn lại, mặc định 5 phút). Thêm khoảng thời gian trong ngoặc vuông, như `node_cpu_seconds_total[5m]`, trả về **range vector**: với mỗi chuỗi là cả một dãy giá trị trong 5 phút gần nhất. Range vector không vẽ được trực tiếp; nó dành để đưa vào các hàm như `rate()`.

Bộ lọc nhãn đặt trong ngoặc nhọn:

- `=` khớp đúng, `!=` khác;
- `=~` khớp biểu thức chính quy, `!~` không khớp. Biểu thức chính quy luôn được neo hai đầu, nên `mode=~"idle"` nghĩa là `^idle$`.

Ví dụ: `node_cpu_seconds_total{mode="idle"}`.

## Counter và gauge

Hai loại metric bạn gặp nhiều nhất:

- **Counter** là giá trị tích luỹ chỉ tăng; khi tiến trình khởi động lại nó có thể về 0. Ví dụ: `node_cpu_seconds_total` (tổng số giây CPU đã chạy ở mỗi chế độ), `node_network_receive_bytes_total` (tổng byte đã nhận). Tên counter thường kết thúc bằng `_total`. Giá trị tuyệt đối của counter ít có ý nghĩa; điều ta quan tâm là *tốc độ tăng*.
- **Gauge** là một con số lên xuống tự do, như nhiệt độ hay lượng RAM trống. Ví dụ: `node_memory_MemAvailable_bytes`, `node_filesystem_avail_bytes`, `node_load1`. Có thể đọc thẳng.

Còn có histogram và summary dùng để ghi phân bố (như thời gian phản hồi), chưa cần trong bài này.

### rate: biến counter thành tốc độ

`rate(v[khoảng])` cho tốc độ tăng trung bình mỗi giây của counter trong khoảng đó, và tự bù khi counter bị về 0 do khởi động lại. Ví dụ, số byte nhận mỗi giây qua mạng:

```promql
rate(node_network_receive_bytes_total[5m])
```

Một vài lưu ý từ tài liệu chính thức: `irate()` chỉ dựa trên hai mẫu cuối, hợp để vẽ biểu đồ biến động nhanh; `rate()` mượt hơn nên hợp với cảnh báo; `increase()` cho tổng mức tăng trong khoảng và về cơ bản là `rate()` nhân với số giây của khoảng. Ngoài ra hãy luôn **`rate()` trước, gộp sau**: nếu gộp (sum) counter rồi mới rate thì Prometheus không còn phát hiện được các lần counter bị reset.

Khoảng thời gian trong `rate` nên lớn hơn vài lần chu kỳ kéo; với chu kỳ 15 giây, `[1m]` hoặc `[5m]` là hợp lý.

## Gộp bằng sum by và avg by

Một metric thường có nhiều chuỗi (mỗi lõi CPU, mỗi ổ đĩa, mỗi máy). Toán tử gộp thu chúng lại:

- `sum(...)`: cộng tất cả; `avg(...)`: trung bình.
- `by (nhãn)`: giữ lại các nhãn liệt kê, gộp theo chúng; `without (nhãn)`: bỏ các nhãn liệt kê, giữ phần còn lại.

Ví dụ: tổng byte nhận trên toàn bộ giao diện mạng của mỗi máy:

```promql
sum by (instance) (rate(node_network_receive_bytes_total[5m]))
```

## Ví dụ 1: CPU đang bận bao nhiêu phần trăm

`node_cpu_seconds_total` có nhãn `cpu` (mỗi lõi) và `mode` (idle, user, system...). Tốc độ tăng của chế độ `idle` là tỉ lệ thời gian lõi đó rảnh (0 đến 1). Trung bình trên các lõi của từng máy, rồi lấy phần còn lại:

```promql
100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))
```

Đọc từ trong ra ngoài: lọc chế độ idle, tính tốc độ từng lõi, lấy trung bình theo máy, trừ khỏi 1 để ra tỉ lệ bận, nhân 100 ra phần trăm.

## Ví dụ 2: RAM còn trống

Hai gauge `node_memory_MemAvailable_bytes` (RAM có thể cấp cho chương trình mới) và `node_memory_MemTotal_bytes` (tổng RAM). Tỉ lệ RAM còn dùng được:

```promql
100 * node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes
```

Hai vế có cùng bộ nhãn nên phép chia ghép từng cặp chuỗi cùng nhãn. Dùng `MemAvailable` thay vì "free" vì Linux dùng RAM trống làm bộ nhớ đệm, nên "free" thấp chưa chắc là thiếu RAM.

## Ví dụ 3: ổ đĩa còn trống

```promql
100 * node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}
    / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"}
```

Bộ lọc `fstype!~"tmpfs|overlay"` loại các hệ tệp ảo ra khỏi kết quả để chỉ còn ổ đĩa thật. Muốn xem riêng một điểm gắn kết, thêm `mountpoint="/"`.

## Kiểm tra và lỗi hay gặp

- **Kết quả trống**: kiểm tra chính tả tên metric. Gõ vài chữ đầu trong ô truy vấn, trang sẽ gợi ý; hoặc xem danh sách ở `/metrics` của node_exporter.
- **"expected type instant vector, got range vector"**: bạn đưa `metric[5m]` vào chỗ cần một giá trị đơn; hãy bọc bằng `rate()`.
- **Dùng `rate` cho gauge**: sai về ý nghĩa; gauge đọc trực tiếp, hoặc dùng `avg_over_time()` để lấy trung bình theo thời gian.
- **Gộp rồi mới rate**: đảo ngược thứ tự, như đã nói ở trên.
- **Quên nhãn `by`**: `sum(...)` không có `by` cho ra một số duy nhất, gộp hết mọi máy.

## Tóm lại

Nắm bốn điều là đọc được phần lớn truy vấn Prometheus: chuỗi thời gian là tên cộng nhãn; counter dùng với `rate()`, gauge dùng thẳng; `sum by`/`avg by` gộp theo nhãn; rate trước, gộp sau. Bước tiếp theo là biến các biểu thức này thành cảnh báo, như ở bài tiếp theo về cảnh báo với Alertmanager. 

## Tham khảo

- Prometheus: [Querying basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- Prometheus: [Query functions](https://prometheus.io/docs/prometheus/latest/querying/functions/)
- Prometheus: [Metric types](https://prometheus.io/docs/concepts/metric_types/)
- Prometheus: [Monitoring Linux host metrics with the Node Exporter](https://prometheus.io/docs/guides/node-exporter/)
