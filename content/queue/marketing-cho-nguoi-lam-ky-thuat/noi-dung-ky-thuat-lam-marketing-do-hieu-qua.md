---
title: Nội dung kỹ thuật làm marketing: tài liệu, blog, mã mẫu, changelog và cách đo hiệu quả
tags: marketing kỹ thuật, tài liệu, changelog, mã mẫu, đo lường
type: process
---

> [!TLDR]
> - Tài liệu, bài blog kỹ thuật, mã mẫu và changelog đều là nội dung marketing nếu chúng giúp kỹ sư giải quyết việc thật.
> - Mỗi loại nội dung phục vụ một chặng của phễu nhà phát triển và cần một thước đo riêng.
> - Đo bằng hành vi có ý nghĩa (chạy được ví dụ, gọi API lại) hơn là lượt xem thô.

## Mục tiêu

Sau bài này, bạn biết dùng bốn loại nội dung kỹ thuật như một kênh marketing có kế hoạch, và biết đo xem chúng có hiệu quả hay không mà không phải bịa số liệu. Bài này nối tiếp bài trước trong chuỗi.

## Chuẩn bị

- Xác định đối tượng chính (kỹ sư backend, vận hành hay người làm dữ liệu) và việc họ đang cố làm.
- Chọn vài sự kiện đo được trong sản phẩm, ví dụ "tạo khoá API", "lời gọi đầu tiên thành công", "gọi API trong 7 ngày liên tiếp".
- Có công cụ thống kê truy cập tôn trọng quyền riêng tư, và biết chính sách dữ liệu áp dụng cho người dùng của bạn.

## Các bước

### Bước 1: tài liệu làm nền

Tài liệu là loại nội dung bền nhất vì được đọc đi đọc lại. Tách các trang theo mục đích (làm quen, hướng dẫn tác vụ, tra cứu, giải thích) như khung Diátaxis mô tả. Mỗi trang nên nói rõ phiên bản áp dụng và có đường dẫn đến trang kế tiếp hợp lý.

Thước đo gợi ý: số người đọc tài liệu rồi thực hiện sự kiện sản phẩm tương ứng, từ khoá tìm kiếm nội bộ không ra kết quả (chỗ tài liệu còn thiếu), phản hồi "trang này có ích không".

### Bước 2: bài blog kỹ thuật cho chặng biết đến

Một bài blog tốt trả lời một câu hỏi cụ thể mà kỹ sư thật sự tìm kiếm: cách chẩn đoán một lỗi, cách so sánh hai cách thiết kế, cách chuyển đổi từ công cụ cũ. Nó phải hữu ích dù người đọc chưa bao giờ dùng sản phẩm của bạn. Sản phẩm chỉ xuất hiện khi thật sự liên quan, và bài nêu cả trường hợp sản phẩm không phù hợp.

Điều nên tránh: bài "thông tin" mỏng chỉ để lấy lượt tìm kiếm, số liệu thống kê không rõ nguồn, và so sánh đối thủ một chiều. Kỹ sư nhận ra những điều đó rất nhanh.

Thước đo gợi ý: lượt đọc đến cuối bài, người đọc bấm sang tài liệu hay trang bắt đầu, thời gian quay lại.

### Bước 3: mã mẫu làm cầu nối sang tích hợp

Kho mã mẫu là cách ngắn nhất để biến sự quan tâm thành tích hợp. Một kho mã mẫu tốt:

- có tệp README nêu yêu cầu, lệnh chạy và kết quả mong đợi;
- được ghim phiên bản phụ thuộc và chạy trong quy trình kiểm thử tự động, để không âm thầm hỏng khi sản phẩm đổi;
- không chứa khoá hay địa chỉ thật, chỉ dùng giá trị giữ chỗ như example.com;
- có giấy phép rõ ràng để người ta yên tâm sao chép.

Thước đo gợi ý: số lần sao chép hay tạo bản fork, số khoá API mới tạo từ trang chứa mã mẫu, câu hỏi hỗ trợ lặp lại về cùng một ví dụ (dấu hiệu ví dụ cần sửa).

### Bước 4: changelog giữ lòng tin sau khi tích hợp

Changelog là nội dung marketing bị đánh giá thấp. Người đã tích hợp đọc nó để biết bản mới có phá hỏng mã của mình không, và để thấy sản phẩm đang được chăm sóc. Khuyến nghị của Keep a Changelog: mỗi bản phát hành có mục riêng, mới nhất ở trên, ngày theo định dạng năm-tháng-ngày, và nhóm thay đổi theo các loại như Added, Changed, Deprecated, Removed, Fixed, Security. Kết hợp với đánh số phiên bản theo Semantic Versioning (MAJOR.MINOR.PATCH) để người đọc biết nhìn thấy "MAJOR" là phải cẩn thận.

Có thể tự động hoá một phần: nhiều nền tảng sinh ghi chú phát hành từ các pull request đã gộp, ví dụ tính năng release notes tự sinh của GitHub. Dù vậy, hãy biên tập lại để người đọc hiểu ảnh hưởng với họ, thay vì chỉ liệt kê tiêu đề commit. Bước đóng gói và phát hành thường nằm trong pipeline phát hành, xem [[Pipeline CI/CD gồm những giai đoạn nào: build, test, deploy, artifact và cache]].

Thước đo gợi ý: số người nâng cấp sau mỗi bản, số câu hỏi hỗ trợ liên quan đến thay đổi gây bất ngờ.

### Bước 5: đo hiệu quả mà không tự lừa mình

- Gắn từng nội dung với một chặng phễu và một sự kiện đích, thay vì nhìn tổng lượt xem.
- Dùng tham số theo dõi trong liên kết (ví dụ tham số UTM) để biết người dùng đến từ đâu, nếu chính sách quyền riêng tư của bạn cho phép.
- Với mã mẫu trên GitHub, API thống kê truy cập của kho mã cho biết lượt xem và lượt sao chép trong khoảng 14 ngày gần nhất (cần quyền ghi vào kho). Muốn xem dài hơn, hãy lưu số liệu định kỳ.
- Đừng quy mọi thứ cho nội dung cuối cùng: người dùng thường đọc nhiều nội dung trước khi hành động. Hãy hỏi người mới đăng ký "bạn biết đến chúng tôi từ đâu?" để bổ sung cho số liệu.
- Khi trích dẫn số liệu ngành, chỉ dùng khảo sát công khai có nguồn và năm; nếu không có thì đừng nêu con số.

## Kiểm tra

Sau một quý, hãy tự hỏi:

1. Với mỗi chặng phễu, có ít nhất một nội dung phục vụ nó không?
2. Có nội dung nào dẫn đến sự kiện sản phẩm đáng kể không, và nội dung nào không dẫn đến gì?
3. Mã mẫu và tài liệu còn chạy đúng với phiên bản hiện tại không?
4. Câu hỏi hỗ trợ lặp lại nhiều nhất là gì, và đã có tài liệu trả lời chưa?

## Lỗi hay gặp

- Viết blog để "có nội dung" mà không có đối tượng và câu hỏi cụ thể.
- Để mã mẫu và ảnh chụp màn hình lỗi thời sau vài bản phát hành.
- Chỉ ghi "sửa lỗi và cải thiện hiệu năng" trong changelog, không nói gì có ích cho người đọc.
- Đo lượt xem rồi kết luận thành công, trong khi không ai thực hiện bước tiếp theo.

## Tóm lại

Tài liệu, blog kỹ thuật, mã mẫu và changelog là bốn kênh marketing hợp với kỹ sư, vì chúng cho họ bằng chứng thay vì lời hứa. Gắn mỗi loại với một chặng phễu và một sự kiện đo được, giữ chúng đúng với phiên bản hiện tại, và đọc số liệu một cách thận trọng.

## Tham khảo

- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- Semantic Versioning 2.0.0: https://semver.org/
- Diátaxis, khung tài liệu kỹ thuật: https://diataxis.fr/
- GitHub Docs, ghi chú phát hành tự sinh: https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes
- GitHub Docs, REST API thống kê truy cập kho mã: https://docs.github.com/en/rest/metrics/traffic
- Write the Docs, hướng dẫn viết tài liệu: https://www.writethedocs.org/guide/
