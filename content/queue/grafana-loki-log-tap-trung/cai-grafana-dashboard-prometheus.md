---
title: Cài Grafana trên Ubuntu 24.04 và dựng dashboard CPU, RAM, ổ đĩa từ Prometheus
tags: grafana, prometheus, dashboard, ubuntu, promql
type: lab
---

> [!TLDR]
> - Grafana là công cụ vẽ biểu đồ: nó không tự thu số liệu, mà đọc từ nguồn dữ liệu như Prometheus.
> - Cài từ kho APT chính thức của Grafana, chạy bằng dịch vụ systemd `grafana-server`, giao diện ở cổng 3000.
> - Ba truy vấn PromQL cho CPU, RAM và ổ đĩa là đủ để có một dashboard theo dõi máy chủ đầu tiên.

## Mục tiêu

Sau bài này bạn có một Grafana chạy trên Ubuntu 24.04 LTS, đã nối với Prometheus, và một dashboard ba biểu đồ: phần trăm CPU đang dùng, phần trăm RAM đang dùng và phần trăm ổ đĩa đã đầy. Nội dung đối chiếu với tài liệu chính thức của Grafana, tính đến tháng 11/2026.

Bài giả định bạn đã có Prometheus và `node_exporter` chạy trên máy, như trong bài [[Cài node_exporter và Prometheus trên Ubuntu 24.04 chạy như dịch vụ systemd]]. Nếu chưa hiểu `rate` hay `sum by` nghĩa là gì, hãy đọc [[PromQL cơ bản: counter, gauge, rate và sum by qua ví dụ CPU, RAM, ổ đĩa]] trước, vì bài này dùng lại các truy vấn đó.

## Chuẩn bị

- Máy Ubuntu 24.04 LTS có quyền `sudo` và truy cập Internet.
- Prometheus đang chạy ở `http://localhost:9090` và đang thu số liệu từ `node_exporter`.
- Cổng 3000 chưa bị chương trình khác dùng.

Phiên bản Grafana thay đổi theo thời gian. Sau khi cài, hãy ghi lại phiên bản của bạn bằng lệnh `grafana-server --version` để khi đọc tài liệu bạn biết mình đang đối chiếu với bản nào.

## Các bước

### Bước 1: thêm kho APT của Grafana

Grafana phát hành gói cho Debian và Ubuntu qua kho riêng. Các lệnh dưới đây theo hướng dẫn chính thức:

```bash
sudo apt-get install -y apt-transport-https wget gnupg
sudo mkdir -p /etc/apt/keyrings
sudo wget -O /etc/apt/keyrings/grafana.asc https://apt.grafana.com/gpg-full.key
sudo chmod 644 /etc/apt/keyrings/grafana.asc
echo "deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list
```

Tệp khoá `grafana.asc` dùng để apt kiểm chữ ký của gói, và tuỳ chọn `signed-by` giới hạn khoá đó chỉ áp dụng cho kho này. Kho `stable` là bản ổn định; kho `beta` dành cho bản thử nghiệm, không nên dùng cho máy thật.

### Bước 2: cài gói và bật dịch vụ

```bash
sudo apt-get update
sudo apt-get install grafana
sudo systemctl daemon-reload
sudo systemctl enable --now grafana-server
sudo systemctl status grafana-server
```

Gói `grafana` là bản mã nguồn mở (OSS). Dịch vụ tên là `grafana-server`; `enable --now` vừa bật khi khởi động máy vừa chạy ngay. Trạng thái `active (running)` nghĩa là xong. Nếu có lỗi, xem log bằng `sudo journalctl -u grafana-server`, như đã làm trong bài [[journalctl: lọc log theo dịch vụ và theo thời gian trên Ubuntu 24.04]].

### Bước 3: đăng nhập lần đầu

Mở trình duyệt tới `http://localhost:3000/` (cổng mặc định của Grafana là 3000). Nếu Grafana nằm trên máy khác, thay `localhost` bằng địa chỉ của máy đó và mở cổng 3000 cho đúng người cần dùng; đừng mở ra Internet khi chưa có lớp bảo vệ. Đăng nhập bằng tài khoản quản trị mặc định theo tài liệu cài đặt và đổi mật khẩu ngay khi được yêu cầu.

### Bước 4: thêm nguồn dữ liệu Prometheus

Trong giao diện:

1. Vào **Connections** ở menu bên trái, chọn **Add new connection**.
2. Tìm `Prometheus`, chọn **Prometheus data source**, rồi **Add new data source**.
3. Ở tab **Settings**, ô **Prometheus server URL** điền `http://localhost:9090`.
4. Bấm **Save & test**. Thông báo thành công có dạng "Successfully queried the Prometheus API."

Lưu ý: nếu Grafana chạy trong container, `localhost` là chính container đó, không phải máy chủ. Khi đó hãy dùng tên hoặc địa chỉ của máy chạy Prometheus. Ngoài giao diện, Grafana còn cho khai báo nguồn dữ liệu bằng tệp YAML (provisioning); nguồn khai báo kiểu này không sửa được trong giao diện.

### Bước 5: dựng ba biểu đồ

Tạo dashboard mới (**Dashboards** → **New** → **New dashboard** → **Add visualization**), chọn nguồn dữ liệu Prometheus, và nhập từng truy vấn dưới đây ở ô truy vấn (chế độ **Code**). Mỗi truy vấn là một panel.

**CPU đang dùng (%)**

```promql
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

`node_cpu_seconds_total` là bộ đếm (counter) thời gian CPU, chia theo chế độ. `rate` biến nó thành "bao nhiêu giây CPU rảnh mỗi giây", `avg by (instance)` lấy trung bình các lõi, rồi lấy 100 trừ đi phần rảnh để ra phần đang bận.

**RAM đang dùng (%)**

```promql
100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)
```

`MemAvailable` là lượng bộ nhớ hệ điều hành ước tính còn dùng được cho chương trình mới, kể cả phần bộ nhớ đệm có thể thu hồi, nên phản ánh thực tế hơn so với `MemFree`.

**Ổ đĩa đã đầy (%)**

```promql
100 * (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})
```

Bộ lọc `fstype!~"tmpfs|overlay"` bỏ các hệ thống tệp ảo mà bạn thường không muốn theo dõi. Panel sẽ hiện một đường cho mỗi phân vùng.

Với mỗi panel, ở phần **Standard options** hãy đặt đơn vị (**Unit**) là `Percent (0-100)`, đặt tiêu đề rõ ràng như "CPU đang dùng (%)", và bấm **Save dashboard** để đặt tên cho dashboard.

## Kiểm tra

- `systemctl is-active grafana-server` trả về `active`.
- Ở bước **Save & test**, Grafana báo truy vấn được API của Prometheus.
- Cả ba panel có đường biểu đồ chứ không phải "No data". Thử tạo tải (ví dụ chạy một lệnh tốn CPU trong vài chục giây) và xem đường CPU nhích lên sau khoảng một phút, vì Prometheus thu số liệu theo chu kỳ.

## Lỗi hay gặp

- **Panel báo "No data":** thường do nguồn dữ liệu sai URL hoặc Prometheus chưa thu được `node_exporter`. Mở Prometheus, vào mục Targets và xem mục tiêu có ở trạng thái UP không.
- **Không vào được cổng 3000 từ máy khác:** kiểm tra tường lửa và địa chỉ Grafana đang lắng nghe; dùng `ss -tlnp | grep 3000` để xem.
- **Grafana trong container không nối được Prometheus:** do dùng `localhost`; hãy dùng tên dịch vụ hoặc địa chỉ mà container tới được.
- **Biểu đồ ổ đĩa quá nhiều đường:** tinh chỉnh bộ lọc `fstype` hoặc thêm `mountpoint="/"` để chỉ xem phân vùng gốc.

## Tóm lại

Grafana chỉ là lớp hiển thị: số liệu nằm ở Prometheus, còn Grafana gọi truy vấn PromQL và vẽ kết quả. Cài từ kho APT chính thức, bật `grafana-server`, thêm nguồn dữ liệu rồi dán ba truy vấn là có dashboard theo dõi cơ bản. Số liệu mới chỉ trả lời "máy đang thế nào"; để biết "vì sao", bạn cần log, và đó là chủ đề của bài tiếp theo: [[Gom log journald về Loki bằng Grafana Alloy: nhãn log đặt sao cho rẻ]].

## Tham khảo

- [Cài Grafana trên Debian hoặc Ubuntu](https://grafana.com/docs/grafana/latest/setup-grafana/installation/debian/)
- [Khởi động và bật Grafana bằng systemd](https://grafana.com/docs/grafana/latest/setup-grafana/start-restart-grafana/)
- [Cấu hình nguồn dữ liệu Prometheus trong Grafana](https://grafana.com/docs/grafana/latest/datasources/prometheus/configure/)
