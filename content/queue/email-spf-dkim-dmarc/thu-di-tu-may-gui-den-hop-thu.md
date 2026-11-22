---
title: Thư điện tử đi từ máy gửi đến hộp thư nhận: MUA, MSA, MTA, bản ghi MX và hai địa chỉ người gửi
tags: email, SMTP, MX, DNS, hạ tầng email
type: note
---

> [!TLDR]
> - Một bức thư đi qua nhiều chặng: ứng dụng thư (MUA), máy chủ tiếp nhận thư gửi (MSA), các máy chủ chuyển thư (MTA) rồi tới máy chủ lưu thư của người nhận.
> - Máy gửi tìm máy nhận bằng bản ghi DNS loại MX của tên miền người nhận.
> - Mỗi thư có hai "địa chỉ người gửi" độc lập (địa chỉ phong bì và dòng From); SPF, DKIM, DMARC tồn tại vì SMTP gốc không kiểm tra chúng.

## Mở đầu

Khi bạn bấm "Gửi", thư của bạn không bay thẳng vào hộp thư của người nhận. Nó đi qua một chuỗi máy chủ, mỗi máy làm một việc riêng, và giữa các máy có những quy ước chung gọi là giao thức. Hiểu chuỗi này là nền tảng để sau đó cấu hình SPF, DKIM và DMARC, vì ba cơ chế ấy đều bám vào từng chặng của hành trình. Đây là bài đầu của chuỗi về xác thực thư; bài kế tiếp là [[SPF, DKIM và DMARC: ba bản ghi DNS chứng minh thư gửi từ tên miền của bạn]].

Bài này chỉ giải thích khái niệm và đưa vài lệnh quan sát, không cần cài thêm máy chủ thư nào.

## Các vai trong hành trình của một bức thư

Tài liệu về email thường dùng bốn chữ viết tắt. Chúng chỉ *vai trò*, không phải bốn máy khác nhau; trên thực tế một phần mềm có thể đảm nhiệm nhiều vai.

- **MUA (Mail User Agent)**: ứng dụng người dùng soạn và đọc thư, ví dụ ứng dụng thư trên điện thoại hay trình duyệt webmail.
- **MSA (Mail Submission Agent)**: máy chủ nhận thư từ MUA để gửi đi. Nó thường yêu cầu đăng nhập (xác thực) và mã hoá kết nối.
- **MTA (Mail Transfer Agent)**: máy chủ chuyển thư từ nơi này sang nơi khác bằng giao thức SMTP. Postfix và Exim là hai ví dụ phần mềm MTA phổ biến.
- **MDA (Mail Delivery Agent)**: phần cuối cùng, bỏ thư vào hộp thư của người dùng trên máy nhận. Người dùng sau đó đọc thư bằng IMAP hoặc POP3.

Giao thức SMTP được mô tả trong RFC 5321, còn cấu trúc của chính bức thư (các dòng tiêu đề như `From`, `To`, `Subject` và phần thân) nằm trong RFC 5322.

### Cổng nào dùng cho việc gì

- **Cổng 25**: dùng giữa các MTA với nhau, tức là chuyển thư giữa các máy chủ. Nhiều nhà cung cấp mạng chặn cổng 25 đi ra từ mạng gia đình hay máy ảo giá rẻ để hạn chế thư rác.
- **Cổng 587**: dùng để MUA gửi thư cho MSA (cổng "submission", RFC 6409), thường bắt đầu kết nối rồi nâng cấp lên TLS bằng lệnh STARTTLS.
- **Cổng 465**: kết nối mã hoá TLS ngay từ đầu cho việc gửi thư; RFC 8314 khuyến nghị dùng TLS cho cả gửi lẫn đọc thư.

## Từ tên miền đến máy chủ nhận: bản ghi MX

Giả sử bạn gửi thư cho `an@example.com`. Máy chủ gửi chỉ biết phần sau dấu `@` là `example.com`, nên nó hỏi DNS: "Thư của tên miền này nên chuyển tới máy nào?". Câu trả lời nằm ở bản ghi **MX (Mail Exchanger)**. Mỗi bản ghi MX có một số ưu tiên và một tên máy; số nhỏ hơn được thử trước.

Trên Ubuntu 24.04 LTS, lệnh `dig` nằm trong gói `bind9-dnsutils`:

```bash
sudo apt update
sudo apt install bind9-dnsutils
dig +short MX example.com
```

Kết quả có dạng `10 mail1.example.com.` và `20 mail2.example.com.` nếu tên miền có hai máy nhận. Nếu máy ưu tiên 10 không trả lời, máy gửi thử tiếp máy ưu tiên 20. Cách máy Ubuntu của bạn tra DNS được giải thích ở [[resolvectl và DNS trên Ubuntu: máy bạn tra tên miền như thế nào]].

Nếu một tên miền không có bản ghi MX, các quy tắc trong RFC 5321 cho phép máy gửi thử chuyển thư tới chính địa chỉ của tên miền đó (bản ghi A hoặc AAAA). Vì thế đừng giả định rằng thiếu MX là chắc chắn không nhận thư.

### Một hành trình cụ thể

1. Bạn soạn thư trong MUA và bấm gửi. MUA đăng nhập vào MSA của nhà cung cấp qua cổng 587 hoặc 465.
2. MSA nhận thư, kiểm tra quyền gửi, thêm các dòng tiêu đề của riêng nó và đưa thư vào hàng đợi.
3. MTA gửi tra DNS bản ghi MX của `example.com`, rồi mở kết nối SMTP tới máy nhận ở cổng 25.
4. Máy nhận chạy các kiểm tra chống thư rác. Đây là nơi SPF, DKIM và DMARC được đánh giá.
5. Nếu chấp nhận, thư được MDA bỏ vào hộp thư của `an@example.com`; người nhận đọc bằng IMAP hoặc webmail.

Mỗi máy chủ chuyển thư thêm một dòng `Received:` vào đầu thư. Đọc các dòng này từ dưới lên trên sẽ thấy thư đã đi qua những máy nào. Trong ứng dụng thư, chức năng "Xem nguồn thư" hoặc "Show original" hiển thị toàn bộ tiêu đề.

## Hai địa chỉ người gửi: phong bì và dòng From

Đây là điểm quan trọng nhất của bài. Một bức thư có **hai** địa chỉ người gửi, và chúng không nhất thiết giống nhau.

- **Địa chỉ phong bì** (envelope sender, còn gọi là MAIL FROM hoặc Return-Path): được máy gửi khai báo trong cuộc hội thoại SMTP bằng lệnh `MAIL FROM`. Đây là nơi thư báo lỗi (bounce) được gửi về. Nó không hiển thị trong ứng dụng thư.
- **Địa chỉ trong tiêu đề** (header From): dòng `From:` mà người nhận thấy trong ứng dụng thư.

Hãy hình dung một phong bì giấy. Địa chỉ viết ngoài phong bì dùng để bưu điện trả thư nếu không giao được; chữ ký ở cuối bức thư bên trong là điều người đọc thấy. Hai thứ ấy có thể khác nhau, và trong SMTP gốc không có gì buộc chúng phải khớp.

Chính khoảng trống này khiến kẻ gian giả mạo người gửi dễ dàng: họ có thể đặt dòng `From:` thành tên miền của một ngân hàng hay công ty mà máy chủ của họ không hề được uỷ quyền. Với giao thức gốc, máy nhận không có cách chuẩn để phân biệt.

## Ba cơ chế xác thực vá khoảng trống ấy như thế nào

- **SPF** kiểm tra *địa chỉ IP của máy gửi* có nằm trong danh sách được tên miền ở địa chỉ phong bì cho phép hay không.
- **DKIM** kiểm tra *chữ ký số* gắn trong thư: thư có đúng do tên miền đã ký và nội dung có bị sửa trên đường đi không.
- **DMARC** nối hai cơ chế trên với dòng `From:` mà người dùng nhìn thấy: nó yêu cầu SPF hoặc DKIM phải đạt *và* tên miền đạt phải khớp với tên miền trong `From:`, rồi cho chủ tên miền quyền nói máy nhận nên xử lý thư không đạt ra sao.

Ba cơ chế này đều được công bố bằng bản ghi DNS, nên chủ tên miền chỉ cần quyền sửa DNS để bật chúng. Cách viết từng bản ghi nằm ở bài sau.

## Quan sát tận mắt

Bạn có thể kiểm tra các khái niệm trên bằng một thư thật của mình:

1. Gửi một thư thử từ hộp thư của bạn sang một hộp thư khác của bạn.
2. Mở thư nhận được, chọn "Xem nguồn thư" (hoặc "Show original").
3. Tìm các dòng `Received:` để đếm số chặng, dòng `Return-Path:` (địa chỉ phong bì) và dòng `From:` (địa chỉ hiển thị).
4. Tìm dòng `Authentication-Results:` nếu có: đây là kết quả SPF, DKIM, DMARC mà máy nhận ghi lại.

Các tiêu đề này có thể chứa thông tin cá nhân (địa chỉ IP, địa chỉ email), nên đừng đăng toàn bộ lên diễn đàn công khai khi hỏi nhờ.

## Lỗi hay gặp khi mới học

- **Nhầm hai địa chỉ người gửi.** Khi gỡ lỗi SPF, hãy nhìn `Return-Path`, không phải `From`.
- **Cho rằng cổng 25 mở được từ mọi nơi.** Nhiều mạng chặn cổng này; hãy dùng cổng 587 hoặc 465 cho việc gửi thư của người dùng.
- **Quên thời gian hiệu lực của DNS.** Bản ghi vừa sửa có thể chưa thấy ngay vì bộ nhớ đệm (TTL).

## Tóm lại

Thư đi từ MUA qua MSA, rồi qua các MTA bằng SMTP; máy gửi tìm máy nhận nhờ bản ghi MX. Vì SMTP gốc cho phép địa chỉ phong bì và dòng `From:` khác nhau mà không kiểm chứng, người ta bổ sung SPF, DKIM và DMARC dưới dạng bản ghi DNS. Bài sau sẽ biến ba bản ghi đó thành các bước cấu hình cụ thể.

## Tham khảo

- RFC 5321, Simple Mail Transfer Protocol: https://www.rfc-editor.org/rfc/rfc5321
- RFC 5322, Internet Message Format: https://www.rfc-editor.org/rfc/rfc5322
- RFC 6409, Message Submission for Mail: https://www.rfc-editor.org/rfc/rfc6409
- RFC 8314, Cleartext Considered Obsolete: Use of TLS for Email Submission and Access: https://www.rfc-editor.org/rfc/rfc8314
