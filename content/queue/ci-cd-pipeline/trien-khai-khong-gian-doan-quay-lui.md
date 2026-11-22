---
title: Triển khai không gián đoạn và quay lui trong pipeline: rolling, blue/green, canary
tags: deployment, rolling update, blue/green, canary, rollback
type: note
---

> [!TLDR]
> - Triển khai không gián đoạn nghĩa là người dùng không thấy lỗi hay ngắt quãng khi bạn đưa phiên bản mới lên.
> - Ba chiến lược phổ biến: rolling (thay dần), blue/green (hai môi trường song song, chuyển lưu lượng), canary (cho một phần nhỏ người dùng thử trước).
> - Quay lui chỉ nhanh và an toàn khi bản cũ còn nguyên (artifact hoặc image gắn nhãn cố định) và cơ sở dữ liệu thay đổi theo kiểu tương thích.

## Mở đầu

Pipeline đã build và test xong, bước cuối là deploy. Nếu cách deploy là "tắt bản cũ, bật bản mới", trong khoảng giữa hai việc đó ứng dụng không phục vụ được ai. Bản mới lỗi thì phải làm lại từ đầu, vừa chậm vừa căng thẳng.

Bài này giải thích ba chiến lược triển khai giúp tránh gián đoạn, và cách chuẩn bị để quay lui (rollback) được ngay khi có sự cố. Phần nền về artifact và pipeline cơ bản đã có ở hai bài trước trong cùng chuỗi.

## Rolling: thay dần từng phiên bản

Giả sử ứng dụng chạy trên bốn bản sao (instance) phía sau một bộ cân bằng tải. Với **rolling update**, hệ thống thay từng bản hoặc từng nhóm nhỏ: bật bản mới, đợi nó sẵn sàng, rồi tắt một bản cũ, và lặp lại cho đến khi cả bốn là phiên bản mới.

- **Ưu điểm**: đơn giản, không cần gấp đôi tài nguyên, là mặc định của nhiều nền tảng.
- **Điều cần lưu ý**: trong lúc thay, bản cũ và bản mới chạy cùng lúc, nên cả hai phải cùng làm việc được với dữ liệu và API chung.
- **Điều kiện cần**: bộ cân bằng tải chỉ gửi yêu cầu vào bản đã *sẵn sàng*, nên ứng dụng cần một kiểm tra sức khoẻ (health check) đáng tin.

Kubernetes dùng rolling update làm chiến lược mặc định của Deployment. Bạn có thể xem cách hoạt động chi tiết, kèm các tham số, trong bài [[Deployment và rolling update trong Kubernetes: cập nhật ứng dụng mà không gián đoạn]].

## Blue/green: hai môi trường song song

Với **blue/green**, bạn có hai môi trường giống nhau: "blue" đang phục vụ người dùng, "green" là nơi dựng phiên bản mới. Sau khi kiểm tra xong trên green, bạn chuyển toàn bộ lưu lượng từ blue sang green, thường bằng cách đổi cấu hình của bộ cân bằng tải hoặc bản ghi định tuyến.

- **Ưu điểm**: chuyển gần như tức thì, và quay lui cũng chỉ là chuyển lưu lượng ngược về blue, bản cũ vẫn còn nguyên.
- **Nhược điểm**: cần tài nguyên cho hai môi trường trong thời gian chuyển; cơ sở dữ liệu dùng chung vẫn là điểm khó (xem phần dưới).

Martin Fowler có mô tả ngắn gọn mẫu này trong bài về BlueGreenDeployment ở mục Tham khảo.

## Canary: thử với một phần nhỏ trước

**Canary** lấy tên từ con chim hoàng yến dùng để báo hiệu khí độc trong hầm mỏ. Bạn đưa phiên bản mới cho một phần nhỏ lưu lượng, ví dụ vài phần trăm người dùng, rồi theo dõi lỗi, độ trễ và các chỉ số khác. Nếu ổn thì tăng dần tỷ lệ cho đến 100%, nếu không thì rút lại về bản cũ, và chỉ phần nhỏ người dùng đó bị ảnh hưởng.

- **Ưu điểm**: giảm phạm vi thiệt hại của một bản lỗi.
- **Nhược điểm**: cần khả năng chia lưu lượng theo tỷ lệ và cần giám sát tốt để biết bản mới "ổn" hay không. Không có số liệu thì canary chỉ là rolling chậm.

## Chuẩn bị để quay lui được

Chiến lược nào cũng vô nghĩa nếu bạn không quay lui được. Có ba điều kiện:

1. **Giữ nguyên bản cũ.** Mỗi bản phát hành phải là artifact hoặc image có nhãn cố định (ví dụ theo mã commit hoặc số phiên bản), không ghi đè. Tránh chỉ dùng nhãn `latest` vì nó không cho biết bản "cũ" là bản nào. Quay lui khi đó đơn giản là triển khai lại bản đã lưu, và pipeline nên cho phép chạy lại bước deploy với một phiên bản chỉ định.
2. **Quay lui phải được thử trước khi cần.** Hãy diễn tập định kỳ ở môi trường thử nghiệm. Với Kubernetes, lệnh quay lui được trình bày trong bài [[Quay lại phiên bản cũ trên Kubernetes bằng kubectl rollout undo]].
3. **Cơ sở dữ liệu đổi theo kiểu tương thích.** Đây là phần dễ bị quên nhất. Nếu bản mới đã xoá một cột mà bản cũ còn cần, quay lui sẽ hỏng dù mã đã trở về. Cách an toàn thường gọi là *parallel change* hay *expand/contract*: trước hết **mở rộng** (thêm cột hoặc bảng mới, vẫn giữ cái cũ), triển khai mã dùng được cả hai, chuyển hết sang cái mới, và chỉ ở lần phát hành sau mới **thu hẹp** (xoá cái cũ). Mỗi bước đều có thể quay lui.

## Đưa vào pipeline

Một deploy an toàn trong pipeline thường có các thành phần sau:

- **Môi trường (environment)**: cả GitHub Actions lẫn GitLab CI đều có khái niệm môi trường để theo dõi lịch sử triển khai và đặt quy tắc riêng.
- **Phê duyệt thủ công** trước production, nếu nhóm theo mô hình Continuous Delivery.
- **Chạy tuần tự, không song song**: hai lần deploy chồng nhau vào cùng một môi trường dễ gây lộn xộn. GitHub Actions có `concurrency`, GitLab CI có tài nguyên `resource_group` cho mục đích này.
- **Kiểm tra sau deploy (smoke test)**: một vài yêu cầu thử đơn giản để xác nhận ứng dụng trả lời đúng. Nếu hỏng, pipeline tự kích hoạt quay lui.

## Tóm lại

Triển khai không gián đoạn không cần phép màu, chỉ cần chọn đúng chiến lược và chuẩn bị đường lui. Rolling thay dần và hợp với đa số trường hợp; blue/green cho phép chuyển và quay lui tức thì nhưng tốn tài nguyên; canary giảm rủi ro nhưng đòi hỏi giám sát tốt. Dù chọn cách nào, hãy giữ nguyên các bản phát hành cũ, diễn tập quay lui và thay đổi cơ sở dữ liệu theo từng bước tương thích.

## Tham khảo

- Martin Fowler, BlueGreenDeployment: https://martinfowler.com/bliki/BlueGreenDeployment.html
- Martin Fowler, CanaryRelease: https://martinfowler.com/bliki/CanaryRelease.html
- Martin Fowler, ParallelChange: https://martinfowler.com/bliki/ParallelChange.html
- Kubernetes Docs, Deployments: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
- GitHub Docs, Managing environments for deployment: https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment
- GitLab Docs, Environments: https://docs.gitlab.com/ci/environments/
