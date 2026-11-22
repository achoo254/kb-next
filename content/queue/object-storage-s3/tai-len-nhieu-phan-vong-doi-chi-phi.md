---
title: Tải lên nhiều phần, vòng đời đối tượng và cách tính chi phí object storage
tags: S3, multipart upload, lifecycle, chi phí lưu trữ, object storage
type: note
---

> [!TLDR]
> - Tệp lớn nên tải lên **nhiều phần** (multipart upload): chia nhỏ, gửi song song, thử lại từng phần; nhớ dọn các lần tải dang dở.
> - **Quy tắc vòng đời** (lifecycle) tự xoá object cũ, chuyển sang lớp lưu trữ rẻ hơn và dọn phần tải dang dở, để dung lượng không phình ra mãi.
> - Chi phí thường gồm dung lượng lưu, số yêu cầu, dữ liệu đi ra ngoài và phí đặc thù của từng lớp lưu trữ; hãy đọc bảng giá của nhà cung cấp thay vì nhớ con số.

## Mở đầu

Sau khi biết object và key là gì, cũng như cách ký yêu cầu và phân quyền, còn ba câu hỏi thực tế: làm sao tải lên một tệp vài chục gigabyte một cách đáng tin cậy? làm sao để dữ liệu cũ không tích tụ mãi? và hoá đơn gồm những khoản nào? Bài này trả lời lần lượt, với ví dụ AWS CLI 2 trên Ubuntu 24.04. Địa chỉ và tên bucket chỉ để minh hoạ.

## Tải lên nhiều phần

Một yêu cầu PUT đơn lẻ có giới hạn kích thước (5 GB theo tài liệu của Amazon S3), và tệp lớn gửi trong một luồng duy nhất rất dễ hỏng giữa chừng. **Multipart upload** giải quyết việc này:

1. **Khởi tạo**: kho trả về một `UploadId`.
2. **Gửi từng phần** (kèm số thứ tự), có thể song song; phần nào lỗi thì chỉ gửi lại phần đó.
3. **Hoàn tất**: bạn gửi danh sách các phần (số thứ tự và ETag), kho ghép chúng thành một object.

Theo tài liệu của Amazon S3, một lần tải có tối đa 10.000 phần, mỗi phần từ 5 MiB đến 5 GiB (phần cuối có thể nhỏ hơn 5 MiB). Kho S3 tương thích khác có thể đặt giới hạn riêng.

### AWS CLI làm sẵn

Lệnh `aws s3 cp` và `aws s3 sync` tự chuyển sang multipart khi tệp vượt một ngưỡng. Hai thiết lập liên quan là `multipart_threshold` và `multipart_chunksize`. Bạn chỉnh bằng:

```bash
aws configure set default.s3.multipart_threshold 64MB
aws configure set default.s3.multipart_chunksize 16MB
```

Với 16 MB mỗi phần và giới hạn 10.000 phần, bạn có thể tải tệp tới khoảng 160.000 MB; tệp lớn hơn cần phần lớn hơn.

### Làm từng bước bằng API cấp thấp

Cách này giúp hiểu cơ chế và xử lý các lần tải dang dở:

```bash
# 1. Khởi tạo, ghi lại UploadId trong kết quả
aws s3api create-multipart-upload --bucket example-media \
  --key sao-luu/db-2026-11.tar.zst --endpoint-url https://s3.example.com

# 2. Gửi phần 1 (đã tách tệp thành các phần, ví dụ bằng split)
aws s3api upload-part --bucket example-media --key sao-luu/db-2026-11.tar.zst \
  --part-number 1 --body phan-001 --upload-id "<UploadId>" \
  --endpoint-url https://s3.example.com
# (ghi lại ETag mỗi phần trả về, lặp lại cho các phần khác)

# 3. Hoàn tất với danh sách phần
aws s3api complete-multipart-upload --bucket example-media \
  --key sao-luu/db-2026-11.tar.zst --upload-id "<UploadId>" \
  --multipart-upload file://parts.json --endpoint-url https://s3.example.com
```

Tệp `parts.json` có dạng:

```json
{
  "Parts": [
    { "PartNumber": 1, "ETag": "\"etag-phan-1\"" },
    { "PartNumber": 2, "ETag": "\"etag-phan-2\"" }
  ]
}
```

Vài lưu ý:

- **ETag của object multipart không phải MD5 của nội dung.** Với Amazon S3 nó thường có dạng "băm của các băm" kèm hậu tố `-<số phần>`, nên đừng dùng nó để so khớp tệp gốc. Nếu cần kiểm toàn vẹn, hãy dùng tổng kiểm (checksum) mà dịch vụ hỗ trợ, hoặc tự lưu băm riêng.
- **Phần đã gửi nhưng chưa hoàn tất vẫn chiếm dung lượng và vẫn tính phí lưu.** Đây là khoản "rò rỉ" hay bị quên.

Xem và huỷ các lần tải dang dở:

```bash
aws s3api list-multipart-uploads --bucket example-media --endpoint-url https://s3.example.com
aws s3api abort-multipart-upload --bucket example-media \
  --key sao-luu/db-2026-11.tar.zst --upload-id "<UploadId>" \
  --endpoint-url https://s3.example.com
```

> **Cảnh báo:** `abort-multipart-upload` xoá vĩnh viễn các phần đã gửi của lần tải đó. Hãy chắc UploadId đúng và lần tải không còn cần.

## Vòng đời đối tượng (lifecycle)

**Quy tắc vòng đời** là cấu hình gắn vào bucket để kho tự làm việc theo thời gian. Các hành động thường gặp:

- **Expiration**: xoá object sau N ngày (hoặc vào một ngày cụ thể).
- **Transition**: chuyển sang lớp lưu trữ rẻ hơn khi dữ liệu ít được đọc (tên lớp tuỳ nhà cung cấp).
- **Noncurrent version expiration**: xoá các phiên bản cũ khi bucket bật versioning.
- **Abort incomplete multipart upload**: dọn các lần tải dang dở sau N ngày.

Quy tắc áp theo **bộ lọc**, thường là tiền tố hoặc thẻ (tag), nên đặt key có quy ước từ đầu (như bài đầu của chuỗi đã nói) sẽ giúp ích. Ví dụ: log ở `logs/` giữ 30 ngày rồi xoá, và mọi lần tải dang dở quá 7 ngày bị dọn.

```json
{
  "Rules": [
    {
      "ID": "xoa-log-sau-30-ngay",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Expiration": { "Days": 30 }
    },
    {
      "ID": "don-phan-tai-do-dang",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration --bucket example-media \
  --lifecycle-configuration file://lifecycle.json --endpoint-url https://s3.example.com
```

> **Cảnh báo:** quy tắc Expiration **xoá dữ liệu thật**, và việc xoá diễn ra tự động, không hỏi lại. Kiểm tra kỹ bộ lọc (một tiền tố rỗng áp cho cả bucket), thử trên bucket thử nghiệm, và cân nhắc bật versioning để có đường lùi. Việc này cũng liên quan đến yêu cầu lưu trữ và xoá dữ liệu cá nhân đúng hạn, như đã nêu ở [[Làm gì về kỹ thuật để tuân thủ Luật 91/2025/QH15: phân loại, mã hoá, nhật ký, xoá dữ liệu và thông báo sự cố]].

Vòng đời được xử lý **bất đồng bộ**: object không nhất thiết biến mất đúng khoảnh khắc đến hạn. Cũng nên xem lại quy tắc khi đổi cách đặt key.

## Cách tính chi phí

Bảng giá khác nhau giữa nhà cung cấp và thay đổi theo thời gian, nên ở đây chỉ nêu **các khoản thường gặp** để bạn biết hỏi gì:

| Khoản | Ý nghĩa |
| --- | --- |
| Dung lượng lưu | Tính theo GB mỗi tháng, giá phụ thuộc lớp lưu trữ. Gồm cả phiên bản cũ và phần multipart dang dở. |
| Yêu cầu | Mỗi lệnh PUT, COPY, LIST, GET... tính theo số lượng; thường mỗi loại một giá. Hàng triệu object nhỏ có thể tốn nhiều tiền yêu cầu. |
| Dữ liệu đi ra | Tải dữ liệu ra internet (hoặc sang vùng khác) thường tính theo GB; dữ liệu đi vào thường miễn phí hoặc rẻ. |
| Lớp lưu trữ lạnh | Rẻ hơn khi lưu nhưng có thể có phí lấy lại dữ liệu, thời gian lưu tối thiểu và độ trễ khi truy xuất. |
| Tính năng thêm | Sao chép giữa vùng, kiểm kê, phân tích, mã hoá bằng khoá quản lý riêng... |

Cách ước tính thực dụng cho một khối dữ liệu:

1. Ước lượng dung lượng trung bình mỗi tháng (kể cả phiên bản cũ).
2. Đếm số yêu cầu mỗi loại (ghi nhiều hay đọc nhiều).
3. Ước lượng lưu lượng đi ra.
4. Nhân với giá niêm yết của nhà cung cấp, rồi cộng thêm một khoản dự phòng.

Mẹo giảm chi phí không đổi chức năng: dọn phần multipart dang dở, đặt hạn cho dữ liệu tạm và log, nén trước khi tải, gom nhiều tệp rất nhỏ thành tệp lớn hơn khi hợp lý, và đặt dữ liệu gần nơi dùng để giảm lưu lượng ra ngoài. Nếu tự vận hành kho S3 tương thích, chi phí chuyển sang phần cứng, điện, băng thông và công vận hành, nhưng tư duy "dung lượng, yêu cầu, truyền dữ liệu" vẫn áp dụng.

## Lỗi hay gặp

- **Bỏ quên các lần tải dang dở** và thấy dung lượng tăng không giải thích được.
- **Đặt quy tắc Expiration quá rộng** và xoá nhầm dữ liệu.
- **So ETag với MD5** của tệp multipart rồi tưởng tệp hỏng.
- **Chọn lớp lưu trữ lạnh cho dữ liệu hay đọc**, phí lấy lại có thể vượt khoản tiết kiệm.
- **Không tính phí truyền dữ liệu ra** khi thiết kế hệ thống phục vụ nhiều người dùng.

## Tóm lại

Tải nhiều phần giúp truyền tệp lớn ổn định, nhưng phải dọn phần dang dở. Quy tắc vòng đời giữ bucket gọn và có kỷ luật về thời hạn lưu dữ liệu, với điều kiện bộ lọc đúng. Chi phí là tổ hợp của dung lượng, yêu cầu, dữ liệu đi ra và đặc thù từng lớp; hãy luôn đối chiếu bảng giá hiện hành của nhà cung cấp trước khi quyết định.

## Tham khảo

- [Amazon S3: Uploading and copying objects using multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [Amazon S3: Configuring a bucket lifecycle configuration to delete incomplete multipart uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html)
- [Amazon S3: Managing the lifecycle of objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
- [AWS CLI: S3 configuration (multipart_threshold, multipart_chunksize)](https://docs.aws.amazon.com/cli/latest/topic/s3-config.html)
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)
