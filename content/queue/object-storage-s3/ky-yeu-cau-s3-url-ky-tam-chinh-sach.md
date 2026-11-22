---
title: Ký yêu cầu S3, URL có chữ ký tạm và chính sách truy cập bucket
tags: S3, SigV4, presigned URL, bucket policy, kiểm soát truy cập
type: note
---

> [!TLDR]
> - Mỗi yêu cầu S3 gửi đi phải được **ký** bằng khoá bí mật theo AWS Signature Version 4; máy chủ tính lại chữ ký để xác minh, khoá bí mật không đi qua mạng.
> - **URL có chữ ký tạm** (presigned URL) cho người khác tải lên hoặc tải xuống một object cụ thể trong thời gian ngắn mà không cần đưa khoá cho họ.
> - Quyền được quyết định bằng **chính sách** (policy) JSON: ai, được làm gì, trên tài nguyên nào; mặc định từ chối, cấp quyền tối thiểu và chặn truy cập công khai nếu không cần.

## Mở đầu

Bài trước của chuỗi cho thấy object storage được truy cập qua HTTP. Câu hỏi tiếp theo là: làm sao kho biết ai đang gọi và người đó có được phép không? Bài này giải thích ba việc: yêu cầu được ký thế nào, tạo URL có chữ ký tạm để chia sẻ một object, và viết chính sách truy cập cho bucket. Ví dụ dùng AWS CLI 2 trên Ubuntu 24.04; địa chỉ chỉ là ví dụ.

## Yêu cầu S3 được ký thế nào

Để gọi S3 bạn cần một cặp **khoá truy cập** (access key ID, công khai như tên đăng nhập) và **khoá bí mật** (secret access key). Công cụ như AWS CLI hay SDK dùng khoá bí mật để **ký** từng yêu cầu theo **AWS Signature Version 4 (SigV4)**. Ý chính của quy trình:

1. Dựng một chuỗi "yêu cầu chuẩn hoá" (canonical request) từ phương thức HTTP, đường dẫn, tham số truy vấn, các header được ký và băm nội dung.
2. Dựng "chuỗi cần ký" (string to sign) gồm thuật toán, thời điểm, phạm vi (ngày, vùng, dịch vụ) và băm của yêu cầu chuẩn hoá.
3. Tính **khoá ký** bằng chuỗi HMAC-SHA256 từ khoá bí mật, ngày, vùng, tên dịch vụ và chữ `aws4_request`, rồi ký chuỗi ở bước 2.
4. Gắn chữ ký vào header `Authorization` (hoặc vào tham số truy vấn, như ở URL có chữ ký tạm bên dưới).

Máy chủ có khoá bí mật của bạn, nên tự làm lại các bước trên; hai chữ ký khớp thì yêu cầu hợp lệ. Nhờ vậy **khoá bí mật không bao giờ được gửi đi**, và nếu ai đó sửa yêu cầu (ví dụ đổi key) thì chữ ký không còn khớp. Thời điểm nằm trong chữ ký, nên máy khách lệch đồng hồ quá nhiều sẽ bị từ chối (thường kèm lỗi `RequestTimeTooSkewed`).

Bạn hiếm khi phải tự ký, nhưng hiểu cơ chế giúp đọc lỗi `SignatureDoesNotMatch`: thường do sai khoá, sai vùng (region), sai endpoint, hoặc proxy đã sửa header trước khi tới kho.

Cấu hình khoá cho CLI (khoá mẫu, không dùng khoá thật khi viết tài liệu):

```bash
aws configure
# AWS Access Key ID: (khoá truy cập của bạn)
# AWS Secret Access Key: (khoá bí mật của bạn)
# Default region name: us-east-1
```

> **Lưu ý an toàn:** không đưa khoá vào kho mã, ảnh chụp màn hình hay tin nhắn. Hãy cấp khoá cho từng ứng dụng với quyền riêng và xoay vòng khi nghi ngờ lộ.

## URL có chữ ký tạm (presigned URL)

Giả sử người dùng cần tải một báo cáo từ bucket riêng tư. Bạn không muốn công khai bucket, cũng không muốn đưa khoá. Giải pháp: dùng khoá của bạn **ký sẵn** một yêu cầu GET cho đúng object đó, đặt thời hạn, rồi đưa URL kết quả cho người dùng. Ai có URL, trong thời hạn, đều thực hiện được **đúng thao tác đó** với **đúng object đó**.

Với AWS CLI:

```bash
aws s3 presign s3://example-media/bao-cao/2026-11.pdf \
  --expires-in 600 \
  --endpoint-url https://s3.example.com
```

Kết quả là một URL dài, trong đó có các tham số như `X-Amz-Algorithm`, `X-Amz-Credential`, `X-Amz-Date`, `X-Amz-Expires`, `X-Amz-SignedHeaders` và `X-Amz-Signature`. Tham số `X-Amz-Expires` là số giây URL còn hiệu lực (ở đây 600 giây, tức 10 phút). Với SigV4, thời hạn tối đa là 7 ngày; và nếu bạn ký bằng thông tin xác thực tạm thời thì URL còn bị giới hạn bởi thời hạn của thông tin đó.

Để cho phép **tải lên**, URL cần được ký cho phương thức PUT. Lệnh `aws s3 presign` mặc định chỉ tạo URL GET, nên với PUT bạn dùng SDK (hầu hết đều có hàm tạo presigned URL cho PUT), rồi máy khách gửi `PUT` kèm nội dung tới URL đó.

Những điều cần nhớ:

- **URL là một "chìa khoá tạm"**: ai có nó đều dùng được. Đừng ghi vào log và đừng gửi qua kênh không tin cậy.
- Đặt thời hạn **ngắn nhất đủ dùng**.
- Quyền của URL không vượt quá quyền của người ký: nếu tài khoản ký không có quyền đọc object, URL cũng vô dụng.
- Các header được ký (như `Content-Type` khi tải lên) phải khớp khi máy khách gửi, nếu không sẽ báo lỗi chữ ký.

Kiểm tra URL bằng `curl` (chỉ dùng cho object bạn có quyền):

```bash
curl -sS -o bao-cao.pdf "<URL đã tạo>"
```

Sau khi hết hạn, cùng lệnh sẽ trả về lỗi `AccessDenied` (mã 403) kèm thông báo yêu cầu đã hết hạn.

## Chính sách truy cập bucket

Có nhiều lớp kiểm soát; hai lớp thường gặp là:

- **Chính sách danh tính** (identity policy): gắn vào người dùng, nhóm hay vai trò, nói "danh tính này được làm gì".
- **Chính sách bucket** (bucket policy): gắn vào bucket, nói "ai được làm gì với bucket và object trong nó".

Cả hai đều là tài liệu JSON. Nguyên tắc chung (theo mô hình của AWS): mặc định mọi truy cập bị **từ chối**; một câu lệnh `Allow` mở quyền; một câu lệnh `Deny` thắng mọi `Allow`.

Một chính sách mẫu chỉ cho phép đọc object có tiền tố `public-assets/` và chỉ với kết nối mã hoá (HTTPS). Tên tài khoản, vai trò và bucket chỉ để minh hoạ:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadAssetsOverTLSOnly",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::example-media/public-assets/*",
      "Condition": { "Bool": { "aws:SecureTransport": "true" } }
    }
  ]
}
```

Các thành phần: `Effect` (Allow hoặc Deny), `Principal` (đối tượng; `*` là mọi người, hãy cân nhắc kỹ), `Action` (thao tác như `s3:GetObject`, `s3:PutObject`, `s3:ListBucket`), `Resource` (ARN của bucket hoặc object) và `Condition` (điều kiện bổ sung). Lưu ý `s3:ListBucket` áp lên **bucket** (`arn:aws:s3:::example-media`), còn `s3:GetObject` áp lên **object** (có `/*`).

Gắn chính sách bằng CLI:

```bash
aws s3api put-bucket-policy --bucket example-media --policy file://policy.json \
  --endpoint-url https://s3.example.com
```

> **Cảnh báo:** một chính sách sai có thể khoá chính bạn khỏi bucket hoặc mở dữ liệu cho cả internet. Hãy thử trên bucket thử nghiệm, và kiểm tra lại bằng tài khoản không có đặc quyền.

Amazon S3 còn có cơ chế **Block Public Access** để chặn việc mở công khai do nhầm lẫn; nên để bật trừ khi bạn thực sự cần phục vụ nội dung công khai. Kho S3 tương thích khác có thể hỗ trợ một phần chính sách; hãy xem tài liệu của kho bạn dùng.

## Kiểm tra và lỗi hay gặp

- **403 `AccessDenied` khi đọc object**: kiểm tra chính sách danh tính, chính sách bucket và xem có câu `Deny` nào không.
- **`SignatureDoesNotMatch`**: kiểm tra khoá, region, endpoint và xem có thành phần trung gian sửa header; nếu lỗi là `RequestTimeTooSkewed` thì chỉnh lại đồng hồ máy.
- **`AccessDenied` với URL ký sẵn dù chưa hết hạn**: người ký không đủ quyền, hoặc thông tin xác thực tạm thời đã hết hạn trước URL.
- **Quên `/*` ở Resource** khi cấp quyền cho object.
- **Dùng `Principal: "*"` cùng `s3:*`**: gần như luôn quá rộng.

## Tóm lại

Mỗi yêu cầu S3 được ký bằng SigV4 để kho xác minh danh tính mà không nhận khoá bí mật. URL có chữ ký tạm cho phép chia sẻ một thao tác trên một object trong thời gian ngắn. Chính sách JSON quyết định ai được làm gì; hãy cấp quyền tối thiểu và giữ chặn truy cập công khai. Phần tiếp theo trong chuỗi là cách xử lý tệp lớn và chi phí: [[Tải lên nhiều phần, vòng đời đối tượng và cách tính chi phí object storage]].

## Tham khảo

- [Amazon S3: Authenticating requests with Signature Version 4 (query string)](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html)
- [Amazon S3: Sharing objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html)
- [AWS CLI: aws s3 presign](https://docs.aws.amazon.com/cli/latest/reference/s3/presign.html)
- [Amazon S3: Policies and permissions in Amazon S3 (policy language overview)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-policy-language-overview.html)
