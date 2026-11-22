---
title: GitHub Actions và GitLab CI cho cùng một dự án Node.js: viết hai pipeline để so sánh
tags: github actions, gitlab ci, ci/cd, node.js, yaml
type: lab
---

> [!TLDR]
> - Cùng một dự án Node.js, ta viết pipeline lint, test, build bằng hai công cụ: tệp `.github/workflows/ci.yml` và `.gitlab-ci.yml`.
> - Khác biệt chính: GitHub Actions chia theo job và action dựng sẵn, GitLab CI chia theo stage và dùng `image` cho môi trường chạy.
> - Cả hai đều có cache theo tệp khoá và artifact để chuyển thư mục `dist/` giữa các job.

## Mục tiêu

Sau bài này bạn viết được một pipeline CI hoàn chỉnh trên cả GitHub Actions lẫn GitLab CI cho cùng một dự án Node.js, và nhìn ra chỗ giống, chỗ khác giữa hai công cụ. Khái niệm artifact và cache đã được giải thích trong bài đầu của chuỗi này (về các giai đoạn pipeline, artifact và cache).

## Chuẩn bị

- Một dự án Node.js có `package.json` và `package-lock.json`, với các script `lint`, `test` và `build` (build tạo thư mục `dist/`). Các tên script này là giả định của bài, hãy đổi cho khớp dự án của bạn.
- Tài khoản GitHub và/hoặc GitLab, mỗi nơi một kho chứa dự án.
- Biết cơ bản về YAML: thụt lề bằng dấu cách (không dùng tab), danh sách bắt đầu bằng dấu `-`.

Các ví dụ dùng Node.js 22 và runner Ubuntu 24.04. Hãy đối chiếu số phiên bản action và image với tài liệu chính thức vì chúng được cập nhật theo thời gian.

## Các bước

### Bước 1: pipeline trên GitHub Actions

Tạo tệp `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test

  build:
    needs: test
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 7
```

Đọc từng phần:

- `on` quy định khi nào chạy: mỗi lần đẩy lên nhánh `main` và mỗi pull request.
- `jobs` là các nhóm bước, mặc định chạy song song; `needs: test` bắt job `build` đợi `test` xong và đạt.
- `uses` gọi một *action* dựng sẵn, `run` chạy một lệnh shell.
- `cache: npm` của `actions/setup-node` tự lưu cache thư viện npm với khoá dựa trên tệp khoá.
- `actions/upload-artifact` lưu `dist/` thành artifact, giữ 7 ngày.

### Bước 2: pipeline trên GitLab CI

Tạo tệp `.gitlab-ci.yml` ở thư mục gốc kho:

```yaml
image: node:22

stages:
  - test
  - build

default:
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/

before_script:
  - npm ci --cache .npm --prefer-offline

test:
  stage: test
  script:
    - npm run lint
    - npm test

build:
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week
```

Đọc từng phần:

- `image` cho biết container nào chạy job; ở GitHub ta chọn `runs-on` và cài Node bằng action, ở GitLab thường chọn luôn image đã có Node.
- `stages` xác định thứ tự; các job cùng stage chạy song song, stage sau chỉ chạy khi stage trước đạt.
- `cache` với `key: files:` tạo khoá từ nội dung `package-lock.json`; ta cho npm dùng thư mục `.npm/` trong dự án để GitLab lưu được.
- `artifacts` với `expire_in` giữ `dist/` một tuần và tự chuyển cho job ở stage sau.

### Bước 3: chạy thử và thêm điều kiện

Đẩy tệp lên kho. GitHub hiện kết quả ở tab Actions, GitLab hiện ở mục Build, Pipelines (tên menu có thể khác theo phiên bản). Muốn giới hạn một job chỉ chạy trên nhánh mặc định, GitLab dùng `rules`:

```yaml
build:
  stage: build
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - npm run build
```

Ở GitHub, bạn thêm `if: github.ref == 'refs/heads/main'` vào job tương ứng.

## So sánh nhanh

| Nội dung | GitHub Actions | GitLab CI |
| --- | --- | --- |
| Tệp cấu hình | `.github/workflows/*.yml` (nhiều tệp) | `.gitlab-ci.yml` (một tệp gốc) |
| Đơn vị chính | job, có thể phụ thuộc bằng `needs` | stage chứa job |
| Môi trường chạy | `runs-on` cộng các action cài đặt | `image` cho từng job |
| Dùng lại | action trên marketplace | `include`, template |
| Cache | `actions/cache` hoặc tuỳ chọn `cache` của setup action | khối `cache` với `key`, `paths` |
| Artifact | `actions/upload-artifact` | khối `artifacts` |

Không có công cụ nào "tốt hơn" tuyệt đối: hãy chọn theo nơi bạn đang lưu mã.

## Kiểm tra

- Sửa cố ý một test cho đỏ rồi đẩy lên: job `build` không được chạy.
- Chạy lại lần hai khi chưa đổi `package-lock.json`: log phải báo đã khôi phục cache và bước cài phụ thuộc nhanh hơn.
- Mở trang kết quả pipeline và tải được artifact `dist`.

## Lỗi hay gặp

- **Thụt lề YAML sai hoặc dùng tab**: công cụ báo lỗi cú pháp ngay khi đọc tệp.
- **`npm ci` báo thiếu `package-lock.json`**: hãy commit tệp khoá vào kho.
- **Job `build` không thấy `dist/`**: quên khai báo artifact, hoặc đường dẫn không khớp thư mục build thật.
- **Cache không bao giờ trúng**: khoá cache đổi mỗi lần (ví dụ dùng thời gian làm khoá) hoặc đường dẫn cache không đúng thư mục npm thật sự dùng.
- **Ghi mật khẩu thẳng vào tệp**: dùng Secrets (GitHub) hoặc CI/CD variables (GitLab). Tiếp theo, bài [[Triển khai không gián đoạn và quay lui trong pipeline: rolling, blue/green, canary]] nói về bước deploy.

## Tham khảo

- GitHub Docs, Workflow syntax for GitHub Actions: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
- GitHub Docs, Caching dependencies to speed up workflows: https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows
- GitLab Docs, CI/CD YAML syntax reference: https://docs.gitlab.com/ci/yaml/
- GitLab Docs, Caching in GitLab CI/CD: https://docs.gitlab.com/ci/caching/
- GitLab Docs, Job artifacts: https://docs.gitlab.com/ci/jobs/job_artifacts/
