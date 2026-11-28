---
title: Năm nguồn dữ liệu công khai để biết kỹ sư đang quan tâm điều gì
tags: xu hướng công nghệ, khảo sát, Octoverse, Google Trends, npm
type: note
---

> [!TLDR]
> - Mỗi nguồn dữ liệu xu hướng trả lời một câu hỏi khác nhau: khảo sát hỏi "bạn nói gì", dữ liệu hoạt động cho biết "bạn làm gì", còn tìm kiếm cho biết "bạn tò mò gì".
> - Năm nguồn dễ tiếp cận: Stack Overflow Developer Survey, GitHub Octoverse, Google Trends, thống kê tải gói (npm) và CNCF Annual Survey.
> - Không nguồn nào đủ một mình; hãy ghi lại nguồn, năm và cách đo trước khi dùng một con số.

## Mở đầu

Khi làm sản phẩm, viết tài liệu hay lên kế hoạch nội dung cho kỹ sư, câu hỏi đầu tiên thường là: "Giờ người ta đang quan tâm điều gì?" Câu trả lời dựa vào cảm giác rất dễ lệch, vì ta chỉ thấy những người quanh mình. May là có nhiều nguồn dữ liệu công khai, miễn phí. Bài này giới thiệu năm nguồn, cho biết mỗi nguồn đo cái gì và không đo cái gì. Bài tiếp theo, [[Đọc số liệu khảo sát công nghệ đúng cách: thiên lệch người trả lời, cỡ mẫu và so sánh giữa các năm]], sẽ đi sâu vào cách đọc chúng cho đúng.

Số liệu trong bài được ghi theo trang nguồn tính đến tháng 11/2026; các con số này sẽ đổi theo từng năm, nên khi dùng hãy mở lại nguồn.

## 1. Stack Overflow Developer Survey

Đây là khảo sát hằng năm do Stack Overflow thực hiện. Bản 2025 là năm thứ mười lăm, theo trang kết quả có hơn 49.000 phản hồi từ 177 quốc gia, gồm 62 câu hỏi về 314 công nghệ, với trọng tâm mới là công cụ AI, tác tử AI và mô hình ngôn ngữ lớn.

Nó đo **điều người trả lời nói**: ngôn ngữ họ dùng, công cụ họ muốn dùng, mức hài lòng với công việc. Điểm mạnh là có chuỗi nhiều năm và nhiều câu hỏi giống nhau, nên so sánh được. Điểm yếu là người trả lời tự chọn tham gia (xem bài sau).

## 2. GitHub Octoverse

Octoverse là báo cáo thường niên của GitHub dựa trên dữ liệu hoạt động thật trên nền tảng, chủ yếu là hoạt động công khai. "Năm Octoverse 2025" chạy từ 01/09/2024 đến 31/08/2025. Báo cáo cho biết hơn 36 triệu lập trình viên mới tham gia GitHub trong năm đó, và đến tháng 8/2025 TypeScript trở thành ngôn ngữ có nhiều người đóng góp hằng tháng nhất trên GitHub, vượt Python và JavaScript.

Nó đo **điều người ta làm**: ai đóng góp, ở ngôn ngữ nào. Lưu ý chính báo cáo nói rằng bảng xếp hạng ngôn ngữ dựa trên số người đóng góp, còn các chỉ mục khác dùng phương pháp khác và có thể xếp thứ tự khác. Ngoài ra nó chỉ thấy những gì nằm trên GitHub, không thấy mã đặt ở nơi khác.

## 3. Google Trends

Google Trends cho biết mức quan tâm tìm kiếm theo thời gian và vùng. Theo trang trợ giúp của Google, mỗi điểm dữ liệu được chia cho tổng lượt tìm kiếm của vùng và khoảng thời gian đó, rồi quy về thang 0–100; giá trị là **tương đối**, không phải số lượt tìm tuyệt đối. Từ khoá có rất ít lượt tìm có thể hiện là 0, và dữ liệu được thêm nhiễu nhỏ để bảo vệ quyền riêng tư.

Nó đo **điều người ta tò mò**. Một đợt tăng đột biến chỉ cho thấy sự quan tâm tìm kiếm, không chứng minh công nghệ đó "đang thắng". Cũng cần cẩn thận với từ khoá nhiều nghĩa (ví dụ "Go", "Rust").

## 4. Thống kê tải gói

Các registry như npm công bố số lượt tải theo gói và theo khoảng thời gian qua API công khai. Theo tài liệu của npm, có thể lấy tổng theo kỳ hoặc theo từng ngày, dữ liệu sớm nhất từ 10/01/2015, và nhật ký được xử lý mỗi ngày một lần sau nửa đêm UTC.

Ví dụ lệnh lấy lượt tải một gói trong tuần qua (thay `express` bằng gói bạn cần):

```bash
curl -s https://api.npmjs.org/downloads/point/last-week/express
```

Nó đo **mức dùng thực tế trong hệ sinh thái của registry đó**. Hạn chế: một lượt tải chưa phải một người dùng; hệ thống tích hợp liên tục tải đi tải lại cùng một gói. Vì thế hãy nhìn xu hướng theo thời gian hơn là so sánh tuyệt đối giữa hai gói khác bản chất.

## 5. CNCF Annual Survey

CNCF (Cloud Native Computing Foundation) khảo sát cộng đồng cloud native hằng năm. Theo trang báo cáo, bản 2024 chạy vào mùa thu 2024, có 750 người tham gia, công bố ngày 01/04/2025; trang nêu rằng một phần tư số người trả lời cho biết gần như toàn bộ việc phát triển và triển khai của họ dùng kỹ thuật cloud native. Nguồn này hữu ích cho hạ tầng, Kubernetes và hệ sinh thái liên quan, nhưng cỡ mẫu nhỏ hơn và thiên về những người đã quan tâm đến cloud native.

## Ghép các nguồn lại

| Nguồn | Đo gì | Điểm yếu chính |
|---|---|---|
| Stack Overflow Survey | Điều người ta nói | Tự chọn tham gia |
| GitHub Octoverse | Điều người ta làm | Chỉ thấy trên GitHub |
| Google Trends | Điều người ta tìm | Tương đối, nhiều nghĩa |
| Lượt tải gói | Mức dùng thực tế | Tải tự động |
| CNCF Survey | Cộng đồng cloud native | Mẫu nhỏ, thiên lệch chủ đề |

Khi ba nguồn khác loại cùng chỉ một hướng, bạn có tín hiệu đáng tin hơn nhiều so với khi chỉ có một nguồn.

## Tóm lại

Hãy coi mỗi nguồn là một cặp kính với độ méo riêng. Khi trích số liệu, luôn ghi nguồn, năm và cách đo. Bước kế tiếp là học cách đọc số liệu khảo sát cho đúng, rồi biến tín hiệu thành quyết định; hai bài sau của hành tinh này sẽ nói về việc đó.

## Tham khảo

- [Stack Overflow Developer Survey 2025](https://survey.stackoverflow.co/2025/)
- [GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- [Google Trends: cách dữ liệu được chuẩn hoá](https://support.google.com/trends/answer/4365533)
- [npm: tài liệu API lượt tải](https://github.com/npm/registry/blob/main/docs/download-counts.md)
- [CNCF Annual Survey 2024](https://www.cncf.io/reports/cncf-annual-survey-2024/)
