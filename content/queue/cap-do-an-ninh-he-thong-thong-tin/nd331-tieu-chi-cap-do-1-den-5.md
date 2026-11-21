---
title: Năm cấp độ an ninh hệ thống thông tin theo Nghị định 331/2026/NĐ-CP: tiêu chí, ngưỡng dữ liệu cá nhân và nguyên tắc cấp cao nhất
tags: cấp độ an ninh, nghị định 331, dữ liệu cá nhân, đánh giá rủi ro, pháp lý
type: note
---

> [!TLDR]
> - Nghị định 331/2026/NĐ-CP chia hệ thống thông tin thành 5 cấp độ (Điều 11 đến 15), dựa trên loại thông tin, đối tượng phục vụ và hậu quả khi bị tấn công.
> - Hệ thống đáp ứng tiêu chí của nhiều cấp thì áp dụng cấp cao nhất; không được chia tách hình thức để hạ cấp (Điều 8).
> - Dịch vụ trực tuyến có ngưỡng dữ liệu cá nhân: dưới 100.000 chủ thể (dữ liệu cơ bản) hoặc dưới 10.000 (dữ liệu nhạy cảm) thì thuộc cấp 2, vượt ngưỡng thì từ cấp 3.

*Bài viết giải thích văn bản, tính đến tháng 11/2026, không phải tư vấn pháp lý cho trường hợp cụ thể. Hãy đối chiếu văn bản chính thức khi áp dụng.*

## Mở đầu

Sau khi biết hệ thống của mình là gì và ai là chủ quản (xem [[Nghị định 331/2026/NĐ-CP tổng quan: phạm vi, đối tượng, chủ quản và đơn vị vận hành hệ thống thông tin]]), câu hỏi tiếp theo là xác định cấp độ. Nghị định số 331/2026/NĐ-CP, ban hành ngày 19/8/2026, dành Chương II (Điều 9 đến 17) cho việc này. Cấp độ càng cao thì yêu cầu bảo vệ càng nghiêm và hồ sơ càng nhiều bước thẩm định.

## Hai việc phải làm trước khi gán cấp

Điều 9 yêu cầu phân loại thông tin được xử lý thành bốn nhóm: thông tin công cộng, thông tin riêng, thông tin cá nhân và bí mật nhà nước; đồng thời phân loại hệ thống theo chức năng. Điều 10 nói về quản lý rủi ro an ninh mạng: nêu các trường hợp phải đánh giá rủi ro, nội dung đánh giá và cách dùng kết quả. Theo các bản tóm tắt chính thống, nếu đánh giá cho thấy mức rủi ro cao hơn cấp đã xác định thì chủ quản phải đề xuất áp dụng cấp cao hơn.

## Mô tả từng cấp

Phần dưới đây là cách hiểu ngắn gọn, không thay thế văn bản.

- **Cấp 1 (Điều 11):** hệ thống phục vụ nội bộ và chỉ xử lý thông tin công cộng.
- **Cấp 2 (Điều 12):** phục vụ nội bộ nhưng có thông tin riêng hoặc thông tin cá nhân, không có bí mật nhà nước; cũng gồm một số dịch vụ trực tuyến cho người dân, doanh nghiệp không thuộc ngành nghề kinh doanh có điều kiện và dưới ngưỡng dữ liệu cá nhân.
- **Cấp 3 (Điều 13):** xử lý bí mật nhà nước hoặc phục vụ quốc phòng, an ninh ở mức khi bị phá hoại có thể gây tổn hại đến an ninh quốc gia; dịch vụ thuộc ngành nghề kinh doanh có điều kiện; hệ thống giải quyết thủ tục hành chính; dịch vụ vượt ngưỡng dữ liệu cá nhân của cấp 2; hệ thống điều khiển công nghiệp cho một số loại công trình.
- **Cấp 4 (Điều 14):** tổn hại nghiêm trọng đến an ninh quốc gia nếu bị phá hoại; hệ thống Chính phủ điện tử toàn quốc vận hành liên tục; hệ thống điều khiển công trình cấp I.
- **Cấp 5 (Điều 15):** tổn hại đặc biệt nghiêm trọng; lưu trữ tập trung dữ liệu đặc biệt quan trọng; hạ tầng kết nối quốc tế; điều khiển công trình cấp đặc biệt. Cấp 5 là hệ thống thông tin quan trọng về an ninh quốc gia (Điều 16 nêu tiêu chí riêng cho nhóm này, và các hệ thống cấp 3, 4 cũng có thể được đưa vào danh mục).

## Ngưỡng dữ liệu cá nhân cho dịch vụ trực tuyến

Với đội kỹ thuật làm dịch vụ trực tuyến, ngưỡng dữ liệu cá nhân là tiêu chí thực tế nhất. Theo các bản tóm tắt, dịch vụ không thuộc ngành nghề kinh doanh có điều kiện được xếp cấp 2 khi xử lý dữ liệu cá nhân của dưới 100.000 chủ thể đối với dữ liệu cơ bản, hoặc dưới 10.000 chủ thể đối với dữ liệu nhạy cảm. Từ ngưỡng đó trở lên là cấp 3.

Ví dụ minh hoạ (giả định): một ứng dụng đặt lịch nhỏ có 8.000 người dùng và chỉ lưu họ tên, số điện thoại. Số lượng đang dưới ngưỡng cho dữ liệu cơ bản. Nếu người dùng tăng lên 120.000, nghị định yêu cầu chủ quản đánh giá lại rủi ro, và nếu vượt ngưỡng thì đề xuất cấp cao hơn rồi lập lại hồ sơ cấp độ. Vì vậy đội kỹ thuật nên theo dõi số lượng chủ thể dữ liệu như một chỉ số vận hành, chứ không chỉ nhớ đến nó khi làm hồ sơ.

## Nguyên tắc cấp cao nhất và cấm chia tách để hạ cấp

Điều 8 đặt ba nguyên tắc: một hệ thống có một chủ quản; hệ thống đáp ứng tiêu chí của nhiều cấp thì áp dụng cấp cao nhất; và không được xác định phạm vi hình thức nhằm giảm cấp độ. Theo bản tóm tắt của Bộ Công an, nếu cơ quan chức năng phát hiện việc chia tách hay gộp hệ thống để hạ cấp hoặc giảm yêu cầu, chủ quản phải xác định lại hệ thống và cấp độ.

Ví dụ: tách cơ sở dữ liệu người dùng khỏi ứng dụng thành "hai hệ thống nhỏ" chỉ để mỗi phần lọt dưới ngưỡng là cách làm trái tinh thần của Điều 7 và 8, vì phạm vi phải theo chức năng nghiệp vụ và luồng dữ liệu.

## Cấp độ và hạ tầng dùng chung

Nghị định khuyến khích dùng chung tài nguyên để tiết kiệm. Theo bản tóm tắt, hệ thống cấp 3 và 4 có thể dùng chung hạ tầng vật lý của trung tâm dữ liệu hoặc điện toán đám mây nếu được tách biệt về mặt logic; còn cấp 5 chỉ dùng chung công cụ an ninh ở lớp giám sát, phát hiện, cảnh báo và bảo vệ biên, không được tiếp cận dữ liệu nghiệp vụ. Điều 30 còn có quy định riêng khi thuê trung tâm dữ liệu hoặc điện toán đám mây cho hệ thống cấp 3 đến 5.

## Tóm lại

- Năm cấp độ gắn với loại thông tin, đối tượng phục vụ và hậu quả khi sự cố.
- Dịch vụ trực tuyến cần theo dõi ngưỡng 100.000 và 10.000 chủ thể dữ liệu cá nhân.
- Áp dụng cấp cao nhất khi đáp ứng nhiều tiêu chí, và không chia tách hình thức để hạ cấp.
- Bước kế tiếp là hồ sơ, thẩm định và phê duyệt, trình bày ở bài kế tiếp của chuỗi.

## Tham khảo

- Nghị định số 331/2026/NĐ-CP ngày 19/8/2026 của Chính phủ (tóm tắt tiêu chí cấp độ): https://bcy.gov.vn/van-ban-phap-luat/nghi-dinh-331-2026-nd-cp-tang-cuong-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-929291
- Bộ Công an, "Quy định mới về bảo vệ an ninh mạng đối với hệ thống thông tin": https://bocongan.gov.vn/chinh-sach-phap-luat/bai-viet/quy-dinh-moi-ve-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-1788941596
