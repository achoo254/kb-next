---
title: Bắt tay TLS và chuỗi chứng chỉ: máy khách tin máy chủ như thế nào
tags: tls, chứng chỉ, https, pki, bảo mật
type: note
---

> [!TLDR]
> - TLS cho hai bên thoả thuận khoá chung và cho máy khách kiểm tra danh tính máy chủ trước khi gửi dữ liệu thật.
> - Chứng chỉ của máy chủ được tin nhờ một chuỗi chữ ký: chứng chỉ máy chủ, chứng chỉ trung gian, rồi chứng chỉ gốc nằm sẵn trong kho tin cậy của máy khách.
> - Trình duyệt kiểm chữ ký, thời hạn và tên miền; sai một trong ba là báo lỗi.

## Mở đầu

Mỗi lần bạn mở một địa chỉ bắt đầu bằng `https://`, trình duyệt và máy chủ thực hiện một "cái bắt tay" ngắn trước khi trao đổi bất cứ dữ liệu nào. Cái bắt tay đó làm hai việc: hai bên thống nhất một khoá bí mật chung để mã hoá đường truyền, và máy chủ chứng minh nó đúng là máy chủ của tên miền bạn định vào. Giao thức làm việc này là TLS (Transport Layer Security), người kế nhiệm của SSL. Chữ "SSL" vẫn hay được dùng trong đời thường, nhưng các phiên bản SSL đã lỗi thời từ lâu; thứ bạn đang dùng thật ra là TLS.

Bài này giải thích cái bắt tay diễn ra thế nào, chứng chỉ chứa gì và vì sao một chuỗi chứng chỉ lại khiến máy khách tin máy chủ. Bài sau trong chuỗi, [[Cấp và gia hạn chứng chỉ Let's Encrypt tự động bằng certbot và ACME trên Ubuntu 24.04]], sẽ đi vào việc lấy và gia hạn chứng chỉ.

## TLS làm hai việc: mã hoá và xác thực

Mã hoá thì dễ hình dung: nếu ai đó nghe lén đường truyền, họ chỉ thấy dữ liệu đã xáo trộn. Nhưng mã hoá một mình chưa đủ. Nếu bạn mã hoá rất kỹ nhưng lại đang nói chuyện với kẻ giả mạo, thì mọi thứ vẫn lộ ra. Vì vậy TLS còn có phần xác thực: máy chủ đưa ra một chứng chỉ, và máy khách kiểm tra xem chứng chỉ đó có đáng tin cho tên miền đang truy cập hay không.

Bạn có thể coi chứng chỉ như một tấm thẻ căn cước do một bên thứ ba có uy tín cấp. Thẻ ghi tên miền được cấp, khoá công khai của máy chủ, thời hạn hiệu lực và chữ ký của bên cấp. Bên cấp này gọi là tổ chức cấp chứng chỉ, viết tắt CA (Certificate Authority).

## Cái bắt tay TLS 1.3 qua các bước

TLS 1.3 được định nghĩa trong RFC 8446. Ở mức khái quát, luồng đi như sau:

1. **ClientHello.** Máy khách gửi các phiên bản và bộ mã hoá nó hỗ trợ, một phần dữ liệu để thoả thuận khoá, và tên miền muốn vào qua phần mở rộng SNI (Server Name Indication). SNI cho phép một địa chỉ IP phục vụ nhiều tên miền, mỗi tên một chứng chỉ riêng.
2. **ServerHello.** Máy chủ chọn một bộ mã hoá trong danh sách đó và gửi phần dữ liệu thoả thuận khoá của mình. Đến đây, hai bên đã đủ thông tin để cùng tính ra khoá chung mà người nghe lén không tính được.
3. **Chứng chỉ và bằng chứng sở hữu khoá.** Từ bước này, phần còn lại của cái bắt tay đã được mã hoá. Máy chủ gửi chứng chỉ của mình, kèm một chữ ký chứng minh nó nắm khoá riêng tương ứng với chứng chỉ, rồi gửi thông điệp kết thúc.
4. **Kết thúc.** Máy khách kiểm tra chứng chỉ, gửi thông điệp kết thúc của nó, và dữ liệu ứng dụng (ví dụ yêu cầu HTTP) bắt đầu đi qua kênh đã mã hoá.

Điểm cải tiến so với TLS 1.2 là cái bắt tay gọn hơn: thông thường chỉ cần một vòng đi về trước khi gửi được dữ liệu ứng dụng. Nhiều bộ mã hoá cũ cũng bị loại bỏ khỏi TLS 1.3.

## Chứng chỉ chứa những gì

Một chứng chỉ theo chuẩn X.509 (RFC 5280) có các trường quan trọng sau:

- **Subject:** đối tượng được cấp.
- **Subject Alternative Name (SAN):** danh sách tên miền mà chứng chỉ hợp lệ, ví dụ `example.com` và `www.example.com`. Đây là nơi trình duyệt hiện đại đối chiếu tên miền.
- **Issuer:** bên đã ký chứng chỉ.
- **Not Before / Not After:** khoảng thời gian có hiệu lực.
- **Khoá công khai** của chủ chứng chỉ và **chữ ký** của bên cấp.

Bạn có thể xem những trường này bằng lệnh `openssl x509 -in cert.pem -noout -subject -issuer -dates -ext subjectAltName` (thử trên OpenSSL 3.0.13, bản đi kèm Ubuntu 24.04). Bài [[Lỗi chứng chỉ hay gặp và cách kiểm bằng openssl: hết hạn, thiếu chuỗi trung gian, sai tên miền]] sẽ dùng lại các lệnh này.

## Chuỗi chứng chỉ: vì sao tin được một chứng chỉ lạ

Trình duyệt không thể biết trước mọi máy chủ trên Internet. Thay vào đó, hệ điều hành và trình duyệt mang sẵn một danh sách chứng chỉ gốc đáng tin, gọi là kho tin cậy (trust store). Chứng chỉ gốc nằm trong kho đó do các CA gốc giữ khoá riêng rất cẩn thận, thường không dùng để ký trực tiếp cho từng máy chủ.

Thay vào đó, CA gốc ký cho một hoặc vài **chứng chỉ trung gian** (intermediate), và chứng chỉ trung gian mới ký cho chứng chỉ **máy chủ** (còn gọi là leaf). Kết quả là một chuỗi:

```
chứng chỉ máy chủ (example.com)
  └─ ký bởi: chứng chỉ trung gian
        └─ ký bởi: chứng chỉ gốc (có sẵn trong kho tin cậy)
```

Máy khách lần ngược chuỗi: kiểm chữ ký của chứng chỉ máy chủ bằng khoá công khai của chứng chỉ trung gian, rồi kiểm chứng chỉ trung gian bằng chứng chỉ gốc. Nếu chuỗi dẫn tới một gốc có trong kho tin cậy, và không mắt xích nào hết hạn, chứng chỉ được chấp nhận.

Ý nghĩa thực tế: máy chủ nên gửi cả chứng chỉ máy chủ lẫn các chứng chỉ trung gian, nhưng không cần gửi chứng chỉ gốc vì máy khách đã có. Nếu máy chủ quên gửi chứng chỉ trung gian, một số máy khách sẽ báo lỗi. Đây là lỗi rất hay gặp và sẽ được phân tích ở bài thứ ba.

## Ba điều máy khách kiểm tra

Khi nhận chứng chỉ, máy khách kiểm tối thiểu ba thứ:

1. **Chữ ký và chuỗi tin cậy:** chuỗi dẫn được tới một chứng chỉ gốc trong kho tin cậy.
2. **Thời hạn:** thời điểm hiện tại nằm giữa Not Before và Not After của mọi chứng chỉ trong chuỗi.
3. **Tên miền:** tên bạn đang truy cập khớp một mục trong SAN (RFC 6125 mô tả cách so khớp, kể cả ký tự đại diện).

Sai một điều thì kết nối bị từ chối hoặc trình duyệt hiện cảnh báo. Đây là lý do cảnh báo chứng chỉ không nên bấm bỏ qua: nó có thể chỉ là chứng chỉ hết hạn, nhưng cũng có thể là dấu hiệu của kẻ chen vào giữa đường truyền.

## Một ví dụ nhỏ để tự quan sát

Nếu muốn nhìn tận mắt, bạn có thể kết nối tới một máy chủ HTTPS bằng `openssl s_client` rồi đọc kết quả:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com -brief
```

Dòng đầu ra cho biết phiên bản giao thức (ví dụ `TLSv1.3`), bộ mã hoá, chứng chỉ của máy chủ và kết quả xác minh. Tuỳ chọn `-servername` gửi SNI, `-brief` rút gọn đầu ra (xem `openssl s_client -help` trên máy bạn).

## Tóm lại

TLS vừa mã hoá vừa xác thực. Cái bắt tay thoả thuận khoá chung và đưa chứng chỉ của máy chủ cho máy khách kiểm tra. Chứng chỉ được tin nhờ chuỗi chữ ký từ chứng chỉ máy chủ qua chứng chỉ trung gian tới chứng chỉ gốc trong kho tin cậy. Nắm được chuỗi này, bạn sẽ hiểu vì sao thiếu chứng chỉ trung gian, hết hạn hay sai tên miền đều làm kết nối thất bại. Bài này chỉ trình bày khái niệm ở mức tổng quát; chi tiết đầy đủ nằm trong các RFC dưới đây.

## Tham khảo

- [RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3](https://datatracker.ietf.org/doc/html/rfc8446)
- [RFC 5280: Internet X.509 Public Key Infrastructure Certificate and CRL Profile](https://datatracker.ietf.org/doc/html/rfc5280)
- [RFC 6125: Representation and Verification of Domain-Based Application Service Identity](https://datatracker.ietf.org/doc/html/rfc6125)
- [Tài liệu OpenSSL 3.0: openssl-s_client](https://docs.openssl.org/3.0/man1/openssl-s_client/)
- [Tài liệu OpenSSL 3.0: openssl-x509](https://docs.openssl.org/3.0/man1/openssl-x509/)
- [Chứng chỉ của Let's Encrypt (chuỗi gốc và trung gian)](https://letsencrypt.org/certificates/)
