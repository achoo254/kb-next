---
title: Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15: dữ liệu cơ bản và nhạy cảm, quyền của chủ thể, bên kiểm soát và bên xử lý
tags: bảo vệ dữ liệu cá nhân, luật 91/2025, chủ thể dữ liệu, bên kiểm soát, bên xử lý
type: note
---

> [!TLDR]
> - Luật 91/2025/QH15 chia dữ liệu cá nhân thành dữ liệu cơ bản và dữ liệu nhạy cảm; danh mục cụ thể do Chính phủ ban hành.
> - Chủ thể dữ liệu có sáu nhóm quyền ở Điều 4; sự đồng ý chỉ có hiệu lực khi tự nguyện, rõ mục đích và theo từng mục đích (Điều 9).
> - Bên kiểm soát quyết định mục đích và phương tiện, bên xử lý làm theo hợp đồng; hai bên có trách nhiệm khác nhau (Điều 37).

Bài này chỉ giải thích nội dung văn bản pháp luật theo cách dễ hiểu cho người làm kỹ thuật, tính đến tháng 11/2026. Đây không phải tư vấn pháp lý cho trường hợp cụ thể; khi cần áp dụng, hãy đối chiếu bản chính thức và hỏi người có chuyên môn pháp lý.

## Mở đầu

Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 do Quốc hội khoá XV thông qua ngày 26 tháng 6 năm 2025 và có hiệu lực từ ngày 01 tháng 01 năm 2026 (Điều 38). Luật gồm 5 chương, 39 điều. Chính phủ ban hành nghị định hướng dẫn, trong đó có Nghị định 356/2025/NĐ-CP; bài này chỉ nhắc chung đến nghị định và không đi vào số điều của nó.

Với người làm hạ tầng và phần mềm, ba câu hỏi đầu tiên luôn là: dữ liệu nào được coi là dữ liệu cá nhân, người dùng có những quyền gì với dữ liệu đó, và tổ chức của mình đứng ở vai trò nào khi xử lý nó. Luật trả lời ba câu hỏi này ở Điều 2, Điều 4, Điều 9 và Điều 37.

## Dữ liệu cá nhân, dữ liệu cơ bản và dữ liệu nhạy cảm

Điều 2 định nghĩa dữ liệu cá nhân là dữ liệu số hoặc thông tin dưới dạng khác xác định hoặc giúp xác định một con người cụ thể. Luật chia thành hai loại:

- **Dữ liệu cá nhân cơ bản**: phản ánh nhân thân, lai lịch phổ biến, thường dùng trong giao dịch và quan hệ xã hội, thuộc danh mục do Chính phủ ban hành.
- **Dữ liệu cá nhân nhạy cảm**: gắn với quyền riêng tư, khi bị xâm phạm sẽ ảnh hưởng trực tiếp đến quyền và lợi ích hợp pháp, cũng thuộc danh mục do Chính phủ ban hành.

Hai điểm rất đáng chú ý với kỹ sư. Thứ nhất, dữ liệu sau khi **khử nhận dạng** (thay đổi hoặc xoá thông tin để không còn xác định được một người cụ thể) thì không còn là dữ liệu cá nhân. Thứ hai, dữ liệu **đã mã hoá vẫn là dữ liệu cá nhân** (Điều 12): mã hoá là biện pháp bảo vệ, không phải cách để "thoát" khỏi luật. Ví dụ, một bảng người dùng có cột email được mã hoá khi lưu trên đĩa vẫn là dữ liệu cá nhân; còn một bộ số liệu thống kê đã bỏ hết định danh và không thể truy ngược về từng người thì có thể đã được khử nhận dạng.

Luật cũng định nghĩa xử lý dữ liệu rất rộng: thu thập, phân tích, tổng hợp, mã hoá, giải mã, chỉnh sửa, xoá, huỷ, khử nhận dạng, cung cấp, công khai, chuyển giao và mọi hoạt động tác động đến dữ liệu. Nghĩa là ngay cả việc ghi log chứa địa chỉ email hay sao lưu cơ sở dữ liệu cũng là "xử lý".

## Quyền và nghĩa vụ của chủ thể dữ liệu

Chủ thể dữ liệu cá nhân là người mà dữ liệu phản ánh. Điều 4 liệt kê các quyền:

1. Được biết về hoạt động xử lý dữ liệu của mình.
2. Đồng ý hoặc không đồng ý, và yêu cầu rút lại sự đồng ý.
3. Xem, chỉnh sửa hoặc yêu cầu chỉnh sửa dữ liệu.
4. Yêu cầu cung cấp, xoá, hạn chế xử lý dữ liệu; gửi yêu cầu phản đối xử lý.
5. Khiếu nại, tố cáo, khởi kiện, yêu cầu bồi thường thiệt hại.
6. Yêu cầu cơ quan có thẩm quyền hoặc bên liên quan thực hiện biện pháp bảo vệ dữ liệu của mình.

Chủ thể cũng có nghĩa vụ: tự bảo vệ dữ liệu, tôn trọng dữ liệu của người khác, cung cấp thông tin đầy đủ và chính xác, và không được gây khó khăn cho việc thực hiện nghĩa vụ hợp pháp của bên kiểm soát hay bên xử lý. Khi nhận được yêu cầu thực hiện quyền, bên kiểm soát phải thực hiện kịp thời trong thời hạn theo quy định của pháp luật; thời hạn cụ thể do Chính phủ quy định chi tiết (Điều 4 khoản 5).

Không phải mọi yêu cầu đều được đáp ứng. Điều 10 và Điều 14 chỉ ra rằng yêu cầu rút lại đồng ý, hạn chế xử lý hay xoá dữ liệu không áp dụng trong các trường hợp xử lý không cần sự đồng ý nêu ở Điều 19, và việc rút lại đồng ý không ảnh hưởng đến hoạt động xử lý đã diễn ra trước thời điểm rút.

## Sự đồng ý: điều kiện để có hiệu lực

Điều 9 đặt ra các điều kiện cho sự đồng ý:

- Dựa trên sự tự nguyện và người dùng biết rõ loại dữ liệu, mục đích xử lý, bên kiểm soát (hoặc bên kiểm soát và xử lý), cùng quyền và nghĩa vụ của mình.
- Thể hiện bằng phương thức rõ ràng, cụ thể, có thể in hoặc sao chép thành văn bản, kể cả dạng điện tử hoặc định dạng kiểm chứng được.
- Đồng ý **theo từng mục đích**, không được kèm điều kiện bắt buộc phải đồng ý với những mục đích khác.
- Có hiệu lực đến khi chủ thể thay đổi, hoặc theo quy định của pháp luật.
- Im lặng hoặc không phản hồi không được coi là đồng ý.

Với người làm sản phẩm, điều này dịch ra yêu cầu thiết kế rất cụ thể: không dùng ô tích sẵn gộp nhiều mục đích, lưu lại bằng chứng đồng ý (ai, khi nào, nội dung nào), và có đường rút lại đồng ý dễ như đường đồng ý.

Điều 19 liệt kê những trường hợp được xử lý mà không cần đồng ý, ví dụ bảo vệ tính mạng trong trường hợp cấp bách, phục vụ hoạt động của cơ quan nhà nước, hoặc thực hiện thoả thuận của chủ thể với bên liên quan theo quy định. Khi dựa vào các trường hợp này, tổ chức phải thiết lập cơ chế giám sát: quy trình xử lý, đánh giá rủi ro, kiểm tra định kỳ và kênh tiếp nhận phản ánh.

## Bên kiểm soát, bên xử lý, bên kiểm soát và xử lý

Điều 2 phân biệt ba vai trò:

- **Bên kiểm soát dữ liệu cá nhân**: quyết định mục đích và phương tiện xử lý.
- **Bên xử lý dữ liệu cá nhân**: xử lý theo yêu cầu của bên kiểm soát thông qua hợp đồng.
- **Bên kiểm soát và xử lý**: vừa quyết định mục đích, phương tiện, vừa trực tiếp xử lý.

Điều 37 nêu trách nhiệm tương ứng. Bên kiểm soát phải nêu rõ trách nhiệm các bên trong hợp đồng, xác định mục đích và phương tiện trong văn bản thoả thuận với chủ thể, áp dụng biện pháp quản lý và kỹ thuật phù hợp, thông báo vi phạm theo Điều 23, chọn bên xử lý phù hợp, bảo đảm quyền của chủ thể, chịu trách nhiệm trước chủ thể về thiệt hại và ngăn chặn việc thu thập trái phép từ hệ thống của mình. Bên xử lý chỉ được nhận dữ liệu sau khi có hợp đồng, xử lý đúng hợp đồng, thực hiện đầy đủ biện pháp bảo vệ và chịu trách nhiệm trước bên kiểm soát. Bên kiểm soát và xử lý phải thực hiện đủ cả hai nhóm trách nhiệm.

Ví dụ minh hoạ: một đơn vị thuê dịch vụ lưu trữ để chạy cơ sở dữ liệu khách hàng. Đơn vị quyết định thu thập gì và để làm gì nên là bên kiểm soát; nhà cung cấp lưu trữ chỉ làm theo hợp đồng nên là bên xử lý. Hợp đồng giữa hai bên cần phân định rõ trách nhiệm này.

## Những hành vi bị nghiêm cấm

Điều 7 cấm, trong số các hành vi khác, xử lý dữ liệu trái quy định pháp luật, mua bán dữ liệu cá nhân (trừ trường hợp luật có quy định khác), và chiếm đoạt, cố ý làm lộ hoặc làm mất dữ liệu. Điều 17 làm rõ rằng chuyển giao dữ liệu trong các trường hợp luật cho phép, dù có thu phí hay không, không bị coi là mua bán dữ liệu. Về xử phạt, Điều 8 quy định mức phạt tiền tối đa với các hành vi vi phạm khác là 03 tỷ đồng đối với tổ chức, và cá nhân thực hiện cùng hành vi thì tối đa bằng một nửa mức của tổ chức; riêng mua bán dữ liệu và chuyển dữ liệu xuyên biên giới có cách tính riêng.

## Tóm lại

- Phân biệt dữ liệu cơ bản và nhạy cảm theo danh mục của Chính phủ; mã hoá không làm dữ liệu hết là dữ liệu cá nhân, còn khử nhận dạng thì có.
- Chủ thể có các quyền ở Điều 4; sự đồng ý phải tự nguyện, rõ ràng và theo từng mục đích.
- Xác định tổ chức mình là bên kiểm soát, bên xử lý hay cả hai, rồi đối chiếu trách nhiệm ở Điều 37 và hợp đồng.

Bài tiếp theo trong chuỗi nói về hồ sơ đánh giá tác động và chuyển dữ liệu xuyên biên giới.

## Tham khảo

- Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (bản PDF): https://static3.luatvietnam.vn/uploaded/others/2025/08/21/luat-91-2025-qh15_2108094941.pdf
- Giới thiệu Luật 91/2025/QH15: https://luatvietnam.vn/tin-van-ban-moi/da-co-luat-bao-ve-du-lieu-ca-nhan-2025-so-91-2025-qh15-186-102925-article.html
