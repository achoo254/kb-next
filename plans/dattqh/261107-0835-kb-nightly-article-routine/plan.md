---
title: "Routine Claude viết bài cho kb mỗi đêm, đăng ẩn chờ chủ dự án xem"
status: running (phase 1–4 xong 25/11/2026; chờ chốt nhịp đăng; khoảng trống 09–15/11 do hạn mức gói Claude; từ 21/11 kb chỉ nhận chủ đề kỹ thuật)
created: 2026-11-07
tier: M
---

# Routine Claude viết bài cho kb mỗi đêm

> **07/11/2026 10:20, đổi tiếp:** mỗi tối 3 lượt (20:00, 21:00, 22:00, cron `0 13,14,15 * * *` UTC), mỗi lượt một
> hành tinh (Collection) mới ở Space khác hai lượt trước, 3 bài nối `[[ ]]` với nhau và sang hành tinh khác (Jev: 3
> bài 61%, Sonnet 70%). Commit `43fd577`; thêm `POST /api/admin/collections`; chủ đề viết lại thành 30 hành tinh (7
> công nghệ). Chạy thử 10:19: hành tinh "Học cách học" (ky-nang), 3 bài hiện, 3 liên kết nối đúng trong database.

> **07/11/2026 09:47, chủ dự án đổi:** không người duyệt. Bài **hiện ngay** khi đăng (`hidden: false`, commit
> `022ed3a`); routine tự duyệt (kiểm từng sự thật, link nguồn, chính tả, an toàn) trước khi đẩy, không chắc thì
> `skipped`. Bài đầu tiên đã được hiện. Các chỗ "ẩn chờ duyệt" bên dưới là thiết kế cũ.

Mỗi đêm một cloud routine của Claude viết **một bài tiếng Việt** cho kb (KnowFlow), đẩy vào hàng chờ trong repo
`kb-next`. kb là kho kiến thức **đủ mọi chủ đề**, không chỉ công nghệ (chủ dự án chốt 07/11/2026), nên chủ đề xoay vòng
giữa nhiều Space. GitHub Actions đăng bài qua API quản trị ở chế độ **ẩn**; chủ dự án đọc rồi bấm hiện ở A02.

Liên quan: plan [kb tự giữ nội dung](../261106-2210-kb-owns-imported-content/plan.md) (phase 3 "bài mới"), danh sách bài
thiếu ở [research-261106-2158-kb-article-completeness.md](../reports/research-261106-2158-kb-article-completeness.md)
mục 5, API ở [`docs/admin-api.md`](../../../docs/admin-api.md#api-quản-trị-token). Các routine khác:
[nightly-improvements](../../../../plans/dattqh/261101-2212-nightly-improvements/plan.md) trong `hoandat-app`.

## Quyết định (Jev chọn, 07/11/2026)

| Câu hỏi | Chọn | Xác suất |
|---|---|---|
| Routine đăng thế nào | Commit bài vào hàng chờ trong repo; GitHub Actions (token là secret của repo) đăng qua API rồi xoá tệp chờ | 85% (gọi API thẳng, token để trong môi trường cloud: 15%) |
| Bài mới hiện ngay không | Đăng `hidden: true`, chủ dự án xem rồi hiện | 78% (hiện ngay: 22%) |
| Space mới (07/11) | Kỹ năng & học tập, Đời sống & mẹo vặt, Công việc & sự nghiệp, Văn hoá & lịch sử Việt Nam | 75–76% mỗi Space (Khoa học thường thức 74%, Nấu ăn 73%, Ngoại ngữ 69%: để đợt sau) |
| Bao nhiêu bài mỗi đêm | 1 bài tiếng Việt từ danh sách bài thiếu | 54% (2 bài: 25%; 1 bài + 1 bản dịch EN: 21%). Độ chắc thấp; đổi sau một tuần chạy thử |

Vì sao không để token trong routine: môi trường cloud dùng chung cho cả 5 routine và hiện không giữ bí mật nào; token
quản trị đăng được bài "Chính thức" và sửa mọi bài. Secret của GitHub Actions đã là nơi giữ khoá deploy.

## Không làm

- Không dịch tiếng Anh, không sửa bài cũ, không dựng lối đi (journey) trong đợt này.
- Không lưu thân bài trong repo sau khi đã đăng: database là bản chuẩn (chủ dự án chốt 06/11/2026). Repo chỉ giữ tệp
  chờ cho tới lúc đăng và một sổ `slug → id`.
- Không gửi bài qua hàng duyệt A01 (API token không có đường đó; ẩn rồi hiện là đủ).

## Luồng một đêm

1. 21:30 Asia/Saigon (`30 14 * * *` UTC; trước lượt Truyện 23:30 và Tiểu Đệ 01:30 để ít tranh hạn mức 5 giờ), model
   `claude-sonnet-5-5`, chỉ repo `kb-next`, công cụ Bash/Read/Write/Edit/Glob/Grep, không connector.
2. Routine đọc `content/topics.json`, lấy chủ đề `todo` đầu tiên thuộc Space khác Space của bài đêm trước, đọc 2–3 bài cùng Space trên kb (trang công khai) để
   giữ giọng văn và tránh trùng, rồi viết `content/queue/<slug>.md`.
3. Chạy `pnpm check:queue` (kiểm định dạng), đổi chủ đề thành `queued`, một commit `content: <tiêu đề>`, push `main`.
4. Workflow `publish-queue.yml` (chạy khi `content/queue/**` đổi): với mỗi tệp chờ, bỏ qua nếu slug đã có trong
   `content/published.json`; gọi `POST /api/admin/posts` với `hidden: true`, `source: "ai"`; ghi `{slug, id, title,
   at}` vào sổ; xoá tệp chờ; đổi chủ đề thành `published`; commit lại bằng `GITHUB_TOKEN` (không kích hoạt workflow
   khác).
5. Chủ dự án mở A02 (`/admin/content`), đọc bài ẩn, sửa nếu cần, bấm hiện.

`ci.yml` thêm `paths-ignore` cho `content/queue/**`, `content/topics.json`, `content/published.json` để commit nội
dung không chạy gate và deploy.

## Phase 1 · Code trong kb-next, tier M (xong 07/11/2026)

Đã làm khác plan một chỗ: web không có màn tạo Space, nên thêm `POST /api/admin/spaces` (token quản trị); workflow
tự tạo các Space trong `content/spaces.json` trước bài đầu tiên của chúng, không cần ai tạo tay. Chủ đề: 30 mục, 8
mục công nghệ. Ảnh Space mới tạm dùng `orb-universe.webp` (như Space Cloud) cho tới khi có ảnh riêng.


- Space mới: hiện kb chỉ có Space công nghệ (Networking, Linux, Docker, Kubernetes). Thêm khoảng 4 Space công khai cho
  chủ đề phổ thông, ví dụ "Kỹ năng & học tập", "Đời sống & mẹo vặt", "Công việc & sự nghiệp", "Văn hoá & lịch sử Việt
  Nam" (danh sách cuối do Jev chọn khi làm phase này). Space công khai chỉ quản trị tạo được (`POST /api/spaces`, phiên
  web); tạo bằng giao diện của chủ dự án hoặc Claude qua trình duyệt đã đăng nhập. Tránh chủ đề y tế, đầu tư, pháp lý
  (dễ thành lời khuyên sai).
- `content/topics.json`: khoảng 30 chủ đề, **công nghệ không quá một phần ba**. Phần công nghệ lấy từ mục 5 của báo
  cáo (netplan, định tuyến/NAT/firewall, tcpdump, nginx + TLS, systemd, Docker networking, K8s rolling update…); phần
  còn lại chia đều cho các Space mới.
  Mỗi mục: `slug`, `title`, `space` hoặc `collection` (slug thật, lấy từ database prod), `tags`, `type`, `brief` (vì
  sao cần, bài liên quan), `status` (`todo`/`queued`/`published`/`skipped`).
- Định dạng tệp chờ: front matter (`title`, `lang: vi`, `space`/`collection`, `tags` ≤ 8, `type`) + thân markdown.
  `scripts/check-queue.ts` (+ test vitest): front matter đủ và đúng kiểu, slug có trong `topics.json`, thân không có
  link Học Cloud, IP thật, chuỗi giống khoá (dùng lại `check-public-info.ts`).
- `scripts/publish-queue.ts` (+ test với API giả): đăng, ghi sổ, xoá tệp; lỗi một bài không chặn bài khác; 409/4xx in
  mã lỗi và giữ tệp chờ để đêm sau thử lại.
- `.github/workflows/publish-queue.yml` và `paths-ignore` trong `ci.yml`.
- `docs/admin-api.md`: thêm mục "Hàng chờ bài AI" (luồng, định dạng, cách hiện bài, cách tắt routine).
- Kiểm: lint, typecheck, test liên quan, build.

## Phase 2 · Token và secret, tier S (xong 07/11/2026)

Token lưu ở `access-tokens.json` (service `kb.hoandat.com admin`), secret `KB_ADMIN_TOKEN` đặt cho `achoo254/kb-next`.


1. Chủ dự án tạo token ở `/admin/api` (A03). Tạo token mới thu hồi token cũ; token tạm của đợt dọn Học Cloud đã thu
   hồi nên không pipeline nào bị ảnh hưởng.
2. Lưu token vào `access-tokens.json` trên iCloud (service `kb.hoandat.com admin`).
3. Claude đặt secret `KB_ADMIN_TOKEN` cho repo bằng `gh secret set` (đọc từ tệp, không in ra).

## Phase 3 · Routine, tier S (xong 07/11/2026)

Routine "Viết bài kb mỗi tối" `trig_01Ky1HeNSVRdLQKBfH4DVHmQ` (`30 14 * * *` UTC = 21:30 VN, `claude-sonnet-5-5`),
https://claude.ai/code/routines/trig_01Ky1HeNSVRdLQKBfH4DVHmQ. Chạy thử 07/11 09:40: bài "Học chủ động và lặp lại
ngắt quãng" (khoảng 2.400 từ, 5 nguồn Wikipedia) đăng ẩn, id `cdb6efbe-ad80-42a0-9fc4-40eb77ea17df`; Space `ky-nang`
được tạo; `ci` không chạy cho commit nội dung. Trang kb cần đăng nhập nên routine không đọc bài trên web.


- Tạo routine "Viết bài kb mỗi đêm" như mục Luồng. Lời nhắn gồm luật viết bên dưới.
- Chạy tay một lần: kiểm bài ẩn hiện ở A02, sổ `published.json` có id, tệp chờ đã xoá, CI không chạy deploy.
- Ghi id routine vào plan này.

### Luật viết (đưa vào lời nhắn routine)

- Tiếng Việt, giọng như các bài hiện có trong cùng Space, dễ đọc cho người không chuyên. Bố cục theo loại bài: bài
  hướng dẫn có mục tiêu, chuẩn bị, các bước, kiểm tra, bài tiếp theo; bài giải thích hay kể chuyện có mở đầu, các ý
  chính, tóm lại, bài liên quan.
- Bài công nghệ: lệnh cho Ubuntu 24.04 LTS và phiên bản phần mềm hiện hành, ghi rõ phiên bản; kiểm lệnh trong sandbox
  khi chạy được. Mọi bài: không chắc sự thật thì không viết.
- Mục "Tham khảo" cuối bài: tài liệu chính thức hoặc Wikipedia. Không link Học Cloud.
- Địa chỉ ví dụ dùng dải tài liệu (192.0.2.0/24, 2001:db8::/32, example.com); không IP thật, không khoá.
- Không bán hàng, không nhắc gia cảnh chủ dự án.
- Viết không đạt thì đổi chủ đề thành `skipped` kèm lý do, không đẩy bài kém.

## Phase 4 · Một tuần chạy thử

Sau 7 đêm (14/11/2026): đếm bài đã đăng, bài `skipped`, lỗi publish; Claude đọc lại các bài đã hiện để tìm sai sót.
Đưa số liệu cho Jev chọn: giữ nhịp, lên 2 bài/đêm, hay thêm bản dịch EN.

### Kết quả phase 4 (25/11/2026)

Số liệu lấy từ `content/published.json`, `content/topics.json` và các lượt chạy `publish-queue.yml`.

- **Đã đăng:** 105 bài tiếng Việt, mỗi bài có một bản EN nối bằng `translationOf` (bản EN do chính luồng đăng sinh ra từ 08/11,
  không còn là chủ đề riêng); 33 hành tinh trải trên 18 Space.
- **Lỗi publish:** 0. Cả 37 lượt `publish-queue.yml` đều thành công.
- **`skipped`:** 3 chủ đề. Một là bản EN `mang-tren-ubuntu-en` (đã thay bằng bản dịch). Hai là `tcvn-14423-2026-yeu-cau-co-ban`
  (21/11) và `iso-27001-2022-co-ban` (24/11): không kiểm được nguồn chính thức (chỉ có tóm tắt thương mại, iso.org trả 403),
  đúng luật "không chắc sự thật thì không viết". Còn 23 chủ đề `todo`.
- **Nhịp thật khác nhịp thiết kế:** 07–08/11 đăng 27 bài, rồi **không đăng gì 09–15/11**, đăng lại từ 16/11. Ngày 21 và 22/11 mỗi
  ngày 21 bài vì chạy tay thêm nhiều lượt cách nhau vài phút để bù. Ngày 24/11 không có bài (chủ đề ISO bị bỏ).
- **Nguyên nhân khoảng trống 09–15/11 (đã rõ, 25/11):** routine bị tắt từ 08/11 và bật lại 16/11, không phải lỗi đăng bài. Nhật ký
  lượt cuối (08/11 07:34 UTC, chạy 6 giây) ghi `rate_limit: rejected (five_hour)`, "You've hit your 5-hour limit": hạn mức gói
  Claude dùng chung với 6 routine viết lại Truyện chạy cùng lúc và phiên làm việc của chủ dự án. Từ 08/11 07:34 UTC tới 16/11 14:39 UTC
  trigger không tạo phiên chạy nào. Ai tắt và lúc nào thì API không cho biết, nhưng plan `261116-2056-content-kb-truyen-daily-report`
  (phase 3) ghi cả routine lập kế hoạch lẫn routine viết bài "tắt từ 08/11" rồi bật lại ngày 16/11 với 3 lượt/ngày.
- **Hạn mức vẫn có thể chặn lại:** lượt 20/11 08:34 UTC cũng dừng sau 7 giây vì `rate_limit: rejected (seven_day)`, "You've hit your
  weekly limit" (mở lại 12:00 UTC cùng ngày). Chỉ 1 lượt bị mất, các lượt sau vẫn chạy; ngày 20/11 đăng 3 bài thay vì 9. Lượt chạy tay
  dày ngày 21–22/11 làm tăng nguy cơ này.
- **Tỉ lệ công nghệ: không phải lỗi, luật đã đổi ngày 21/11.** Commit `6696e72` (21/11/2026) thu hẹp kb về hạ tầng và kỹ thuật phần mềm:
  "Topics must be tech, the third-share rule is gone", kèm các Space kỹ thuật mới (bảo mật, cơ sở dữ liệu, email, web, CI/CD, AI, marketing kỹ thuật,
  pháp lý và tiêu chuẩn an ninh mạng). Prompt routine cũng sửa theo (nếu mục `todo` ngoài phạm vi thì đặt `skipped`). Vì vậy 14/16 hành tinh
  mới từ 21/11 là công nghệ là đúng thiết kế, và `tech: true` ở cả 42 chủ đề cũng đúng. Luật "công nghệ không quá một phần ba" ở tiêu chí phase 1–3 bên dưới là
  luật cũ (07/11), không còn hiệu lực.
- **Đọc lại bài (mẫu 2/105, chỉ 2 bài mới nhất theo nhóm kỹ thuật, không phải toàn bộ):** "Phân trang, lọc và sắp xếp trong REST API" và
  "ConfigMap và Secret trên Kubernetes". Không thấy sai sự thật; có TL;DR, mục Tham khảo; 6 link tài liệu chính thức đều trả 200
  (các `api.example.com` là địa chỉ ví dụ, đúng luật). Nhận xét nhỏ: ví dụ dùng `nginx:1.27`, nên cập nhật phiên bản khi viết bài kế tiếp.
  **Chưa đọc 103 bài còn lại**, nên chưa thể nói toàn bộ không sai sót.

**Chưa chốt (cần Jev/chủ dự án):** giữ nhịp, lên 2 bài/đêm hay thêm bản dịch EN. Bản EN đã có nên lựa chọn còn lại là giữ nhịp hay
tăng số bài. Trước khi tăng cần canh hạn mức gói Claude dùng chung (khoảng trống 09–15/11 đã rõ nguyên nhân; tỉ lệ công nghệ theo luật mới 21/11).

## Rủi ro

| Rủi ro | Giảm |
|---|---|
| Đăng trùng khi workflow chết giữa chừng (đăng xong, chưa ghi sổ) | Ghi sổ ngay sau mỗi bài; trùng thì bài vẫn ẩn, xoá ở A02 |
| Sai kiến thức | Bài ẩn tới khi chủ dự án xem; mỗi lần sửa là một phiên bản |
| Hết hạn mức 5 giờ | Một bài, Sonnet, chạy 21:30; bị chặn thì chủ đề vẫn `todo`, đêm sau viết |
| Lộ token | Chỉ ở secret của Actions; tạo token mới ở A03 là thu hồi ngay |
| Bản nháp nằm trong repo public trước khi đăng | Chấp nhận: nội dung vốn để công khai; tệp xoá sau khi đăng |

## Tiêu chí xong (phase 1–3)

- [x] Các Space mới có trên kb (workflow tạo ở lần đăng đầu); `topics.json` có công nghệ không quá một phần ba (8/30).
- [x] `pnpm check:queue` và test của hai script đạt; lint, typecheck, build xanh.
- [x] Commit chỉ đổi `content/` không chạy `ci`/`deploy`.
- [x] Một lần chạy tay: bài ẩn có ở A02 với nhãn AI, `published.json` có id, `content/queue/` trống.
- [x] Routine có lịch, id ghi trong plan.

## Câu hỏi mở

- Nhịp 1 bài/đêm do Jev chọn với độ chắc thấp (54%); xem lại sau tuần chạy thử.
