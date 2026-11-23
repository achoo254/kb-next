---
title: Phễu nhà phát triển: từ biết đến, dùng thử, tích hợp đến trả tiền
tags: marketing kỹ thuật, phễu nhà phát triển, onboarding, tích hợp, API
type: note
---

> [!TLDR]
> - Phễu nhà phát triển có bốn chặng: biết đến, dùng thử, tích hợp và trả tiền; mỗi chặng cần một loại nội dung khác.
> - Chặng đáng chú ý nhất thường là từ dùng thử sang tích hợp, nơi người dùng thật sự đưa sản phẩm vào hệ thống của họ.
> - Đo từng chặng bằng sự kiện cụ thể, không dùng một con số chung chung.

## Mở đầu

"Phễu" là cách mô tả hành trình của một người từ lúc chưa biết sản phẩm đến lúc trở thành khách hàng. Với sản phẩm dành cho nhà phát triển, hành trình này có những đặc thù riêng: người ta thử bằng mã chứ không bằng cuộc gọi bán hàng, và giá trị thật chỉ lộ ra khi sản phẩm nằm trong hệ thống của họ. Bài này chia phễu thành bốn chặng, nêu điều người dùng cần ở mỗi chặng và cách theo dõi. Đây là một mô hình để suy nghĩ, không phải công thức cố định, và tên gọi các chặng có thể khác nhau tuỳ nơi.

Bài nối tiếp bài trước trong chuỗi, nơi đã giải thích vì sao kỹ sư cần tự kiểm chứng.

## Chặng 1: biết đến

Ở chặng này, một kỹ sư gặp tên sản phẩm lần đầu, thường là khi đang tìm cách giải quyết một vấn đề cụ thể. Họ tìm kiếm lỗi, đọc một bài kỹ thuật, thấy một thư viện trong kho mã của người khác hay nghe đồng nghiệp nhắc đến.

Điều người dùng cần: một câu trả lời hữu ích cho vấn đề họ đang có, chứ chưa phải lời giới thiệu sản phẩm. Vì vậy nội dung hiệu quả ở chặng này thường là bài giải thích vấn đề, hướng dẫn xử lý lỗi, so sánh trung thực giữa các cách làm. Sản phẩm xuất hiện như một lựa chọn trong câu chuyện, không phải nhân vật chính.

Cách theo dõi: lượt đọc các bài nội dung, nguồn truy cập, số người tìm đến tài liệu từ công cụ tìm kiếm.

## Chặng 2: dùng thử

Chặng này bắt đầu khi người đọc quyết định "thử xem sao". Họ tạo tài khoản, cài thư viện hoặc gọi API lần đầu. Việc cần làm là rút ngắn quãng đường đến kết quả đầu tiên: hướng dẫn bắt đầu nhanh, khoá thử, ví dụ chạy được và thông báo lỗi dễ hiểu.

Điểm hay bị bỏ qua: lỗi trong lần chạy đầu tiên là lúc người dùng dễ bỏ đi nhất. Một thông báo lỗi nói rõ nguyên nhân và cách sửa có giá trị marketing hơn một trang chủ bóng bẩy.

Cách theo dõi: số tài khoản được tạo, tỉ lệ người chạy được lời gọi hay lệnh đầu tiên thành công, thời gian từ lúc tạo tài khoản đến lúc đó.

## Chặng 3: tích hợp

Dùng thử mới chỉ là thử nghiệm. Tích hợp là khi sản phẩm được đưa vào mã thật, vào quy trình triển khai thật, thường có thêm người khác trong nhóm tham gia. Chặng này đòi hỏi những thứ mà ví dụ nhập môn không trả lời được:

- Tài liệu tra cứu đầy đủ, nêu giới hạn, hạn mức và mã lỗi.
- Hướng dẫn cho các tình huống thật: xác thực, xử lý lỗi, thử lại, phân trang, phiên bản API.
- Chính sách tương thích: khi nào sản phẩm đổi và đổi thế nào. Chính sách phiên bản rõ ràng, ví dụ theo Semantic Versioning, giúp người tích hợp biết một bản nâng cấp có thể làm hỏng mã của họ hay không.
- Nhật ký thay đổi (changelog) để theo kịp các bản phát hành.
- Kênh hỗ trợ trả lời được câu hỏi kỹ thuật.

Cách theo dõi: số dự án gọi API đều đặn qua nhiều ngày, số loại lời gọi khác nhau được dùng, số người cùng một tổ chức tham gia. Đây là các tín hiệu tốt hơn một lần đăng nhập đơn lẻ.

## Chặng 4: trả tiền

Người dùng sẵn sàng trả tiền khi thấy sản phẩm đã nằm trong hệ thống của mình và việc rời đi sẽ tốn công. Lúc này cần minh bạch về giá, hạn mức, cách tính hoá đơn và điều xảy ra khi vượt hạn mức. Bất ngờ ở khâu thanh toán phá hỏng lòng tin đã xây ở các chặng trước.

Ở nhiều tổ chức, người trả tiền không phải kỹ sư. Kỹ sư cần có tài liệu để thuyết phục người duyệt ngân sách: tóm tắt giá trị, chi phí dự kiến, các cam kết về độ sẵn sàng và bảo mật.

Cách theo dõi: tỉ lệ chuyển từ dùng thử sang trả tiền, thời gian chuyển, những người dừng ở bước nào.

## Cách đọc phễu mà không tự lừa mình

Một số lưu ý để các con số có ích:

- **Định nghĩa sự kiện rõ ràng.** "Dùng thử" nghĩa là tạo tài khoản, hay chạy thành công lời gọi đầu tiên? Mỗi cách định nghĩa cho một bức tranh khác.
- **Đo tỉ lệ giữa các chặng liền kề** để thấy chỗ rơi rụng, thay vì chỉ nhìn tổng số ở đầu và cuối.
- **Kết hợp số liệu với quan sát trực tiếp.** Nhờ vài người chưa quen sản phẩm thử đi hết hành trình và nói to điều họ nghĩ. Con số cho biết đâu là chỗ rơi, cuộc quan sát cho biết vì sao.
- **Tôn trọng quyền riêng tư.** Chỉ thu thập dữ liệu cần thiết, nói rõ cho người dùng biết, và tuân thủ quy định bảo vệ dữ liệu áp dụng.
- **Đừng xem phễu là đường thẳng.** Người ta quay lại đọc tài liệu, tạm dừng rồi quay lại sau vài tháng, hoặc nhảy thẳng vào chặng tích hợp khi đồng nghiệp đã chọn sản phẩm.

## Lỗi hay gặp

- Dồn hết công sức vào chặng đầu (làm cho nhiều người biết) trong khi chặng dùng thử và tích hợp rò rỉ.
- Đo số tài khoản đăng ký như thể nó là thành công, dù phần lớn chưa từng chạy được lệnh nào.
- Bỏ qua người đã tích hợp: họ cần thông báo thay đổi, hướng dẫn nâng cấp và hỗ trợ ổn định, đó cũng là nội dung marketing tốt nhất cho chặng trả tiền. Cách biến các nội dung đó thành một kênh có kế hoạch được bàn trong [[Nội dung kỹ thuật làm marketing: tài liệu, blog, mã mẫu, changelog và cách đo hiệu quả]].

## Tóm lại

Phễu nhà phát triển là chuỗi bốn chặng: biết đến, dùng thử, tích hợp, trả tiền. Mỗi chặng trả lời một câu hỏi khác của kỹ sư và cần nội dung khác. Hãy định nghĩa sự kiện đo cho từng chặng, tìm chỗ rơi rụng lớn nhất, và sửa đúng chỗ đó thay vì chỉ kéo thêm người vào đầu phễu.

## Tham khảo

- Semantic Versioning 2.0.0: https://semver.org/
- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- Diátaxis, khung tài liệu kỹ thuật: https://diataxis.fr/
