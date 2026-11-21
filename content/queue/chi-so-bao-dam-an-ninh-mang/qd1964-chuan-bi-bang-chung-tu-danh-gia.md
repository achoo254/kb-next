---
title: Chuẩn bị bằng chứng để tự đánh giá theo Chỉ số bảo đảm an ninh mạng: ví dụ sao lưu và số liệu Nhóm III
tags: an ninh mạng, bằng chứng, tự đánh giá, sao lưu, TCVN 14423
type: process
---

> [!TLDR]
> - Mỗi mức điểm cần thuyết minh và bằng chứng; chuẩn bị hồ sơ theo từng nội dung đánh giá thì việc chấm điểm nhẹ nhàng hơn nhiều.
> - Tiêu chí sao lưu và khôi phục (II.11) là ví dụ tốt: quy định ký ban hành, sao lưu tự động, bản sao được bảo vệ, lưu ở hạ tầng tách biệt.
> - Nhóm III không tính điểm nhưng cần số liệu thống kê chính xác, không thấp hơn số liệu cơ quan chức năng ghi nhận.

*Bài này chỉ giải thích văn bản, không phải tư vấn pháp lý cho trường hợp cụ thể. Nội dung tính đến tháng 11/2026.*

## Mục tiêu

Sau bài này bạn biết cách biến một tiêu chí của Chỉ số bảo đảm an ninh mạng (Quyết định 1964/QĐ-TTg, 12/10/2026) thành một danh sách hồ sơ cụ thể cần có, và hiểu số liệu Nhóm III cần thu thập như thế nào. Nội dung bám các Phụ lục III, VI và VII. Để hiểu cách chấm và xếp loại trước, hãy đọc bài về thang chấm và xếp loại ngay trước bài này.

## Chuẩn bị

- Danh sách hệ thống thông tin của bạn và cấp độ đã được phê duyệt của từng hệ thống (Nhóm II chỉ áp dụng cho hệ thống cấp độ 3 trở lên).
- Bảng đánh giá trong các Phụ lục V, VI, VII của quyết định. Mỗi dòng có: nội dung đánh giá, mô tả Mức 0 đến Mức 3 và cột "bằng chứng" gợi ý loại tài liệu cần nộp.
- Một người chịu trách nhiệm tập hợp bằng chứng cho mỗi tiêu chí, và một nơi lưu tài liệu có kiểm soát phiên bản.
- Lưu ý: Phụ lục I lấy tiêu chuẩn TCVN 14423:2026 làm cơ sở trọng tâm của Chỉ số, nên các yêu cầu trong bảng thường trùng với những biện pháp mà tiêu chuẩn đó yêu cầu.

## Các bước

### Bước 1: đọc mức yêu cầu và quy ra "tài liệu cần có"

Với mỗi nội dung đánh giá, đọc cột Mức 1, Mức 2, Mức 3 và cột bằng chứng. Quy tắc chung của Phụ lục III: không có thuyết minh hoặc tài liệu chứng minh cho mức nào thì không được ghi nhận mức đó; quy trình, quy định ở Mức 1 phải do cấp có thẩm quyền ký và còn hiệu lực.

### Bước 2: lập hồ sơ cho từng mức

Lấy ví dụ tiêu chí **II.11 Sao lưu và khôi phục dữ liệu** (trọng số 10 trong Nhóm II). Bảng Phụ lục VI chia nó thành bốn mục tiêu:

1. **Có quy định sao lưu và khôi phục.** Ở Mức 1, quy định đã ban hành phải nêu tối thiểu: các loại dữ liệu cần sao lưu (như tập tin cấu hình hệ thống, bản dự phòng hệ điều hành máy chủ, cơ sở dữ liệu, dữ liệu và thông tin nghiệp vụ), tần suất, phương pháp, cách quản lý vùng lưu trữ bản sao lưu để giữ toàn vẹn, và việc định kỳ thử khôi phục để kiểm tra bản sao dùng được. Mức 3 có thêm việc rà soát, cập nhật quy định tối thiểu một lần mỗi năm hoặc khi tổ chức thay đổi.
2. **Sao lưu tự động.** Có danh sách dữ liệu cần sao lưu kèm tần suất theo ngày, tuần, tháng hoặc năm, và có giải pháp sao lưu tự động hoặc biện pháp tương đương. Bằng chứng gợi ý là danh sách dữ liệu, kế hoạch triển khai hoặc tập luật sao lưu.
3. **Bảo vệ bản sao lưu.** Mức 1 yêu cầu áp dụng quy tắc sao lưu 3-2-1 hoặc biện pháp tương đương, và mã hoá những bản sao lưu quan trọng.
4. **Hạ tầng lưu trữ tách biệt.** Các bản sao lưu được định danh, quản lý phiên bản và lưu trên hạ tầng tách biệt với môi trường vận hành.

Với hầu hết nội dung, Mức 2 là "Mức 1 cộng cơ chế đo lường, đánh giá hiệu quả" và Mức 3 là "Mức 2 cộng cơ chế cải tiến liên tục". Với sao lưu, bằng chứng Mức 2 có thể là báo cáo định kỳ về tỷ lệ sao lưu thành công và thời gian khôi phục thử; bằng chứng Mức 3 là biên bản rà soát và các thay đổi đã làm sau đó. Đây là gợi ý của bài viết để bạn hình dung, không phải danh sách bắt buộc của văn bản.

### Bước 3: chuẩn bị số liệu Nhóm III

Nhóm III gồm 9 tiêu chí thống kê phục vụ chỉ đạo, điều hành, không tính vào điểm. Phụ lục VII chia chúng thành tiêu chí "thuận" (số càng cao càng tốt, như tỷ lệ biện pháp xử lý rủi ro đúng hạn, tỷ lệ sự cố được xử lý kịp thời) và tiêu chí "nghịch" (số càng thấp càng tốt, như số sự cố nghiêm trọng, số bản ghi dữ liệu cá nhân bị lộ, số Gigabyte dữ liệu bị lộ hoặc bị mất, mã hoá). Với hai tỷ lệ phần trăm đầu, công thức là 100 nhân số lượng đạt chia tổng số.

Văn bản có hai ràng buộc cần nhớ: số liệu căn cứ theo thống kê của chủ quản hệ thống nhưng **không được ít hơn số liệu do cơ quan chức năng ghi nhận** (với các tiêu chí về sự cố và lộ lọt), và khi gộp nhiều hệ thống phải cộng số liệu gốc rồi mới tính phần trăm. Vì vậy bạn nên có sổ ghi sự cố đầy đủ, có thời gian phát hiện và xử lý, thay vì tổng hợp lại từ trí nhớ lúc cuối kỳ.

### Bước 4: tự chấm và rà soát chéo

Chấm theo mức cao nhất có đủ bằng chứng, rồi để một người khác không tham gia làm hồ sơ đọc lại: mỗi điểm số phải truy được tới một tài liệu cụ thể.

## Kiểm tra

- Mỗi nội dung đánh giá có một ô ghi mức tự chấm, tên tài liệu bằng chứng, người ký và ngày hiệu lực.
- Các quy định Mức 1 đều đã được ký và còn hiệu lực.
- Với Mức 2 trở lên có số liệu thật theo kỳ, không phải bảng trống.
- Số liệu Nhóm III khớp với sổ ghi sự cố và không thấp hơn số liệu bên ngoài đã ghi nhận.
- Hệ thống cấp độ 3 trở lên đều có đủ bằng chứng cho Nhóm II.

## Lỗi hay gặp

- **Có quy định nhưng chưa ký hoặc đã hết hiệu lực.** Khi đó Mức 1 không được ghi nhận.
- **Có sao lưu nhưng chưa bao giờ thử khôi phục.** Yêu cầu của quy định sao lưu có cả việc định kỳ khôi phục thử, nên đây là chỗ hay hụt.
- **Tự khai không bằng chứng.** Phụ lục I nói rõ cần hạn chế đánh giá hình thức hoặc tự khai thiếu căn cứ.
- **Lấy trung bình các phần trăm** của từng hệ thống thay vì cộng số liệu gốc ở Nhóm III.
- **Chép bảng điểm cũ cho kỳ mới** mà không rà soát lại: tiêu chí Mức 3 yêu cầu rà soát quy định ít nhất mỗi năm.

## Tham khảo

- Quyết định số 1964/QĐ-TTg ngày 12/10/2026 của Thủ tướng Chính phủ, Phụ lục I, III, VI, VII (bản PDF chính thức): https://bcp.cdnchinhphu.vn/334894974524682240/2026/10/12/1964-qd-ttg-12102026-signed-1791798586779365358593.pdf
- Cổng thông tin điện tử Chính phủ: https://chinhphu.vn
