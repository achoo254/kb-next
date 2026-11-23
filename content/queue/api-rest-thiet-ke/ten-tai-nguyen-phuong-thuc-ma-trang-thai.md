---
title: Thiết kế REST API: đặt tên tài nguyên, chọn phương thức HTTP và mã trạng thái cho đúng
tags: rest, api, http, thiết kế api, mã trạng thái
type: note
---

> [!TLDR]
> - URL của REST API nên là danh từ chỉ tài nguyên (số nhiều), còn hành động nằm ở phương thức HTTP.
> - GET, PUT và DELETE là idempotent; POST và PATCH thì không mặc định như vậy.
> - Mã trạng thái cho client biết chuyện gì đã xảy ra: 2xx thành công, 4xx lỗi do bên gọi, 5xx lỗi do máy chủ.

## Mở đầu

Khi bạn xây một API để ứng dụng di động, trang web hay một dịch vụ khác gọi vào, điều khó nhất thường không phải là viết code, mà là **đặt ra quy ước** sao cho người khác đoán được cách dùng mà không phải hỏi bạn. Bài này nói về ba quy ước nền tảng của một REST API chạy trên HTTP: cách đặt tên tài nguyên trong URL, cách chọn phương thức HTTP, và cách chọn mã trạng thái trả về.

Lưu ý nhỏ: "REST" là một phong cách kiến trúc, không phải một chuẩn có kiểm định. Phần lớn API gọi là REST ngoài đời thực chỉ tuân theo một phần của phong cách đó. Vì vậy mục tiêu thực tế của bài là **nhất quán và dễ đoán**, còn hành vi của từng phương thức và mã trạng thái thì đã được chuẩn HTTP mô tả rõ (RFC 9110), nên bạn nên bám theo.

## Đặt tên tài nguyên

Một **tài nguyên** là một "thứ" mà API quản lý: người dùng, đơn hàng, hoá đơn, tệp tải lên. Mỗi tài nguyên có một địa chỉ (URL). Vài quy ước phổ biến giúp địa chỉ dễ đọc:

- **Dùng danh từ, không dùng động từ.** `/users` thay vì `/getUsers`. Hành động đã được thể hiện bằng phương thức HTTP.
- **Dùng số nhiều cho tập hợp.** `/orders` là danh sách đơn hàng, `/orders/42` là một đơn cụ thể. Chọn số nhiều hay số ít đều được, miễn là cả API dùng thống nhất.
- **Lồng tài nguyên khi có quan hệ sở hữu rõ ràng.** `/orders/42/items` là các dòng hàng của đơn 42. Đừng lồng quá hai ba tầng; khi đó hãy cho tài nguyên con một địa chỉ riêng như `/items/9`.
- **Chữ thường, ngăn cách bằng dấu gạch ngang.** `/order-items` dễ đọc hơn `/OrderItems`. Địa chỉ nên ổn định theo thời gian.
- **Không đưa thông tin nhạy cảm vào URL**, vì URL có thể nằm trong log của máy chủ, proxy và lịch sử trình duyệt.

Có những thao tác không giống "thêm, sửa, xoá" một bản ghi, ví dụ "huỷ đơn hàng" hay "gửi lại email xác nhận". Có hai cách xử lý thường gặp. Cách thứ nhất là coi kết quả là một tài nguyên mới: `POST /orders/42/cancellations`. Cách thứ hai là chấp nhận một "động từ" ở cuối đường dẫn: `POST /orders/42/cancel`. Cách sau gọn hơn nhưng lệch khỏi quy ước danh từ; chọn cách nào cũng được, hãy ghi rõ trong tài liệu và dùng nhất quán.

## Chọn phương thức HTTP

Phương thức cho biết bạn muốn làm gì với tài nguyên. Chuẩn HTTP (RFC 9110) định nghĩa hai tính chất đáng nhớ:

- **Safe (an toàn):** phương thức chỉ để đọc, không làm đổi trạng thái trên máy chủ. GET, HEAD và OPTIONS thuộc nhóm này.
- **Idempotent:** gọi một lần hay gọi nhiều lần liên tiếp với cùng nội dung thì trạng thái cuối cùng trên máy chủ như nhau. GET, HEAD, OPTIONS, PUT và DELETE là idempotent; POST và PATCH thì không được đảm bảo như vậy theo mặc định.

| Phương thức | Dùng để | Ví dụ |
|---|---|---|
| GET | Đọc một tài nguyên hoặc danh sách | `GET /orders/42` |
| POST | Tạo mới, hoặc kích hoạt một thao tác | `POST /orders` |
| PUT | Thay thế toàn bộ một tài nguyên | `PUT /orders/42` |
| PATCH | Sửa một phần tài nguyên | `PATCH /orders/42` |
| DELETE | Xoá một tài nguyên | `DELETE /orders/42` |

Vài điểm hay bị nhầm:

- **Không đổi dữ liệu bằng GET.** Trình duyệt, proxy và công cụ thu thập có thể gọi GET tự do (để làm nóng bộ nhớ đệm, xem trước liên kết). Nếu `GET /orders/42/delete` xoá dữ liệu, bạn sẽ gặp sự cố rất khó giải thích.
- **PUT và PATCH khác nhau.** PUT gửi toàn bộ biểu diễn mới của tài nguyên; trường nào thiếu có thể bị coi là xoá. PATCH chỉ gửi phần cần đổi.
- **DELETE idempotent nghĩa là gì?** Xoá đơn 42 hai lần thì sau cả hai lần, đơn 42 đều không còn. Lần hai có thể trả `404`; điều đó không vi phạm tính idempotent, vì tính chất này nói về trạng thái trên máy chủ chứ không phải về mã trả về.
- **POST là phương thức "đa dụng".** Vì không idempotent mặc định, gọi lại POST khi mạng chập chờn có thể tạo ra hai đơn hàng. Bài [[Phân trang, lọc và sắp xếp trong REST API: offset, cursor và những quy ước nên thống nhất]] nói tiếp về cách đọc danh sách, còn chuyện chống tạo trùng được bàn ở bài cuối của chuỗi này.

## Chọn mã trạng thái

Mã trạng thái là ba chữ số ở dòng đầu của phản hồi. Chỉ cần nhớ nhóm trước:

- **2xx:** thành công.
- **3xx:** chuyển hướng hoặc "không đổi" (ví dụ `304 Not Modified`).
- **4xx:** lỗi do bên gọi (client) gửi yêu cầu chưa đúng.
- **5xx:** lỗi do máy chủ.

Các mã dùng nhiều nhất trong API:

| Mã | Ý nghĩa | Khi nào dùng |
|---|---|---|
| 200 OK | Thành công, có nội dung trả về | GET, PUT, PATCH thành công |
| 201 Created | Đã tạo tài nguyên mới | POST tạo mới; nên kèm header `Location` trỏ tới tài nguyên vừa tạo |
| 204 No Content | Thành công, không có nội dung | DELETE thành công |
| 400 Bad Request | Yêu cầu sai cú pháp | JSON hỏng, thiếu tham số bắt buộc |
| 401 Unauthorized | Chưa xác thực hoặc thông tin xác thực sai | Thiếu hoặc hết hạn token |
| 403 Forbidden | Đã xác thực nhưng không đủ quyền | Người dùng không được xem tài nguyên này |
| 404 Not Found | Không tìm thấy | Địa chỉ hoặc id không tồn tại |
| 405 Method Not Allowed | Phương thức không hỗ trợ ở địa chỉ này | `DELETE /orders` khi API không cho phép; nên kèm header `Allow` |
| 409 Conflict | Xung đột với trạng thái hiện tại | Tạo bản ghi trùng khoá duy nhất |
| 422 Unprocessable Content | Cú pháp đúng nhưng nội dung không hợp lệ | Email sai định dạng, số lượng âm |
| 429 Too Many Requests | Gọi quá nhiều | Vượt giới hạn tốc độ (định nghĩa ở RFC 6585) |
| 500 Internal Server Error | Lỗi không lường trước ở máy chủ | Ngoại lệ chưa xử lý |
| 503 Service Unavailable | Tạm thời không phục vụ được | Bảo trì, quá tải |

Hai cặp dễ nhầm nhất là **401 và 403** (401: "tôi chưa biết bạn là ai"; 403: "tôi biết bạn, nhưng bạn không được phép") và **400 và 422** (400: yêu cầu không đọc được; 422: đọc được nhưng giá trị không hợp lệ). Nhiều API gộp 400 và 422 làm một, điều đó chấp nhận được nếu bạn nhất quán.

Đừng trả `200 OK` kèm nội dung `{"error": "..."}` cho một lỗi. Công cụ giám sát, bộ nhớ đệm và thư viện client đều dựa vào mã trạng thái để đoán chuyện gì đã xảy ra; trả sai mã khiến mọi thứ phía sau hiểu sai.

## Ví dụ nhỏ

Giả sử bạn tạo một đơn hàng rồi đọc lại (địa chỉ dùng tên miền ví dụ):

```text
POST https://api.example.com/orders
Content-Type: application/json

{"customerId": 7, "items": [{"sku": "A-100", "quantity": 2}]}
```

Phản hồi hợp lý:

```text
HTTP/1.1 201 Created
Location: https://api.example.com/orders/42
Content-Type: application/json

{"id": 42, "status": "pending"}
```

Sau đó `GET /orders/42` trả `200`, `DELETE /orders/42` trả `204`, và gọi `GET /orders/42` lần nữa trả `404`. Chuỗi mã này đủ để client hiểu toàn bộ vòng đời mà không cần đọc thêm gì.

## Tóm lại

- Đặt tên tài nguyên bằng danh từ, thống nhất số nhiều, lồng tối đa vài tầng.
- Để phương thức HTTP thể hiện hành động; hiểu rõ phương thức nào safe và idempotent.
- Trả mã trạng thái đúng nhóm; đừng giấu lỗi trong thân phản hồi `200`.

Quy ước nào cũng là một cam kết với người dùng API. Hãy chọn ít, chọn rõ, ghi vào tài liệu và giữ nguyên.

## Tham khảo

- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 6585: Additional HTTP Status Codes](https://www.rfc-editor.org/rfc/rfc6585.html)
- [MDN: Mã trạng thái phản hồi HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [MDN: Idempotent](https://developer.mozilla.org/en-US/docs/Glossary/Idempotent)
