---
title: Quản lý bí mật trong kho mã và CI/CD: không commit khoá, quét rò rỉ và xoay vòng khi lộ
tags: quản lý bí mật, CI/CD, git, GitHub Actions, xoay vòng khoá
type: lab
---

> [!TLDR]
> - Bí mật (mật khẩu, token, khoá riêng) không được nằm trong kho mã; chỉ để chúng trong kho bí mật của nền tảng hoặc trình quản lý bí mật.
> - Chặn từ sớm bằng `.gitignore`, hook pre-commit và quét bí mật trong CI; khi đã lộ thì coi như hỏng và phải xoay vòng.
> - Trong CI/CD, cấp quyền tối thiểu, không in bí mật ra log và ghim phiên bản action bên thứ ba.

## Mục tiêu

Sau bài này bạn có thể:

- Giải thích vì sao một bí mật đã lọt vào lịch sử git thì không thể coi là an toàn nữa.
- Thiết lập `.gitignore` và một hook pre-commit đơn giản để chặn tệp `.env`.
- Dùng bí mật trong quy trình CI/CD (ví dụ GitHub Actions) đúng cách.
- Có sẵn quy trình xử lý khi nghi ngờ một khoá đã bị lộ.

Bài này tiếp nối bài về vòng đời phát triển phần mềm an toàn: ở đó bí mật là một mục trong danh sách nghiệm thu, ở đây ta xem cách đạt mục đó.

## Chuẩn bị

- Máy Ubuntu 24.04 LTS có `git` (bản 2.43 trở lên đi kèm Ubuntu 24.04; kiểm tra bằng `git --version`).
- Một thư mục thử nghiệm. Mọi giá trị trong bài là ví dụ giả, không phải khoá thật.
- Nếu muốn thử phần CI: một kho trên GitHub có bật Actions.

## Bí mật là gì và vì sao kho mã là nơi tệ để giữ

**Bí mật** là mọi giá trị mà ai có nó cũng có thể hành động thay bạn: mật khẩu cơ sở dữ liệu, khoá API, token truy cập, khoá riêng SSH hay TLS, chuỗi ký webhook.

Kho mã là nơi tệ để giữ chúng vì ba lý do:

1. **Lịch sử git là vĩnh viễn trong thực tế.** Xoá một dòng ở commit mới không xoá nó khỏi các commit cũ. Mỗi bản sao (clone) của kho, mỗi nhánh và mỗi fork đều mang theo lịch sử đó.
2. **Kho được chia sẻ rộng.** Nhiều người đọc được mã hơn số người cần biết mật khẩu sản xuất.
3. **Kho dễ bị lộ ra ngoài.** Một kho riêng tư vô tình đổi thành công khai, hay một bản sao lưu bị rò rỉ, đều kéo theo mọi bí mật bên trong.

Quy tắc thực dụng: **mã thì ở trong kho, bí mật thì ở ngoài kho**, và ứng dụng nhận bí mật lúc chạy qua biến môi trường, tệp được gắn vào hoặc trình quản lý bí mật. Tư tưởng tách cấu hình khỏi image cũng là điều bài [[ConfigMap và Secret: tách cấu hình khỏi image ứng dụng trên Kubernetes]] trình bày cho Kubernetes.

## Các bước

### Bước 1: tạo kho thử và `.gitignore`

```bash
mkdir demo-secrets && cd demo-secrets
git init
printf 'DB_PASSWORD=example-not-real\n' > .env
printf '.env\n.env.*\n!.env.example\n' > .gitignore
printf 'DB_PASSWORD=\n' > .env.example
git status --short
```

`git status` sẽ chỉ hiện `.gitignore` và `.env.example`; tệp `.env` bị bỏ qua. Tệp `.env.example` chứa tên biến nhưng không có giá trị, để người mới biết cần cấu hình gì.

Kiểm tra lý do một tệp bị bỏ qua:

```bash
git check-ignore -v .env
```

Lệnh in ra dòng quy tắc trong `.gitignore` đã khớp.

**Lưu ý quan trọng:** `.gitignore` chỉ ảnh hưởng tới tệp *chưa được theo dõi*. Nếu `.env` đã từng được commit, thêm nó vào `.gitignore` là chưa đủ. Để ngừng theo dõi (giữ lại tệp trên đĩa):

```bash
git rm --cached .env
```

Nhưng việc này chỉ dừng theo dõi từ commit mới; lịch sử cũ vẫn còn bí mật, xem Bước 4.

### Bước 2: thêm hook pre-commit để chặn tệp `.env`

Hook là tập lệnh git chạy trước khi tạo commit. Tạo `.git/hooks/pre-commit`:

```bash
cat > .git/hooks/pre-commit <<'HOOK'
#!/bin/sh
# Chặn commit nếu có tệp .env hoặc .env.* trong vùng staged (trừ .env.example)
if git diff --cached --name-only | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$'; then
  echo "Chặn commit: có tệp .env trong vùng staged." >&2
  exit 1
fi
HOOK
chmod +x .git/hooks/pre-commit
```

Thử: `git add -f .env` rồi `git commit -m test`. Commit bị chặn và hook in tên tệp. Gỡ khỏi vùng staged bằng `git rm --cached .env`.

Hook cục bộ chỉ là lưới an toàn đầu tiên: ai cũng có thể bỏ qua nó (`git commit --no-verify`) và nó không tự đi theo `git clone`. Vì vậy cần thêm lớp kiểm ở phía máy chủ, xem Bước 3.

### Bước 3: quét bí mật trong CI và trên nền tảng

Hai hướng bổ sung nhau:

- **Quét bí mật của nền tảng.** GitHub có tính năng *secret scanning* tìm các mẫu token của nhiều nhà cung cấp trong kho, và *push protection* có thể chặn lần push chứa bí mật. Bạn bật chúng trong phần cài đặt bảo mật của kho (tính năng nào khả dụng tuỳ loại kho và gói dịch vụ; xem tài liệu GitHub).
- **Công cụ quét mã nguồn mở** chạy trong CI hoặc trước khi push, ví dụ gitleaks hay trufflehog. Chúng quét cả lịch sử commit chứ không chỉ cây thư mục hiện tại. Đọc tài liệu của công cụ bạn chọn để biết cú pháp dòng lệnh của đúng phiên bản đang dùng, vì tuỳ chọn thay đổi giữa các bản.

Công cụ quét có thể báo nhầm (false positive) hoặc bỏ sót, nên đây là lớp phát hiện, không phải lý do để bớt cẩn thận ở các lớp khác.

### Bước 4: khi một bí mật đã lọt vào kho

Giả sử bạn phát hiện khoá đã được commit. Thứ tự việc nên làm:

1. **Thu hồi và xoay vòng ngay (rotate).** Tạo khoá mới, cập nhật nơi dùng, rồi vô hiệu hoá khoá cũ ở nhà cung cấp. Đây là bước quan trọng nhất, vì bạn không thể biết ai đã sao chép khoá trong lúc nó lộ.
2. **Xem nhật ký sử dụng của khoá cũ** (nếu nhà cung cấp có) để biết có truy cập lạ không.
3. **Tìm chỗ xuất hiện** trong lịch sử:

   ```bash
   git log --all --oneline -S'example-not-real'
   ```

   `-S` tìm các commit làm thay đổi số lần xuất hiện của chuỗi đó.
4. **Dọn lịch sử là việc phụ**, làm sau khi đã xoay vòng, bằng công cụ viết lại lịch sử như `git filter-repo` hoặc BFG Repo-Cleaner.

> **Cảnh báo:** viết lại lịch sử làm đổi mọi mã commit phía sau, buộc những người khác sửa lại bản sao của họ và cần `git push --force`, thao tác có thể ghi đè công việc của người khác. Hãy thống nhất với cả nhóm và sao lưu kho trước khi làm. Ngay cả khi đã dọn, hãy coi khoá cũ là đã lộ.

### Bước 5: dùng bí mật trong CI/CD đúng cách

Với GitHub Actions, bí mật được lưu trong phần *Secrets* của kho hoặc môi trường (environment) và truy cập qua ngữ cảnh `secrets`:

```yaml
name: deploy
on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: Gọi API triển khai
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
        run: ./scripts/deploy.sh
```

Các nguyên tắc đi kèm:

- **Quyền tối thiểu**: khai báo `permissions` để `GITHUB_TOKEN` chỉ có quyền cần thiết, như ví dụ trên.
- **Phạm vi hẹp**: dùng secrets theo environment cho môi trường sản xuất và đặt quy tắc bảo vệ (ví dụ cần người duyệt) cho environment đó.
- **Không in bí mật ra log.** GitHub che các giá trị secret đã đăng ký trong log, nhưng không che được mọi biến thể (ví dụ giá trị bị mã hoá base64 hay cắt khúc). Đừng `echo` bí mật và đừng bật chế độ gỡ lỗi chi tiết khi không cần.
- **Cẩn trọng với mã từ bên ngoài**: các workflow chạy từ pull request của fork mặc định không nhận secrets, và bạn không nên đổi hành vi đó cho mã chưa tin cậy.
- **Ghim action bên thứ ba** bằng mã commit đầy đủ thay vì thẻ có thể bị đổi, theo khuyến nghị trong hướng dẫn tăng cường bảo mật của GitHub.
- **Ưu tiên danh tính ngắn hạn** (như OpenID Connect với nhà cung cấp đám mây) thay vì khoá dài hạn lưu sẵn, khi nền tảng của bạn hỗ trợ.

## Kiểm tra

- `git ls-files | grep -E '(^|/)\.env'` chỉ ra tối đa `.env.example`.
- Thử commit tệp `.env` và xác nhận hook chặn.
- Trong CI, kiểm tra log của một lần chạy xem có giá trị bí mật nào xuất hiện không.
- Có tài liệu ngắn ghi: bí mật nào tồn tại, ai quản lý, xoay vòng bao lâu một lần và làm gì khi lộ.

## Lỗi hay gặp

- **Thêm `.env` vào `.gitignore` sau khi đã commit**: tệp vẫn được theo dõi và lịch sử vẫn chứa nó.
- **Chỉ xoá khoá khỏi lịch sử mà không xoay vòng**: khoá cũ vẫn dùng được với người đã sao chép.
- **Dùng chung một khoá cho mọi môi trường**: lộ một nơi là lộ tất cả. Mỗi môi trường nên có khoá riêng.
- **Để bí mật trong tham số dòng lệnh**: chúng có thể hiện trong danh sách tiến trình và lịch sử shell. Ưu tiên biến môi trường hoặc tệp có quyền hạn chế.
- **Quá tin vào công cụ quét**: nó bỏ sót những bí mật không có mẫu nhận dạng, như mật khẩu tự đặt.

## Tóm lại

Giữ bí mật ngoài kho mã, chặn rò rỉ bằng nhiều lớp (`.gitignore`, hook, quét tự động), cấp quyền tối thiểu cho CI/CD và luôn có sẵn quy trình xoay vòng. Bí mật đã lộ thì phải thay, không phải che. Nhóm cũng cần chú ý rằng phần mềm bên thứ ba trong dự án có thể mang rủi ro riêng, chủ đề của bài [[Theo dõi lỗ hổng của thư viện phụ thuộc và xử lý thành phần hết hỗ trợ (EOL)]].

## Tham khảo

- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- GitHub Docs, Using secrets in GitHub Actions: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
- GitHub Docs, Security hardening for GitHub Actions: https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions
- GitHub Docs, About secret scanning: https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning
- Git documentation, gitignore: https://git-scm.com/docs/gitignore
- Git documentation, githooks: https://git-scm.com/docs/githooks
- BFG Repo-Cleaner: https://rtyley.github.io/bfg-repo-cleaner/
