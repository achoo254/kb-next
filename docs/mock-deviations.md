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
