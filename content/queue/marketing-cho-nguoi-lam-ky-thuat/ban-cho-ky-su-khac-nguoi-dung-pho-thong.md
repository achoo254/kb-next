---
title: Bán cho kỹ sư khác bán cho người dùng phổ thông: tài liệu, bản dùng thử và ví dụ chạy được
tags: marketing kỹ thuật, nhà phát triển, tài liệu, bản dùng thử, sản phẩm kỹ thuật
type: note
---

> [!TLDR]
> - Kỹ sư muốn tự kiểm chứng trước khi tin: họ đọc tài liệu, thử bản dùng thử và chạy ví dụ, không đọc khẩu hiệu.
> - Ba thứ thuyết phục nhất là tài liệu rõ, đường dùng thử ngắn và ví dụ chạy được ngay.
> - Lời hứa mơ hồ làm mất lòng tin nhanh hơn là không hứa gì.

## Mở đầu

Khi nói đến "marketing", nhiều người nghĩ ngay đến quảng cáo, khẩu hiệu và hình ảnh đẹp. Cách đó thường hiệu quả với người dùng phổ thông, những người chọn sản phẩm dựa trên cảm nhận, lời giới thiệu hay giao diện. Nhưng với sản phẩm kỹ thuật như một thư viện, một API, một dịch vụ lưu trữ hay một công cụ vận hành, người quyết định thường là kỹ sư, và họ có thói quen rất khác.

Bài này giải thích sự khác biệt đó và đưa ra ba việc cụ thể giúp một sản phẩm kỹ thuật được tin cậy: tài liệu, bản dùng thử và ví dụ chạy được. Đây là bài giải thích chung về cách làm nội dung, không dựa trên số liệu của riêng ai.

## Người dùng phổ thông và kỹ sư ra quyết định khác nhau thế nào

Người dùng phổ thông thường quyết định nhanh, dựa trên vài tín hiệu: sản phẩm có dễ hiểu không, bạn bè có dùng không, giá bao nhiêu. Họ chấp nhận để sản phẩm "dẫn dắt" mình qua các bước.

Kỹ sư thì khác ở ba điểm:

- **Họ nghi ngờ lời quảng cáo theo thói quen nghề nghiệp.** Công việc của họ là tìm ra chỗ hệ thống hỏng, nên một câu như "nhanh nhất", "đơn giản nhất" khiến họ hỏi ngay: so với cái gì, đo thế nào?
- **Họ muốn tự kiểm chứng.** Thay vì tin lời bạn, họ mở tài liệu, thử gọi API, đọc mã nguồn nếu có.
- **Họ chịu trách nhiệm về hậu quả.** Chọn một công cụ nghĩa là họ phải tích hợp, vận hành và sửa lỗi nó về sau. Vì vậy họ quan tâm đến chi tiết: phiên bản, giới hạn, cách xử lý lỗi, cách rút lui nếu cần đổi nhà cung cấp.

Hệ quả là kênh thuyết phục đổi hẳn: thay vì kể câu chuyện hay, bạn cần cho họ bằng chứng mà họ tự lấy được.

## Thứ nhất: tài liệu là trang bán hàng chính

Với nhiều sản phẩm kỹ thuật, trang tài liệu được đọc kỹ hơn trang chủ. Kỹ sư thường vào thẳng tài liệu để trả lời câu hỏi "cái này có làm được việc của tôi không và tôi mất bao lâu để bắt đầu?".

Một cách chia tài liệu dễ áp dụng là khung Diátaxis, tách nội dung thành bốn loại có mục đích khác nhau: hướng dẫn làm quen (tutorial), hướng dẫn làm một việc cụ thể (how-to), tài liệu tra cứu (reference) và bài giải thích (explanation). Trộn bốn loại vào một trang là lỗi phổ biến: người mới bị ngợp bởi bảng tham số, còn người đã quen phải lội qua phần dạy từ đầu.

Một số nguyên tắc nhỏ nhưng đáng làm:

- Viết câu đầy đủ, dùng thuật ngữ nhất quán, nêu phiên bản mà tài liệu áp dụng.
- Nói thẳng giới hạn và điều sản phẩm không làm. Kỹ sư sẽ tự phát hiện ra giới hạn, và họ đánh giá cao việc bạn nói trước.
- Giữ tài liệu cùng nhịp với sản phẩm: tài liệu cũ gây hại hơn thiếu tài liệu, vì nó làm người đọc mất thời gian rồi mất lòng tin.

## Thứ hai: bản dùng thử ngắn đường

Bản dùng thử là cách để kỹ sư tự kiểm chứng. Điều quan trọng không phải là thời hạn bao nhiêu ngày mà là quãng đường từ lúc quyết định thử đến lúc thấy kết quả đầu tiên chạy.

Những điểm cần xem lại:

- **Số bước đến kết quả đầu tiên.** Mỗi biểu mẫu dài, mỗi bước chờ duyệt đều làm rơi bớt người thử.
- **Có cần thẻ thanh toán hay không.** Đây là quyết định kinh doanh, nhưng hãy biết rằng yêu cầu này làm tăng ma sát khi người ta chỉ muốn thử.
- **Môi trường thử có đủ thật không.** Nếu bản thử bị cắt quá nhiều tính năng, kỹ sư không thể đánh giá được thứ họ sẽ dùng thật.
- **Cách rút lui.** Cho phép xuất dữ liệu và xoá tài khoản dễ dàng nghe có vẻ phản trực giác, nhưng nó giúp kỹ sư yên tâm bắt đầu.

Một thước đo thực tế là "thời gian đến giá trị đầu tiên": một người mới mất bao lâu để chạy được ví dụ đầu tiên? Hãy tự đo bằng cách nhờ một người chưa từng dùng sản phẩm thử và quan sát họ vướng ở đâu.

## Thứ ba: ví dụ chạy được ngay

Một đoạn mã minh hoạ đẹp nhưng không chạy được là loại nội dung làm hại uy tín nhất. Ví dụ tốt có những đặc điểm sau:

- **Sao chép, dán rồi chạy được.** Ghi rõ phiên bản ngôn ngữ, thư viện và hệ điều hành đã thử.
- **Nhỏ và tập trung.** Mỗi ví dụ làm một việc, kèm kết quả mong đợi để người đọc tự đối chiếu.
- **Dùng dữ liệu và địa chỉ ví dụ an toàn**, chẳng hạn tên miền example.com, thay vì khoá hay địa chỉ thật.
- **Được kiểm thử tự động.** Nếu ví dụ nằm trong kho mã và được chạy trong quy trình kiểm thử, nó sẽ không lặng lẽ hỏng khi sản phẩm đổi.

Ví dụ chạy được còn có tác dụng phụ: người đọc có thể sửa nó thành điểm khởi đầu của dự án thật, nghĩa là họ đã bắt đầu tích hợp ngay từ lúc đang đánh giá.

## Lỗi hay gặp

- Dùng tính từ tuyệt đối ("nhanh nhất", "an toàn tuyệt đối") mà không có số đo hay điều kiện kèm theo.
- Giấu giá hoặc giới hạn sau nút "liên hệ" khiến kỹ sư không thể tự ước tính chi phí.
- Để tài liệu nằm sau tường đăng nhập, trong khi động tác đầu tiên của kỹ sư là tìm kiếm và đọc.
- Dùng cùng một thông điệp cho mọi đối tượng, trong khi người ký hợp đồng và người viết mã quan tâm đến những điều khác nhau.

Cần lưu ý một điều: ở nhiều tổ chức, người trả tiền không phải là người dùng. Kỹ sư thường là người đánh giá và ủng hộ, còn người duyệt ngân sách cần thêm thông tin về chi phí và rủi ro. Phần tiếp theo trong chuỗi bài về phễu nhà phát triển, [[Phễu nhà phát triển: từ biết đến, dùng thử, tích hợp đến trả tiền]], đi vào chặng đường này.

## Tóm lại

Bán cho kỹ sư là cho họ cơ hội tự kiểm chứng. Tài liệu rõ ràng, bản dùng thử ngắn đường và ví dụ chạy được là ba thứ biến lời hứa thành bằng chứng. Hãy bớt khẩu hiệu, nói thẳng giới hạn và để sản phẩm tự chứng minh.

## Tham khảo

- Diátaxis, khung tài liệu kỹ thuật: https://diataxis.fr/
- Write the Docs, hướng dẫn viết tài liệu: https://www.writethedocs.org/guide/
- Google developer documentation style guide: https://developers.google.com/style
