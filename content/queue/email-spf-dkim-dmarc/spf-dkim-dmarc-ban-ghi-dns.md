---
title: SPF, DKIM và DMARC: ba bản ghi DNS chứng minh thư gửi từ tên miền của bạn
tags: SPF, DKIM, DMARC, DNS, email
type: lab
---

> [!TLDR]
> - SPF liệt kê máy được phép gửi thư cho tên miền; DKIM gắn chữ ký số vào thư; DMARC buộc kết quả của hai cơ chế này khớp với dòng `From:` và nói máy nhận xử lý thư không đạt ra sao.
> - Cả ba được công bố bằng bản ghi TXT trong DNS; hãy bắt đầu DMARC bằng `p=none` để chỉ quan sát.
> - Mỗi tên miền chỉ nên có một bản ghi SPF, và SPF bị giới hạn 10 lần tra DNS.

## Mục tiêu

Sau bài này bạn sẽ viết được ba bản ghi DNS cho tên miền gửi thư (ví dụ `example.com`): SPF, DKIM và DMARC, tạo được cặp khoá DKIM bằng `openssl` trên Ubuntu 24.04 LTS, và kiểm tra bản ghi bằng `dig`. Bài trước giải thích bài “Thư điện tử đi từ máy gửi đến hộp thư nhận: MUA, MSA, MTA, bản ghi MX và hai địa chỉ người gửi”; nếu chưa quen khái niệm địa chỉ phong bì và dòng `From:`, hãy đọc bài đó trước. Bài tiếp theo của chuỗi là [[Đọc báo cáo tổng hợp DMARC và xử lý thư bị vào spam: từ p=none đến reject]].

## Chuẩn bị

- Quyền sửa DNS của tên miền (ở nhà đăng ký tên miền hoặc nhà cung cấp DNS).
- Danh sách mọi nơi đang gửi thư nhân danh tên miền: máy chủ thư riêng, dịch vụ gửi thư hàng loạt, hệ thống thông báo của ứng dụng, phần mềm CRM... Bỏ sót một nơi là nguyên nhân phổ biến khiến thư thật bị đánh dấu không đạt.
- Một máy Ubuntu 24.04 LTS để chạy lệnh. Tên miền và địa chỉ trong bài chỉ là ví dụ: `example.com`, `192.0.2.10`, `2001:db8::10`.

```bash
sudo apt update
sudo apt install bind9-dnsutils openssl
openssl version      # Ubuntu 24.04: OpenSSL 3.0.x
```

## Các bước

### Bước 1: SPF, danh sách máy được phép gửi

SPF (RFC 7208) là một bản ghi TXT đặt tại chính tên miền, bắt đầu bằng `v=spf1`. Máy nhận lấy tên miền trong địa chỉ phong bì (MAIL FROM), tra bản ghi này rồi so địa chỉ IP của máy đang gửi với danh sách.

Ví dụ:

```text
example.com.  IN TXT  "v=spf1 ip4:192.0.2.10 ip6:2001:db8::10 include:_spf.mailservice.example.net ~all"
```

Giải nghĩa từng phần:

- `ip4:` và `ip6:`: cho phép một địa chỉ hay một dải địa chỉ.
- `include:`: gộp danh sách của một nhà cung cấp dịch vụ gửi thư. Hãy dùng đúng giá trị nhà cung cấp công bố.
- `mx` và `a`: cho phép các máy ở bản ghi MX hoặc bản ghi A của tên miền.
- `all` đứng cuối cùng, kèm một ký hiệu kết quả: `-all` (từ chối, fail), `~all` (softfail, đáng ngờ nhưng không chặn cứng), `?all` (trung lập). Khi mới triển khai, nhiều người chọn `~all` rồi chuyển `-all` khi đã chắc chắn danh sách đầy đủ.

Hai giới hạn cần nhớ:

1. **Chỉ một bản ghi SPF cho mỗi tên miền.** Có hai bản ghi bắt đầu bằng `v=spf1` thì kết quả là lỗi vĩnh viễn (permerror).
2. **Tối đa 10 lần tra DNS** do các cơ chế `include`, `a`, `mx`, `ptr`, `exists` và `redirect` gây ra. Vượt quá cũng là permerror. Vì vậy đừng chất chồng quá nhiều `include`; `ip4:` và `ip6:` không tốn lượt tra.

Kiểm tra:

```bash
dig +short TXT example.com
```

### Bước 2: DKIM, chữ ký số gắn trong thư

DKIM (RFC 6376) hoạt động bằng cặp khoá. **Khoá riêng** nằm ở nơi ký thư (máy chủ thư hoặc dịch vụ gửi thư) và dùng để ký các tiêu đề cùng thân thư; **khoá công khai** được đăng trong DNS để ai cũng kiểm tra được chữ ký. Chữ ký nằm trong dòng tiêu đề `DKIM-Signature`, trong đó `d=` là tên miền ký và `s=` là **selector**, tên giúp một tên miền có nhiều khoá cùng lúc (ví dụ để xoay vòng khoá).

Tạo cặp khoá RSA 2048 bit bằng `openssl`:

```bash
openssl genrsa -out dkim-private.pem 2048
openssl rsa -in dkim-private.pem -pubout -outform DER | openssl base64 -A
```

Lệnh thứ hai in ra một chuỗi base64 dài; đó là phần `p=` của bản ghi. **Khoá riêng `dkim-private.pem` là bí mật:** không đăng, không gửi qua chat, không commit vào kho mã, và chỉ cấp quyền đọc cho tài khoản chạy dịch vụ ký (`chmod 600`). Nếu đưa khoá cho dịch vụ gửi thư bên thứ ba, nhiều nhà cung cấp tự sinh khoá và đưa bạn bản ghi cần đăng, cách này tiện hơn.

Bản ghi DNS nằm ở tên `<selector>._domainkey.<tên miền>`. Với selector `s2026`:

```text
s2026._domainkey.example.com.  IN TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkq...(chuỗi base64 của bạn)"
```

Khoá 2048 bit dài hơn giới hạn 255 ký tự của một chuỗi trong TXT, nên bản ghi phải được tách thành nhiều chuỗi trong ngoặc kép liền nhau; hầu hết giao diện DNS tự làm việc này. RFC 8301 yêu cầu bên ký dùng khoá RSA tối thiểu 1024 bit và không còn dùng SHA-1; khoá 2048 bit là lựa chọn thường dùng. Ngoài RSA, RFC 8463 bổ sung thuật toán Ed25519, nhưng không phải bên nhận nào cũng hỗ trợ, nên RSA vẫn là lựa chọn tương thích nhất.

Việc ký thật sự do phần mềm gửi thư đảm nhiệm. Với Postfix trên Ubuntu, một cách phổ biến là gói OpenDKIM (`opendkim`, `opendkim-tools`); hãy làm theo tài liệu của chính phần mềm bạn dùng. Kiểm tra bản ghi công khai:

```bash
dig +short TXT s2026._domainkey.example.com
```

### Bước 3: DMARC, nối SPF và DKIM với dòng From

DMARC (RFC 7489) đặt bản ghi TXT tại `_dmarc.<tên miền>`. Bắt đầu với chế độ chỉ quan sát:

```text
_dmarc.example.com.  IN TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"
```

Các thẻ chính:

- `v=DMARC1`: bắt buộc, phải đứng đầu.
- `p=`: chính sách cho tên miền: `none` (chỉ báo cáo), `quarantine` (đưa vào spam), `reject` (từ chối).
- `rua=`: địa chỉ nhận **báo cáo tổng hợp** (aggregate) hằng ngày từ các máy nhận.
- `sp=`: chính sách riêng cho tên miền con; `pct=`: tỉ lệ phần trăm thư áp dụng chính sách; `adkim=` và `aspf=`: độ chặt của việc khớp tên miền, `r` (relaxed, mặc định) hoặc `s` (strict).

Thư **đạt DMARC** khi ít nhất một trong hai điều sau đúng: SPF đạt *và* tên miền trong địa chỉ phong bì khớp tên miền trong `From:`; hoặc DKIM đạt *và* tên miền `d=` khớp tên miền trong `From:`. Khái niệm "khớp" này gọi là **alignment**; với chế độ relaxed, tên miền con vẫn được coi là khớp với tên miền chính.

Nếu địa chỉ nhận báo cáo thuộc *tên miền khác* với tên miền được bảo vệ, bên nhận báo cáo phải đăng thêm một bản ghi cho phép (xem mục 7.1 của RFC 7489), nếu không các máy nhận sẽ không gửi báo cáo tới đó. Cách đơn giản nhất lúc đầu là dùng hộp thư cùng tên miền.

## Kiểm tra

1. Chờ DNS cập nhật (tuỳ TTL), rồi chạy lại ba lệnh `dig` ở trên và đối chiếu từng ký tự.
2. Gửi một thư từ tên miền của bạn tới một hộp thư khác, mở "Xem nguồn thư" và tìm `Authentication-Results:`: bạn mong thấy `spf=pass`, `dkim=pass` và `dmarc=pass`.
3. Nếu có kết quả `fail` hay `none`, xem phần Lỗi hay gặp bên dưới.

## Lỗi hay gặp

- **Hai bản ghi SPF.** Gộp thành một bản ghi duy nhất.
- **Vượt 10 lần tra DNS.** Giảm `include`, thay bằng `ip4:` khi nhà cung cấp có dải IP cố định và ổn định.
- **Bản ghi DKIM bị cắt hoặc thừa dấu cách.** Sao chép lại chuỗi base64 cẩn thận; dùng `dig` để thấy bản ghi thực tế.
- **Đặt `p=reject` quá sớm.** Thư hợp lệ từ một hệ thống bạn quên liệt kê sẽ bị từ chối. Hãy bắt đầu bằng `p=none`.
- **Dịch vụ bên thứ ba ký bằng tên miền của họ.** Thư đạt DKIM nhưng không khớp `From:` nên vẫn không đạt DMARC; cấu hình tên miền tuỳ chỉnh ở nhà cung cấp để họ ký bằng `d=` của bạn.
- **Chuyển tiếp và danh sách thư.** SPF thường hỏng khi thư bị chuyển tiếp vì IP máy gửi đã đổi; DKIM thường sống sót nếu nội dung không bị sửa.

## Tóm lại

SPF trả lời "máy này có được gửi cho tên miền không", DKIM trả lời "thư có đúng do tên miền ký và còn nguyên vẹn không", còn DMARC buộc hai câu trả lời ấy khớp với dòng `From:` mà người dùng thấy và cho chủ tên miền nói cách xử lý. Triển khai theo thứ tự SPF, DKIM, rồi DMARC với `p=none`; bài sau hướng dẫn đọc báo cáo để siết chính sách một cách an toàn.

## Tham khảo

- RFC 7208, Sender Policy Framework (SPF): https://www.rfc-editor.org/rfc/rfc7208
- RFC 6376, DomainKeys Identified Mail (DKIM) Signatures: https://www.rfc-editor.org/rfc/rfc6376
- RFC 8301, Cryptographic Algorithm and Key Usage Update to DKIM: https://www.rfc-editor.org/rfc/rfc8301
- RFC 8463, A New Cryptographic Signature Method for DKIM (Ed25519): https://www.rfc-editor.org/rfc/rfc8463
- RFC 7489, Domain-based Message Authentication, Reporting, and Conformance (DMARC): https://www.rfc-editor.org/rfc/rfc7489
