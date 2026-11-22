---
title: Theo dõi lỗ hổng của thư viện phụ thuộc và xử lý thành phần hết hỗ trợ (EOL)
tags: thư viện phụ thuộc, lỗ hổng, SBOM, EOL, Dependabot
type: note
---

> [!TLDR]
> - Phần lớn mã trong một ứng dụng hiện đại là thư viện của người khác, nên lỗ hổng của chúng cũng là lỗ hổng của bạn.
> - Cần ba việc đều đặn: biết mình dùng gì (kiểm kê, SBOM), biết lỗ hổng nào đã công bố, và có quy trình cập nhật.
> - Thành phần hết hỗ trợ (EOL) không còn được vá; phải lên kế hoạch thay thế, nâng cấp hoặc có biện pháp giảm rủi ro rõ ràng.

## Mở đầu

Khi bạn chạy `npm install` hay `pip install`, bạn kéo về không chỉ thư viện mình chọn mà cả chuỗi thư viện mà chúng cần, gọi là **phụ thuộc gián tiếp** (transitive dependencies). Một dự án nhỏ cũng có thể kéo theo hàng trăm gói. Khi một trong số đó có lỗ hổng, ứng dụng của bạn bị ảnh hưởng dù bạn chưa từng viết dòng mã nào liên quan.

OWASP Top 10 đã có hẳn một hạng mục cho vấn đề này: **A06:2021 Vulnerable and Outdated Components** (thành phần có lỗ hổng và lỗi thời). Bài này giải thích cách theo dõi lỗ hổng của thư viện và cách xử lý khi một thành phần đã hết hỗ trợ. Đây là bước SCA (kiểm tra thành phần phụ thuộc) mà bài bài về vòng đời phát triển phần mềm an toàn đã nhắc tới.

## Bước 1: biết mình đang dùng gì

Không thể vá thứ mà bạn không biết mình có. Nguồn sự thật đầu tiên là các tệp khoá phiên bản (lockfile) như `package-lock.json` hay `requirements.txt` đã ghim phiên bản. Hãy commit chúng vào kho, và dùng chúng để cài đặt có thể lặp lại, ví dụ `npm ci` thay vì `npm install` trong CI.

Một hình thức kiểm kê chuẩn hoá hơn là **SBOM** (Software Bill of Materials, danh mục thành phần phần mềm): một tệp liệt kê các thành phần, phiên bản và nguồn gốc của chúng. Hai định dạng phổ biến là **CycloneDX** và **SPDX**. SBOM hữu ích vì khi một lỗ hổng mới được công bố, bạn tra danh mục để trả lời trong vài phút câu hỏi "chúng ta có dùng thành phần đó không, ở phiên bản nào, trong sản phẩm nào?".

Đừng quên các thành phần ngoài thư viện ngôn ngữ: image container nền, gói hệ điều hành, runtime (Node.js, Python, JVM) và cả cơ sở dữ liệu, máy chủ web đi kèm.

## Bước 2: biết lỗ hổng nào đã được công bố

Lỗ hổng được công bố công khai thường có mã **CVE** (Common Vulnerabilities and Exposures) và nằm trong các cơ sở dữ liệu tư vấn bảo mật. Bạn không cần tra tay; các công cụ so khớp phiên bản bạn dùng với những cơ sở dữ liệu này:

- **`npm audit`** kiểm tra cây phụ thuộc của dự án Node.js với cơ sở dữ liệu tư vấn của npm. Một vài cách dùng:

  ```bash
  npm audit                      # báo cáo đầy đủ
  npm audit --omit=dev           # chỉ phần phụ thuộc chạy thật, bỏ phần chỉ dùng khi phát triển
  npm audit --audit-level=high   # chỉ coi là lỗi (mã thoát khác 0) nếu có mức high trở lên
  ```

  Tuỳ chọn `--audit-level` rất tiện để đặt cổng trong CI: build chỉ đỏ khi có lỗ hổng đủ nghiêm trọng. Hãy đọc `npm audit --help` của phiên bản npm bạn cài, vì tuỳ chọn có thể khác giữa các bản.
- **Dependabot** của GitHub gửi *alert* khi kho dùng phụ thuộc có lỗ hổng đã biết, và có thể tự mở pull request nâng phiên bản. Ví dụ cấu hình cập nhật định kỳ trong `.github/dependabot.yml`:

  ```yaml
  version: 2
  updates:
    - package-ecosystem: "npm"
      directory: "/"
      schedule:
        interval: "weekly"
  ```

- **OSV** (osv.dev) là cơ sở dữ liệu lỗ hổng mã nguồn mở, có công cụ quét và API để tra theo gói và phiên bản. Với Python, công cụ `pip-audit` làm việc tương tự cho các gói PyPI. **OWASP Dependency-Check** là một lựa chọn khác, hỗ trợ nhiều hệ sinh thái.

Dù dùng công cụ nào, hãy đặt kết quả vào một nơi mà người có trách nhiệm thực sự nhìn thấy: kênh cảnh báo của nhóm, danh sách việc, hay bước chặn trong CI.

## Bước 3: phân loại, rồi mới vá

Không phải cảnh báo nào cũng khẩn cấp như nhau. Một báo cáo có thể có hàng chục mục, và nếu coi tất cả là "đỏ" thì nhóm sẽ bỏ qua tất cả. Một cách phân loại hợp lý:

1. **Có thực sự dùng đến mã lỗi không?** Lỗ hổng trong một hàm mà ứng dụng không bao giờ gọi, hoặc trong gói chỉ dùng khi phát triển, thường có rủi ro thấp hơn.
2. **Có thể bị khai thác từ bên ngoài không?** Thành phần nằm trên đường xử lý dữ liệu do người dùng gửi thì ưu tiên cao hơn thành phần chạy nội bộ.
3. **Mức độ nghiêm trọng** (thường theo điểm CVSS trong tư vấn) cộng với việc có thông tin khai thác công khai hay không.
4. **Có bản vá chưa?** Nếu có, nâng phiên bản. Nếu chưa, xem biện pháp giảm thiểu mà tác giả tư vấn nêu (tắt tính năng, đổi cấu hình, chặn ở tường lửa ứng dụng).

Khi nâng phiên bản, ưu tiên bản vá nhỏ (patch) trước, vì ít nguy cơ phá vỡ hơn bản lớn (major). Luôn chạy bộ kiểm thử sau khi nâng, và ghi lại quyết định cho các mục cố ý chưa xử lý, kèm người chịu trách nhiệm và hạn xem lại.

## Thành phần hết hỗ trợ (EOL)

**EOL** (End of Life) là mốc từ đó nhà phát triển ngừng phát hành bản vá, kể cả bản vá bảo mật. Thành phần EOL đặc biệt nguy hiểm vì khi lỗ hổng mới được tìm ra, sẽ không có bản sửa chính thức nào, trong khi kẻ tấn công vẫn có thể khai thác.

Một vài điều hữu ích cần biết:

- Mỗi dự án có chính sách phát hành riêng. Ví dụ Node.js chỉ các bản đánh số chẵn mới trở thành bản hỗ trợ dài hạn (LTS), còn Ubuntu LTS có thời gian hỗ trợ bảo mật tiêu chuẩn 5 năm, và chương trình Expanded Security Maintenance (ESM) của Ubuntu Pro kéo dài việc vá cho nhiều gói hơn. Hãy tra chính sách của đúng thành phần bạn dùng thay vì đoán.
- **endoflife.date** là trang tổng hợp ngày hết hỗ trợ của nhiều sản phẩm. Nó là nguồn cộng đồng, nên với quyết định quan trọng hãy đối chiếu thêm với trang chính thức của dự án.
- Trong thực tế, lưu ngày EOL của các thành phần chính vào danh mục kiểm kê, rồi đặt lịch nhắc từ sớm (ví dụ sáu tháng trước) để có thời gian nâng cấp.

Khi đã phát hiện một thành phần EOL hoặc sắp EOL, các lựa chọn theo thứ tự thường ưu tiên là:

1. **Nâng cấp** lên phiên bản còn hỗ trợ.
2. **Thay thế** bằng thư viện khác còn được bảo trì, nếu dự án gốc đã bị bỏ rơi.
3. **Mua hỗ trợ kéo dài** từ nhà cung cấp, nếu có (ví dụ ESM cho gói hệ điều hành).
4. **Giảm rủi ro tạm thời**: cách ly thành phần (mạng riêng, quyền tối thiểu), giám sát chặt, và ghi rủi ro vào sổ rủi ro với hạn xử lý rõ ràng. Đây chỉ là biện pháp tạm, không phải lời giải.

Việc tự "fork" và vá thư viện EOL chỉ nên là phương án cuối, vì bạn sẽ gánh việc bảo trì bảo mật mà đáng ra do cả cộng đồng làm.

## Thói quen nên có

- Ghim phiên bản bằng lockfile, cài bằng lệnh tái lập được trong CI.
- Quét phụ thuộc trong mỗi build và theo lịch (kể cả khi mã không đổi, vì lỗ hổng mới xuất hiện mỗi ngày).
- Cập nhật thường xuyên theo các bước nhỏ, thay vì dồn một lần nâng cấp lớn mỗi vài năm.
- Dùng ít phụ thuộc hơn: mỗi gói thêm vào là thêm một thứ phải theo dõi. Cân nhắc trước khi thêm một gói chỉ để dùng một hàm nhỏ.
- Chỉ lấy gói từ nguồn chính thức và kiểm tên gói cẩn thận, vì kẻ xấu từng đăng gói có tên gần giống để đánh lừa người cài.

## Tóm lại

Thư viện phụ thuộc là một phần mã của bạn về mặt rủi ro, dù bạn không viết nó. Hãy kiểm kê, quét đều đặn, phân loại cảnh báo có lý lẽ và cập nhật theo bước nhỏ. Với thành phần EOL, đừng chờ sự cố: ghi ngày hết hỗ trợ vào danh mục, lên kế hoạch nâng cấp hoặc thay thế từ sớm và có người chịu trách nhiệm cho từng ngoại lệ.

## Tham khảo

- OWASP Top 10:2021, A06 Vulnerable and Outdated Components: https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/
- npm Docs, npm-audit: https://docs.npmjs.com/cli/v10/commands/npm-audit
- GitHub Docs, About Dependabot alerts: https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts
- OSV, Open Source Vulnerabilities: https://osv.dev/
- OWASP Dependency-Check: https://owasp.org/www-project-dependency-check/
- CycloneDX: https://cyclonedx.org/
- SPDX: https://spdx.dev/
- endoflife.date: https://endoflife.date/
- Ubuntu, Expanded Security Maintenance: https://ubuntu.com/security/esm
- Node.js, Previous releases (LTS policy): https://nodejs.org/en/about/previous-releases
- pip-audit: https://pypi.org/project/pip-audit/
