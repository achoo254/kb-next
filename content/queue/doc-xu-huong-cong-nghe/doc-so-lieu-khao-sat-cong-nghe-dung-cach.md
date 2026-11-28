---
title: Đọc số liệu khảo sát công nghệ đúng cách: thiên lệch người trả lời, cỡ mẫu và so sánh giữa các năm
tags: khảo sát, thiên lệch, thống kê, xu hướng công nghệ, đọc số liệu
type: note
---

> [!TLDR]
> - Khảo sát công khai thường là mẫu tự chọn: người trả lời không đại diện cho toàn bộ kỹ sư.
> - Trước khi tin một con số, hãy hỏi: ai trả lời, được tuyển bằng cách nào, bao nhiêu người, câu hỏi diễn đạt ra sao.
> - So sánh giữa các năm chỉ có ý nghĩa khi câu hỏi và cách tuyển mẫu giữ nguyên; chênh lệch nhỏ thường chỉ là nhiễu.

## Mở đầu

Một dòng như "X% lập trình viên dùng công cụ Y" rất dễ lan đi và rất dễ bị hiểu sai. Bài này giúp bạn đặt vài câu hỏi trước khi dùng con số, dựa trên các khảo sát công khai như Stack Overflow Developer Survey và CNCF Annual Survey. Bài trước, bài về năm nguồn dữ liệu công khai, đã giới thiệu các nguồn; bài này nói cách đọc chúng.

## Ý 1: Người trả lời không phải là tất cả

Trang kết quả Stack Overflow Developer Survey 2025 cho biết có hơn 49.000 phản hồi từ 177 quốc gia, trong đó Hoa Kỳ chiếm 20,4%, Đức 8,6% và Ấn Độ 7,2%. Đây là một mẫu rất lớn, nhưng lớn không có nghĩa là đại diện. Những người điền khảo sát của một trang hỏi đáp thường là người đã biết và dùng trang đó, nên nhóm không dùng trang sẽ vắng mặt. Hiện tượng này gọi là **thiên lệch tự chọn** (self-selection bias): người chọn tham gia khác người không tham gia.

Ví dụ tưởng tượng: nếu một khảo sát về công cụ container chỉ được gửi qua một nhóm cộng đồng cloud native, tỷ lệ dùng container trong kết quả gần như chắc chắn cao hơn tỷ lệ thật của toàn ngành. CNCF Annual Survey 2024 có 750 người tham gia từ cộng đồng cloud native; kết quả cho biết điều gì đó về cộng đồng ấy, và chỉ suy ra ngoài cộng đồng khi có thêm bằng chứng.

## Ý 2: Cỡ mẫu và nhóm con

Một mẫu 49.000 người nghe rất lớn, nhưng khi bạn cắt theo một nhóm nhỏ (một quốc gia, một vai trò, một ngôn ngữ ít phổ biến) thì số người còn lại có thể rất ít. Với nhóm nhỏ, tỷ lệ dao động mạnh hơn. Nguyên tắc thực dụng:

1. Luôn tìm xem báo cáo ghi số người ở **nhóm bạn quan tâm**, không chỉ tổng số.
2. Nếu báo cáo không ghi cỡ mẫu của nhóm con, đừng so hai tỷ lệ chênh vài điểm phần trăm và kết luận bên nào hơn.
3. Với mẫu nhỏ như 750 người, hãy coi kết quả là gợi ý về hướng chứ không phải số chính xác.

## Ý 3: Câu hỏi hỏi gì và hỏi ai

Cùng một công nghệ có thể được đo theo nhiều cách: "đã dùng trong năm qua", "đang dùng nhiều nhất", "muốn dùng trong năm tới", "yêu thích". Stack Overflow Survey tách riêng các nhóm như công nghệ được ngưỡng mộ, mong muốn, và đang làm việc cùng. Ba con số này không thay thế được nhau: một công cụ có thể được nhiều người **muốn** học nhưng ít người **đang dùng** trong công việc.

Vì vậy, khi trích số liệu, hãy ghi rõ nó trả lời câu hỏi nào. Viết "27% người trả lời nói họ muốn dùng X" khác hẳn "27% kỹ sư dùng X" (con số này chỉ minh hoạ cách viết, không phải số liệu thật).

## Ý 4: Hoạt động và lời nói khác nhau

Dữ liệu hoạt động như Octoverse đếm việc người ta làm trên GitHub trong một khoảng thời gian cụ thể: năm Octoverse 2025 chạy từ 01/09/2024 đến 31/08/2025. Báo cáo cũng nêu rõ bảng xếp hạng ngôn ngữ dùng số người đóng góp, và các chỉ mục khác dùng phương pháp khác nên có thể xếp thứ tự khác. Cùng một câu hỏi "ngôn ngữ nào phổ biến nhất" có thể có nhiều đáp án tuỳ cách đo; đó không phải mâu thuẫn mà là khác định nghĩa.

Google Trends còn khác nữa: giá trị 0–100 là tương đối trong vùng và thời gian đã chọn, không phải số lượt tìm. Một biểu đồ thấy "tụt" từ 100 xuống 60 không có nghĩa lượt tìm giảm 40%; đó là so với đỉnh của chính khoảng thời gian bạn chọn.

## Ý 5: So sánh giữa các năm

Muốn nói "tăng" hay "giảm", bạn cần cùng câu hỏi, cùng cách tuyển mẫu và cùng tập lựa chọn. Khảo sát thường thêm hoặc đổi câu hỏi theo năm; Stack Overflow Survey 2025 chẳng hạn nêu rõ trọng tâm mới là công cụ AI và tác tử. Nếu mẫu đổi (ví dụ một quốc gia chiếm nhiều hơn), tỷ lệ chung đổi theo dù hành vi từng nhóm không đổi.

Một danh sách kiểm nhanh khi so sánh:

- Câu hỏi có giữ nguyên chữ không?
- Danh sách lựa chọn có thêm hoặc bớt mục không?
- Số người và thành phần theo quốc gia có tương tự không?
- Chênh lệch có lớn hơn vài điểm phần trăm không? Nếu chỉ chênh một hai điểm, hãy coi là "không đổi đáng kể".

## Ý 6: Khi nào nên nghi ngờ

Hãy chậm lại khi gặp một số liệu thiếu nguồn, thiếu năm, không nói cỡ mẫu, hoặc được dùng để chứng minh đúng điều người trích muốn. Nếu không tìm được báo cáo gốc, đừng dùng. Chỉ trích số liệu bạn đã mở và đọc ở trang gốc.

## Tóm lại

Khảo sát công khai là tín hiệu hữu ích, không phải sự thật tuyệt đối. Hỏi ai trả lời, hỏi gì, đo cách nào, mẫu bao nhiêu và có so sánh được không. Khi đã đọc đúng, bước cuối là biến tín hiệu thành quyết định, như bài [[Biến tín hiệu xu hướng thành quyết định về nội dung và sản phẩm]] trình bày.

## Tham khảo

- [Stack Overflow Developer Survey 2025](https://survey.stackoverflow.co/2025/)
- [CNCF Annual Survey 2024](https://www.cncf.io/reports/cncf-annual-survey-2024/)
- [GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- [Google Trends: cách dữ liệu được chuẩn hoá](https://support.google.com/trends/answer/4365533)
- [Wikipedia: Self-selection bias](https://en.wikipedia.org/wiki/Self-selection_bias)
