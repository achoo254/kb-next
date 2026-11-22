---
title: Pipeline CI/CD gồm những giai đoạn nào: build, test, deploy, artifact và cache
tags: ci/cd, pipeline, artifact, cache, devops
type: note
---

> [!TLDR]
> - Pipeline là chuỗi bước tự động chạy mỗi khi có thay đổi mã: build, test, đóng gói rồi triển khai.
> - Artifact là sản phẩm của một bước để các bước sau dùng lại; cache chỉ là bản lưu tạm để chạy nhanh hơn.
> - Mỗi giai đoạn phải cho kết quả đạt hoặc không đạt rõ ràng, giai đoạn trước hỏng thì giai đoạn sau không chạy.

## Mở đầu

Nhiều nhóm phát triển phần mềm vẫn triển khai bằng tay: ai đó đăng nhập máy chủ, kéo mã mới về, chạy vài lệnh rồi hy vọng mọi thứ ổn. Cách này chậm, dễ sót bước và khó lặp lại. CI/CD thay những việc tay đó bằng một **pipeline**: chuỗi bước tự động mà hệ thống chạy mỗi khi có thay đổi mã.

Hai chữ viết tắt thường được gộp chung nhưng nói về hai việc khác nhau:

- **CI (Continuous Integration, tích hợp liên tục)**: mỗi thay đổi được gộp vào nhánh chung đều được build và kiểm thử tự động, để lỗi lộ ra sớm khi còn nhỏ.
- **CD** thường được hiểu là *Continuous Delivery* (luôn có sẵn bản đã qua kiểm thử, sẵn sàng phát hành khi người ta bấm nút) hoặc *Continuous Deployment* (bản đạt kiểm thử được triển khai luôn, không cần bấm). Hai cách hiểu này khác nhau ở chỗ có người bấm nút phát hành hay không, nên khi đọc tài liệu hãy xem tác giả đang dùng nghĩa nào.

Bài này giải thích các giai đoạn thường gặp của một pipeline, rồi hai khái niệm hay bị nhầm lẫn là artifact và cache. Bài kế tiếp, [[GitHub Actions và GitLab CI cho cùng một dự án Node.js: viết hai pipeline để so sánh]], sẽ viết pipeline thật bằng hai công cụ phổ biến.

## Các giai đoạn thường gặp

Tên giai đoạn mỗi nơi một khác, nhưng ý tưởng khá giống nhau. Một pipeline cho ứng dụng web có thể gồm:

1. **Lấy mã (checkout)**: tải đúng phiên bản mã nguồn của commit đang xét về máy chạy pipeline.
2. **Cài phụ thuộc**: ví dụ `npm ci` cho dự án Node.js. Lệnh này cài đúng các phiên bản ghi trong tệp khoá (`package-lock.json`) nên kết quả lặp lại được.
3. **Kiểm tra tĩnh (lint)**: bắt lỗi cú pháp và quy ước viết mã trước cả khi chạy chương trình.
4. **Build**: biên dịch hoặc đóng gói mã thành thứ có thể chạy được, ví dụ thư mục `dist/` hay một container image.
5. **Test**: chạy kiểm thử đơn vị, và nếu có thì cả kiểm thử tích hợp.
6. **Đóng gói và lưu trữ**: đưa kết quả build lên nơi lưu, như registry cho image hoặc kho artifact.
7. **Deploy**: đưa bản đã đóng gói lên môi trường đích, thường là môi trường thử nghiệm (staging) trước rồi mới tới production.

Quy tắc quan trọng nhất là **giai đoạn trước hỏng thì giai đoạn sau dừng**. Nếu test đỏ thì không deploy. Nhờ đó pipeline làm vai trò cổng chặn: mã chưa đạt kiểm tra không thể đi tiếp.

Một nguyên tắc khác là **build một lần, dùng nhiều lần**. Bản build đã được test ở bước 5 phải đúng là bản được deploy ở bước 7. Nếu mỗi môi trường tự build lại thì thứ chạy ở production có thể khác thứ đã được kiểm thử, dù cùng một commit.

## Artifact: sản phẩm của một bước

**Artifact** là tệp hoặc thư mục do một bước tạo ra và được giữ lại để bước khác, hoặc con người, dùng sau. Ví dụ:

- thư mục `dist/` chứa bản build của giao diện web;
- một tệp `.tar.gz` hay `.zip` chứa chương trình đã biên dịch;
- báo cáo kiểm thử hoặc báo cáo độ phủ;
- một container image đẩy lên registry (thường người ta coi registry là nơi lưu artifact dạng image).

Mỗi job trong pipeline thường chạy trên một máy (hoặc container) mới tinh, nên thứ job `build` tạo ra sẽ **mất** khi job kết thúc nếu bạn không lưu thành artifact. Job `deploy` ở phía sau muốn dùng bản build thì phải tải artifact đó về.

Artifact còn có hai lợi ích: bạn có thể tải về để kiểm tra khi pipeline hỏng, và có thể giữ bản đã phát hành để quay lui sau này (xem bài [[Triển khai không gián đoạn và quay lui trong pipeline: rolling, blue/green, canary]]). Vì chiếm dung lượng, các công cụ đều cho đặt thời hạn lưu.

Về container image, cách đóng gói gọn thường dùng Dockerfile nhiều tầng như trong bài [[Dockerfile nhiều tầng (multi-stage): build nặng, image chạy nhẹ]].

## Cache: bản lưu tạm cho nhanh

**Cache** có mục đích khác: tránh làm lại việc tốn thời gian. Ví dụ, mỗi lần chạy mà tải lại toàn bộ thư viện npm từ internet thì rất chậm. Nếu lưu thư mục tải về của lần chạy trước, lần sau chỉ cần lấy lại.

Điểm khác cốt lõi giữa hai khái niệm:

| | Artifact | Cache |
| --- | --- | --- |
| Mục đích | Chuyển kết quả giữa các bước, hoặc giữ để dùng lại | Chạy nhanh hơn |
| Có được phép thiếu không | Không, bước sau cần nó | Có, thiếu thì chỉ chậm hơn |
| Độ tin cậy | Phải đúng và đầy đủ | Có thể bị xoá hoặc cũ bất cứ lúc nào |

Vì cache có thể mất, pipeline **không được phụ thuộc** vào nó để chạy đúng. Nếu mất cache mà pipeline hỏng thì chỗ đó đáng lẽ phải là artifact.

Khoá cache thường được tạo từ nội dung tệp khoá phụ thuộc, ví dụ băm của `package-lock.json`. Khi bạn thêm hoặc nâng cấp thư viện, tệp này đổi, khoá đổi và hệ thống tạo cache mới. Khi tệp không đổi, cache cũ được dùng lại. Cả GitHub Actions và GitLab CI đều có cơ chế này; bài sau sẽ có ví dụ cụ thể.

## Những sai lầm hay gặp

- **Nhầm cache với artifact**: để job deploy lấy bản build từ cache. Khi cache bị xoá, deploy hỏng.
- **Test chậm nằm quá sớm**: nên đặt kiểm tra rẻ và nhanh (lint, test đơn vị) trước, để lỗi dễ bị bắt sớm và không tốn tài nguyên.
- **Đưa bí mật vào mã pipeline**: mật khẩu, khoá truy cập phải nằm trong kho bí mật (secrets/variables) của công cụ CI, không ghi thẳng vào tệp cấu hình.
- **Build lại ở mỗi môi trường**: phá nguyên tắc build một lần.

## Tóm lại

Pipeline CI/CD biến chuỗi việc thủ công thành quy trình tự động: lấy mã, cài phụ thuộc, kiểm tra, build, test, đóng gói và deploy, mỗi giai đoạn là một cổng chặn. Artifact là sản phẩm cần giữ lại để các bước sau dùng, còn cache chỉ giúp chạy nhanh và có thể mất bất cứ lúc nào. Nắm rõ sự khác biệt này sẽ giúp bạn đọc và viết pipeline đúng ngay từ đầu.

## Tham khảo

- GitHub Docs, Understanding GitHub Actions: https://docs.github.com/en/actions/get-started/understanding-github-actions
- GitHub Docs, Caching dependencies to speed up workflows: https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows
- GitLab Docs, Caching in GitLab CI/CD: https://docs.gitlab.com/ci/caching/
- GitLab Docs, Job artifacts: https://docs.gitlab.com/ci/jobs/job_artifacts/
