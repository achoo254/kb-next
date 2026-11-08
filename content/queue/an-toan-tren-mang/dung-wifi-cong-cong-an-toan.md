---
title: Dùng Wi-Fi công cộng an toàn: mạng giả mạo, HTTPS và chia sẻ mạng từ điện thoại
tags: wi-fi công cộng, https, mạng giả mạo, chia sẻ mạng, an toàn mạng
type: note
---

> [!TLDR]
> - Mạng Wi-Fi công cộng có thể bị kẻ xấu dựng giả với tên giống hệt, nên hãy hỏi nhân viên tên mạng chính xác.
> - Chỉ nhập mật khẩu và thông tin quan trọng ở trang có HTTPS, tốt nhất là hoãn việc nhạy cảm sang mạng đáng tin.
> - Chia sẻ mạng từ điện thoại với mật khẩu riêng thường an toàn hơn Wi-Fi quán xá.

## Mở đầu

Quán cà phê, sân bay, khách sạn, thư viện: ở đâu cũng có Wi-Fi miễn phí, và ai cũng muốn kết nối cho tiện. Phần lớn thời gian chuyện đó hoàn toàn bình thường. Nhưng mạng công cộng có một đặc điểm: bạn dùng chung nó với rất nhiều người lạ, và bạn không kiểm soát ai đứng sau chiếc router.

Bài này giải thích những rủi ro chính bằng ngôn ngữ dễ hiểu và đưa ra các thói quen giúp bạn dùng Wi-Fi công cộng yên tâm hơn.

## Rủi ro thứ nhất: mạng giả mạo

Kẻ xấu có thể phát ra một mạng Wi-Fi mang tên giống hệt mạng của quán, ví dụ thêm một ký tự hoặc dùng đúng tên nhưng không có mật khẩu. Kiểu tấn công này thường được gọi là "evil twin" (cặp song sinh xấu). Khi bạn kết nối vào mạng giả, toàn bộ dữ liệu của bạn đi qua thiết bị của kẻ đó, và họ có thể thử xem hoặc can thiệp vào dữ liệu chưa được mã hoá.

Cách phòng tránh:

- **Hỏi nhân viên tên mạng và mật khẩu chính xác** thay vì chọn mạng nào trông giống nhất trong danh sách.
- Cẩn thận với mạng không mật khẩu, nhất là khi có hai mạng tên gần giống nhau.
- Tắt chế độ tự động kết nối vào mạng mở trên điện thoại và máy tính, để thiết bị không tự nối vào mạng lạ chỉ vì trùng tên.
- Sau khi dùng xong, chọn "quên mạng" để thiết bị không nhớ nó.

## Rủi ro thứ hai: dữ liệu không được mã hoá

Khi bạn truy cập một trang web, dữ liệu có thể đi theo hai cách. Với HTTP thường, nội dung gửi đi dạng chữ rõ, ai đứng giữa đường truyền đều có thể đọc được. Với **HTTPS**, nội dung được mã hoá giữa trình duyệt và máy chủ của trang, nên người đứng giữa chỉ thấy dữ liệu bị xáo trộn.

Trình duyệt hiện đại hiển thị biểu tượng ổ khoá hoặc cảnh báo "không bảo mật" cho trang không dùng HTTPS. Thói quen cần có:

- Khi đăng nhập hoặc nhập thông tin quan trọng, kiểm tra địa chỉ trang bắt đầu bằng `https://`.
- **Đừng bỏ qua cảnh báo chứng chỉ** của trình duyệt chỉ để vào cho nhanh. Cảnh báo ấy có thể chính là dấu hiệu có người đang xen vào đường truyền.
- Ứng dụng trên điện thoại của các dịch vụ lớn thường tự mã hoá kết nối, nhưng bạn vẫn nên cập nhật ứng dụng và hệ điều hành thường xuyên để vá các lỗi bảo mật đã biết.

Lưu ý: HTTPS bảo vệ nội dung bạn trao đổi với trang web, nhưng không biến một mạng giả mạo thành mạng an toàn. Nó là một lớp bảo vệ, không phải lý do để mất cảnh giác.

## Rủi ro thứ ba: bị dụ vào trang giả

Nhiều mạng công cộng hiển thị một trang đăng nhập khi bạn kết nối (còn gọi là cổng đăng nhập). Kẻ xấu có thể làm trang giả yêu cầu bạn nhập tài khoản mạng xã hội hoặc email để "xác nhận". Nguyên tắc: mạng công cộng chỉ cần bạn đồng ý điều khoản hoặc nhập mã do quán cung cấp, không cần mật khẩu email của bạn. Cách nhận diện các lời dụ này giống với những gì mô tả trong bài [[Nhận diện tin nhắn và cuộc gọi lừa đảo: năm dấu hiệu để dừng lại trước khi bấm]], và xin nhớ là dừng lại để suy nghĩ trước khi nhập bất cứ thông tin gì.

## Các thói quen dùng Wi-Fi công cộng an toàn

### Mục tiêu

Dùng được Internet ở nơi công cộng mà không để lộ tài khoản và dữ liệu quan trọng.

### Chuẩn bị

- Hệ điều hành và trình duyệt đã cập nhật bản mới.
- Tài khoản quan trọng đã bật xác thực hai bước. Chi tiết xem bài [[Bật xác thực hai bước cho email và mạng xã hội: thêm một khoá nữa cho tài khoản của bạn]]. Nhờ đó, dù mật khẩu có bị lộ, kẻ xấu vẫn thiếu thêm một bước để vào tài khoản.
- Chia sẻ mạng (hotspot) trên điện thoại, nếu gói cước của bạn cho phép.

### Các bước

1. Xác nhận tên mạng chính xác với nhân viên trước khi kết nối.
2. Với việc nhạy cảm như ngân hàng, thanh toán, đổi mật khẩu, hãy **hoãn lại** cho đến khi về mạng ở nhà, hoặc dùng dữ liệu di động của điện thoại.
3. Nếu cần dùng nhiều, bật **chia sẻ mạng từ điện thoại**: đặt tên mạng riêng, đặt mật khẩu mạnh theo chuẩn mã hoá hiện đại mà điện thoại hỗ trợ (ví dụ WPA2 hoặc WPA3), và chỉ cho thiết bị của mình dùng. Kết nối này đi qua nhà mạng của bạn thay vì qua router của người lạ.
4. Tắt chia sẻ tệp và chế độ "có thể phát hiện" của máy tính trong mạng công cộng.
5. Khi rời đi, tắt Wi-Fi hoặc chọn "quên mạng", và tắt hotspot nếu đã bật.

### Kiểm tra

Trước khi nhập mật khẩu ở bất kỳ trang nào, nhìn lại thanh địa chỉ: có `https://` và có ổ khoá không, tên miền có đúng chính tả không. Sau buổi dùng mạng lạ, nếu thấy thông báo đăng nhập từ thiết bị hoặc nơi lạ, hãy đổi mật khẩu ngay từ một mạng đáng tin.

### Lỗi hay gặp

- Chọn đại một mạng tên giống quán mà không hỏi lại.
- Bấm qua cảnh báo chứng chỉ vì vội.
- Làm giao dịch ngân hàng trên mạng công cộng.
- Để hotspot điện thoại không mật khẩu hoặc dùng mật khẩu dễ đoán, khiến người lạ gần đó dùng ké và có thể tốn dung lượng của bạn.
- Quên tắt chia sẻ tệp.

## Tóm lại

Wi-Fi công cộng không đáng sợ nếu bạn nhớ vài nguyên tắc: xác nhận đúng tên mạng, chỉ nhập thông tin quan trọng ở trang HTTPS, hoãn việc nhạy cảm sang mạng đáng tin hoặc dùng chia sẻ mạng từ điện thoại, và luôn bật xác thực hai bước cho tài khoản quan trọng. Vài giây kiểm tra mỗi lần kết nối có thể tránh cho bạn một rắc rối lớn.

## Tham khảo

- [Evil twin (wireless networks), Wikipedia (tiếng Anh)](https://en.wikipedia.org/wiki/Evil_twin_(wireless_networks))
- [HTTPS, Wikipedia (tiếng Việt)](https://vi.wikipedia.org/wiki/HTTPS)
- [Wi-Fi Protected Access, Wikipedia (tiếng Anh)](https://en.wikipedia.org/wiki/Wi-Fi_Protected_Access)
- [Tethering, Wikipedia (tiếng Anh)](https://en.wikipedia.org/wiki/Tethering)
