---
title: Object, bucket và key trong object storage: khác tập tin và thư mục ở chỗ nào
tags: object storage, S3, bucket, object key, lưu trữ đám mây
type: note
---

> [!TLDR]
> - Object storage lưu dữ liệu thành các **object** (nội dung + metadata) nằm trong **bucket**, mỗi object được gọi bằng một **key** (một chuỗi), không có cây thư mục thật.
> - "Thư mục" trên giao diện chỉ là cách nhìn theo tiền tố (prefix) và ký tự phân cách `/` trong key.
> - Object được ghi và đọc nguyên khối qua HTTP (PUT, GET, HEAD, DELETE); không sửa giữa chừng, không đổi tên tại chỗ, nên hợp với tệp tĩnh, bản sao lưu, log và dữ liệu lớn hơn là cơ sở dữ liệu.

## Mở đầu

Nếu bạn từng dùng ổ đĩa, thư mục chia sẻ mạng hay máy chủ tệp, bạn quen với ý nghĩ "tệp nằm trong thư mục, thư mục nằm trong thư mục khác". **Object storage** (kho lưu trữ đối tượng) làm việc theo cách khác. Giao thức S3 do Amazon đưa ra đã trở thành cách giao tiếp phổ biến nhất với loại kho này, và nhiều sản phẩm khác (kể cả phần mềm tự dựng trên máy chủ riêng) cũng nói được "giọng S3" ở mức độ khác nhau.

Bài này là bài đầu của chuỗi về object storage và S3. Ta sẽ làm rõ ba từ khoá `object`, `bucket`, `key`, so sánh với tập tin và thư mục, rồi xem vài ví dụ lệnh để thấy mô hình này vận hành thế nào. Các bài sau nói về cách ký yêu cầu và phân quyền, rồi tải lên nhiều phần, vòng đời và chi phí.

## Ba khái niệm: object, bucket, key

### Object

Một **object** gồm:

- **Nội dung** (dữ liệu nhị phân, có thể là ảnh, tệp nén, log, bản sao lưu...).
- **Metadata**: các cặp tên–giá trị đi kèm, ví dụ `Content-Type`, `Cache-Control`, hoặc metadata do bạn tự đặt.
- **Key**: tên định danh của object trong bucket của nó.

Khác với tệp trong hệ thống tệp, object không có "vị trí trên đĩa" mà bạn nhìn thấy, không có quyền kiểu `chmod`, và bạn không mở nó ra để ghi thêm vài byte vào giữa.

### Bucket

**Bucket** là vùng chứa các object ở cấp cao nhất. Một số điểm cần nhớ (theo tài liệu của Amazon S3):

- Tên bucket phải duy nhất trong phạm vi dịch vụ (với S3 của AWS là toàn cục), nên người ta hay thêm một chuỗi ngẫu nhiên vào tên.
- Tên gồm chữ thường, chữ số, dấu chấm và dấu gạch ngang, dài 3 đến 63 ký tự. Các kho S3 tương thích khác có thể đặt luật riêng, hãy xem tài liệu của kho bạn dùng.
- Các thiết lập như chính sách truy cập, quản lý phiên bản (versioning), quy tắc vòng đời được gắn vào bucket.

Bucket **không lồng nhau**: bạn không đặt bucket trong bucket.

### Key

**Key** là một chuỗi ký tự Unicode mã hoá UTF-8, dài tối đa 1.024 byte (theo tài liệu AWS). Cặp (bucket, key) xác định duy nhất một object. Ví dụ:

```text
bucket:  example-media
key:     2026/11/anh-bia.jpg
```

Với key trên, nhiều công cụ sẽ hiển thị như thư mục `2026`, trong đó có thư mục `11`, trong đó có tệp `anh-bia.jpg`. Nhưng thực chất chỉ có **một** object với **một** chuỗi key dài có chứa dấu `/`.

## "Thư mục" chỉ là tiền tố và ký tự phân cách

Khi bạn liệt kê object, API cho phép hai tham số: `prefix` (tiền tố) và `delimiter` (ký tự phân cách, thường là `/`). Kho sẽ:

1. Lọc các key bắt đầu bằng `prefix`.
2. Nếu có `delimiter`, gom những key có cùng đoạn đến lần xuất hiện kế tiếp của `/` thành một "nhóm tiền tố chung" (common prefix), và giao diện hiển thị nhóm đó như một thư mục.

Hệ quả thực tế:

- Tạo "thư mục rỗng" không phải là bắt buộc. Có công cụ tạo một object rỗng có key kết thúc bằng `/` để mô phỏng thư mục, nhưng đó chỉ là quy ước.
- **Đổi tên** hoặc **di chuyển** một "thư mục" nghĩa là sao chép từng object sang key mới rồi xoá key cũ. Nếu có hàng triệu object thì thao tác này tốn thời gian và tốn yêu cầu.
- Hai object `bao-cao/2026.pdf` và `bao-cao` có thể cùng tồn tại, vì chúng chỉ là hai key khác nhau. Trên hệ thống tệp thì điều này không thể xảy ra.

## So sánh nhanh với hệ thống tệp

| Điểm so sánh | Hệ thống tệp / thư mục | Object storage (kiểu S3) |
| --- | --- | --- |
| Cấu trúc | Cây thư mục thật | Phẳng: bucket chứa các key |
| Truy cập | Mở tệp, đọc/ghi từng đoạn | Gọi HTTP: PUT, GET, HEAD, DELETE |
| Sửa nội dung | Ghi đè một phần, thêm cuối tệp | Ghi lại **toàn bộ** object |
| Đổi tên | Một thao tác nhanh | Sao chép sang key mới rồi xoá key cũ |
| Quyền | Người dùng, nhóm, chmod | Chính sách truy cập (policy), khoá truy cập |
| Quy mô | Giới hạn theo ổ/volume | Rất lớn, mở rộng ngang |
| Hợp với | Ứng dụng cần khoá tệp, cơ sở dữ liệu | Ảnh, video, bản sao lưu, log, tệp tĩnh, dữ liệu phân tích |

Vì ghi theo nguyên khối, object storage **không phải là ổ đĩa mạng** để chạy cơ sở dữ liệu hay phần mềm cần ghi nhỏ liên tục. Có công cụ gắn bucket như một thư mục, nhưng đó là lớp giả lập và hiệu năng, độ nhất quán sẽ khác ổ đĩa thật.

## Thử bằng dòng lệnh

Giả sử bạn đã cài AWS CLI phiên bản 2 trên Ubuntu 24.04 và đã đặt khoá truy cập qua `aws configure`. Với kho S3 tương thích tự dựng, thêm `--endpoint-url`. Địa chỉ dưới đây chỉ là ví dụ.

```bash
# Tạo bucket (tên ví dụ; tên thật phải duy nhất)
aws s3 mb s3://example-media --endpoint-url https://s3.example.com

# Tải một tệp lên, đặt key là 2026/11/anh-bia.jpg
aws s3 cp anh-bia.jpg s3://example-media/2026/11/anh-bia.jpg \
  --endpoint-url https://s3.example.com

# Xem như thư mục (dùng prefix + delimiter ngầm)
aws s3 ls s3://example-media/2026/ --endpoint-url https://s3.example.com

# Xem metadata mà không tải nội dung (HEAD)
aws s3api head-object --bucket example-media --key 2026/11/anh-bia.jpg \
  --endpoint-url https://s3.example.com
```

Lệnh `aws s3 ls` hiển thị dòng `PRE 11/`: đó chính là nhóm tiền tố chung chứ không phải một thư mục có thật. Muốn thấy rõ cơ chế, dùng API cấp thấp:

```bash
aws s3api list-objects-v2 --bucket example-media \
  --prefix 2026/ --delimiter / --endpoint-url https://s3.example.com
```

Kết quả JSON có hai phần: `Contents` (object nằm ngay ở mức đó) và `CommonPrefixes` (các "thư mục" con).

> **Cảnh báo:** `aws s3 rm --recursive` và `aws s3 sync --delete` **xoá dữ liệu hàng loạt**. Hãy chạy thử với `--dryrun` trước, và kiểm tra lại bucket cùng prefix đang trỏ tới.

## Một vài tính chất đáng biết

- **Metadata gắn lúc ghi.** Muốn đổi `Content-Type` của object có sẵn, bạn phải sao chép object lên chính nó với metadata mới (thao tác thay metadata), không phải sửa tại chỗ.
- **Phiên bản.** Khi bật versioning, ghi đè hoặc xoá không mất dữ liệu cũ: kho giữ các phiên bản và đánh dấu xoá. Có ích cho việc khôi phục, nhưng làm tăng dung lượng; bài về vòng đời sẽ quay lại điểm này.
- **Nhất quán.** Với Amazon S3 hiện nay, sau khi ghi thành công thì đọc lại sẽ thấy dữ liệu mới. Với kho S3 tương thích khác, hãy xem tài liệu của chúng vì hành vi có thể khác.
- **Đặt tên key.** Dùng ký tự đơn giản (chữ không dấu, số, `-`, `_`, `/`, `.`) để tránh lỗi mã hoá URL ở các công cụ. Đặt ngày hoặc loại dữ liệu vào tiền tố giúp liệt kê và áp quy tắc vòng đời dễ hơn.

## Lỗi hay gặp

- **Coi `/` là thư mục thật** rồi viết kịch bản giả định thao tác đổi tên là tức thì.
- **Quên rằng ghi đè là thay toàn bộ.** Hai tiến trình cùng ghi một key thì kết quả cuối là của người ghi sau; nếu cần chặn, hãy dùng versioning hoặc tên key riêng cho mỗi lần ghi.
- **Đặt tên bucket đoán được** rồi cấp quyền công khai, dẫn đến lộ dữ liệu. Phần chính sách truy cập sẽ nói kỹ trong bài kế tiếp: [[Ký yêu cầu S3, URL có chữ ký tạm và chính sách truy cập bucket]].
- **Lưu mọi thứ vào một bucket** mà không có quy ước tiền tố, về sau khó áp quy tắc theo nhóm dữ liệu.

## Tóm lại

Object storage lưu **object** (nội dung cùng metadata) trong **bucket**, gọi bằng **key**; "thư mục" chỉ là cách nhìn theo tiền tố. Mô hình này đơn giản, mở rộng tốt và hợp với dữ liệu ghi một lần, đọc nhiều. Nhớ hai điều: ghi là thay nguyên khối, và đổi tên là sao chép rồi xoá. Hiểu được vậy thì các bài sau về ký yêu cầu, phân quyền và vòng đời sẽ dễ theo hơn.

## Tham khảo

- [Amazon S3: What is Amazon S3?](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
- [Amazon S3: Naming Amazon S3 objects (object keys)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html)
- [Amazon S3: General purpose bucket naming rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html)
- [Amazon S3: Retaining multiple versions of objects with S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
