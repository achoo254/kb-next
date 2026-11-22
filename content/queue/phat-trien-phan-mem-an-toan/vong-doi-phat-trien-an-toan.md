---
title: Vòng đời phát triển phần mềm an toàn: đưa bảo mật vào từng bước thay vì chờ đến cuối dự án
tags: phát triển an toàn, SSDF, review mã, kiểm thử xâm nhập, OWASP
type: note
---

> [!TLDR]
> - Bảo mật rẻ nhất khi được nghĩ tới từ lúc viết yêu cầu, không phải khi đã sắp phát hành.
> - Mỗi giai đoạn (yêu cầu, thiết kế, viết mã, kiểm thử, nghiệm thu, vận hành) có một vài việc nhỏ, lặp lại được.
> - Review mã, quét tự động và kiểm thử xâm nhập bổ sung cho nhau, không thay thế nhau.

## Mở đầu

Nhiều nhóm coi bảo mật là một "cửa kiểm tra" ở cuối dự án: viết xong tính năng, rồi nhờ ai đó dò lỗi trước ngày phát hành. Cách này thường tốn kém. Lỗi thiết kế phát hiện muộn buộc phải sửa lại cả luồng xử lý, còn thời hạn thì đã cận kề nên người ta dễ chấp nhận rủi ro "tạm thời".

Ý tưởng của **vòng đời phát triển phần mềm an toàn** (Secure Software Development Lifecycle, hay SSDLC) rất đơn giản: đặt vài việc bảo mật nhỏ vào mỗi giai đoạn quen thuộc của dự án. Bài này đi qua từng giai đoạn bằng ngôn ngữ dễ hiểu và ví dụ chung chung, không gắn với hệ thống của riêng ai.

Có hai tài liệu công khai đáng đọc để có khung tham chiếu:

- **NIST SP 800-218**, Secure Software Development Framework (SSDF) phiên bản 1.1, do Viện Tiêu chuẩn và Công nghệ Hoa Kỳ công bố năm 2022. Khung này chia các thực hành thành bốn nhóm: chuẩn bị tổ chức (Prepare the Organization), bảo vệ phần mềm (Protect the Software), tạo ra phần mềm được bảo vệ tốt (Produce Well-Secured Software) và ứng phó lỗ hổng (Respond to Vulnerabilities).
- **OWASP SAMM** (Software Assurance Maturity Model) giúp một nhóm tự đánh giá mức trưởng thành về bảo mật phần mềm và chọn việc cải thiện kế tiếp.

Bạn không cần áp dụng toàn bộ. Chọn vài thực hành phù hợp với quy mô nhóm rồi làm đều đặn thì hiệu quả hơn nhiều so với một bộ quy trình đồ sộ không ai theo.

## Giai đoạn 1: yêu cầu bảo mật

Khi viết yêu cầu chức năng, hãy viết luôn yêu cầu phi chức năng về bảo mật. Một số câu hỏi hữu ích:

- Dữ liệu nào là nhạy cảm (mật khẩu, dữ liệu cá nhân, thông tin thanh toán) và được lưu, truyền, ghi log ra sao?
- Ai được làm gì? Vai trò nào được xem, sửa, xoá?
- Hệ thống cần ghi lại những sự kiện nào để sau này còn điều tra được?

**OWASP ASVS** (Application Security Verification Standard) là danh sách kiểm chia thành ba mức (1, 2, 3), tăng dần theo độ nghiêm ngặt. Nhóm có thể chọn một mức làm đích và dùng các mục của nó làm yêu cầu có thể kiểm chứng, thay vì ghi chung chung "hệ thống phải an toàn".

## Giai đoạn 2: thiết kế và mô hình hoá mối đe doạ

**Mô hình hoá mối đe doạ** (threat modeling) nghe nặng nề nhưng bản nhẹ chỉ cần một buổi họp ngắn và một sơ đồ luồng dữ liệu:

1. Vẽ các thành phần: người dùng, ứng dụng, cơ sở dữ liệu, dịch vụ bên ngoài.
2. Vẽ các **ranh giới tin cậy**, tức nơi dữ liệu đi từ vùng ít tin cậy (trình duyệt, internet) vào vùng tin cậy hơn (máy chủ nội bộ).
3. Với mỗi luồng cắt qua ranh giới, hỏi theo gợi ý **STRIDE**: giả mạo danh tính (Spoofing), sửa dữ liệu trái phép (Tampering), chối bỏ hành vi (Repudiation), lộ thông tin (Information disclosure), từ chối dịch vụ (Denial of service), nâng quyền (Elevation of privilege).
4. Ghi lại các rủi ro và quyết định xử lý: giảm thiểu, chấp nhận, chuyển giao hoặc loại bỏ tính năng.

Ví dụ: một API cho phép tải tệp lên. Hỏi theo STRIDE sẽ nhanh chóng dẫn tới các câu như "tệp có được kiểm tra loại và kích thước không?", "ai được tải?", "tệp lưu ở đâu và có bị thực thi được không?". Những câu hỏi này rẻ khi hỏi ở bản thiết kế và đắt khi hỏi sau sự cố.

## Giai đoạn 3: viết mã và review mã

Ở giai đoạn viết mã, ba thói quen mang lại nhiều lợi ích nhất:

- **Quy ước an toàn của ngôn ngữ và framework**: dùng truy vấn có tham số thay vì nối chuỗi SQL, mã hoá đầu ra khi chèn vào HTML, dùng thư viện mật mã có sẵn thay vì tự chế.
- **Review mã (code review) có danh sách kiểm bảo mật**: người review không chỉ hỏi "chạy đúng không" mà còn hỏi "đầu vào có được kiểm tra không", "quyền có được kiểm ở phía máy chủ không", "có ghi bí mật vào log không".
- **Quét tĩnh (SAST)** tự động trong quy trình: công cụ đọc mã nguồn và cảnh báo các mẫu nguy hiểm đã biết. Kết quả quét có nhiễu, nên cần một người phân loại để đội ngũ không bị "mù cảnh báo".

Review của con người bắt được lỗi logic và lỗi thiết kế mà công cụ không hiểu; công cụ lại không mệt và không bỏ sót những mẫu lặp. Hai việc này bổ sung cho nhau.

## Giai đoạn 4: kiểm thử, gồm cả kiểm thử xâm nhập

Ngoài kiểm thử đơn vị và kiểm thử tích hợp thông thường, một dự án có thể thêm:

- **Kiểm thử động (DAST)**: công cụ gửi yêu cầu bất thường tới ứng dụng đang chạy ở môi trường thử và quan sát phản hồi.
- **Kiểm tra thành phần phụ thuộc (SCA)**: tìm lỗ hổng đã công bố trong thư viện bên thứ ba. Chủ đề này được bàn riêng ở bài [[Theo dõi lỗ hổng của thư viện phụ thuộc và xử lý thành phần hết hỗ trợ (EOL)]].
- **Kiểm thử xâm nhập (penetration test)**: một người hoặc nhóm có kỹ năng thử tấn công hệ thống như kẻ xấu, trong phạm vi và thời gian đã thoả thuận bằng văn bản. **OWASP Web Security Testing Guide** mô tả phương pháp kiểm thử ứng dụng web và là tài liệu tham khảo tốt để hiểu người kiểm thử sẽ làm gì.

Một lưu ý quan trọng: chỉ kiểm thử xâm nhập trên hệ thống của mình hoặc hệ thống bạn được cho phép rõ ràng, và nên thực hiện ở môi trường thử hay vào khung giờ đã báo trước để không gây gián đoạn dịch vụ thật. Kết quả kiểm thử cần được ghi thành danh sách lỗi có mức độ nghiêm trọng, người chịu trách nhiệm sửa và hạn sửa.

## Giai đoạn 5: nghiệm thu trước khi phát hành

Nghiệm thu là lúc trả lời câu hỏi "đã đủ an toàn để phát hành chưa?" bằng bằng chứng, không bằng cảm giác. Một danh sách kiểm gọn có thể gồm:

| Hạng mục | Câu hỏi kiểm |
| --- | --- |
| Yêu cầu | Các yêu cầu bảo mật đã chọn có đạt không? |
| Rủi ro | Rủi ro mức cao từ mô hình đe doạ đã xử lý hoặc có người chấp nhận bằng văn bản chưa? |
| Lỗi | Lỗi nghiêm trọng từ quét và kiểm thử xâm nhập đã đóng chưa? |
| Bí mật | Mã và cấu hình có chứa khoá hay mật khẩu không? (xem [[Quản lý bí mật trong kho mã và CI/CD: không commit khoá, quét rò rỉ và xoay vòng khi lộ]]) |
| Vận hành | Có log đủ để điều tra, có cách quay lại phiên bản trước không? |

Quyết định "chấp nhận rủi ro" nên có tên người ký và thời hạn xem xét lại, vì rủi ro bị bỏ qua không có chủ sẽ bị quên.

## Giai đoạn 6: vận hành và ứng phó

Phần mềm không dừng bảo mật khi phát hành. SSDF dành riêng một nhóm cho việc **ứng phó lỗ hổng**: có kênh để nhận báo cáo lỗ hổng, có quy trình đánh giá và vá, và rút kinh nghiệm để lỗi cùng loại không lặp lại. Với nhóm nhỏ, điều này có thể chỉ là một địa chỉ liên hệ bảo mật rõ ràng, một người phụ trách và một mẫu ghi chép sau sự cố.

## Bắt đầu từ đâu

Đừng cố làm hết trong một quý. Một lộ trình thực tế:

1. Thêm mục "bảo mật" vào mẫu yêu cầu và mẫu review mã.
2. Bật quét tự động (SAST, SCA, quét bí mật) trong CI, ban đầu chỉ cảnh báo, chưa chặn.
3. Làm một buổi mô hình hoá đe doạ nhẹ cho tính năng quan trọng tiếp theo.
4. Lên lịch kiểm thử xâm nhập định kỳ hoặc trước các bản phát hành lớn.
5. Sau vài tháng, dùng OWASP SAMM để xem đã tiến được tới đâu.

## Tóm lại

Phát triển an toàn không phải một công cụ mà là thói quen phân bổ việc bảo mật vào cả vòng đời. Yêu cầu rõ ràng, mô hình đe doạ nhẹ, review mã có danh sách kiểm, quét tự động, kiểm thử xâm nhập có phạm vi và nghiệm thu có bằng chứng: mỗi mắt xích nhỏ, nhưng cộng lại làm giảm đáng kể số lỗi lọt tới người dùng.

## Tham khảo

- NIST SP 800-218, Secure Software Development Framework (SSDF) Version 1.1: https://csrc.nist.gov/pubs/sp/800/218/final
- OWASP Application Security Verification Standard: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Software Assurance Maturity Model (SAMM): https://owasp.org/www-project-samm/
- OWASP Threat Modeling: https://owasp.org/www-community/Threat_Modeling
- OWASP Web Security Testing Guide: https://owasp.org/www-project-web-security-testing-guide/
- OWASP Top 10: https://owasp.org/Top10/
