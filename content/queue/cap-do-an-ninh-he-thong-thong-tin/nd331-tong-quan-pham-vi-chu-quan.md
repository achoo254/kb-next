---
title: Nghị định 331/2026/NĐ-CP tổng quan: phạm vi, đối tượng, chủ quản và đơn vị vận hành hệ thống thông tin
tags: an ninh mạng, nghị định 331, cấp độ, chủ quản hệ thống, pháp lý
type: note
---

> [!TLDR]
> - Nghị định 331/2026/NĐ-CP (ban hành 19/8/2026) quy định chi tiết việc bảo vệ an ninh mạng đối với hệ thống thông tin theo cấp độ.
> - Mỗi hệ thống có một chủ quản duy nhất và một đơn vị vận hành; hai vai trò này có trách nhiệm khác nhau.
> - Phạm vi hệ thống được xác định theo chức năng nghiệp vụ và luồng dữ liệu, không theo sơ đồ tổ chức.

*Bài viết giải thích văn bản, tính đến tháng 11/2026. Đây không phải tư vấn pháp lý cho một trường hợp cụ thể; khi áp dụng hãy đối chiếu văn bản chính thức và hỏi đơn vị chuyên trách hoặc luật sư.*

## Mở đầu

Nếu bạn làm hạ tầng hoặc phát triển phần mềm tại Việt Nam, sớm muộn bạn sẽ nghe câu hỏi: "Hệ thống này cấp độ mấy?". Từ năm 2026, câu trả lời được đặt trên Nghị định số 331/2026/NĐ-CP của Chính phủ, ban hành ngày 19/8/2026, "về bảo vệ an ninh mạng đối với hệ thống thông tin". Nghị định căn cứ vào Luật An ninh mạng số 116/2025/QH15 và có hiệu lực từ ngày ban hành (Điều 38).

Bài này là bản đồ tổng quan, dành cho người không chuyên luật. Hai bài tiếp theo của chuỗi sẽ đi sâu vào tiêu chí cấp độ và quy trình hồ sơ.

## Nghị định điều chỉnh những gì

Theo Điều 1, nghị định quy định chi tiết một số khoản của Luật An ninh mạng về: cấp độ an ninh mạng của hệ thống thông tin, thẩm quyền, trình tự và thủ tục xác định cấp độ, nghĩa vụ bảo đảm an ninh mạng, và việc kiểm tra. Điều 2 nêu đối tượng áp dụng là cơ quan, tổ chức, cá nhân tham gia xây dựng, vận hành hệ thống thông tin tại Việt Nam; các đối tượng khác được khuyến khích áp dụng tự nguyện.

Cho dễ nhớ, có thể hình dung văn bản gồm sáu chương:

- Chương I: quy định chung (Điều 1 đến 8), gồm cả giải thích từ ngữ, chủ quản, đơn vị vận hành và nguyên tắc.
- Chương II: tiêu chí xác định cấp độ 1 đến 5 và hệ thống quan trọng về an ninh quốc gia (Điều 9 đến 17).
- Chương III: thẩm quyền, trình tự, thủ tục thẩm định và phê duyệt (Điều 18 đến 25).
- Chương IV: kiểm tra an ninh mạng (Điều 26, 27).
- Chương V: nhiệm vụ, biện pháp và trách nhiệm (Điều 28 đến 34).
- Chương VI: tổ chức thực hiện, gồm chế độ báo cáo, hiệu lực và chuyển tiếp (Điều 35 đến 40), kèm phụ lục các mẫu văn bản.

## Chủ quản hệ thống thông tin

Điều 4 nói ai là chủ quản. Tuỳ hệ thống, đó có thể là bộ, cơ quan ngang bộ, Uỷ ban nhân dân cấp tỉnh, cơ quan quyết định đầu tư, hoặc doanh nghiệp và tổ chức khác sở hữu hệ thống. Chủ quản có thể uỷ quyền bằng văn bản theo khoản 3 của điều này.

Điểm cần nhớ: mỗi hệ thống chỉ có một chủ quản (Điều 8). Chủ quản là bên chịu trách nhiệm chính: người đứng đầu chịu trách nhiệm trước pháp luật, bố trí lực lượng chuyên trách phù hợp, phê duyệt hồ sơ cấp độ ở những cấp thuộc thẩm quyền của mình và báo cáo sự cố (Điều 31).

## Đơn vị vận hành

Điều 5 định nghĩa đơn vị vận hành là bên trực tiếp vận hành hệ thống, bao gồm cả trường hợp chủ quản thuê dịch vụ công nghệ thông tin. Ví dụ dễ hiểu: một cơ quan là chủ quản của một cổng dịch vụ, còn một đội kỹ thuật (nội bộ hoặc thuê ngoài) lo máy chủ, bản vá và giám sát hằng ngày là đơn vị vận hành. Trách nhiệm riêng của đơn vị vận hành nằm ở Điều 33; trách nhiệm của đơn vị chuyên trách về an ninh mạng ở Điều 32. Với đội kỹ thuật, điều này có nghĩa là công việc hằng ngày như vá lỗi, sao lưu, ghi nhật ký phải có người nhận rõ ràng, chứ không nằm trong vùng không ai chịu trách nhiệm.

## Nguyên tắc và việc xác định phạm vi hệ thống

Điều 6 nêu các nguyên tắc bảo đảm an ninh mạng theo cấp độ, trong đó có việc bảo đảm liên tục, khuyến khích dùng chung tài nguyên và ưu tiên cho hệ thống ở cấp cao hơn. Điều 7 hướng dẫn cách xác định "một hệ thống thông tin": dựa trên chức năng nghiệp vụ, luồng dữ liệu và mức độ phụ thuộc giữa các thành phần, không dựa trên cơ cấu hành chính của tổ chức.

Ví dụ: một ứng dụng web, cơ sở dữ liệu và các dịch vụ nền cùng phục vụ một nghiệp vụ thì thường được xem xét như một hệ thống, kể cả khi do các phòng ban khác nhau quản lý. Cách chia nhỏ chỉ để đạt cấp thấp hơn không được chấp nhận; chúng ta sẽ quay lại điểm này ở bài sau.

## Hiệu lực và quy định chuyển tiếp

Nghị định có hiệu lực từ 19/8/2026. Điều 39 có quy định chuyển tiếp liên quan Nghị định số 85/2016/NĐ-CP, văn bản trước đây về bảo đảm an toàn hệ thống thông tin theo cấp độ: dự án đang đầu tư trước ngày 01/7/2026 phải hoàn thành thẩm định theo Nghị định 85/2016/NĐ-CP trong sáu tháng, rồi đáp ứng yêu cầu bảo vệ theo cấp độ trong mười hai tháng kể từ khi Luật An ninh mạng có hiệu lực. Đội kỹ thuật đang có hệ thống cũ nên đọc kỹ điều này cùng bộ phận pháp chế.

## Tóm lại

- Nghị định 331/2026/NĐ-CP là văn bản hướng dẫn trung tâm về cấp độ an ninh mạng của hệ thống thông tin.
- Một hệ thống có một chủ quản; đơn vị vận hành có thể là nội bộ hoặc thuê ngoài, nhưng trách nhiệm của chủ quản không biến mất.
- Phạm vi hệ thống theo chức năng và luồng dữ liệu; bước tiếp theo là xác định cấp độ.

## Tham khảo

- Nghị định số 331/2026/NĐ-CP ngày 19/8/2026 của Chính phủ về bảo vệ an ninh mạng đối với hệ thống thông tin, tóm tắt trên trang của Ban Cơ yếu Chính phủ: https://bcy.gov.vn/van-ban-phap-luat/nghi-dinh-331-2026-nd-cp-tang-cuong-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-929291
- Bộ Công an, "Quy định mới về bảo vệ an ninh mạng đối với hệ thống thông tin": https://bocongan.gov.vn/chinh-sach-phap-luat/bai-viet/quy-dinh-moi-ve-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-1788941596
