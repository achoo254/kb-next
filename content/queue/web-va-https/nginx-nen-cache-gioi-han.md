---
title: nginx nén, cache tệp tĩnh và giới hạn tốc độ bằng limit_req
tags: nginx, gzip, cache, limit_req, hiệu năng
type: lab
---

> [!TLDR]
> - `gzip` nén phản hồi dạng văn bản để tiết kiệm băng thông; ảnh và tệp đã nén sẵn thì không nên nén thêm.
> - Tệp tĩnh có tên kèm phiên bản có thể cho trình duyệt cache lâu bằng `expires` và `Cache-Control`.
> - `limit_req` giới hạn số yêu cầu mỗi giây theo từng địa chỉ, với `burst` để chịu được đợt tăng ngắn.

## Mục tiêu

Sau bài này bạn cấu hình nginx 1.24.x trên Ubuntu 24.04 LTS để nén phản hồi văn bản, cho trình duyệt cache tệp tĩnh, và giới hạn tốc độ yêu cầu để một client không làm quá tải ứng dụng. Bài giả định bạn đã có `server` làm reverse proxy cho ứng dụng.

## Chuẩn bị

- nginx đã chạy một `server` cho `app.example.com`.
- Thư mục tệp tĩnh, ví dụ `/var/www/app/static/`, chứa các tệp như `app.3f9c1.css` và `app.3f9c1.js`.
- Nhớ kiểm tra mọi thay đổi bằng `sudo nginx -t` trước khi `sudo systemctl reload nginx`.

## Các bước

### Bước 1: bật nén gzip

Đặt trong khối `http` (hoặc trong `server`):

```nginx
gzip on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_vary on;
gzip_proxied any;
gzip_types text/css application/javascript application/json image/svg+xml;
```

- `gzip on` bật nén. Kiểu `text/html` luôn được nén khi bật gzip, không cần liệt kê.
- `gzip_types` liệt kê thêm các kiểu MIME cần nén. Chỉ liệt kê loại dạng văn bản; ảnh JPEG, PNG, video và tệp zip đã nén sẵn, nén lại tốn CPU mà gần như không giảm dung lượng.
- `gzip_comp_level` từ 1 đến 9; mức cao hơn nén nhỏ hơn nhưng tốn CPU hơn. Mức 4 đến 6 thường là điểm cân bằng.
- `gzip_min_length` bỏ qua phản hồi quá nhỏ.
- `gzip_vary on` thêm header `Vary: Accept-Encoding` để cache trung gian phân biệt bản nén và không nén.
- `gzip_proxied any` cho phép nén cả phản hồi từ ứng dụng phía sau proxy (mặc định là `off`).

### Bước 2: cache tệp tĩnh ở trình duyệt

```nginx
location /static/ {
    alias /var/www/app/static/;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

`expires 30d` đặt header `Expires` và `Cache-Control: max-age` tương ứng 30 ngày. Cách an toàn là chỉ cache lâu những tệp có tên đổi khi nội dung đổi (kiểu `app.3f9c1.css`), vì trình duyệt sẽ không hỏi lại trong 30 ngày. Nếu tệp giữ nguyên tên mà nội dung đổi, người dùng sẽ thấy bản cũ. Với nginx, `add_header` ở cấp `location` thay thế các `add_header` thừa kế từ cấp ngoài, nên nếu có header bảo mật đặt ở `server`, hãy lặp lại chúng ở đây.

### Bước 3: cache phản hồi từ ứng dụng (tuỳ chọn)

Có thể để nginx lưu phản hồi của ứng dụng trong một thời gian ngắn:

```nginx
# trong khối http
proxy_cache_path /var/cache/nginx/app levels=1:2 keys_zone=appcache:10m max_size=1g inactive=60m;

# trong location /
proxy_cache appcache;
proxy_cache_valid 200 10m;
add_header X-Cache-Status $upstream_cache_status;
```

Chỉ cache những trang giống nhau với mọi người dùng. Đừng cache trang cá nhân hoá hay trang cần đăng nhập, vì người này có thể thấy dữ liệu của người khác. Header `X-Cache-Status` cho biết kết quả là `MISS`, `HIT`, `EXPIRED` và nhiều giá trị khác, giúp bạn kiểm tra.

### Bước 4: giới hạn tốc độ bằng limit_req

Khai báo vùng nhớ ở khối `http`, rồi áp dụng ở `location`:

```nginx
limit_req_zone $binary_remote_addr zone=perip:10m rate=10r/s;
limit_req_status 429;

location /api/ {
    limit_req zone=perip burst=20 nodelay;
    proxy_pass http://app_backend;
}
```

- `$binary_remote_addr` là khoá: mỗi địa chỉ client có bộ đếm riêng. Dạng nhị phân gọn hơn dạng chuỗi nên vùng nhớ chứa được nhiều địa chỉ hơn.
- `zone=perip:10m` đặt tên và dung lượng vùng nhớ.
- `rate=10r/s` cho phép trung bình 10 yêu cầu mỗi giây cho mỗi địa chỉ.
- `burst=20` cho phép đợt tăng đột biến tối đa 20 yêu cầu vượt mức; với `nodelay`, các yêu cầu trong burst được xử lý ngay, nếu không có `nodelay` chúng bị xếp hàng và làm chậm lại theo tốc độ cho phép. Mặc định burst bằng 0.
- Yêu cầu vượt hạn mức bị từ chối. `limit_req_status 429` đổi mã trả về thành 429 Too Many Requests; mặc định là 503.

Lưu ý: nếu nginx đứng sau một proxy hay CDN khác, `$binary_remote_addr` sẽ là địa chỉ của proxy đó, và mọi người dùng bị tính chung một bộ đếm. Khi đó phải cấu hình để nginx lấy đúng địa chỉ client thật (module realip) trước khi dùng giới hạn theo địa chỉ.

## Kiểm tra

```bash
curl -s -H "Accept-Encoding: gzip" -I -H "Host: app.example.com" http://127.0.0.1/static/app.3f9c1.css
for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code}\n" -H "Host: app.example.com" http://127.0.0.1/api/; done | sort | uniq -c
```

Lệnh thứ nhất phải cho thấy `Content-Encoding: gzip` và `Cache-Control` đã đặt. Lệnh thứ hai gửi 40 yêu cầu liên tiếp: bạn sẽ thấy một phần mã 200 và phần còn lại là 429 khi vượt `rate` cộng `burst`. Xem `error.log` để thấy các dòng nginx ghi nhận việc từ chối.

## Lỗi hay gặp

- **Không thấy nén**: kiểu MIME chưa có trong `gzip_types`, phản hồi nhỏ hơn `gzip_min_length`, hoặc client không gửi `Accept-Encoding: gzip`.
- **Người dùng thấy bản tệp cũ**: cache lâu nhưng tên tệp không đổi theo nội dung.
- **Mọi người dùng bị chặn cùng lúc**: nginx đứng sau proxy khác nên mọi yêu cầu có cùng địa chỉ nguồn.
- **Cache lộ dữ liệu cá nhân**: cache cả trang phụ thuộc người dùng. Chỉ cache nội dung dùng chung.
- **Header bảo mật biến mất ở `location`**: do `add_header` ở cấp trong thay thế hoàn toàn các header khai báo ở cấp ngoài.

## Tóm lại

Nén giảm lượng dữ liệu phải truyền, cache giảm số lần phải xử lý, còn `limit_req` bảo vệ ứng dụng trước client quá hung hăng. Cả ba đều là vài dòng cấu hình, nhưng cần đo và kiểm tra bằng `curl` để chắc chúng đúng như mong muốn trước khi đưa vào dùng thật.

## Tham khảo

- [Module ngx_http_gzip_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)
- [Module ngx_http_headers_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_headers_module.html)
- [Module ngx_http_limit_req_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)
- [Module ngx_http_proxy_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
