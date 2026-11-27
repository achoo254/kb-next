---
title: nginx làm reverse proxy cho ứng dụng: proxy_pass, header X-Forwarded-* và timeout
tags: nginx, reverse proxy, proxy_pass, http, ubuntu
type: lab
---

> [!TLDR]
> - Reverse proxy là máy đứng trước ứng dụng, nhận yêu cầu của người dùng rồi chuyển vào ứng dụng ở phía sau.
> - `proxy_pass` chỉ đường tới ứng dụng; các header `Host` và `X-Forwarded-*` giúp ứng dụng biết yêu cầu gốc trông như thế nào.
> - Ba timeout `proxy_connect_timeout`, `proxy_send_timeout`, `proxy_read_timeout` mặc định là 60 giây; chỉ tăng khi ứng dụng thật sự cần.

## Mục tiêu

Sau bài này bạn đặt được nginx trên Ubuntu 24.04 LTS (gói `nginx` 1.24.x) đứng trước một ứng dụng đang nghe ở `127.0.0.1:3000`, truyền đúng địa chỉ người dùng và giao thức cho ứng dụng, và chỉnh được timeout khi ứng dụng trả lời chậm.

## Reverse proxy là gì và vì sao nên dùng

Ứng dụng web viết bằng Node.js, Python hay Go thường tự mở một cổng HTTP như 3000 hoặc 8080. Bạn có thể mở thẳng cổng đó ra Internet, nhưng đặt nginx ở phía trước có nhiều lợi ích: một cổng 80 duy nhất cho nhiều ứng dụng (phân biệt bằng tên miền), ứng dụng chỉ cần nghe ở `127.0.0.1` nên không bị truy cập trực tiếp từ ngoài, và nginx lo các việc nặng nhọc như nén, cache, giới hạn tốc độ (xem bài [[nginx nén, cache tệp tĩnh và giới hạn tốc độ bằng limit_req]]).

Phần chứng chỉ TLS và HTTPS thuộc hành tinh khác nên bài này chỉ dùng HTTP thuần.

## Chuẩn bị

- Máy Ubuntu 24.04 LTS có quyền `sudo`, đã cài nginx: `sudo apt install nginx`.
- Một ứng dụng thử nghe ở `127.0.0.1:3000`. Nếu chưa có, có thể chạy tạm máy chủ tĩnh của Python: `python3 -m http.server 3000 --bind 127.0.0.1`.
- Một tên miền ví dụ: `app.example.com`.

Trên Ubuntu, nginx đọc `/etc/nginx/nginx.conf`, trong đó có dòng nạp mọi tệp ở `/etc/nginx/sites-enabled/`. Quy ước quen thuộc là viết tệp ở `sites-available` rồi tạo liên kết mềm sang `sites-enabled`.

## Các bước

### Bước 1: viết tệp cấu hình

Tạo tệp `/etc/nginx/sites-available/app.example.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Giải thích từng phần:

- `proxy_pass http://127.0.0.1:3000;` là đích mà nginx chuyển yêu cầu tới. Khi `proxy_pass` không có phần đường dẫn phía sau địa chỉ, nginx giữ nguyên đường dẫn gốc của yêu cầu. Nếu bạn viết `proxy_pass http://127.0.0.1:3000/api/;` thì phần khớp với `location` sẽ được thay bằng `/api/`, nên hãy chú ý dấu `/` ở cuối.
- `Host`: mặc định nginx gửi cho ứng dụng `Host` bằng tên máy đích của `proxy_pass` (ở đây là `127.0.0.1:3000`). Nếu ứng dụng cần biết tên miền người dùng gõ, hãy đặt `Host $host`.
- `X-Real-IP` và `X-Forwarded-For`: ứng dụng chỉ thấy kết nối đến từ nginx, tức `127.0.0.1`. Hai header này mang địa chỉ người dùng thật. `$proxy_add_x_forwarded_for` nối địa chỉ client vào cuối giá trị `X-Forwarded-For` đã có, nên giữ được cả chuỗi các proxy đi qua.
- `X-Forwarded-Proto`: cho ứng dụng biết người dùng dùng `http` hay `https`, hữu ích khi ứng dụng sinh đường dẫn tuyệt đối hoặc chuyển hướng.

Lưu ý bảo mật: ứng dụng chỉ nên tin các header này khi yêu cầu đến từ nginx mà bạn kiểm soát. Người dùng có thể tự gửi `X-Forwarded-For` giả; vì vậy cấu hình ứng dụng chỉ tin proxy ở `127.0.0.1`.

### Bước 2: bật cấu hình và nạp lại

```bash
sudo ln -s /etc/nginx/sites-available/app.example.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` kiểm tra cú pháp và chỉ in kết quả, không đổi gì trên máy chạy. Chỉ khi báo `syntax is ok` và `test is successful` mới nên `reload`. Lệnh `reload` nạp cấu hình mới mà không ngắt các kết nối đang có. Nếu bạn chưa quen với `systemctl`, đọc [[systemctl trên Ubuntu 24.04: bật, tắt, khởi động lại dịch vụ và xem trạng thái]].

### Bước 3: chỉnh timeout

Có ba timeout liên quan tới kết nối từ nginx đến ứng dụng, mỗi cái mặc định 60 giây:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_connect_timeout 5s;   # thời gian chờ thiết lập kết nối
    proxy_send_timeout    60s;  # chờ giữa hai lần ghi dữ liệu gửi đi
    proxy_read_timeout    60s;  # chờ giữa hai lần đọc dữ liệu trả về
}
```

Hai timeout sau không đo tổng thời gian của yêu cầu mà đo khoảng nghỉ giữa hai lần ghi hoặc đọc liên tiếp. Nếu ứng dụng mất quá `proxy_read_timeout` mà không trả byte nào, nginx đóng kết nối và trả lỗi 504 cho người dùng. Khi gặp 504, trước hết hãy tìm vì sao ứng dụng chậm; chỉ tăng `proxy_read_timeout` cho riêng một `location` có việc nặng thật sự (như xuất báo cáo), đừng tăng toàn bộ.

### Bước 4: WebSocket (nếu ứng dụng cần)

Với WebSocket, nginx phải dùng HTTP/1.1 và chuyển hai header `Upgrade` và `Connection`:

```nginx
location /ws/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## Kiểm tra

```bash
curl -I -H "Host: app.example.com" http://127.0.0.1/
sudo tail -n 5 /var/log/nginx/access.log
sudo tail -n 5 /var/log/nginx/error.log
```

Lệnh `curl` giả lập tên miền bằng header `Host`, nên không cần sửa DNS khi thử trên chính máy đó. Nếu ứng dụng của bạn in ra header nhận được, bạn sẽ thấy `X-Forwarded-For` mang địa chỉ client. Để kiểm tra ứng dụng có thật sự nghe ở cổng 3000, dùng `ss -ltn` như trong bài [[Kiểm tra kết nối mạng trên Ubuntu bằng ip, ss, ping và tracepath]].

## Lỗi hay gặp

- **502 Bad Gateway**: ứng dụng không chạy hoặc nghe sai cổng. Kiểm tra bằng `ss -ltn`, rồi đọc `error.log` (thường có dòng `connect() failed ... Connection refused`).
- **504 Gateway Timeout**: ứng dụng trả lời quá chậm so với `proxy_read_timeout`.
- **Ứng dụng luôn thấy địa chỉ 127.0.0.1**: quên đặt `X-Forwarded-For` hoặc ứng dụng chưa được cấu hình để đọc header đó.
- **Đường dẫn bị lệch khi dùng `/api/`**: chú ý dấu `/` cuối trong `proxy_pass` và trong `location`.
- **Sửa xong không thấy đổi**: quên `reload`, hoặc `nginx -t` báo lỗi nên cấu hình mới chưa được nạp.

## Tóm lại

Reverse proxy cho phép ứng dụng ẩn sau nginx. Ba thứ cần nhớ là `proxy_pass` để chỉ đường, bộ header `Host` và `X-Forwarded-*` để ứng dụng biết yêu cầu gốc, và các timeout để xử lý ứng dụng chậm. Khi có nhiều bản sao của ứng dụng, bước tiếp theo là [[Cân bằng tải bằng nginx: upstream, thuật toán chọn máy và kiểm tra sức khoẻ thụ động]].

## Tham khảo

- [Module ngx_http_proxy_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Beginner's Guide (nginx.org)](https://nginx.org/en/docs/beginners_guide.html)
