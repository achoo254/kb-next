---
title: Bật xác thực hai bước cho email và mạng xã hội: thêm một khoá nữa cho tài khoản của bạn
tags: xác thực hai bước, 2FA, an toàn mạng, mã OTP, khoá bảo mật
type: process
---

## Mục tiêu

Sau bài này, bạn hiểu xác thực hai bước là gì, các loại "bước thứ hai" khác nhau ra sao, và biết cách bật nó cho tài khoản email cùng mạng xã hội của mình theo một quy trình an toàn, không bị khoá mình ở ngoài.

Đây là bài cuối của chuỗi ba bài. Bài đầu giúp bạn nhận ra tin nhắn lừa đảo, bài hai giúp bạn có mật khẩu mạnh và riêng biệt cho từng nơi. Bài này thêm lớp cuối cùng: ngay cả khi mật khẩu bị lộ, kẻ xấu vẫn chưa vào được.

## Xác thực hai bước là gì

Để chứng minh "tôi là chủ tài khoản", có ba loại bằng chứng:

- **Thứ bạn biết**: mật khẩu, mã PIN.
- **Thứ bạn có**: điện thoại, khoá bảo mật vật lý.
- **Thứ thuộc về bạn**: vân tay, khuôn mặt.

Đăng nhập chỉ bằng mật khẩu là dùng một loại. *Xác thực hai bước* (2FA, hay xác thực đa yếu tố nói chung) yêu cầu thêm một loại khác. Nhờ đó, kẻ xấu lấy được mật khẩu của bạn vẫn cần thêm thứ thứ hai mà họ không có.

## Các loại bước thứ hai

Từ mức tiện lợi đến mức chống lừa đảo tốt hơn, thường gặp:

1. **Mã gửi qua tin nhắn SMS.** Dễ dùng và ai cũng có, nhưng yếu nhất trong các lựa chọn, vì tin nhắn có thể bị chuyển hướng nếu số điện thoại bị chiếm quyền, và vì bạn có thể bị dụ đọc mã cho kẻ lừa đảo. Vẫn tốt hơn nhiều so với không có gì.
2. **Ứng dụng tạo mã (TOTP).** Ứng dụng trên điện thoại tạo mã gồm vài chữ số, đổi sau mỗi khoảng thời gian ngắn (thường là 30 giây). Cơ chế này dựa trên chuẩn *mật khẩu dùng một lần theo thời gian* (RFC 6238). Mã không đi qua mạng viễn thông nên an toàn hơn SMS.
3. **Thông báo xác nhận trên ứng dụng.** Một số dịch vụ gửi yêu cầu "có phải bạn đang đăng nhập không?" tới điện thoại. Hãy đọc kỹ nơi và thiết bị được nêu trước khi chấp nhận, đừng bấm đồng ý theo phản xạ.
4. **Khoá bảo mật vật lý và passkey.** Dựa trên chuẩn FIDO2/WebAuthn: thiết bị hoặc điện thoại của bạn chứng minh quyền sở hữu với đúng trang web thật. Vì gắn với địa chỉ trang, chúng chống được trang đăng nhập giả rất tốt. Đây là lựa chọn mạnh nhất nếu dịch vụ của bạn hỗ trợ.

Lời khuyên thực tế: dùng loại mạnh nhất mà dịch vụ cho phép; nếu chỉ có SMS thì vẫn nên bật.

## Chuẩn bị

- Một điện thoại hoạt động tốt, có màn hình khoá bằng mã hoặc sinh trắc học.
- Một ứng dụng tạo mã xác thực nếu bạn chọn TOTP (nhiều trình quản lý mật khẩu và ứng dụng độc lập đều có chức năng này).
- Quyền truy cập vào email khôi phục hiện tại và số điện thoại hiện tại của bạn.
- Một chỗ an toàn để cất **mã dự phòng** (xem bên dưới), ví dụ tệp trong trình quản lý mật khẩu hoặc tờ giấy cất kỹ.

## Các bước

Giao diện từng dịch vụ khác nhau và thay đổi theo thời gian, nên đây là quy trình chung; tên mục có thể là "Bảo mật", "Đăng nhập và bảo mật", "Xác minh 2 bước".

1. **Bắt đầu với email chính.** Email là chìa khoá khôi phục của hầu hết tài khoản khác, nên bảo vệ nó trước.
2. Vào phần cài đặt **bảo mật** của tài khoản, tìm mục xác thực hai bước hoặc đa yếu tố, rồi bắt đầu thiết lập.
3. **Chọn phương thức.** Ưu tiên khoá bảo mật hoặc passkey, rồi ứng dụng tạo mã, cuối cùng mới là SMS.
4. Với ứng dụng tạo mã: quét mã QR mà dịch vụ hiển thị bằng ứng dụng, sau đó nhập mã sáu chữ số vừa tạo để xác nhận hai bên khớp nhau.
5. **Lưu mã dự phòng.** Dịch vụ thường cấp một bộ mã dùng một lần để vào lại khi mất điện thoại. Hãy lưu ở nơi an toàn, tách khỏi điện thoại.
6. **Kiểm tra thông tin khôi phục**: số điện thoại và email dự phòng còn đúng và còn dùng được.
7. **Lặp lại** cho mạng xã hội, đám mây lưu trữ, tài khoản mua sắm và ngân hàng nếu có tuỳ chọn.

## Kiểm tra

Mở một cửa sổ ẩn danh hoặc một trình duyệt khác, thử đăng nhập vào tài khoản đó. Bạn sẽ được yêu cầu bước thứ hai. Nếu vào được thành công thì thiết lập đã đúng. Đừng đăng xuất khỏi tất cả thiết bị cho tới khi chắc chắn bạn đã thử xong, và hãy chắc rằng mã dự phòng đã được lưu.

## Lỗi hay gặp

- **Mất hoặc đổi điện thoại mà chưa chuyển ứng dụng tạo mã.** Đây là cách phổ biến nhất để tự khoá mình ngoài tài khoản. Trước khi đổi máy, hãy chuyển cài đặt sang máy mới hoặc dùng mã dự phòng. Một số ứng dụng cho phép sao lưu hoặc đồng bộ, hãy tìm hiểu tính năng đó.
- **Không lưu mã dự phòng.** Khi gặp sự cố mà không có mã, việc lấy lại tài khoản có thể rất lâu và không chắc thành công.
- **Chấp nhận thông báo xác nhận mà không đọc.** Nếu bạn nhận yêu cầu đăng nhập khi mình không làm gì, hãy **từ chối** và đổi mật khẩu ngay.
- **Đọc mã cho người lạ.** Mã xác thực chỉ để bạn tự nhập. Không ai có lý do chính đáng để hỏi bạn mã đó, nên hãy nhớ lại năm dấu hiệu lừa đảo ở bài đầu của chuỗi khi nhận một yêu cầu như vậy.
- **Dùng SMS rồi quên rủi ro đổi SIM.** Nếu thấy điện thoại bỗng mất sóng bất thường mà không rõ lý do, hãy liên hệ nhà mạng và kiểm tra ngay các tài khoản quan trọng.

## Tóm lại

Xác thực hai bước biến việc lộ mật khẩu từ thảm hoạ thành sự cố có thể xử lý được. Hãy bật nó cho email trước, rồi đến mạng xã hội và các tài khoản tài chính; chọn phương thức mạnh nhất có thể (khoá bảo mật hoặc passkey, rồi ứng dụng tạo mã, rồi SMS); và luôn giữ mã dự phòng ở nơi an toàn. Cùng với việc nhận diện lừa đảo và dùng mật khẩu riêng cho từng nơi, đây là ba thói quen đơn giản giúp bạn an toàn hơn đáng kể mỗi ngày.

## Tham khảo

- Wikipedia, "Multi-factor authentication": https://en.wikipedia.org/wiki/Multi-factor_authentication
- Wikipedia, "Time-based one-time password" (RFC 6238): https://en.wikipedia.org/wiki/Time-based_one-time_password
- Wikipedia, "WebAuthn": https://en.wikipedia.org/wiki/WebAuthn
- Wikipedia, "Passkey": https://en.wikipedia.org/wiki/Passkey_(credential)
