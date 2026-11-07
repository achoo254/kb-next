---
title: Netplan trên Ubuntu 24.04: đặt IP tĩnh và dùng DHCP bằng một tệp YAML
tags: ubuntu, netplan, ip tĩnh, dhcp, mạng
type: lab
---

## Mục tiêu

Sau bài này bạn sẽ biết netplan là gì, đọc được tệp cấu hình mạng trên Ubuntu 24.04 LTS, và làm được hai việc thường gặp nhất: cho máy tự nhận địa chỉ qua DHCP, hoặc đặt cho máy một địa chỉ IP cố định (IP tĩnh). Bài cũng chỉ cách thử cấu hình mới một cách an toàn để không tự "cắt cổ" mình khi đang làm việc từ xa.

## Netplan là gì?

Netplan là công cụ cấu hình mạng mặc định của Ubuntu. Bạn mô tả mạng mong muốn trong các tệp YAML đặt ở thư mục `/etc/netplan/`. Netplan không tự quản lý mạng; nó đọc các tệp đó rồi sinh ra cấu hình cho một "bộ máy" (renderer) làm việc thật sự bên dưới:

- **networkd** (`systemd-networkd`): thường dùng trên máy chủ, không có giao diện đồ hoạ.
- **NetworkManager**: thường dùng trên máy để bàn có giao diện đồ hoạ.

Nhờ vậy cùng một cách viết YAML dùng được trên nhiều kiểu máy. Trong bài này ta dùng `renderer: networkd`.

## Chuẩn bị

- Một máy chạy Ubuntu 24.04 LTS (máy thật, máy ảo hay container đều được) và tài khoản có quyền `sudo`.
- Biết tên card mạng. Chạy lệnh sau để xem:

```bash
ip -br link
```

Tên thường có dạng `enp1s0`, `ens3` hoặc `eth0`. Trong bài ta dùng `enp1s0` làm ví dụ; hãy thay bằng tên thật trên máy bạn.

- Các địa chỉ trong bài đều là địa chỉ dành riêng cho tài liệu (khối `192.0.2.0/24`, tên miền `example.com`). Khi làm thật, bạn thay bằng địa chỉ mạng của bạn.

## Các bước

### Bước 1: Xem tệp cấu hình hiện có

```bash
ls -l /etc/netplan/
sudo cat /etc/netplan/*.yaml
```

Trên nhiều máy chủ cài mới bạn sẽ thấy một tệp như `50-cloud-init.yaml` hoặc `00-installer-config.yaml`. Hãy sao lưu trước khi sửa:

```bash
sudo cp /etc/netplan/50-cloud-init.yaml /etc/netplan/50-cloud-init.yaml.bak
```

Lưu ý: netplan đọc mọi tệp có đuôi `.yaml` trong thư mục. Tệp sao lưu có đuôi `.bak` thì bị bỏ qua, đúng như ta muốn.

### Bước 2: Cấu hình DHCP

Đây là dạng đơn giản nhất, router hoặc máy chủ DHCP sẽ cấp địa chỉ cho máy:

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp1s0:
      dhcp4: true
```

Chú ý: YAML rất nhạy với thụt lề. Hãy dùng dấu cách, không dùng phím Tab, và giữ mỗi cấp thụt hai dấu cách cho đồng nhất.

### Bước 3: Cấu hình IP tĩnh

Để đặt địa chỉ cố định, tắt DHCP và khai báo địa chỉ, tuyến mặc định, máy chủ DNS:

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp1s0:
      dhcp4: false
      addresses:
        - 192.0.2.10/24
      routes:
        - to: default
          via: 192.0.2.1
      nameservers:
        addresses:
          - 192.0.2.53
        search:
          - example.com
```

Giải nghĩa từng khoá:

- `addresses`: danh sách địa chỉ kèm độ dài tiền tố. `/24` nghĩa là mạng con có mặt nạ 255.255.255.0.
- `routes` với `to: default`: tuyến mặc định, tức "cổng ra" (gateway) mà gói tin đi qua khi đích nằm ngoài mạng con. Cách viết cũ `gateway4:` đã bị đánh dấu lỗi thời (deprecated), bạn nên dùng `routes`.
- `nameservers`: máy chủ DNS và danh sách tên miền tìm kiếm (`search`).

Muốn dùng IPv6 tĩnh, bạn thêm một địa chỉ IPv6 vào `addresses` (ví dụ `2001:db8::10/64`) và một tuyến mặc định IPv6 tương ứng, cùng cách viết như trên.

### Bước 4: Đặt quyền tệp

Từ Ubuntu 22.04 trở đi, netplan cảnh báo nếu tệp cấu hình cho phép người khác đọc, vì tệp có thể chứa mật khẩu Wi-Fi. Hãy đặt quyền chặt:

```bash
sudo chmod 600 /etc/netplan/50-cloud-init.yaml
```

### Bước 5: Thử rồi mới áp dụng

Dùng `netplan try` thay vì áp dụng thẳng:

```bash
sudo netplan try
```

Lệnh này áp dụng cấu hình mới và đếm ngược (mặc định 120 giây). Nếu bạn không bấm Enter để xác nhận trong thời gian đó, nó tự động quay về cấu hình cũ. Đó là lưới an toàn rất đáng giá khi bạn đang SSH vào máy: nếu sai địa chỉ và mất kết nối, cấu hình tự hoàn lại.

Khi mọi thứ ổn, bạn có thể áp dụng chính thức bằng:

```bash
sudo netplan apply
```

Ngoài ra, `sudo netplan generate` chỉ kiểm tra cú pháp và sinh tệp cấu hình mà không đổi mạng đang chạy.

## Kiểm tra

```bash
ip -br address show enp1s0
ip route
```

Bạn cần thấy địa chỉ `192.0.2.10/24` gắn vào card mạng và một dòng `default via 192.0.2.1`. Nếu dùng DHCP, địa chỉ hiện ra là địa chỉ router cấp. Cách đọc kết quả của các lệnh `ip` được nói kỹ hơn ở bài [[Kiểm tra kết nối mạng trên Ubuntu bằng ip, ss, ping và tracepath]]; còn việc kiểm tra DNS nằm trong bài [[resolvectl và DNS trên Ubuntu: máy bạn tra tên miền như thế nào]].

## Lỗi hay gặp

- **Sai thụt lề hoặc dùng Tab**: netplan báo lỗi cú pháp YAML. Chạy `sudo netplan generate` để biết dòng nào sai.
- **Quên tắt DHCP khi đặt IP tĩnh**: máy có thể nhận thêm một địa chỉ nữa, gây rối. Hãy đặt `dhcp4: false`.
- **Sai tên card mạng**: cấu hình không áp dụng được vì không có card nào tên như vậy. Kiểm tra lại bằng `ip -br link`.
- **Cloud-init ghi đè cấu hình**: trên máy tạo từ ảnh đám mây, cloud-init có thể sinh lại `50-cloud-init.yaml` khi khởi động. Muốn tự quản lý mạng, tạo tệp `/etc/cloud/cloud.cfg.d/99-disable-network-config.cfg` với nội dung `network: {config: disabled}`.
- **Sai cổng ra hoặc sai mạng con**: máy ping được máy cùng mạng nhưng không ra ngoài. Kiểm tra `via` có nằm trong cùng mạng con với địa chỉ của máy hay không.
- **Cảnh báo**: đừng áp dụng cấu hình bằng `netplan apply` khi đang SSH vào máy từ xa mà chưa thử bằng `netplan try`, vì một lỗi nhỏ có thể làm bạn mất kết nối và phải ra tận máy để sửa.

## Tóm lại

Netplan cho phép bạn mô tả mạng bằng YAML trong `/etc/netplan/`: `dhcp4: true` để nhận địa chỉ tự động, hoặc `addresses`, `routes`, `nameservers` để đặt IP tĩnh. Hãy sao lưu tệp, đặt quyền `600`, thử bằng `netplan try`, rồi mới áp dụng chính thức.

## Tham khảo

- Trang man netplan(5): https://manpages.ubuntu.com/manpages/noble/en/man5/netplan.5.html
- Trang man netplan-try(8): https://manpages.ubuntu.com/manpages/noble/en/man8/netplan-try.8.html
- Ubuntu Server, cấu hình mạng: https://documentation.ubuntu.com/server/explanation/networking/configuring-networks/
