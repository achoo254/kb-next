---
title: Đọc báo cáo tổng hợp DMARC và xử lý thư bị vào spam: từ p=none đến reject
tags: DMARC, báo cáo DMARC, spam, email, gỡ lỗi
type: process
---

> [!TLDR]
> - Báo cáo tổng hợp DMARC là tệp XML nén do các máy nhận gửi về địa chỉ `rua`, cho biết ai đang gửi thư nhân danh tên miền của bạn và SPF, DKIM, DMARC của họ đạt hay không.
> - Quy trình an toàn: `p=none`, rà báo cáo và sửa nguồn gửi hợp lệ, rồi `quarantine`, rồi `reject`, tăng dần bằng `pct`.
> - Thư vào spam có nhiều nguyên nhân ngoài xác thực; hãy gỡ lỗi từ tiêu đề `Authentication-Results` của chính thư đó.

## Mở đầu

Bài trước đã đặt bản ghi DMARC với `p=none` và địa chỉ `rua`. Sau một vài ngày, hộp thư đó bắt đầu nhận những tệp đính kèm lạ. Bài này hướng dẫn đọc chúng, dùng chúng để tìm nguồn gửi bị sót hoặc giả mạo, và siết chính sách từng bước. Nội dung nối tiếp bài “SPF, DKIM và DMARC: ba bản ghi DNS chứng minh thư gửi từ tên miền của bạn”; bài này là bài cuối của chuỗi.

Bài dựa trên RFC 7489. IETF đã làm việc trên một bản sửa đổi của đặc tả này (thường gọi là DMARCbis); hãy kiểm tra trạng thái mới nhất tại trang RFC hoặc IETF Datatracker, vì các thẻ cơ bản trong bài là phần đã được dùng rộng rãi.

## Báo cáo tổng hợp trông như thế nào

Các máy nhận lớn gửi báo cáo tổng hợp (aggregate report) khoảng mỗi ngày một lần, thường dưới dạng tệp XML nén bằng gzip hoặc zip đính kèm thư. Báo cáo không chứa nội dung thư, chỉ chứa thống kê theo địa chỉ IP nguồn.

Giải nén và mở tệp bằng trình soạn thảo văn bản. Trên Ubuntu 24.04:

```bash
gunzip report.xml.gz        # với tệp .gz
unzip report.zip            # với tệp .zip (gói unzip)
```

Cấu trúc điển hình (rút gọn, dùng địa chỉ ví dụ):

```xml
<feedback>
  <report_metadata>
    <org_name>Example Receiver</org_name>
    <report_id>123456</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>example.com</domain><p>none</p>
  </policy_published>
  <record>
    <row>
      <source_ip>192.0.2.10</source_ip>
      <count>120</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
    <auth_results>
      <dkim><domain>example.com</domain><selector>s2026</selector><result>pass</result></dkim>
      <spf><domain>example.com</domain><result>pass</result></spf>
    </auth_results>
  </record>
</feedback>
```

Các phần cần đọc:

- `report_metadata`: ai gửi báo cáo và khoảng thời gian (thời điểm tính bằng giây Unix).
- `policy_published`: chính sách DMARC mà máy nhận thấy khi báo cáo.
- Mỗi `record` là một nhóm thư cùng IP nguồn: `source_ip`, `count` (số thư), và `policy_evaluated` với kết quả `dkim`, `spf` *sau khi đã xét alignment*.
- `auth_results`: kết quả thô của DKIM và SPF cùng tên miền đã kiểm. Nếu `auth_results` là `pass` nhưng `policy_evaluated` là `fail`, nguyên nhân gần như chắc chắn là **không khớp tên miền** (alignment).

Tệp XML thô khó đọc khi có nhiều nguồn. Bạn có thể dùng một công cụ phân tích báo cáo DMARC mã nguồn mở hoặc dịch vụ có sẵn; vì báo cáo chứa địa chỉ IP gửi thư của bạn, hãy cân nhắc tin cậy dịch vụ nhận dữ liệu.

## Quy trình siết chính sách

### Bước 1: quan sát với `p=none`

Để nguyên `p=none` ít nhất vài tuần để thấy hết chu kỳ gửi thư (thư định kỳ cuối tháng, hoá đơn, bản tin). Gom các dòng `record` theo `source_ip`.

### Bước 2: phân loại từng nguồn

Với mỗi IP, trả lời:

1. **Của mình và đạt cả hai**: không cần làm gì.
2. **Của mình nhưng không đạt**: ví dụ máy chủ ứng dụng chưa có trong SPF, hoặc dịch vụ gửi thư chưa ký bằng tên miền của bạn. Sửa SPF (`include` hay `ip4`) hoặc bật DKIM tên miền tuỳ chỉnh ở nhà cung cấp. Có thể tra chủ sở hữu IP bằng `whois` (gói `whois`) hoặc hỏi nhóm vận hành ứng dụng.
3. **Không phải của mình**: nhiều khả năng là giả mạo hoặc thư bị chuyển tiếp. Đây chính là loại thư mà `quarantine` và `reject` được thiết kế để chặn.

Chú ý hai trường hợp gây "dương tính giả": thư **chuyển tiếp** (SPF hỏng vì IP máy chuyển khác) và **danh sách thư** (có thể sửa tiêu đề hay thân thư làm hỏng chữ ký DKIM). Bởi vậy một ít thư hợp lệ không đạt DMARC là bình thường; RFC 8617 (ARC) là một cơ chế được xây dựng để giúp máy trung gian giữ lại kết quả xác thực ban đầu, nhưng việc áp dụng còn tuỳ từng máy nhận.

### Bước 3: chuyển sang `quarantine` dần dần

Khi các nguồn hợp lệ đều đạt, đổi chính sách sang chế độ cách ly, bắt đầu với tỉ lệ nhỏ:

```text
_dmarc.example.com.  IN TXT  "v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc-reports@example.com"
```

Tăng `pct` dần (ví dụ 10, 25, 50, 100) và tiếp tục đọc báo cáo sau mỗi lần tăng. Nếu có sự cố, quay lại `p=none` ngay; vì DNS có TTL, nên đặt TTL của bản ghi DMARC thấp trong giai đoạn này.

### Bước 4: `reject` khi đã chắc chắn

Chỉ chuyển sang `p=reject` khi báo cáo nhiều tuần liền không còn nguồn hợp lệ nào bị fail. Đừng quên `sp=` nếu tên miền con cũng gửi thư, và đặt chính sách cho tên miền không gửi thư (ví dụ tên miền đăng ký dự phòng) để chặn giả mạo chúng.

## Khi thư thật bị vào spam

DMARC chỉ là một trong nhiều tín hiệu. Quy trình gỡ lỗi:

1. Lấy một thư cụ thể bị vào spam, mở "Xem nguồn thư".
2. Đọc `Authentication-Results`. Nếu SPF, DKIM hoặc DMARC không `pass`, quay lại bài trước và sửa bản ghi tương ứng.
3. Nếu cả ba đều `pass` mà thư vẫn vào spam, nguyên nhân thường nằm ngoài xác thực: danh tiếng của IP hoặc tên miền gửi, người nhận hay đánh dấu thư là rác, nội dung giống thư quảng cáo, liên kết rút gọn đáng ngờ, hoặc gửi đột ngột với số lượng lớn từ một tên miền mới.
4. Kiểm tra IP gửi có nằm trong danh sách đen công khai không, và dịch vụ phản hồi (feedback loop) của nhà cung cấp hộp thư nếu họ có cung cấp.
5. Với thư hàng loạt, cung cấp cách huỷ đăng ký rõ ràng. Một số nhà cung cấp hộp thư lớn đã công bố yêu cầu xác thực và giảm tỉ lệ báo cáo thư rác với người gửi số lượng lớn; hãy đọc hướng dẫn gửi thư chính thức của từng nhà cung cấp mà bạn gửi tới.

## Lỗi hay gặp

- **Đặt `rua` tới địa chỉ không tồn tại hoặc đầy hộp thư**: báo cáo thất lạc, bạn mù thông tin.
- **Đặt `reject` rồi mới đọc báo cáo.** Hãy đọc báo cáo trước khi siết.
- **Chỉ nhìn `auth_results`, không nhìn `policy_evaluated`.** DMARC dựa vào alignment, không chỉ pass thô.
- **Quên các nguồn gửi ít ai nhớ**: máy in, hệ thống giám sát, công cụ chăm sóc khách hàng, biểu mẫu trên website.

## Tóm lại

Báo cáo tổng hợp DMARC cho bạn bản đồ mọi nơi gửi thư nhân danh tên miền. Hãy đọc chúng, sửa các nguồn hợp lệ còn fail, rồi siết chính sách từ `none` đến `quarantine` và `reject` theo từng bước nhỏ, có thể quay lại. Khi một thư cụ thể vào spam, bắt đầu từ `Authentication-Results` rồi mới xét danh tiếng và nội dung.

## Tham khảo

- RFC 7489, Domain-based Message Authentication, Reporting, and Conformance (DMARC): https://www.rfc-editor.org/rfc/rfc7489
- RFC 7208, Sender Policy Framework (SPF): https://www.rfc-editor.org/rfc/rfc7208
- RFC 6376, DomainKeys Identified Mail (DKIM) Signatures: https://www.rfc-editor.org/rfc/rfc6376
- RFC 8617, The Authenticated Received Chain (ARC) Protocol: https://www.rfc-editor.org/rfc/rfc8617
