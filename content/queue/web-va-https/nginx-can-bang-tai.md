---
title: Cân bằng tải bằng nginx: upstream, thuật toán chọn máy và kiểm tra sức khoẻ thụ động
tags: nginx, cân bằng tải, upstream, high availability, ubuntu
type: lab
---

> [!TLDR]
> - Khối `upstream` gom nhiều máy chạy cùng một ứng dụng; nginx chia yêu cầu cho chúng, mặc định theo vòng tròn (round robin).
> - Bản nginx mã nguồn mở kiểm tra sức khoẻ kiểu thụ động: máy lỗi nhiều lần liên tiếp bị tạm loại, đo bằng `max_fails` và `fail_timeout`.
> - Có thể đổi thuật toán (`least_conn`, `ip_hash`), gán `weight`, đặt máy `backup`.

## Mục tiêu

Bài này giúp bạn chạy hai bản của một ứng dụng ở `127.0.0.1:3001` và `127.0.0.1:3002`, đặt nginx 1.24.x trên Ubuntu 24.04 LTS chia tải giữa chúng, và hiểu nginx xử lý thế nào khi một bản ngừng trả lời. Bài nối tiếp phần reverse proxy cơ bản, nên bạn nên đã biết `proxy_pass`.

## Chuẩn bị

- nginx đã chạy và một `server` làm reverse proxy như trong bài trước của hành tinh này.
- Hai tiến trình ứng dụng thử nghe ở hai cổng 3001 và 3002. Có thể dùng `python3 -m http.server 3001 --bind 127.0.0.1` và `python3 -m http.server 3002 --bind 127.0.0.1` trong hai cửa sổ khác nhau, mỗi cái ở một thư mục có tệp `index.html` khác nội dung để dễ phân biệt.

## Các bước

### Bước 1: khai báo upstream

Khối `upstream` đặt trong ngữ cảnh `http` (tệp trong `sites-enabled` đã nằm trong `http`, nên đặt cùng tệp, phía trên `server`):

```nginx
upstream app_backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://app_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Điểm khác với reverse proxy một máy chỉ là `proxy_pass` trỏ tới tên nhóm thay vì địa chỉ. Kiểm tra cú pháp rồi nạp lại: `sudo nginx -t && sudo systemctl reload nginx`.

Mặc định nginx chia yêu cầu theo vòng tròn: yêu cầu thứ nhất tới máy đầu, thứ hai tới máy thứ hai, rồi quay lại.

### Bước 2: chọn thuật toán và trọng số

- `weight=n`: máy có trọng số cao nhận nhiều yêu cầu hơn theo tỉ lệ. Hữu ích khi một máy mạnh hơn.
- `least_conn;`: chọn máy đang có ít kết nối đang hoạt động nhất, phù hợp khi thời gian xử lý mỗi yêu cầu chênh lệch lớn.
- `ip_hash;`: cùng một địa chỉ client luôn được gửi tới cùng một máy, dùng khi ứng dụng giữ phiên trên bộ nhớ của từng máy. Giải pháp tốt hơn là đưa phiên ra ngoài (ví dụ vào cơ sở dữ liệu) để mọi máy đều như nhau.
- `backup`: máy dự phòng, chỉ nhận yêu cầu khi các máy còn lại không dùng được.
- `down`: đánh dấu tạm thời không dùng máy, tiện khi bảo trì.

```nginx
upstream app_backend {
    least_conn;
    server 127.0.0.1:3001 weight=2;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003 backup;
}
```

### Bước 3: kiểm tra sức khoẻ thụ động

nginx mã nguồn mở không chủ động gọi thử các máy theo lịch; nó quan sát chính các yêu cầu thật. Hai tham số quyết định:

- `max_fails`: số lần thử không thành công liên tiếp trong khoảng `fail_timeout` thì coi máy là không dùng được. Mặc định là 1.
- `fail_timeout`: vừa là khoảng thời gian đếm lỗi, vừa là thời gian máy bị loại. Mặc định là 10 giây.

```nginx
upstream app_backend {
    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
}
```

Với cấu hình trên, nếu một máy lỗi 3 lần trong 30 giây, nginx ngừng gửi yêu cầu tới nó trong 30 giây, sau đó thử lại.

Thế nào là "không thành công" do `proxy_next_upstream` quy định. Mặc định, lỗi kết nối, lỗi gửi hoặc đọc, và timeout được tính, nên một yêu cầu bị lỗi như vậy sẽ được thử lại ngay trên máy kế tiếp, người dùng thường không nhận ra. Ngược lại, mã trạng thái 5xx mà ứng dụng trả về không tự được tính, trừ khi bạn thêm vào, ví dụ `proxy_next_upstream error timeout http_502 http_503;`. Cẩn thận với các yêu cầu không idempotent như POST: mặc định nginx không thử lại yêu cầu loại này sau khi đã gửi tới máy trước.

Kiểm tra sức khoẻ chủ động (gọi thử theo lịch) có ở bản thương mại NGINX Plus, hoặc có thể dùng bộ cân bằng tải khác; bài này chỉ nói phần có sẵn ở bản mã nguồn mở.

## Kiểm tra

```bash
for i in 1 2 3 4; do curl -s -H "Host: app.example.com" http://127.0.0.1/ | head -n 1; done
```

Với hai thư mục nội dung khác nhau, bạn sẽ thấy kết quả xen kẽ. Để thử lỗi, tắt một ứng dụng (Ctrl+C ở cửa sổ cổng 3001) rồi chạy lại vòng lặp: mọi yêu cầu đều trả về từ máy còn lại, thỉnh thoảng nginx thử lại máy hỏng sau mỗi `fail_timeout`. Xem `error.log` để thấy các dòng `connect() failed` và `upstream server temporarily disabled`. Kiểm tra cổng đang nghe bằng `ss -ltn`, như hướng dẫn ở bài [[Kiểm tra kết nối mạng trên Ubuntu bằng ip, ss, ping và tracepath]].

## Lỗi hay gặp

- **Người dùng bị đăng xuất lung tung**: ứng dụng giữ phiên trong bộ nhớ từng máy mà không dùng `ip_hash` hay phiên dùng chung.
- **Tất cả máy cùng lỗi, nginx trả 502**: nginx không còn máy nào để thử. Xem `error.log`.
- **Một máy nhận quá nhiều tải**: kiểm tra `weight` và thuật toán đang dùng.
- **Quên `reload`**: cấu hình mới chỉ có hiệu lực sau khi nạp lại.
- **Dùng `down` rồi quên bỏ**: máy bảo trì xong nhưng vẫn không nhận tải.

## Tóm lại

`upstream` biến nhiều bản ứng dụng thành một địa chỉ duy nhất cho nginx. Round robin là mặc định, `least_conn` và `ip_hash` cho các tình huống cụ thể, còn `max_fails` và `fail_timeout` giúp loại tạm máy lỗi mà không cần công cụ ngoài. Khi lưu lượng đã được chia đều, bước tiếp theo là giảm tải cho từng máy bằng nén và cache, và chặn lạm dụng bằng giới hạn tốc độ: [[nginx nén, cache tệp tĩnh và giới hạn tốc độ bằng limit_req]].

## Tham khảo

- [Module ngx_http_upstream_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [Using nginx as HTTP load balancer (nginx.org)](https://nginx.org/en/docs/http/load_balancing.html)
- [Module ngx_http_proxy_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
