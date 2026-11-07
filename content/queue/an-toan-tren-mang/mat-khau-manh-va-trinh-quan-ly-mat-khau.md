---
title: Mật khẩu mạnh và trình quản lý mật khẩu: bỏ thói quen đặt một mật khẩu cho mọi nơi
tags: mật khẩu, trình quản lý mật khẩu, an toàn mạng, passphrase, bảo mật tài khoản
type: note
---

## Mở đầu

Nếu có một thói quen nên bỏ ngay hôm nay, đó là dùng chung một mật khẩu cho nhiều tài khoản. Chuyện xảy ra như sau: một dịch vụ nhỏ mà bạn đăng ký từ nhiều năm trước bị lộ dữ liệu, kẻ xấu lấy được cặp email và mật khẩu của bạn, rồi **thử đúng cặp đó** ở email, mạng xã hội, ngân hàng. Nếu mật khẩu giống nhau, một vụ lộ nhỏ biến thành mất nhiều tài khoản quan trọng. Kiểu tấn công thử lại thông tin đã lộ trên các dịch vụ khác này thường được gọi là *credential stuffing*.

Ở bài trước, chúng ta học cách nhận ra những tin nhắn và cuộc gọi muốn lấy thông tin của mình. Bài này nói về lớp phòng thủ tiếp theo: mật khẩu của bạn nên như thế nào, và làm sao nhớ được hàng chục mật khẩu khác nhau mà không phát điên.

## Mật khẩu "mạnh" nghĩa là gì

Nhiều người được dạy rằng mật khẩu tốt phải có chữ hoa, chữ thường, số và ký tự đặc biệt, rồi đổi mỗi vài tháng. Kết quả thường là những mật khẩu như `Matkhau@123` rất khó nhớ nhưng kẻ tấn công lại đoán được dễ dàng, vì mọi người đều biến tấu theo cùng một kiểu.

Hướng dẫn về danh tính số của NIST (Viện Tiêu chuẩn và Công nghệ Hoa Kỳ, ấn phẩm SP 800-63B; xem trang Password policy ở phần Tham khảo) có hướng khác: ưu tiên **độ dài**, cho phép mật khẩu dài và dùng được nhiều loại ký tự, không bắt người dùng phải đổi mật khẩu định kỳ khi chưa có dấu hiệu bị lộ, và nên kiểm tra mật khẩu mới có nằm trong danh sách mật khẩu phổ biến hoặc đã bị lộ hay không. Từ đó có thể rút ra những nguyên tắc thực tế:

1. **Dài tốt hơn phức tạp.** Một cụm từ dài thường vừa dễ nhớ vừa khó đoán hơn một chuỗi ngắn đầy ký tự lạ.
2. **Không dùng thông tin cá nhân.** Ngày sinh, tên người thân, số điện thoại, tên thú cưng đều dễ bị đoán từ mạng xã hội.
3. **Mỗi tài khoản một mật khẩu riêng.** Đây là nguyên tắc quan trọng nhất.
4. **Không dùng các mật khẩu phổ biến.** Những dãy như `123456`, `password`, `qwerty` luôn đứng đầu các danh sách mật khẩu bị đoán nhiều nhất.

## Passphrase: cụm từ dài dễ nhớ

Một cách tạo mật khẩu dài mà vẫn nhớ được là chọn **một cụm từ gồm nhiều từ ngẫu nhiên không liên quan nhau**, ví dụ bốn đến sáu từ. Điểm mấu chốt là từ phải được chọn ngẫu nhiên (bằng xúc xắc, bằng bộ tạo ngẫu nhiên của trình quản lý mật khẩu), chứ không phải một câu thơ hay câu nói nổi tiếng mà người khác có thể đoán ra. Cụm từ này thường được gọi là *passphrase*. Bạn có thể ghép thêm một dấu phân cách hoặc vài chữ số nếu trang web yêu cầu.

Passphrase đặc biệt hợp để làm **mật khẩu chính** cho trình quản lý mật khẩu, thứ duy nhất bạn thực sự phải nhớ.

## Trình quản lý mật khẩu hoạt động thế nào

Trình quản lý mật khẩu là ứng dụng lưu mật khẩu của bạn trong một "kho" được mã hoá bằng một mật khẩu chính. Bạn chỉ cần nhớ mật khẩu chính; ứng dụng sẽ:

- **Tạo mật khẩu ngẫu nhiên, dài** cho từng tài khoản mà bạn không cần nhớ.
- **Tự điền** mật khẩu khi bạn đăng nhập, thường chỉ trên đúng địa chỉ trang web đã lưu. Đây cũng là một lớp bảo vệ trước trang giả mạo: nếu ứng dụng không tự điền, hãy nghi ngờ địa chỉ trang đang mở.
- **Đồng bộ** giữa điện thoại và máy tính.
- Nhiều ứng dụng còn **cảnh báo mật khẩu trùng lặp hoặc yếu**, và kiểm tra xem mật khẩu có nằm trong các vụ lộ dữ liệu công khai hay không.

Bạn có thể chọn trình quản lý mật khẩu có sẵn trong trình duyệt hoặc hệ điều hành, một ứng dụng chuyên dụng, hoặc một công cụ mã nguồn mở lưu kho trên máy bạn. Mỗi lựa chọn có ưu nhược điểm riêng; điều quan trọng là chọn sản phẩm của đơn vị đáng tin, được cập nhật thường xuyên, và bật khoá bằng mật khẩu chính hoặc sinh trắc học.

## Các bước bắt đầu

### Mục tiêu

Chuyển dần các tài khoản quan trọng sang mật khẩu riêng, mạnh, do trình quản lý mật khẩu tạo.

### Chuẩn bị

- Một trình quản lý mật khẩu mà bạn chọn và cài trên điện thoại hoặc máy tính.
- Khoảng một buổi tối rảnh rỗi, và một cây bút để ghi tạm danh sách tài khoản (xoá sau khi dùng xong).

### Các bước

1. **Tạo mật khẩu chính** bằng một passphrase dài, chọn ngẫu nhiên. Luyện gõ nhiều lần trong vài ngày đầu để nhớ chắc.
2. **Liệt kê các tài khoản quan trọng nhất**: email chính, ngân hàng, mạng xã hội, đám mây lưu ảnh và tài liệu.
3. **Đổi mật khẩu từng tài khoản**, bắt đầu từ email chính, vì email thường dùng để khôi phục mọi tài khoản khác. Để trình quản lý mật khẩu tạo mật khẩu ngẫu nhiên và lưu lại.
4. **Dọn dần các tài khoản cũ**: những dịch vụ không còn dùng thì xoá tài khoản đi, ít tài khoản thì ít rủi ro.
5. **Kiểm tra định kỳ** báo cáo của trình quản lý mật khẩu về mật khẩu trùng hoặc yếu.

### Kiểm tra

Sau khi xong, thử đăng xuất rồi đăng nhập lại một tài khoản bằng cách tự điền của trình quản lý mật khẩu. Nếu được, hãy thử thêm trên điện thoại. Hãy chắc chắn bạn vào được kho mật khẩu từ nhiều thiết bị.

### Lỗi hay gặp

- **Quên mật khẩu chính.** Đa số trình quản lý mật khẩu không thể khôi phục kho nếu bạn quên, vì chính họ cũng không biết mật khẩu đó. Hãy đọc kỹ hướng dẫn khôi phục của sản phẩm bạn chọn từ đầu.
- **Đổi mật khẩu rồi quên lưu.** Hãy lưu mật khẩu mới vào trình quản lý trước khi xác nhận đổi trên trang web.
- **Dùng mật khẩu chính giống mật khẩu ở nơi khác.** Mật khẩu chính phải là duy nhất.
- **Ghi mật khẩu chính lên giấy dán ở bàn làm việc.** Nếu cần bản dự phòng, hãy cất ở nơi an toàn, không ai khác chạm tới.

## Nhớ mật khẩu chính bằng cách ôn lại ngắt quãng

Mật khẩu chính là thứ bạn gõ ít nhất một lần mỗi ngày trong những tuần đầu, nên thường tự khắc nhớ. Nhưng nếu muốn chắc ăn, bạn có thể áp dụng chính nguyên lý của trí nhớ: ôn lại đúng lúc sắp quên. Bài [[Đường cong quên lãng: vì sao ta quên nhanh và làm gì để nhớ lâu hơn]] giải thích vì sao việc nhắc lại cách quãng giúp thông tin bền hơn nhiều so với đọc lặp liền một mạch. Với passphrase, bạn chỉ cần tự gõ thử không nhìn sau một ngày, ba ngày, một tuần.

## Tóm lại

Mỗi tài khoản một mật khẩu riêng, dài và ngẫu nhiên là cách phòng thủ hiệu quả nhất trước việc lộ dữ liệu ở một nơi lan sang nhiều nơi khác. Để làm được điều đó mà không phải nhớ hàng chục mật khẩu, hãy dùng trình quản lý mật khẩu và chỉ ghi nhớ một passphrase dài làm mật khẩu chính. Nhưng mật khẩu, dù mạnh đến đâu, vẫn có thể bị lấy mất qua một trang giả mạo. Vì vậy bài tiếp theo sẽ thêm một lớp nữa: [[Bật xác thực hai bước cho email và mạng xã hội: thêm một khoá nữa cho tài khoản của bạn]].

## Tham khảo

- Wikipedia, "Password policy" (phần về hướng dẫn của NIST SP 800-63B): https://en.wikipedia.org/wiki/Password_policy
- Wikipedia, "Password strength": https://en.wikipedia.org/wiki/Password_strength
- Wikipedia, "Password manager": https://en.wikipedia.org/wiki/Password_manager
- Wikipedia, "Passphrase": https://en.wikipedia.org/wiki/Passphrase
- Wikipedia, "Credential stuffing": https://en.wikipedia.org/wiki/Credential_stuffing
