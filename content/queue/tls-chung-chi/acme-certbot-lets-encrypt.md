---
title: Cấp và gia hạn chứng chỉ Let's Encrypt tự động bằng certbot và ACME trên Ubuntu 24.04
tags: acme, certbot, let's encrypt, tls, ubuntu
type: lab
---

> [!TLDR]
> - ACME là giao thức để máy tự chứng minh quyền kiểm soát tên miền và nhận chứng chỉ; Let's Encrypt là CA miễn phí dùng giao thức này, certbot là máy khách phổ biến.
> - Cấp bằng một lệnh `certbot`, kiểm thử bằng `--dry-run`, và để bộ hẹn giờ gia hạn tự chạy.
> - Sau mỗi lần gia hạn, nginx phải được nạp lại để dùng chứng chỉ mới.

## Mục tiêu

Sau bài này bạn sẽ cấp được một chứng chỉ TLS miễn phí từ Let's Encrypt cho một tên miền, hiểu cách gia hạn tự động hoạt động, và biết cách kiểm tra việc gia hạn có chạy được hay không. Kiến thức nền là cái bắt tay TLS và chuỗi chứng chỉ (bài đầu của chuỗi này). Sau khi có chứng chỉ, bạn có thể đặt nginx làm điểm kết thúc TLS phía trước ứng dụng, như bài [[nginx làm reverse proxy cho ứng dụng: proxy_pass, header X-Forwarded-* và timeout]] mô tả. Nếu gặp lỗi, hãy xem tiếp bài [[Lỗi chứng chỉ hay gặp và cách kiểm bằng openssl: hết hạn, thiếu chuỗi trung gian, sai tên miền]].

## ACME và Let's Encrypt là gì

ACME (Automatic Certificate Management Environment) là giao thức được chuẩn hoá trong RFC 8555. Ý tưởng: máy của bạn tự liên hệ với CA, CA đưa ra một "thử thách", và nếu máy chứng minh được nó kiểm soát tên miền thì CA ký chứng chỉ. Toàn bộ quá trình không cần người bấm nút.

Let's Encrypt là CA phi lợi nhuận cấp chứng chỉ miễn phí qua ACME. Chứng chỉ của họ có thời hạn ngắn (hiện là 90 ngày) để buộc việc gia hạn phải tự động hoá; họ cũng đã công bố kế hoạch rút ngắn thời hạn hơn nữa, nên hãy xem trang chính thức để biết con số hiện hành. Hai kiểu thử thách thường gặp:

- **HTTP-01:** CA gọi vào cổng 80 của tên miền để đọc một tệp mà certbot đặt sẵn. Dễ dùng nhất, nhưng không cấp được chứng chỉ ký tự đại diện (wildcard).
- **DNS-01:** bạn chứng minh bằng một bản ghi TXT trong DNS. Cần cho chứng chỉ wildcard và dùng được khi máy chủ không mở cổng 80, nhưng cần cách tự động sửa DNS.

Bài này dùng HTTP-01.

## Chuẩn bị

- Ubuntu 24.04 LTS, quyền `sudo`.
- Một tên miền thật (trong bài dùng `example.com` và `www.example.com` làm ví dụ, hãy thay bằng tên của bạn) có bản ghi A/AAAA trỏ về máy này.
- nginx đã cài và đang phục vụ tên miền đó ở cổng 80; tường lửa mở cổng 80 và 443.

Trang hướng dẫn của certbot khuyên cài bằng snap trên Ubuntu:

```bash
sudo snap install --classic certbot
sudo ln -s /snap/certbot/current/bin/certbot /usr/bin/certbot
certbot --version
```

Nếu bạn quen dùng apt, Ubuntu cũng có gói `certbot` trong kho của nó, nhưng phiên bản có thể cũ hơn; hãy đọc trang hướng dẫn chính thức để chọn cách phù hợp.

## Các bước

### 1. Thử với môi trường staging trước

Let's Encrypt có giới hạn số lần cấp, nên đừng thử đi thử lại trên môi trường thật. Hãy dùng `--dry-run` để chạy toàn bộ quy trình mà không lưu chứng chỉ thật, hoặc `--test-cert` để lấy chứng chỉ thử (trình duyệt sẽ không tin chứng chỉ này):

```bash
sudo certbot certonly --nginx -d example.com -d www.example.com --dry-run
```

### 2. Cấp chứng chỉ thật

Cách đơn giản nhất là để certbot sửa luôn cấu hình nginx:

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

Certbot hỏi email nhận thông báo (chỉ để nhận cảnh báo hết hạn), chấp nhận điều khoản, rồi cấu hình HTTPS. Nếu bạn muốn tự sửa tệp cấu hình, dùng chế độ chỉ lấy chứng chỉ:

```bash
sudo certbot certonly --webroot -w /var/www/html -d example.com -d www.example.com
```

Khi thành công, các tệp nằm trong `/etc/letsencrypt/live/example.com/`:

| Tệp | Nội dung |
| --- | --- |
| `fullchain.pem` | chứng chỉ máy chủ kèm chứng chỉ trung gian (dùng cho nginx) |
| `privkey.pem` | khoá riêng (giữ bí mật, không chia sẻ) |
| `cert.pem` | chỉ chứng chỉ máy chủ |
| `chain.pem` | chỉ chứng chỉ trung gian |

Trong nginx, hai dòng cần có là `ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;` và `ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;`. Hãy dùng `fullchain.pem`, không dùng `cert.pem`, nếu không máy chủ sẽ thiếu chứng chỉ trung gian.

### 3. Hiểu gia hạn tự động

Bản cài bằng snap kèm sẵn bộ hẹn giờ systemd. Xem bằng:

```bash
systemctl list-timers | grep certbot
```

Certbot chỉ thực sự gia hạn những chứng chỉ còn dưới 30 ngày hiệu lực, nên chạy thường xuyên cũng không gây hại. Muốn biết tình trạng các chứng chỉ:

```bash
sudo certbot certificates
```

### 4. Nạp lại nginx sau khi gia hạn

Chứng chỉ mới nằm trên đĩa nhưng nginx vẫn giữ bản cũ trong bộ nhớ cho tới khi được nạp lại. Chế độ `--nginx` thường lo việc này, nhưng với chế độ `certonly` bạn nên thêm một deploy hook:

```bash
sudo certbot renew --deploy-hook "systemctl reload nginx"
```

Hoặc đặt một tập lệnh có quyền thực thi trong `/etc/letsencrypt/renewal-hooks/deploy/`; certbot chạy các tập lệnh ở đó sau mỗi lần gia hạn thành công.

## Kiểm tra

1. Chạy thử toàn bộ quy trình gia hạn mà không đổi gì thật:

   ```bash
   sudo certbot renew --dry-run
   ```

   Kết quả mong đợi là thông báo cho biết mọi chứng chỉ gia hạn thử thành công.
2. Xem chứng chỉ mà máy chủ đang phát:

   ```bash
   echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -dates -issuer
   ```

   Ngày `notAfter` phải còn xa và `issuer` là một CA trung gian của Let's Encrypt.

## Lỗi hay gặp

- **Không xác thực được tên miền:** bản ghi DNS chưa trỏ đúng về máy, hoặc cổng 80 bị tường lửa chặn. Kiểm tra cả IPv4 lẫn IPv6 nếu tên miền có bản ghi AAAA.
- **Chạm giới hạn tần suất:** bạn đã thử quá nhiều lần trên môi trường thật. Dùng `--dry-run` hay `--test-cert` khi thử nghiệm và đọc trang giới hạn của Let's Encrypt.
- **Gia hạn xong nhưng trình duyệt vẫn thấy chứng chỉ cũ:** nginx chưa được nạp lại; thêm deploy hook như ở trên.
- **Gia hạn hỏng âm thầm sau khi đổi cấu hình nginx hay chặn cổng 80:** chạy `sudo certbot renew --dry-run` định kỳ, đặc biệt sau mỗi lần sửa cấu hình web.

Lưu ý an toàn: không bao giờ đưa `privkey.pem` lên kho mã, ảnh chụp màn hình hay kênh chat. Nếu nghi ngờ khoá đã lộ, hãy cấp lại chứng chỉ với khoá mới và không dùng `--reuse-key`.

## Tóm lại

ACME biến việc xin chứng chỉ thành chuyện máy tự làm, Let's Encrypt cho chứng chỉ miễn phí, và certbot nối hai thứ đó với nginx. Thói quen đáng giữ là cấp bằng `certbot`, kiểm bằng `--dry-run`, đảm bảo bộ hẹn giờ gia hạn đang chạy và nginx được nạp lại sau mỗi lần đổi chứng chỉ. Bài viết dựa trên tài liệu chính thức tới tháng 11/2026; hãy đối chiếu với trang của certbot và Let's Encrypt vì các chi tiết như thời hạn chứng chỉ có thể thay đổi.

## Tham khảo

- [RFC 8555: Automatic Certificate Management Environment (ACME)](https://datatracker.ietf.org/doc/html/rfc8555)
- [Let's Encrypt: tài liệu](https://letsencrypt.org/docs/)
- [Let's Encrypt: các loại thử thách (challenge types)](https://letsencrypt.org/docs/challenge-types/)
- [Let's Encrypt: giới hạn tần suất (rate limits)](https://letsencrypt.org/docs/rate-limits/)
- [Certbot: hướng dẫn cài đặt](https://certbot.eff.org/instructions)
- [Certbot: hướng dẫn sử dụng](https://eff-certbot.readthedocs.io/en/stable/using.html)
