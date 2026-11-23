---
title: Phân trang, lọc và sắp xếp trong REST API: offset, cursor và những quy ước nên thống nhất
tags: rest, api, phân trang, cursor, lọc dữ liệu
type: note
---

> [!TLDR]
> - Không bao giờ trả toàn bộ một tập dữ liệu lớn trong một phản hồi; luôn phân trang và đặt giới hạn tối đa.
> - Offset đơn giản nhưng chậm dần và dễ lệch khi dữ liệu thay đổi; cursor ổn định và nhanh hơn với danh sách lớn.
> - Lọc và sắp xếp nên dùng tham số truy vấn có tên nhất quán, và chỉ cho phép những trường đã công bố.

## Mở đầu

Sau khi đã có địa chỉ và phương thức rõ ràng như trong bài đầu của chuỗi (đặt tên tài nguyên, chọn phương thức và mã trạng thái), câu hỏi tiếp theo là: `GET /orders` sẽ trả bao nhiêu đơn hàng? Nếu bảng có vài chục nghìn dòng mà API trả hết một lần, phản hồi sẽ nặng, máy chủ tốn bộ nhớ, và ứng dụng gọi vào phải chờ lâu. Giải pháp là **phân trang** (chia nhỏ), kèm **lọc** (chỉ lấy phần cần) và **sắp xếp** (theo thứ tự mong muốn).

Cả ba đều dùng **tham số truy vấn** (phần sau dấu `?` trong URL). Chuẩn HTTP không quy định tên của các tham số này, nên đây là chỗ bạn phải tự đặt quy ước và giữ nhất quán trên toàn API.

## Phân trang bằng offset

Cách dễ hiểu nhất: nói "bỏ qua bao nhiêu bản ghi, rồi lấy bao nhiêu".

```text
GET https://api.example.com/orders?limit=20&offset=40
```

Đây là trang thứ ba nếu mỗi trang 20 bản ghi (bỏ qua 40, lấy 20). Một biến thể dùng số trang: `?page=3&per_page=20`.

Ưu điểm: dễ làm, dễ nhảy thẳng tới một trang bất kỳ, giao diện có nút "trang 5" thì rất hợp. Nhược điểm cần biết:

- **Chậm dần ở các trang sâu.** Với nhiều cơ sở dữ liệu quan hệ, câu lệnh dạng `OFFSET 100000` vẫn phải đi qua (hoặc đếm) các dòng bị bỏ qua, nên trang càng xa càng tốn.
- **Dễ lệch khi dữ liệu đang thay đổi.** Giả sử bạn đang xem trang 1, rồi có đơn mới được thêm vào đầu danh sách. Khi bạn tải trang 2, một bản ghi cuối trang 1 bị đẩy sang trang 2 và bạn thấy nó hai lần. Ngược lại, nếu có bản ghi bị xoá, bạn có thể bỏ sót một bản ghi.

## Phân trang bằng cursor

Thay vì nói "bỏ qua N dòng", client gửi lại một **con trỏ** (cursor) cho biết "tôi đã đọc tới đâu". Máy chủ trả về cursor của trang kế tiếp cùng dữ liệu:

```text
GET https://api.example.com/orders?limit=20
```

```json
{
  "data": [ { "id": 981, "status": "paid" } ],
  "next_cursor": "eyJpZCI6OTYxfQ"
}
```

Muốn lấy trang sau, client gọi:

```text
GET https://api.example.com/orders?limit=20&cursor=eyJpZCI6OTYxfQ
```

Bên trong, cursor thường mã hoá giá trị của khoá sắp xếp ở bản ghi cuối trang (ví dụ `id` hoặc thời điểm tạo), và máy chủ truy vấn kiểu "lấy các bản ghi có khoá nhỏ hơn giá trị này". Nhờ vậy cơ sở dữ liệu dùng được chỉ mục, tốc độ không phụ thuộc vào độ sâu của trang, và việc thêm bớt bản ghi không làm lặp hay sót.

Đánh đổi: không nhảy thẳng tới "trang 50" được, và việc đếm tổng số bản ghi cần làm riêng. Cursor nên được coi là **chuỗi mờ** (opaque): client chỉ chuyển nguyên văn, không tự phân tích hay tự dựng, để bạn đổi cách mã hoá về sau mà không phá client. Với danh sách cuộn vô hạn (dòng thời gian, nhật ký), cursor thường là lựa chọn tốt hơn.

## Giới hạn và siêu dữ liệu phân trang

Dù chọn cách nào, hãy giữ vài nguyên tắc:

- **Đặt giá trị mặc định cho `limit`** (ví dụ 20) và **giá trị tối đa** (ví dụ 100). Nếu client xin `limit=1000000`, hãy cắt xuống mức tối đa hoặc trả `400`.
- **Cho client biết còn trang nữa không.** Có thể bằng trường `next_cursor` (null khi hết), hoặc bằng header `Link` với `rel="next"` theo RFC 8288, hoặc trường `has_more` trong thân phản hồi.
- **Cân nhắc kỹ trước khi trả tổng số** (`total`). Đếm toàn bộ bảng lớn có thể đắt; nếu giao diện không thật sự cần, hãy bỏ qua hoặc cho client yêu cầu riêng.
- **Giữ thứ tự xác định.** Phân trang chỉ có nghĩa khi thứ tự ổn định. Nếu sắp theo một cột có giá trị trùng nhau (như thời điểm tạo), hãy thêm khoá phụ như `id` để thứ tự không "nhảy".

## Lọc

Cách đơn giản nhất là mỗi trường có thể lọc ứng với một tham số cùng tên:

```text
GET https://api.example.com/orders?status=paid&customer_id=7
```

Khi cần so sánh khoảng, vài quy ước hay gặp là đặt hậu tố tên (`created_after`, `created_before`) hoặc dùng cú pháp có ngoặc (`created[gte]=...`). Cú pháp nào cũng được, miễn là nhất quán. Một số điều nên làm:

- **Chỉ cho lọc trên các trường đã công bố** trong tài liệu, và nên có chỉ mục tương ứng ở cơ sở dữ liệu. Cho phép lọc trên mọi cột là cách nhanh nhất để một yêu cầu vô tình làm chậm cả hệ thống.
- **Kiểm tra giá trị đầu vào.** Đừng ghép trực tiếp tham số vào câu lệnh truy vấn; luôn dùng tham số hoá (prepared statement) để tránh SQL injection.
- **Tham số lạ thì báo lỗi** (`400`) thay vì lặng lẽ bỏ qua; nếu không, client gõ sai tên tham số sẽ tưởng bộ lọc đã chạy trong khi nó không hề có tác dụng.
- Với tìm kiếm văn bản tự do, hãy dùng một tham số riêng như `q`, và nói rõ trong tài liệu nó khớp trên những trường nào.

## Sắp xếp

Quy ước thông dụng là một tham số `sort` chứa tên trường, thêm dấu `-` phía trước để sắp giảm dần:

```text
GET https://api.example.com/orders?sort=-created_at
GET https://api.example.com/orders?sort=status,-created_at
```

Dòng thứ hai nghĩa là sắp theo `status` tăng dần, rồi trong cùng `status` thì theo `created_at` giảm dần. Đây là một quy ước phổ biến chứ không phải chuẩn bắt buộc; bạn cũng có thể dùng `sort=created_at&order=desc`. Điều quan trọng là:

- Chỉ nhận một **danh sách trắng** các trường được phép sắp xếp, vì lý do hiệu năng và bảo mật như với lọc.
- Có thứ tự mặc định rõ ràng khi client không truyền `sort`.
- Với phân trang cursor, kiểu sắp xếp phải khớp với khoá mà cursor mã hoá; nếu cho phép sắp theo nhiều kiểu, cursor phải gắn với kiểu sắp đó.

## Ví dụ kết hợp

```text
GET https://api.example.com/orders?status=paid&sort=-created_at&limit=20
```

Yêu cầu này nghĩa là: lấy các đơn đã thanh toán, mới nhất trước, 20 đơn mỗi trang. Phản hồi hợp lý là `200 OK` với `data` và `next_cursor`. Nếu client truyền `sort=password`, API nên trả `400` kèm thông báo lỗi nói rõ trường đó không được phép; cách trình bày lỗi cho thống nhất sẽ nằm ở bài [[Lỗi thống nhất, idempotency và phiên bản hoá REST API: những quy ước giúp API sống lâu]].

## Tóm lại

- Luôn phân trang với giới hạn mặc định và tối đa.
- Chọn offset khi cần nhảy trang và dữ liệu ít đổi; chọn cursor cho danh sách lớn, thay đổi liên tục.
- Đặt tên tham số lọc và sắp xếp nhất quán, chỉ cho phép trường đã công bố, và kiểm tra mọi đầu vào.

## Tham khảo

- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 8288: Web Linking](https://www.rfc-editor.org/rfc/rfc8288.html)
- [MDN: Mã trạng thái phản hồi HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
