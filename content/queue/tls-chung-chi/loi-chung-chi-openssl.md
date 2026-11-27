---
title: Lỗi chứng chỉ hay gặp và cách kiểm bằng openssl: hết hạn, thiếu chuỗi trung gian, sai tên miền
tags: openssl, tls, chứng chỉ, xử lý sự cố, ubuntu
type: lab
---

> [!TLDR]
> - Ba lỗi chứng chỉ hay gặp nhất là hết hạn, thiếu chứng chỉ trung gian và tên miền không khớp.
> - `openssl s_client` cho thấy mã lỗi xác minh; `openssl x509` cho thấy ngày hết hạn và danh sách tên (SAN) của chứng chỉ.
> - Kiểm từ máy khách bằng đúng tên miền, có SNI, rồi mới sửa ở máy chủ.

## Mục tiêu

Bài này giúp bạn nhận ra ba lỗi chứng chỉ phổ biến, đọc được thông báo của `openssl` và biết sửa ở đâu. Bạn nên nắm trước khái niệm chuỗi chứng chỉ và cách cấp, gia hạn chứng chỉ (hai bài trước trong chuỗi).

## Chuẩn bị

- Ubuntu 24.04 LTS với OpenSSL 3.0.13 (kiểm bằng `openssl version`). Các tuỳ chọn dưới đây được thử trên bản này; xem `openssl s_client -help` nếu máy bạn khác.
- Một tên miền để kiểm. Trong bài dùng `example.com` làm ví dụ; hãy thay bằng tên miền của bạn.
- Các lệnh chỉ đọc, không thay đổi gì trên máy chủ.

## Công cụ cốt lõi

Hai lệnh bạn sẽ dùng liên tục:

```bash
# Kết nối và xem kết quả xác minh. -servername gửi SNI, bắt buộc khi một IP phục vụ nhiều tên.
echo | openssl s_client -connect example.com:443 -servername example.com -verify_hostname example.com

# Đọc thông tin một chứng chỉ trong tệp PEM
openssl x509 -in cert.pem -noout -subject -issuer -dates -ext subjectAltName
```

`echo |` đóng đầu vào để `s_client` thoát ngay thay vì chờ bạn gõ. Ở cuối đầu ra của `s_client`, dòng `Verify return code: 0 (ok)` nghĩa là chuỗi hợp lệ; số khác 0 kèm lời giải thích là lỗi. Với `-verify_hostname`, bạn còn thấy dòng `Verification: OK` hoặc `Verification error: ...`.

Để lấy chứng chỉ máy chủ rồi đọc ngay:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

## Lỗi 1: chứng chỉ hết hạn

**Dấu hiệu:** trình duyệt báo "chứng chỉ đã hết hạn"; `s_client` báo mã lỗi liên quan đến thời hạn (với OpenSSL là `certificate has expired`).

**Kiểm:**

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -dates
```

Xem dòng `notAfter`. Muốn biết chứng chỉ có hết hạn trong N giây tới không, dùng `-checkend`:

```bash
openssl x509 -in cert.pem -noout -checkend 1209600   # 14 ngày
```

Lệnh in `Certificate will not expire` và trả mã thoát 0 nếu còn hạn, hoặc `Certificate will expire` và mã 1 nếu sắp hết. Rất tiện để đưa vào một tập lệnh giám sát.

**Sửa:** gia hạn chứng chỉ, rồi nạp lại dịch vụ web. Nguyên nhân thường gặp là bộ hẹn giờ gia hạn không chạy, hoặc chứng chỉ mới đã có trên đĩa nhưng nginx chưa được nạp lại.

Lưu ý: đồng hồ hệ thống lệch cũng gây ra lỗi tương tự. Nếu máy khách có giờ sai, chứng chỉ còn hạn vẫn bị coi là chưa hiệu lực hoặc đã hết hạn.

## Lỗi 2: thiếu chứng chỉ trung gian

**Dấu hiệu:** một số máy khách (đặc biệt là `curl`, thư viện trong ứng dụng, máy ảo Java) từ chối kết nối, trong khi vài trình duyệt vẫn mở được vì chúng tự tải chứng chỉ trung gian còn thiếu. `openssl s_client` báo:

```
verify error:num=20:unable to get local issuer certificate
verify error:num=21:unable to verify the first certificate
Verify return code: 21 (unable to verify the first certificate)
```

**Kiểm:** liệt kê những chứng chỉ máy chủ thực sự gửi:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com -showcerts 2>/dev/null | grep -E "^ *[0-9]+ s:|^ *i:"
```

Mỗi chứng chỉ được in kèm dòng `s:` (chủ thể) và `i:` (bên cấp). Nếu chỉ có một chứng chỉ (mục `0`) mà bên cấp của nó không phải một gốc được tin, máy chủ đã quên gửi chứng chỉ trung gian.

Hai mã lỗi 20 và 21 ở trên cũng xuất hiện khi máy khách đơn giản là không tin bên cấp (ví dụ CA tự tạo chưa được thêm vào kho tin cậy), nên hãy đối chiếu bằng `-showcerts` trước khi kết luận.

**Sửa:** cấu hình nginx dùng tệp chứa cả chứng chỉ máy chủ lẫn chứng chỉ trung gian. Với Let's Encrypt, đó là `fullchain.pem` chứ không phải `cert.pem`. Sau đó nạp lại nginx và kiểm lại.

## Lỗi 3: sai tên miền

**Dấu hiệu:** trình duyệt báo tên trong chứng chỉ không khớp. Với OpenSSL, khi dùng `-verify_hostname`, bạn thấy:

```
verify error:num=62:hostname mismatch
Verification error: hostname mismatch
Verify return code: 62 (hostname mismatch)
```

**Kiểm:** đọc danh sách tên mà chứng chỉ phủ:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -ext subjectAltName
```

Tên bạn truy cập phải xuất hiện trong danh sách `DNS:` (hoặc khớp một mục ký tự đại diện như `*.example.com`; mục này chỉ phủ một cấp tên con, nên không phủ chính `example.com`). Hai nguyên nhân hay gặp:

- Chứng chỉ chỉ cấp cho `example.com`, trong khi người dùng vào `www.example.com`.
- Không gửi SNI, nên máy chủ trả về chứng chỉ mặc định của một tên miền khác. Thử lại với và không có `-servername` để so sánh; `-noservername` tắt hẳn phần mở rộng này.

**Sửa:** cấp lại chứng chỉ có đủ các tên cần dùng (mỗi tên một `-d` với certbot), hoặc sửa cấu hình để đúng khối `server` phục vụ đúng tên.

## Kiểm tra theo thứ tự

Khi nhận được báo cáo "web báo lỗi chứng chỉ", bạn có thể đi theo thứ tự cố định:

1. Chạy `s_client` có `-servername` và `-verify_hostname`, đọc `Verify return code`.
2. Nếu lỗi liên quan thời hạn: đọc `notAfter` và kiểm đồng hồ hệ thống.
3. Nếu lỗi không tìm được bên cấp: dùng `-showcerts` đếm số chứng chỉ máy chủ gửi.
4. Nếu lỗi tên: đọc SAN và so với tên đang truy cập.

Chỉ sửa ở máy chủ sau khi biết rõ nguyên nhân thuộc loại nào, và luôn kiểm lại bằng cùng lệnh sau khi sửa.

## Lỗi hay gặp khi dùng chính `openssl`

- **Quên `-servername`:** nhận về chứng chỉ mặc định, dẫn tới kết luận sai.
- **Quên `echo |`:** lệnh treo chờ bạn nhập.
- **Tin kết quả `Verify return code` khi chưa chỉ định kho tin cậy:** `openssl` dùng kho mặc định của hệ thống; nếu bạn thử với CA nội bộ, hãy truyền `-CAfile ca.crt`.
- **Dán khoá riêng lên diễn đàn khi nhờ giúp:** chỉ chia sẻ chứng chỉ công khai và đầu ra lệnh, không bao giờ chia sẻ `privkey.pem`.

## Tóm lại

Ba lỗi hết hạn, thiếu chứng chỉ trung gian và sai tên miền chiếm phần lớn các sự cố chứng chỉ. Với `openssl s_client` để xem mã xác minh và `openssl x509` để đọc ngày hạn cùng SAN, bạn phân biệt được chúng chỉ trong vài lệnh. Đưa `-checkend` vào giám sát sẽ giúp bạn biết chứng chỉ sắp hết hạn trước khi người dùng biết.

## Tham khảo

- [Tài liệu OpenSSL 3.0: openssl-s_client](https://docs.openssl.org/3.0/man1/openssl-s_client/)
- [Tài liệu OpenSSL 3.0: openssl-x509](https://docs.openssl.org/3.0/man1/openssl-x509/)
- [RFC 5280: Internet X.509 Public Key Infrastructure Certificate and CRL Profile](https://datatracker.ietf.org/doc/html/rfc5280)
- [RFC 6125: Representation and Verification of Domain-Based Application Service Identity](https://datatracker.ietf.org/doc/html/rfc6125)
- [Certbot: hướng dẫn sử dụng](https://eff-certbot.readthedocs.io/en/stable/using.html)
