---
title: LogQL cơ bản và cảnh báo từ log: khi nào dùng metric thay vì log
tags: logql, loki, cảnh báo, log, metric
type: note
---

> [!TLDR]
> - Một truy vấn LogQL gồm bộ chọn luồng theo nhãn, rồi các bộ lọc dòng; đặt bộ lọc dòng ngay đầu để chạy nhanh.
> - Bọc truy vấn trong `rate` hoặc `count_over_time` thì ra số liệu, dùng để vẽ biểu đồ hoặc đặt cảnh báo.
> - Cái gì đo được trực tiếp thì nên là metric; log dành cho chi tiết và sự kiện hiếm.

## Mở đầu

Gom log về một nơi chưa đủ; bạn còn phải hỏi được nó. Loki dùng ngôn ngữ truy vấn LogQL, có hình dáng gần với PromQL của Prometheus. Bài này giới thiệu cú pháp cơ bản, cách biến log thành con số, cách đặt cảnh báo từ log, và quan trọng nhất là khi nào không nên làm vậy. Nội dung đối chiếu với tài liệu chính thức của Grafana, tính đến tháng 11/2026.

Bài giả định log đã vào Loki như trong bài trước của chuỗi (Loki và Grafana Alloy), với các nhãn `host`, `job` và `unit`.

## Bộ chọn luồng và bộ lọc dòng

Mọi truy vấn log bắt đầu bằng bộ chọn luồng trong dấu ngoặc nhọn, gồm các cặp `nhãn="giá trị"` cách nhau bằng dấu phẩy:

```logql
{job="journald", unit="ssh.service"}
```

Các toán tử so khớp nhãn là `=`, `!=`, `=~` (khớp biểu thức chính quy) và `!~` (không khớp). Biểu thức chính quy trong bộ chọn luồng phải khớp toàn bộ giá trị nhãn.

Sau bộ chọn, bạn lọc nội dung từng dòng bằng bốn toán tử:

- `|=` dòng chứa chuỗi;
- `!=` dòng không chứa chuỗi;
- `|~` dòng khớp biểu thức chính quy;
- `!~` dòng không khớp biểu thức chính quy.

```logql
{job="journald", unit="ssh.service"} |= "Failed" != "invalid user"
```

Biểu thức chính quy ở bộ lọc dòng không bị neo hai đầu, và phân biệt hoa thường trừ khi bạn thêm tiền tố `(?i)`. Các bộ lọc nối tiếp được. Tài liệu khuyên đặt bộ lọc dòng ở đầu chuỗi xử lý, vì các bước sau chỉ chạy trên những dòng đã qua lọc nên nhanh hơn.

Đây cũng là lý do bài trước khuyên đặt ít nhãn: một bộ chọn hẹp cộng bộ lọc dòng thường đã đủ nhanh mà không cần thêm nhãn.

## Phân tích dòng log có cấu trúc

Nếu dòng log là JSON hay logfmt, bạn có thể tách trường ra:

```logql
{job="app"} | json
{job="app"} | logfmt
```

`| json` không tham số sẽ trích mọi thuộc tính JSON thành nhãn tạm thời (khoá lồng nhau nối bằng dấu gạch dưới); với tham số thì chỉ trích các trường bạn nêu. `| logfmt` làm tương tự cho dạng `khoá=giá trị`. Nếu bộ phân tích gặp dòng sai định dạng, dòng vẫn được giữ và gắn thêm nhãn `__error__`. Sau khi tách, bạn lọc được theo trường, ví dụ `| duration > 10s`.

Lưu ý quan trọng: nhãn tạm sinh ra từ `json` hay `logfmt` chỉ tồn tại trong truy vấn, không làm tăng chỉ mục. Đó là cách tốt để lọc theo các giá trị nhiều biến thể mà không phải đặt thành nhãn.

## Biến log thành con số

Bọc một truy vấn log trong hàm trên khoảng thời gian thì được số liệu:

- `count_over_time(...)`: đếm số dòng trong khoảng thời gian;
- `rate(...)`: số dòng mỗi giây;
- `bytes_rate(...)`: số byte mỗi giây.

```logql
count_over_time({job="journald", unit="ssh.service"} |= "Failed" [5m])
sum by (host) (rate({job="journald"} |= "error" [5m]))
```

Khoảng thời gian có thể đặt ngay sau bộ chọn luồng hoặc ở cuối chuỗi xử lý. Quen với `sum by` của PromQL, bạn sẽ thấy cách gom theo nhãn ở đây giống hệt; xem lại [[PromQL cơ bản: counter, gauge, rate và sum by qua ví dụ CPU, RAM, ổ đĩa]] nếu cần. Kết quả này vẽ được thành biểu đồ trong Grafana như số liệu thông thường.

## Cảnh báo từ log

Loki có thành phần ruler, liên tục chạy các truy vấn đã cấu hình và hành động theo kết quả. Luật cảnh báo có định dạng giống Prometheus, chỉ khác là biểu thức `expr` viết bằng LogQL:

```yaml
groups:
  - name: vi-du
    rules:
      - alert: TyLeLoiCao
        expr: |
          sum(rate({app="foo", env="production"} |= "error" [5m])) by (job)
            /
          sum(rate({app="foo", env="production"}[5m])) by (job)
            > 0.05
        for: 10m
        labels:
          severity: page
        annotations:
          summary: Tỷ lệ dòng lỗi cao
```

Luật này tính tỷ lệ dòng chứa "error" trên tổng số dòng, và nếu vượt 5% liên tục 10 phút thì phát cảnh báo. Ruler gửi cảnh báo tới Alertmanager theo cấu hình `alertmanager_url`. Với kho luật cục bộ, mỗi tệp luật nằm trong thư mục theo mã tenant; ở chế độ một tenant, mã mặc định là `fake`. Ngoài ra, Grafana có cảnh báo do chính Grafana quản lý, mà tài liệu Loki gọi là loại được khuyến nghị, và có thể truy vấn nhiều nguồn dữ liệu trong một luật.

Nếu bạn quen với việc Alertmanager nhóm và gửi thông báo, mọi thứ vẫn như cũ; chỉ có nguồn của cảnh báo là log thay vì metric.

## Khi nào dùng metric, khi nào dùng log

Cảnh báo từ log hoạt động, nhưng không phải lúc nào cũng là lựa chọn tốt. Một quy tắc thực dụng:

- **Dùng metric** cho thứ đo được liên tục: CPU, RAM, ổ đĩa, số yêu cầu mỗi giây, độ trễ. Metric nhỏ, rẻ, truy vấn nhanh và ổn định, vì nó là con số ngay từ đầu.
- **Dùng log** cho sự kiện rời rạc, hiếm và cần ngữ cảnh: một lần đăng nhập thất bại, một dịch vụ báo lỗi cụ thể, một thông điệp mà chương trình không xuất ra dưới dạng metric.
- Nếu bạn thấy mình đếm một loại dòng log nào đó mỗi ngày để cảnh báo, hãy cân nhắc để chương trình xuất thẳng một metric. Việc đếm dòng log đòi hỏi đọc lại nhiều dữ liệu hơn và phụ thuộc vào việc chữ trong dòng log không bị đổi.
- Cảnh báo bằng metric cho bạn biết có vấn đề; log giúp bạn tìm ra nguyên nhân. Hai thứ bổ sung nhau; so sánh chi tiết nằm trong [[Cảnh báo với Prometheus và Alertmanager: metric khác log thế nào]].

## Tóm lại

LogQL gồm bộ chọn luồng, bộ lọc dòng (đặt ở đầu), bộ phân tích `json` và `logfmt`, và các hàm như `rate`, `count_over_time` để ra con số. Ruler của Loki cho phép đặt cảnh báo theo định dạng Prometheus bằng LogQL. Hãy giữ cảnh báo cho các việc đo được trên metric, và dùng log để điều tra. Như vậy dashboard ở Grafana, log ở Loki và cảnh báo ở Alertmanager hợp thành một vòng quan sát đầy đủ.

## Tham khảo

- [Cú pháp truy vấn log của LogQL](https://grafana.com/docs/loki/latest/query/log_queries/)
- [Truy vấn số liệu từ log](https://grafana.com/docs/loki/latest/query/metric_queries/)
- [Cảnh báo và luật ghi của Loki](https://grafana.com/docs/loki/latest/alert/)
