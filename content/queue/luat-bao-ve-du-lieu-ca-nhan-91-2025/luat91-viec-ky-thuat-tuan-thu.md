---
title: Làm gì về kỹ thuật để tuân thủ Luật 91/2025/QH15: phân loại, mã hoá, nhật ký, xoá dữ liệu và thông báo sự cố
tags: tuân thủ, mã hoá, nhật ký truy cập, xoá dữ liệu, thông báo sự cố, luật 91/2025
type: process
---

> [!TLDR]
> - Luật không bắt buộc công cụ cụ thể, nhưng nhiều điều dịch ra việc kỹ thuật: phân loại dữ liệu, mã hoá, phân quyền và theo dõi truy cập, xoá an toàn, thông báo vi phạm trong 72 giờ.
> - Mã hoá không đổi tính chất dữ liệu cá nhân (Điều 12); khử nhận dạng thì có, nhưng cấm tái nhận dạng (Điều 14).
> - Đây là cách đọc luật theo góc kỹ thuật, không phải tư vấn pháp lý; yêu cầu chi tiết còn nằm trong văn bản hướng dẫn.

Bài này giải thích văn bản pháp luật theo góc nhìn kỹ thuật, tính đến tháng 11/2026, không phải tư vấn pháp lý cho trường hợp cụ thể. Nó nối tiếp [[Đánh giá tác động xử lý dữ liệu và chuyển dữ liệu xuyên biên giới theo Luật 91/2025/QH15: khi nào, nộp gì, thời hạn nào]] và [[Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15: dữ liệu cơ bản và nhạy cảm, quyền của chủ thể, bên kiểm soát và bên xử lý]].

## Mở đầu

Luật 91/2025/QH15 viết bằng ngôn ngữ pháp lý, nhưng nhiều điều có thể "dịch" thành việc cho đội kỹ thuật. Điều 3 khoản 4 nêu nguyên tắc thực hiện đồng bộ biện pháp về thể chế, kỹ thuật và con người; Điều 37 yêu cầu bên kiểm soát áp dụng biện pháp quản lý và kỹ thuật phù hợp, rà soát và cập nhật khi cần. Dưới đây là năm nhóm việc, mỗi nhóm gắn với điều luật tương ứng. Luật không chỉ định phần mềm hay cấu hình cụ thể; hãy xem chúng như danh sách gợi ý để đối chiếu, không phải danh sách bắt buộc.

## 1. Phân loại dữ liệu và lập sơ đồ luồng

Để biết dữ liệu nào là cơ bản, nhạy cảm (Điều 2) và đâu là dữ liệu của trẻ em, dữ liệu sức khoẻ, tài chính, vị trí, sinh trắc học (các Điều 24 đến 31 có quy định riêng), bước đầu tiên là có **bảng kiểm kê**: hệ thống nào lưu trường nào, ai truy cập, gửi đi đâu. Việc này cũng là nền cho hồ sơ đánh giá tác động và để xác định có chuyển dữ liệu xuyên biên giới hay không (ví dụ dùng nền tảng đặt ngoài Việt Nam, Điều 20 khoản 1).

Một cách làm đơn giản: gắn nhãn cho từng cột trong lược đồ cơ sở dữ liệu (không phải dữ liệu cá nhân, cơ bản, nhạy cảm), lưu bảng nhãn trong kho mã cùng tài liệu, và cập nhật khi thêm trường mới. Danh mục chính thức của dữ liệu cơ bản và nhạy cảm do Chính phủ ban hành, nên hãy đối chiếu với danh mục đó thay vì tự suy luận.

## 2. Mã hoá và khử nhận dạng

Điều 12 cho phép tổ chức tự quyết định việc mã hoá, giải mã phù hợp với hoạt động xử lý, và nhấn mạnh dữ liệu đã mã hoá **vẫn là dữ liệu cá nhân**. Điều 31 khoản 4 yêu cầu riêng với dữ liệu sinh trắc học: bảo mật vật lý thiết bị lưu và truyền, hạn chế quyền truy cập, có hệ thống theo dõi để phòng ngừa và phát hiện xâm phạm. Điều 30 khoản 3 yêu cầu hệ thống dùng dữ liệu lớn, trí tuệ nhân tạo, chuỗi khối, điện toán đám mây tích hợp biện pháp bảo mật phù hợp, dùng phương thức xác thực, định danh phù hợp và phân quyền truy cập.

Gợi ý kỹ thuật chung: mã hoá khi truyền (TLS) và khi lưu, quản lý khoá tách khỏi dữ liệu, giới hạn ai đọc được khoá. Khử nhận dạng (Điều 14 khoản 6) cần kiểm soát chặt quá trình thực hiện và **không được tái nhận dạng** sau đó, trừ khi pháp luật cho phép. Vì vậy hãy cẩn thận khi "ẩn danh" bằng cách chỉ băm một trường: nếu vẫn có thể đối chiếu lại về từng người thì rất khó nói là đã khử nhận dạng.

## 3. Phân quyền và nhật ký truy cập

Luật yêu cầu phân quyền truy cập ở Điều 30 khoản 3, hạn chế quyền truy cập với dữ liệu sinh trắc học ở Điều 31, và có hệ thống theo dõi để phát hiện xâm phạm. Điều 19 khoản 2 yêu cầu cơ chế giám sát khi xử lý không cần đồng ý: quy trình, đánh giá rủi ro thường xuyên, kiểm tra định kỳ, kênh tiếp nhận phản ánh. Điều 37 yêu cầu ngăn chặn việc thu thập trái phép từ hệ thống của mình.

Về kỹ thuật: quyền tối thiểu theo vai trò, xác thực nhiều yếu tố cho tài khoản quản trị, và **nhật ký truy cập** ghi ai đọc, sửa, xuất dữ liệu cá nhân và khi nào. Nhật ký này vừa giúp phát hiện bất thường, vừa là bằng chứng khi cần phối hợp với cơ quan chuyên trách. Lưu ý chính nhật ký cũng có thể chứa dữ liệu cá nhân (địa chỉ IP gắn với tài khoản, email), nên cũng cần phân quyền và thời hạn lưu.

## 4. Xoá, huỷ dữ liệu khi hết mục đích

Điều 14 khoản 1 nêu các trường hợp xoá, huỷ: chủ thể yêu cầu (có ngoại lệ), đã hoàn thành mục đích xử lý, hết thời hạn lưu trữ theo pháp luật, theo quyết định của cơ quan có thẩm quyền, theo thoả thuận. Khoản 3 yêu cầu xoá bằng biện pháp an toàn, ngăn xâm nhập và khôi phục trái phép; khoản 4 cấm cố ý khôi phục trái phép dữ liệu đã xoá. Các điều chuyên biệt có thêm mốc: dữ liệu ứng viên không được tuyển phải xoá (Điều 25), dữ liệu người lao động xoá khi chấm dứt hợp đồng trừ khi có thoả thuận hoặc quy định khác, dữ liệu ghi âm ghi hình nơi công cộng chỉ giữ trong thời gian cần thiết (Điều 32).

Việc kỹ thuật tương ứng: đặt **thời hạn lưu** cho từng loại dữ liệu, chạy tác vụ xoá định kỳ, và nhớ rằng bản sao lưu, bản sao ở môi trường thử nghiệm và log cũng chứa dữ liệu. Cảnh báo: lệnh hoặc tác vụ xoá hàng loạt không hoàn tác được; hãy thử trên bản sao, kiểm tra điều kiện lọc và xác nhận chính sách lưu trước khi chạy trên hệ thống thật.

## 5. Phát hiện và thông báo sự cố

Điều 23 khoản 1: khi phát hiện vi phạm có thể gây tổn hại đến quốc phòng, an ninh quốc gia, trật tự an toàn xã hội hoặc xâm phạm tính mạng, sức khoẻ, danh dự, nhân phẩm, tài sản của chủ thể, bên kiểm soát (hoặc bên kiểm soát và xử lý) và bên thứ ba phải thông báo cho cơ quan chuyên trách **chậm nhất 72 giờ kể từ khi phát hiện**. Bên xử lý phát hiện thì thông báo kịp thời cho bên kiểm soát. Bên kiểm soát phải lập biên bản xác nhận và phối hợp xử lý; nội dung thông báo do Chính phủ quy định. Riêng lĩnh vực tài chính, ngân hàng, tổ chức phải thông báo cho chủ thể khi lộ, mất thông tin tài khoản (Điều 27).

Việc kỹ thuật: có quy trình ứng phó sự cố với người chịu trách nhiệm, mốc thời gian "phát hiện" được ghi lại, mẫu biên bản sẵn, và hợp đồng với bên xử lý quy định thời hạn báo cho bạn ngắn hơn 72 giờ. Khi dự án thuộc hệ thống thông tin có cấp độ an ninh, hãy xem thêm bài [[Năm cấp độ an ninh hệ thống thông tin theo Nghị định 331/2026/NĐ-CP: tiêu chí, ngưỡng dữ liệu cá nhân và nguyên tắc cấp cao nhất]] để thấy hai khung quy định liên quan thế nào.

## Kiểm tra

Một danh sách tự kiểm đơn giản:

- Có bảng kiểm kê dữ liệu cá nhân và nhãn phân loại cập nhật?
- Dữ liệu được mã hoá khi truyền và khi lưu, khoá quản lý riêng?
- Có phân quyền tối thiểu và nhật ký truy cập, đều có thời hạn lưu?
- Mỗi loại dữ liệu có thời hạn lưu và tác vụ xoá, kể cả sao lưu?
- Có quy trình thông báo trong 72 giờ và hợp đồng với bên xử lý khớp thời hạn đó?
- Có kênh tiếp nhận yêu cầu của chủ thể (xem, sửa, xoá, rút đồng ý)?

## Lỗi hay gặp

- Nghĩ rằng mã hoá là đủ để dữ liệu "không còn là dữ liệu cá nhân".
- Xoá ở cơ sở dữ liệu chính nhưng quên bản sao lưu và môi trường thử nghiệm.
- Ghi log chứa dữ liệu cá nhân nhưng không giới hạn truy cập và thời hạn lưu.
- Không ghi lại thời điểm phát hiện sự cố nên không chứng minh được mốc 72 giờ.

## Tóm lại

Luật đặt mục tiêu, kỹ sư chọn cách làm: phân loại, mã hoá, phân quyền, nhật ký, xoá an toàn và quy trình sự cố. Hãy bắt đầu từ bảng kiểm kê dữ liệu, rồi đối chiếu văn bản hướng dẫn cho yêu cầu chi tiết.

## Tham khảo

- Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (bản PDF): https://static3.luatvietnam.vn/uploaded/others/2025/08/21/luat-91-2025-qh15_2108094941.pdf
- Giới thiệu Luật 91/2025/QH15: https://luatvietnam.vn/tin-van-ban-moi/da-co-luat-bao-ve-du-lieu-ca-nhan-2025-so-91-2025-qh15-186-102925-article.html
