---
title: Lỗi thống nhất, idempotency và phiên bản hoá REST API: những quy ước giúp API sống lâu
tags: rest, api, xử lý lỗi, idempotency, phiên bản api
type: note
---

> [!TLDR]
> - Mọi lỗi của API nên có cùng một dạng, ví dụ theo "problem details" của RFC 9457, để client xử lý bằng một đoạn code chung.
> - Với thao tác không idempotent như POST, một khoá idempotency do client gửi giúp thử lại an toàn mà không tạo trùng.
> - Phiên bản hoá và thông báo ngừng hỗ trợ cho phép đổi API mà không phá những client đang chạy.

## Mở đầu

Hai bài trước của chuỗi đã nói về tên tài nguyên, phương thức, mã trạng thái, phân trang, lọc và sắp xếp. Bài này nói về ba thứ quyết định API có dễ sống chung lâu dài hay không: **cách báo lỗi**, **cách xử lý yêu cầu bị gửi lặp**, và **cách thay đổi API mà không làm hỏng người đang dùng**. Nếu bạn muốn xem phần nền tảng trước, hãy đọc hai bài trước rồi quay lại đây.

## Lỗi trả về thống nhất

Mã trạng thái cho biết *loại* lỗi, nhưng client thường cần nhiều hơn: nguyên nhân cụ thể là gì, trường nào sai, có thể sửa thế nào. Nếu mỗi endpoint trả lỗi một kiểu (khi thì chuỗi, khi thì `{"message": ...}`, khi thì `{"errors": [...]}`), phía client sẽ đầy các đoạn xử lý riêng lẻ.

IETF có một chuẩn cho việc này: **RFC 9457 (Problem Details for HTTP APIs)**, thay thế RFC 7807. Phản hồi lỗi dùng kiểu nội dung `application/problem+json` với vài trường chuẩn:

- `type`: một URI định danh loại lỗi (có thể trỏ tới trang tài liệu).
- `title`: tóm tắt ngắn, dễ đọc, ổn định cho cùng loại lỗi.
- `status`: mã trạng thái HTTP, lặp lại để tiện cho client.
- `detail`: mô tả cụ thể cho lần lỗi này.
- `instance`: định danh của lần xảy ra lỗi, tiện khi tra log.

Chuẩn cho phép thêm trường riêng. Ví dụ lỗi kiểm tra dữ liệu:

```text
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "https://api.example.com/problems/validation-error",
  "title": "Dữ liệu không hợp lệ",
  "status": 422,
  "detail": "Một hoặc nhiều trường không đúng định dạng.",
  "errors": [
    { "field": "email", "message": "Phải là địa chỉ email hợp lệ" }
  ]
}
```

Dù bạn dùng RFC 9457 hay tự đặt dạng riêng, vài nguyên tắc luôn đúng:

- **Một dạng duy nhất** cho mọi lỗi của mọi endpoint, kể cả lỗi `404`, `405`, `500` do framework sinh ra.
- **Mã máy đọc được** (như `type` hoặc một trường `code` ổn định) tách khỏi **lời nhắn cho người đọc**. Client nên dựa vào mã, không dựa vào chuỗi mô tả vì chuỗi có thể đổi.
- **Không lộ chi tiết nội bộ** như stack trace, tên bảng, đường dẫn tệp. Ghi chi tiết đó vào log, còn phản hồi chỉ mang một mã tham chiếu để tra lại.
- Với `429`, kèm header `Retry-After` để client biết đợi bao lâu.

## Idempotency: thử lại mà không sợ trùng

Ở bài đầu, ta thấy GET, PUT và DELETE là idempotent còn POST thì không. Điều này gây vấn đề thực tế: client gửi `POST /payments`, máy chủ xử lý xong nhưng phản hồi bị mất vì mạng đứt. Client không biết kết quả, nếu gửi lại thì có thể trừ tiền hai lần.

Cách giải quyết phổ biến là **khoá idempotency**: client sinh một giá trị duy nhất (ví dụ UUID) cho mỗi thao tác logic và gửi trong header, thường tên là `Idempotency-Key`. Máy chủ làm như sau:

1. Nhận yêu cầu, kiểm tra khoá đã gặp chưa.
2. Chưa gặp: xử lý, lưu kết quả (mã trạng thái và nội dung) gắn với khoá, rồi trả về.
3. Đã gặp với cùng nội dung: **không xử lý lại**, trả đúng kết quả đã lưu.
4. Đã gặp nhưng nội dung khác: từ chối bằng lỗi (thường `409` hoặc `422`), vì có thể client dùng nhầm khoá.

```text
POST https://api.example.com/payments
Idempotency-Key: 6f1c2a3e-1d4b-4f6e-9a77-0c2f5b8d9e11
Content-Type: application/json

{"orderId": 42, "amount": 150000}
```

Một số lưu ý khi triển khai:

- Khoá chỉ có hiệu lực trong một khoảng thời gian (ví dụ vài chục giờ); sau đó có thể xoá để khỏi phình bộ lưu trữ. Hãy ghi rõ thời hạn đó trong tài liệu.
- Việc kiểm tra khoá và ghi kết quả phải **nguyên tử** (ví dụ dùng ràng buộc duy nhất ở cơ sở dữ liệu), nếu không hai yêu cầu đến cùng lúc vẫn có thể lọt cả hai.
- `Idempotency-Key` là một quy ước phổ biến được nhiều dịch vụ dùng và đang được IETF soạn thảo dưới dạng bản nháp, chưa phải RFC hoàn chỉnh tại thời điểm bài này được viết; vì vậy hãy mô tả đúng hành vi của bạn trong tài liệu thay vì giả định mọi client đã biết.

Với PUT và DELETE, bạn đã được idempotent "miễn phí" nếu thiết kế đúng: PUT đặt trạng thái cuối cố định, DELETE xoá thứ đã xoá thì vẫn là "không còn".

## Phiên bản hoá

Sớm muộn bạn sẽ muốn đổi API: đổi tên trường, bỏ một endpoint, thay cấu trúc phản hồi. Nếu có client đang chạy mà bạn không kiểm soát được (ứng dụng di động cài trên máy người dùng chẳng hạn), đổi bừa sẽ làm họ hỏng. Có hai hướng phối hợp:

**1. Ưu tiên thay đổi tương thích ngược.** Thêm trường mới vào phản hồi, thêm endpoint mới, thêm tham số tuỳ chọn thường không phá client (nếu client viết đúng và bỏ qua trường lạ). Đổi tên, đổi kiểu, bỏ trường, đổi ý nghĩa là thay đổi phá vỡ.

**2. Khi buộc phải phá vỡ, ra phiên bản mới.** Các cách đặt số phiên bản thường gặp:

| Cách | Ví dụ | Ghi chú |
|---|---|---|
| Trong đường dẫn | `/v2/orders` | Dễ thấy, dễ định tuyến, dễ thử bằng trình duyệt |
| Trong header | `X-API-Version: 2` hoặc media type riêng | URL sạch hơn nhưng khó thấy và khó thử |
| Tham số truy vấn | `/orders?version=2` | Ít được ưa vì dễ lẫn với tham số lọc |

Không có cách nào "đúng" duy nhất. Cách dùng số phiên bản trong đường dẫn phổ biến vì đơn giản; điều quan trọng hơn là **một chính sách rõ ràng**: khi nào tăng phiên bản, hỗ trợ phiên bản cũ bao lâu, và báo trước thế nào.

## Thông báo ngừng hỗ trợ

Trước khi tắt một endpoint hay phiên bản cũ, hãy báo trước. Về mặt kỹ thuật, header `Sunset` (RFC 8594) cho biết thời điểm một tài nguyên sẽ ngừng hoạt động, và bạn có thể bổ sung `Link` trỏ tới trang hướng dẫn chuyển đổi. Kết hợp với thông báo qua email hoặc bảng tin dành cho nhà phát triển, và theo dõi log xem còn bao nhiêu client gọi phiên bản cũ, bạn sẽ tắt được mà không bất ngờ cho ai.

Đây cũng là nơi quy trình triển khai quan trọng: khi đổi API, hãy triển khai theo cách cho phép chạy song song hai phiên bản và quay lui được, như bài [[Triển khai không gián đoạn và quay lui trong pipeline: rolling, blue/green, canary]] mô tả.

## Tóm lại

- Một dạng lỗi duy nhất, có mã máy đọc được; RFC 9457 là một lựa chọn chuẩn sẵn có.
- Dùng khoá idempotency để thao tác POST quan trọng có thể thử lại an toàn.
- Ưu tiên thay đổi tương thích ngược, đặt số phiên bản khi phải phá vỡ, và báo ngừng hỗ trợ có thời hạn rõ ràng.

## Tham khảo

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 6585: Additional HTTP Status Codes](https://www.rfc-editor.org/rfc/rfc6585.html)
- [RFC 8594: The Sunset HTTP Header Field](https://www.rfc-editor.org/rfc/rfc8594.html)
- [MDN: Idempotent](https://developer.mozilla.org/en-US/docs/Glossary/Idempotent)
