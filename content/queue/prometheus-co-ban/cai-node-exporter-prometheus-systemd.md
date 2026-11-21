---
title: Cài node_exporter và Prometheus trên Ubuntu 24.04 chạy như dịch vụ systemd
tags: prometheus, node_exporter, systemd, ubuntu, giám sát
type: lab
---

> [!TLDR]
> - node_exporter đo sức khoẻ của máy (CPU, RAM, ổ đĩa, mạng) và mở ra ở cổng 9100; Prometheus định kỳ đến "kéo" số đo đó về.
> - Cả hai chương trình là tệp chạy đơn lẻ; ta tạo người dùng riêng và viết unit file để systemd tự khởi động, tự chạy lại khi lỗi.
> - Kiểm tra bằng `curl` ở cổng 9100 và trang Targets ở cổng 9090: mọi target phải ở trạng thái UP.

## Mục tiêu

Sau bài này bạn có một máy Ubuntu 24.04 LTS chạy hai dịch vụ: **node_exporter** (cung cấp số đo của chính máy đó) và **Prometheus** (thu thập, lưu và cho truy vấn các số đo). Cả hai chạy dưới systemd, nên tự bật khi máy khởi động và tự khởi động lại khi bị dừng bất thường.

Prometheus hoạt động theo mô hình *kéo* (pull): thay vì chương trình tự gửi số đo đi, Prometheus chủ động gọi HTTP đến một địa chỉ `/metrics` của từng "target" theo chu kỳ, ví dụ mỗi 15 giây. Nơi cung cấp `/metrics` gọi là **exporter**. node_exporter là exporter chính thức cho số đo của hệ điều hành Linux.

Nếu bạn chưa quen với unit file, hãy đọc trước [[systemd và unit file trên Ubuntu 24.04: dịch vụ được mô tả và khởi chạy như thế nào]]; bài này dùng đúng các khái niệm đó.

## Chuẩn bị

- Máy Ubuntu 24.04 LTS, tài khoản có quyền `sudo`, có kết nối ra internet để tải tệp.
- Các cổng 9100 (node_exporter) và 9090 (Prometheus) chưa bị chương trình khác dùng. Trong bài này cả hai chỉ cần truy cập từ chính máy (`localhost`).
- Mở trang phát hành chính thức để chọn phiên bản: node_exporter tại `https://github.com/prometheus/node_exporter/releases` và Prometheus tại `https://prometheus.io/download/`. Bài dùng node_exporter 1.10.2 theo ví dụ trong hướng dẫn chính thức; với Prometheus, bạn thay `PROM_VERSION` bằng số phiên bản bạn chọn (ví dụ viết dưới dạng `3.x.y`, không kèm chữ `v`).

Kiểu máy là `linux-amd64`. Nếu máy dùng ARM, tên tệp tải sẽ là `linux-arm64`; hãy kiểm tra bằng `uname -m` (kết quả `x86_64` là amd64, `aarch64` là arm64).

## Các bước

### Bước 1: tạo người dùng hệ thống không đăng nhập được

Chạy dịch vụ bằng người dùng riêng giúp hạn chế thiệt hại nếu chương trình bị lợi dụng:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin node_exporter
sudo useradd --system --no-create-home --shell /usr/sbin/nologin prometheus
```

### Bước 2: tải và cài node_exporter

```bash
cd /tmp
wget https://github.com/prometheus/node_exporter/releases/download/v1.10.2/node_exporter-1.10.2.linux-amd64.tar.gz
tar xvfz node_exporter-1.10.2.linux-amd64.tar.gz
sudo install -o root -g root -m 0755 node_exporter-1.10.2.linux-amd64/node_exporter /usr/local/bin/node_exporter
```

Trang phát hành có kèm tệp tổng kiểm (checksum) `sha256sums.txt`; nên đối chiếu bằng `sha256sum` trước khi cài.

### Bước 3: viết unit file cho node_exporter

Tạo tệp `/etc/systemd/system/node_exporter.service`:

```ini
[Unit]
Description=Prometheus node_exporter
After=network-online.target
Wants=network-online.target

[Service]
User=node_exporter
ExecStart=/usr/local/bin/node_exporter
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Giải thích ngắn: `User=` chọn người dùng chạy; `ExecStart=` là lệnh khởi chạy; `Restart=on-failure` bảo systemd chạy lại khi chương trình thoát với lỗi; `WantedBy=multi-user.target` làm cho dịch vụ bật cùng máy khi bạn `enable`.

Nạp lại cấu hình và bật dịch vụ:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter
systemctl status node_exporter --no-pager
```

### Bước 4: tải và cài Prometheus

```bash
cd /tmp
wget https://github.com/prometheus/prometheus/releases/download/vPROM_VERSION/prometheus-PROM_VERSION.linux-amd64.tar.gz
tar xvfz prometheus-PROM_VERSION.linux-amd64.tar.gz
cd prometheus-PROM_VERSION.linux-amd64
sudo install -m 0755 prometheus promtool /usr/local/bin/
sudo mkdir -p /etc/prometheus /var/lib/prometheus
sudo chown prometheus:prometheus /var/lib/prometheus
```

`promtool` là công cụ đi kèm để kiểm tra tệp cấu hình và tệp luật; ta sẽ dùng nó ở các bước sau.

### Bước 5: viết tệp cấu hình prometheus.yml

Tạo `/etc/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: node
    static_configs:
      - targets: ['localhost:9100']
```

`scrape_interval` là chu kỳ kéo số đo. Mỗi mục trong `scrape_configs` là một "job" với danh sách target. Kiểm tra cú pháp trước khi chạy:

```bash
promtool check config /etc/prometheus/prometheus.yml
```

### Bước 6: unit file cho Prometheus

Tạo `/etc/systemd/system/prometheus.service`:

```ini
[Unit]
Description=Prometheus
After=network-online.target
Wants=network-online.target

[Service]
User=prometheus
ExecStart=/usr/local/bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Cờ `--storage.tsdb.path` chỉ nơi cơ sở dữ liệu chuỗi thời gian được lưu (mặc định là thư mục `./data` cạnh nơi chạy, không phù hợp khi chạy như dịch vụ). Bật dịch vụ:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now prometheus
systemctl status prometheus --no-pager
```

## Kiểm tra

1. Xem số đo thô của máy:

   ```bash
   curl -s http://localhost:9100/metrics | grep "node_" | head
   ```

   Bạn sẽ thấy các dòng dạng `node_cpu_seconds_total{...} số`. Mỗi dòng là một chuỗi thời gian: tên metric, các nhãn trong dấu ngoặc nhọn và giá trị.

2. Mở trình duyệt đến `http://localhost:9090/targets` (hoặc vào **Status > Target health**). Target thuộc job `node` phải hiện **UP**. Máy chủ ở xa thì dùng đường hầm SSH hoặc proxy thay vì mở thẳng cổng ra internet.

3. Trong ô truy vấn của trang `http://localhost:9090/graph`, nhập `up` rồi bấm Execute. Metric `up` do chính Prometheus tạo cho mỗi target: giá trị 1 là lần kéo gần nhất thành công, 0 là thất bại. Đây là cách đơn giản nhất để biết một exporter còn sống.

4. Muốn nạp lại cấu hình sau khi sửa `prometheus.yml` mà không khởi động lại, gửi tín hiệu SIGHUP: `sudo systemctl kill -s SIGHUP prometheus`.

## Lỗi hay gặp

- **Target hiện DOWN**: kiểm tra node_exporter còn chạy (`systemctl status node_exporter`) và đúng cổng. Thử `curl` thủ công đến địa chỉ target từ chính máy chạy Prometheus.
- **Prometheus không lên, báo lỗi quyền**: thư mục `/var/lib/prometheus` phải thuộc người dùng `prometheus` (bước 4). Xem chi tiết bằng `journalctl -u prometheus -e`; cách lọc log được giải thích trong [[journalctl: lọc log theo dịch vụ và theo thời gian trên Ubuntu 24.04]].
- **Lỗi cú pháp YAML**: YAML nhạy với thụt lề, chỉ dùng dấu cách, không dùng tab. `promtool check config` sẽ chỉ ra dòng sai.
- **Sửa unit file mà không có tác dụng**: quên `sudo systemctl daemon-reload`.
- **Mở cổng 9100 hoặc 9090 ra internet**: các cổng này không có xác thực mặc định, nên đừng mở công khai; hạn chế bằng tường lửa hoặc đặt sau proxy có xác thực.

## Tóm lại

Cài hai tệp chạy đơn lẻ, tạo người dùng riêng, mô tả chúng bằng unit file và để systemd lo phần còn lại. node_exporter phơi số đo ở cổng 9100, Prometheus kéo về mỗi 15 giây và cho bạn xem ở cổng 9090. Có dữ liệu rồi, bước tiếp theo là học cách hỏi dữ liệu bằng PromQL.

## Tham khảo

- Prometheus: [Monitoring Linux host metrics with the Node Exporter](https://prometheus.io/docs/guides/node-exporter/)
- Prometheus: [Getting started](https://prometheus.io/docs/prometheus/latest/getting_started/)
- Prometheus: [Download](https://prometheus.io/download/)
- Prometheus: [Jobs and instances (metric `up`)](https://prometheus.io/docs/concepts/jobs_instances/)
