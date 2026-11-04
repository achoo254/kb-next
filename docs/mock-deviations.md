# Chỗ app khác mock

Mock Universe đã chốt ([`design/`](../design)) là đặc tả giao diện: mỗi màn phải giống board của nó về bố cục, chữ,
màu, trạng thái và chuyển động. Chỗ nào buộc phải khác thì ghi vào bảng dưới, kèm lý do. Một màn vượt ngưỡng 3% pixel
của bộ kiểm giống mock ([`parity-testing.md`](parity-testing.md)) chỉ được nâng ngưỡng riêng (`maxDiff` trong
`apps/web/e2e/parity-screens.ts`) khi có dòng tương ứng ở đây.

## Cách ghi

| Cột | Ghi gì |
|---|---|
| Mã màn | Mã board, ví dụ `C11` |
| Khác gì | Phần nào của màn khác board: vị trí, chữ, màu, trạng thái, chuyển động |
| Vì sao | Lý do buộc phải khác: giới hạn kỹ thuật, dữ liệu thật, trợ năng, quyết định của người dùng (ghi ngày) |
| Ngưỡng | `maxDiff` của màn nếu đã nâng, không thì để trống |

## Danh sách

| Mã màn | Khác gì | Vì sao | Ngưỡng |
|---|---|---|---|
| DesignSystem (token) | Accent của chế độ Sáng là `#0E718C` thay cho `#0E7490` của board; focus Sáng giữ `#0E7490` | `#0E7490` chỉ đạt 4,48:1 trên nền `bg2` (`#ECE8FF`), nơi chữ accent thật sự nằm; `#0E718C` đạt chuẩn chữ 4,5:1 mà mắt gần như không phân biệt (04/11/2026) | |
| X01 (token) | Nút đỏ đặc (xác nhận "Xoá") dùng `#DC2626` thay cho `#EF4444` của board, cả hai chế độ | Chữ trắng trên `#EF4444` chỉ đạt 3,76:1; `#DC2626` đạt 4,83:1 (chuẩn chữ 4,5:1). Nút này không nằm trong khung so pixel của board (04/11/2026) | |
| DesignSystem, C10, C11 và mọi chỗ có nhãn nguồn gốc | Không còn nhãn "Chính thức · AI tạo"; bài chính thức (kể cả do AI viết hay dịch) chỉ mang nhãn "Chính thức" | Người dùng chốt 04/11/2026: chỉ giữ một nhãn chính thức. Bản dịch AI vẫn được đánh dấu riêng qua `aiTranslated` | |
| S02 | Ngoài 3 cột của board, `/login` còn một trạng thái chờ: thẻ A (cổng đăng nhập) kèm nút "Đăng nhập bằng tài khoản hoandat". Nút ở landing (`?go=1`) thì bỏ qua bước chờ, hiện ngay "Đang mở cổng…" như board. Ảnh so pixel là trang `/dev/kit/sign-in` đặt 3 thẻ thật cạnh nhau như board | Khách mở một link cần đăng nhập (vd `/d/…`) được đưa về `/login?return=…`: tự chuyển sang IdP ngay sẽ đẩy họ đi mà không biết vì sao, và lặp lại nếu IdP trả lỗi. App chỉ hiện một trạng thái mỗi lúc, nên board 3 cột được so trên trang kit ghép đúng các thẻ đó (04/11/2026) | |
| X02 | App hiện một bảng lỗi mỗi lúc (giữa màn, cỡ một ô của board); ảnh so pixel là trang `/dev/kit/errors` ghép 4 bảng thật theo lưới 2×2 của board. Bảo trì không có giờ mở lại thì ghi "Sẽ mở lại sớm" | Board trình bày cả 4 lỗi cạnh nhau; một màn lỗi thật chỉ có một lỗi (04/11/2026) | |
| C09 | Panel AI không có cuộc hỏi đáp mẫu (câu hỏi DHCP, sơ đồ DORA, "Dựa trên 3 tài liệu"). Thay vào đó: một câu hỏi về bài đang đọc ("Giải thích “Giao thức DHCP”", mở Copilot với câu đó), câu "Copilot trả lời có nguồn, dựa trên N tài liệu bạn đọc được trong M Space" kèm ô từng Space (tên, chú thích Jev), "Nguồn mới cập nhật" là 3 bài mới cập nhật nhất với nhãn ngôn ngữ thay cho số phiên bản. Ô hỏi vẫn nằm dưới nguồn cuối, tràn khỏi viền panel như board | Copilot (C14, phase 7) chưa chạy nên chưa có cuộc hỏi đáp thật; mọi số và tên trong panel lấy từ API, không bịa (04/11/2026) | |
| C09 | Sân khấu "Gần đây" lấy từ dữ liệu của người đọc: "Tiếp tục đọc" là bài mới nhất đang đọc dở (có %), "Cần cập nhật" là bài mới nhất đã 30 ngày không sửa ("● Đã N ngày"), "Tài liệu liên quan" đếm mục "Liên quan" của bài đang đọc. Thiếu dữ liệu thì thẻ đổi sang "Mới cập nhật" / "Bắt đầu đọc" / "Của tôi" / "Xem liên kết". Ảnh so pixel cố định đồng hồ trình duyệt ở 18/12/2026 (45 ngày sau lần cập nhật cuối của seed) | Board là một lần xem mẫu; app tính từ dữ liệu thật, đồng hồ cố định chỉ để ảnh so ổn định (04/11/2026) | |
| C09, S01 | Universe thật có 8 Space: Cloud (nhập từ Học Cloud) nằm ở chỗ thứ 8 (`SCENE_SLOTS.cloud`, bên trái Docker, dưới chữ giới thiệu). Pha lê lấy ảnh, màu và quầng sáng từ dữ liệu Space; Cloud tạm dùng ảnh quả cầu cho tới khi có ảnh pha lê riêng | Board vẽ 7 Space của seed mẫu (04/11/2026) | |
| C09 | Bản 3D (React Three Fiber, tải lười) giữ góc nhìn, vị trí và màu của board; quầng sáng quỹ đạo là dải mờ thay cho bộ lọc blur của SVG, chấm sáng to hơn chút, phần quỹ đạo phía trên quả cầu đi sau nó | WebGL không có blur của SVG; đi sau quả cầu là chiều sâu của bản 3D (Z02). Ảnh so pixel chụp bản 2D (giảm chuyển động) (04/11/2026) | |
| S04 | Dòng chú thích của board "Quá 1,5 giây vẫn chưa xong thì hiện:" thành "Tải lâu hơn thường lệ:"; tải lỗi (không phải mất mạng) cũng dùng màn này với "Chưa tải được Universe" và nút "Thử lại" | Câu của board là ghi chú thiết kế cho người làm, không phải chữ cho người dùng (04/11/2026) | |
| S05 | Màn trống hiện khi người đọc chưa có Space riêng hoặc Space riêng chưa có bài ("Vũ trụ của bạn còn trống"); link "khám phá Universe chung" mở `/u?shared=1` (C09 đủ). Nút "Demo: mất mạng" thành "Mở AI Copilot"; câu hỏi gợi ý lấy từ 3 bài mới cập nhật nhất. Ba thẻ "Viết ghi chú", "Tải file Office", "Tạo lối đi" và "Hành tinh đầu tiên" mở "Của tôi" (`/me`) | Nút demo là công tắc xem thử của mock; C01, C02, C03, C07 chưa dựng (04/11/2026) | |
| S05 (offline) | Thông báo offline ghi "Bạn đang offline · đang thử kết nối lại…", bỏ vế "vẫn đọc và sửa được tệp đã lưu". Mất mạng ngay khi mở thì chưa có Space nào để vẽ: chỉ có quả cầu, quỹ đạo và tiêu đề "Bạn đang offline"; mất mạng sau khi đã tải thì Universe giữ nguyên, thêm thông báo | App chưa lưu bài để đọc offline, không hứa điều chưa làm (04/11/2026) | |
| S01 | Pha lê "Vũ trụ của bạn" của khách ghi "riêng tư" thay cho "3 tệp · riêng tư"; các pha lê khác lấy tên và chú thích từ `/api/spaces` | Khách chưa có Space riêng; số tệp của board là dữ liệu mẫu (04/11/2026) | |
| C10, C11 | Không có thanh "Trạng thái" (C10, dưới trái) và khối "Trạng thái (demo)" (C11, cuối mục lục) | Đó là công tắc xem thử của mock. Mỗi trạng thái (đang tải, Collection trống, không có quyền; đang tải, không có quyền, bị ẩn, offline) là trạng thái thật của màn, có test render riêng (04/11/2026) | |
| C10 | Câu dưới "Space liên quan" là "Nối với Space này vì có bài của hai bên liên kết với nhau." thay cho câu Jev viết | Space liên quan được tính bằng code từ liên kết giữa các bài (`spaceRelevance`), không phải Jev; chữ phải nói đúng cách tính (04/11/2026) | |
| C10, C11 | Dòng ngôn ngữ chỉ "VI" (C10 "8 lab · 4 bộ sưu tập · VI", C11 "· VI ·" không có "có bản EN") | Dữ liệu seed chưa có bản tiếng Anh của bài Networking; dòng này lấy từ bản dịch có thật và tự hiện "EN" khi có (04/11/2026) | |
| C11 | "Đã duyệt bởi Linh" ở đầu bài (board ghi "Đạt" ở đầu bài nhưng "Linh duyệt" ở ô phiên bản) | Board tự mâu thuẫn; chọn Linh (người duyệt) cho cả hai chỗ, seed ghi lượt duyệt v4 của DHCP bởi Linh (04/11/2026) | |
| C11 | Ô phiên bản ghi "Linh duyệt 03/11 · 4 phiên bản" thay cho "· 6 thay đổi"; số phút đọc tính từ chữ thật (DHCP: 1 phút, board 4 phút) | Dữ liệu có số phiên bản, không có số thay đổi; thời gian đọc tính theo độ dài bài (04/11/2026) | |
| C11 | "Liên quan · Jev" ra ARP 0,75, Ghi chú: DHCP giả mạo 0,68, Máy mới vào mạng 0,60 thay cho ARP 0,92, Subnet & CIDR 0,81, Packet Journey 0,74 | Độ liên quan tính bằng code từ liên kết, vị trí và từ chung (`apps/server/src/api/relevance.ts`), không bịa số cho khớp mock (04/11/2026) | |
| C11 | Mở bài không có đoạn đang chọn: không có đoạn tô sáng, thanh "Giải thích / Tóm tắt / Hỏi Copilot / Đánh dấu", thẻ "Giải thích đoạn đã chọn" kèm trích dẫn và "Key OpenAI ••••a1b2", nút "Demo: bỏ key". Bấm "Giải thích đoạn này"/"Tóm tắt" hiện trạng thái cần key (như công tắc "bỏ key" của board) trong khung AI. Gợi ý phím chỉ có J / K. "Chia sẻ", "Yêu thích" tạm khoá ("Sắp có") | Board vẽ một lượt dùng AI bằng key riêng (phase 7) trên đoạn đã chọn; app chưa có key riêng, lệnh `/`, ⌘K, E, chia sẻ (phase 11) và yêu thích, nên không hiện những thứ chưa chạy được. Phần này chiếm phần lớn khác biệt pixel. Thanh chọn đoạn và thẻ trả lời AI đến cùng phase 7 (key riêng, Copilot); xong phase 7, C11 phải về lại ngưỡng chung 3% (04/11/2026) | 9% |
