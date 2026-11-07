---
title: resolvectl và DNS trên Ubuntu: máy bạn tra tên miền như thế nào
tags: ubuntu, dns, resolvectl, systemd-resolved, mạng
type: lab
---

## Mở đầu

Gõ `example.com` vào trình duyệt, máy tính phải đổi tên đó thành một địa chỉ IP trước khi kết nối được. Việc đổi tên thành địa chỉ gọi là phân giải tên (name resolution) và do hệ thống DNS đảm nhiệm. Khi "mạng vẫn có mà vào web thì không", rất thường là DNS có chuyện. Bài này giải thích máy Ubuntu 24.04 LTS tra DNS ra sao, và dùng `resolvectl` để xem, thử, chẩn đoán.

Nếu máy bạn chưa có địa chỉ và máy chủ DNS đúng, hãy xem lại cách khai báo địa chỉ và DNS trong netplan trước khi chẩn đoán tiếp.

## systemd-resolved đứng ở giữa

Trên Ubuntu, dịch vụ `systemd-resolved` làm bộ phân giải tên cho cả máy. Các chương trình không tự hỏi máy chủ DNS ở xa; chúng hỏi một "người trung gian" chạy ngay trên máy tại địa chỉ `127.0.0.53`. Người trung gian này:

- giữ bộ nhớ đệm (cache), nên tên đã tra gần đây trả lời nhanh hơn;
- biết máy chủ DNS nào thuộc card mạng nào (ví dụ DNS của mạng gia đình và DNS của VPN);
- chuyển câu hỏi đến máy chủ DNS thật, lấy từ DHCP hoặc từ cấu hình netplan.

Vì thế khi mở `/etc/resolv.conf` bạn thường chỉ thấy dòng `nameserver 127.0.0.53`. Đó không phải lỗi: tệp này là một liên kết tới `/run/systemd/resolve/stub-resolv.conf`, và danh sách máy chủ DNS thật nằm ở nơi khác. Muốn xem chúng, dùng `resolvectl`.

## Xem trạng thái bằng resolvectl status

```bash
resolvectl status
```

Kết quả chia thành phần chung (Global) và từng card mạng (Link). Với mỗi card bạn sẽ thấy các thông tin như:

- `Current DNS Server`: máy chủ DNS đang được dùng.
- `DNS Servers`: danh sách máy chủ có thể dùng.
- `DNS Domain`: tên miền tìm kiếm.

Muốn chỉ xem một card, thêm tên card: `resolvectl status enp1s0`. Đây là bước đầu tiên khi nghi ngờ DNS: máy chủ DNS có đúng như bạn tưởng không?

## Tra thử một tên miền

```bash
resolvectl query example.com
```

Lệnh in ra các địa chỉ tìm được, cho biết dùng giao thức nào và card mạng nào trả lời. Nếu một địa chỉ được lấy từ bộ nhớ đệm, kết quả cũng ghi nguồn dữ liệu là bộ nhớ đệm. Chạy hai lần liên tiếp bạn sẽ thấy sự khác biệt giữa lần hỏi mới và lần lấy từ cache.

Bạn có thể hỏi loại bản ghi cụ thể, ví dụ bản ghi thư (MX) hoặc IPv6 (AAAA):

```bash
resolvectl query --type=MX example.com
resolvectl query --type=AAAA example.com
```

Bạn không cần nhớ hết tuỳ chọn; xem `resolvectl --help` hoặc `man resolvectl` khi cần.

### So sánh với dig

Nếu muốn hỏi thẳng một máy chủ DNS cụ thể để so sánh, cài gói `bind9-dnsutils` rồi dùng `dig`:

```bash
sudo apt install bind9-dnsutils
dig @192.0.2.53 example.com
```

Dấu `@` chỉ định máy chủ để hỏi. Nếu `dig` trả lời đúng mà `resolvectl query` sai, vấn đề nhiều khả năng nằm ở cấu hình trên máy bạn, không phải ở máy chủ DNS.

## Đổi DNS tạm thời để thử

Bạn có thể gán máy chủ DNS cho một card mạng mà không sửa tệp cấu hình:

```bash
sudo resolvectl dns enp1s0 192.0.2.53
sudo resolvectl domain enp1s0 example.com
```

Thay đổi này chỉ tồn tại tới khi mạng được cấu hình lại hoặc máy khởi động lại. Muốn bỏ ngay, chạy:

```bash
sudo resolvectl revert enp1s0
```

Muốn đổi vĩnh viễn, hãy sửa mục `nameservers` trong tệp netplan trong netplan rồi áp dụng.

## Xoá bộ nhớ đệm

Khi bạn vừa sửa một bản ghi DNS mà máy vẫn trả địa chỉ cũ, hãy xoá cache:

```bash
sudo resolvectl flush-caches
```

Lệnh `resolvectl statistics` cho biết số lần trúng cache, số truy vấn đã gửi và tình trạng chung của dịch vụ.

## Cấu hình chung của dịch vụ

Tệp `/etc/systemd/resolved.conf` chứa các thiết lập toàn cục, ví dụ danh sách máy chủ DNS dự phòng (`FallbackDNS`) hay `DNSSEC`. Các dòng trong tệp mặc định thường đang bị chú thích bằng dấu `#`. Sau khi sửa, khởi động lại dịch vụ:

```bash
sudo systemctl restart systemd-resolved
```

Cảnh báo: sai cấu hình DNS có thể khiến cả máy không tra được tên nào. Hãy sao lưu tệp trước khi sửa và giữ một phiên đăng nhập dự phòng.

## Chẩn đoán nhanh theo thứ tự

1. `resolvectl status`: đúng máy chủ DNS chưa?
2. `resolvectl query example.com`: tra được không?
3. Nếu không, thử gọi thẳng địa chỉ IP bằng `ping`. Ping IP được mà ping tên không được thì lỗi nằm ở DNS, không phải ở đường truyền.
4. `dig @<máy chủ> example.com`: máy chủ DNS có trả lời không?
5. `sudo resolvectl flush-caches` rồi thử lại.

Các bước kiểm tra đường truyền ở mục 3 được giải thích trong bài [[Kiểm tra kết nối mạng trên Ubuntu bằng ip, ss, ping và tracepath]].

## Tóm lại

Trên Ubuntu 24.04, `systemd-resolved` là bộ phân giải tên của cả máy, lắng nghe ở `127.0.0.53`. Dùng `resolvectl status` để xem máy chủ DNS thật, `resolvectl query` để thử tra tên, `resolvectl flush-caches` để xoá cache, và sửa DNS lâu dài trong cấu hình netplan.

## Tham khảo

- Ubuntu Server, DNS: https://documentation.ubuntu.com/server/how-to/networking/install-dns/
- Trang man của resolvectl: https://manpages.ubuntu.com/manpages/noble/en/man1/resolvectl.1.html
- Trang man của systemd-resolved: https://manpages.ubuntu.com/manpages/noble/en/man8/systemd-resolved.service.8.html
- Wikipedia, Domain Name System: https://en.wikipedia.org/wiki/Domain_Name_System
