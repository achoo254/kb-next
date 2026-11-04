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
