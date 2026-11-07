---
title: Kiểm tra kết nối mạng trên Ubuntu bằng ip, ss, ping và tracepath
tags: ubuntu, ip, ss, ping, tracepath, mạng
type: lab
---

## Mục tiêu

Khi mạng trục trặc, thay vì đoán mò, bạn có thể đi từng bước từ gần đến xa: máy mình có địa chỉ chưa, có đường ra chưa, đích có trả lời không, và chương trình nào đang mở cổng. Bài này giới thiệu bốn công cụ có sẵn trên Ubuntu 24.04 LTS: `ip`, `ss`, `ping` và `tracepath`.

## Chuẩn bị

- Máy Ubuntu 24.04 LTS, mở terminal.
- Các địa chỉ trong bài là địa chỉ ví dụ: `192.0.2.10` (máy bạn), `192.0.2.1` (cổng ra), `198.51.100.10` (một máy ở xa), `example.com`. Hãy thay bằng địa chỉ của bạn.
- Những lệnh chỉ đọc thông tin dưới đây đều an toàn. Chúng không thay đổi cấu hình mạng.

## Các bước

### Bước 1: Máy mình có địa chỉ không? (ip address, ip link)

```bash
ip -br link
ip -br address
```

Tuỳ chọn `-br` (brief) in mỗi card mạng trên một dòng cho dễ đọc. Hãy nhìn:

- Trạng thái `UP` nghĩa là card đang bật. `DOWN` nghĩa là chưa bật hoặc chưa cắm dây.
- Cột địa chỉ phải có một địa chỉ IPv4 như `192.0.2.10/24`. Nếu trống, máy chưa nhận được địa chỉ: hãy xem lại cấu hình netplan của máy.
- Địa chỉ bắt đầu bằng `127.` thuộc card `lo` (loopback), dùng để máy nói chuyện với chính nó.

### Bước 2: Có đường ra ngoài không? (ip route)

```bash
ip route
```

Hãy tìm dòng bắt đầu bằng `default via`, ví dụ `default via 192.0.2.1 dev enp1s0`. Đó là tuyến mặc định. Không có dòng này thì máy chỉ nói chuyện được với mạng con của mình. Để biết gói tin tới một đích sẽ đi đường nào:

```bash
ip route get 198.51.100.10
```

### Bước 3: Hàng xóm gần nhất có trả lời không? (ip neighbor)

```bash
ip neighbor
```

Bảng này cho biết địa chỉ MAC của những máy cùng mạng con mà máy bạn đã liên lạc, trong đó có cổng ra. Một dòng có trạng thái `REACHABLE` hoặc `STALE` là dấu hiệu tốt; `FAILED` nghĩa là không hỏi được địa chỉ MAC của máy đó.

### Bước 4: Thử với ping

`ping` gửi gói ICMP echo và đo thời gian trả lời. Hãy đi từ gần ra xa:

```bash
ping -c 4 192.0.2.1
ping -c 4 198.51.100.10
ping -c 4 example.com
```

Tuỳ chọn `-c 4` giới hạn bốn gói để lệnh tự dừng. Cách đọc:

- Ping được cổng ra nhưng không ping được đích xa: vấn đề nằm ngoài mạng của bạn hoặc ở đường ra.
- Ping địa chỉ IP được nhưng ping tên miền thì báo không tìm thấy: vấn đề là DNS; hãy kiểm tra bằng `resolvectl status` và `resolvectl query`.
- Dòng tổng kết có `packet loss` cho biết tỉ lệ mất gói, và `rtt min/avg/max` cho biết thời gian khứ hồi.

Lưu ý quan trọng: nhiều máy chủ và tường lửa cố ý không trả lời ICMP. Ping không thấy trả lời chưa chắc là mạng hỏng; hãy thử thêm bằng cách kết nối vào cổng dịch vụ thật.

### Bước 5: Gói tin đi qua đâu? (tracepath)

```bash
tracepath -n 198.51.100.10
```

`tracepath` liệt kê từng chặng (hop) gói tin đi qua trên đường tới đích. Tuỳ chọn `-n` in địa chỉ số, không tra tên nên chạy nhanh hơn. Nó không cần quyền root. Các dòng `no reply` ở giữa đường khá phổ biến vì có thiết bị không trả lời; điều đáng chú ý là đường đi dừng hẳn ở chặng nào, và thời gian tăng vọt ở chặng nào. Dòng `pmtu` cho biết kích thước gói lớn nhất đi được qua đường đó (path MTU).

Gói `tracepath` nằm trong `iputils-tracepath`; nếu máy báo không có lệnh, cài bằng `sudo apt install iputils-tracepath`.

### Bước 6: Chương trình nào đang mở cổng? (ss)

`ss` (socket statistics) liệt kê các kết nối và cổng đang mở, thay thế cho lệnh `netstat` cũ.

```bash
ss -tuln
```

Ý nghĩa từng chữ cái: `t` là TCP, `u` là UDP, `l` là chỉ các cổng đang lắng nghe (listening), `n` là in số thay vì tên. Mỗi dòng cho biết địa chỉ và cổng cục bộ. Hãy để ý cột địa chỉ:

- `127.0.0.1:631` chỉ lắng nghe trong chính máy, bên ngoài không vào được.
- `0.0.0.0:22` hoặc `[::]:22` lắng nghe trên mọi card mạng, tức máy khác trong mạng có thể kết nối.

Muốn biết chương trình nào đang giữ cổng, thêm `p` và chạy với `sudo`:

```bash
sudo ss -tulnp
```

Một vài biến thể hữu ích khác: `ss -t state established` chỉ liệt kê các kết nối TCP đang thiết lập, và `ss -tn dst 198.51.100.10` lọc theo đích.

Khi thấy một cổng lạ đang mở, đừng vội đóng bằng cách tắt dịch vụ mà bạn chưa hiểu; hãy tra xem chương trình đó là gì trước. Mỗi dịch vụ mở ra mạng đều nên có mật khẩu mạnh, như đã nói trong bài [[Mật khẩu mạnh và trình quản lý mật khẩu: bỏ thói quen đặt một mật khẩu cho mọi nơi]].

## Kiểm tra

Một bản "khám nhanh" năm lệnh, đi từ gần ra xa:

```bash
ip -br address
ip route
ping -c 2 192.0.2.1
ping -c 2 example.com
ss -tuln
```

Nếu cả năm lệnh cho kết quả hợp lý thì mạng của máy bạn cơ bản ổn.

## Lỗi hay gặp

- **Nhầm `ping` không thấy trả lời là mạng hỏng**: tường lửa có thể chặn ICMP. Hãy thử thêm cách khác.
- **Quên `sudo` khi dùng `ss -p`**: cột chương trình sẽ trống đối với các tiến trình của người dùng khác.
- **Đọc nhầm `127.0.0.1` thành "mở ra mạng"**: địa chỉ này chỉ có hiệu lực trong chính máy.
- **Chỉ nhìn `ip address` mà quên `ip route`**: có địa chỉ nhưng không có tuyến mặc định thì vẫn không ra được Internet.
- **Dùng `ifconfig` và `netstat` theo hướng dẫn cũ**: chúng thuộc gói `net-tools`, không cài sẵn trên bản Ubuntu mới; hãy dùng `ip` và `ss`.

## Tóm lại

Hãy chẩn đoán theo thứ tự: `ip -br address` (có địa chỉ), `ip route` (có đường ra), `ping` (đích có trả lời), `tracepath` (đứt ở chặng nào) và `ss -tuln` (cổng nào đang mở). Đi từ gần ra xa giúp bạn khoanh vùng lỗi nhanh mà không cần đoán.

## Tham khảo

- Trang man của ip: https://manpages.ubuntu.com/manpages/noble/en/man8/ip.8.html
- Trang man của ss: https://manpages.ubuntu.com/manpages/noble/en/man8/ss.8.html
- Trang man của ping: https://manpages.ubuntu.com/manpages/noble/en/man8/ping.8.html
- Trang man của tracepath: https://manpages.ubuntu.com/manpages/noble/en/man8/tracepath.8.html
- Wikipedia, Ping (networking utility): https://en.wikipedia.org/wiki/Ping_(networking_utility)
