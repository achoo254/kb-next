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
