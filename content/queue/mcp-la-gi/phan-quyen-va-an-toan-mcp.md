---
title: Phân quyền và an toàn khi cho AI gọi công cụ thật qua MCP
tags: mcp, bảo mật, phân quyền, oauth, ai agent, least privilege
type: note
---

> [!TLDR]
> - Công cụ MCP làm việc thật với quyền thật, nên cần người duyệt các thao tác nhạy cảm và giới hạn quyền ở mức tối thiểu.
> - Server phải kiểm tra mọi đầu vào, kiểm soát truy cập, giới hạn tần suất gọi và làm sạch đầu ra; client nên cho người dùng xem tham số trước khi gọi.
> - Không chuyển tiếp token của nơi khác: server chỉ nhận token được cấp cho chính nó; cấp quyền (scope) nhỏ rồi nâng dần khi cần.
> - Server cục bộ chạy với quyền của người dùng, nên chỉ cài từ nguồn tin cậy và nên chạy trong môi trường cách ly.

## Mở đầu

Đọc dữ liệu thì hiếm khi gây hại lớn; xoá bảng, gửi thư hay đẩy mã lên kho thì khác. Khi một ứng dụng AI nối với MCP server, mô hình có thể tự quyết định gọi các công cụ đó, kể cả khi nó hiểu sai yêu cầu hoặc bị một đoạn văn bản độc hại dẫn dắt. Vì vậy phân quyền và an toàn là phần thiết kế chính, không phải phần thêm vào cuối.

Bài này tóm tắt các khuyến nghị trong đặc tả MCP (phiên bản 2026-07-28, tính đến tháng 11/2026) và trang "Security Best Practices" của dự án, kèm cách áp dụng cho người viết server. Nó cũng nối tiếp phần thực hành viết một MCP server nhỏ bằng TypeScript. Bài chỉ giải thích tài liệu kỹ thuật, không thay cho việc đánh giá an ninh riêng cho hệ thống của bạn.

## Nguyên tắc 1: luôn có người trong vòng lặp

Đặc tả viết rằng, vì lý do an toàn và bảo mật, **nên luôn có con người** với khả năng từ chối việc gọi công cụ. Ứng dụng nên:

- hiển thị rõ những công cụ nào đang được đưa cho mô hình;
- có dấu hiệu trực quan rõ ràng khi một công cụ được gọi;
- hỏi xác nhận người dùng với các thao tác cần thiết.

Phía client còn được khuyến nghị cho người dùng **xem tham số trước khi gọi server**, để tránh rò rỉ dữ liệu vô tình hoặc có chủ đích, ghi log việc dùng công cụ để kiểm toán và đặt thời gian chờ tối đa cho mỗi lần gọi.

Một điểm tinh tế: tool có thể kèm `annotations` mô tả hành vi, nhưng đặc tả yêu cầu client coi chúng là **không đáng tin**, trừ khi server đến từ nguồn đáng tin. Đừng dựa vào nhãn như "chỉ đọc" của một server lạ để bỏ qua bước xác nhận.

## Nguyên tắc 2: server kiểm soát chặt, không tin đầu vào

Đặc tả liệt kê những việc server **phải** làm: kiểm tra mọi đầu vào của tool, có kiểm soát truy cập, giới hạn tần suất gọi và làm sạch đầu ra. Áp dụng thực tế:

- **Khai báo lược đồ chặt.** Dùng kiểu, độ dài, `enum`. Nếu tool đọc tài liệu, đừng nhận đường dẫn tự do mà cho chọn trong danh sách cho phép.
- **Tách công cụ đọc khỏi công cụ ghi.** Hai tool nhỏ dễ cấp quyền và dễ duyệt hơn một tool "làm mọi thứ".
- **Trả lỗi hữu ích nhưng không lộ nội tình.** Lỗi nghiệp vụ trả bằng `isError: true` để mô hình tự sửa; đừng đưa vào đó đường dẫn nội bộ hay thông tin xác thực.

Ví dụ một tool chỉ đọc, chỉ nhận tên trong danh sách cho phép:

```typescript
server.registerTool(
  "read_doc",
  {
    description: "Read one document from a fixed allowlist",
    inputSchema: z.object({ name: z.enum(["intro", "faq"]) }),
    annotations: { readOnlyHint: true },
  },
  async ({ name }) => ({
    content: [{ type: "text", text: DOCS.get(name) ?? "Not found" }],
  }),
);
```

Vì `name` chỉ có thể là `intro` hoặc `faq`, mô hình không có cách nào đưa vào một đường dẫn như `../../etc/passwd`. Đoạn mã trên giả định `DOCS` là một `Map` chứa nội dung các tài liệu.

## Nguyên tắc 3: cẩn thận với token và quyền (server từ xa)

Với server từ xa dùng Streamable HTTP, tài liệu khuyến nghị dùng OAuth để lấy token. Trang "Security Best Practices" nêu một số cạm bẫy:

- **Chuyển tiếp token (token passthrough).** Đây là kiểu làm sai: server nhận token từ client rồi chuyển nguyên cho API phía sau mà không kiểm tra token có được cấp cho chính server hay không. Đặc tả cấm: server **không được** nhận token không được cấp rõ ràng cho nó. Chuyển tiếp làm lách các kiểm soát như giới hạn tần suất và làm nhật ký truy cập khó truy vết.
- **Confused deputy với máy chủ uỷ quyền (proxy).** Một MCP proxy dùng client ID cố định với dịch vụ bên thứ ba, lại cho client đăng ký động, có thể bị lợi dụng khi cookie đồng ý cũ khiến bước hỏi người dùng bị bỏ qua. Cách chặn là proxy phải lưu và kiểm tra sự đồng ý theo từng client, kiểm tra `redirect_uri` khớp tuyệt đối với chuỗi đã đăng ký và dùng tham số `state` dùng một lần.
- **Giả mạo yêu cầu phía server (SSRF).** Client chạy trên máy chủ có thể bị server độc hại lừa truy cập địa chỉ nội bộ hoặc dịch vụ metadata của nhà cung cấp đám mây. Nên bắt buộc HTTPS, chặn dải địa chỉ riêng và nội bộ, kiểm tra cả đích chuyển hướng và cân nhắc proxy đầu ra. Tài liệu cũng khuyên không tự viết phần kiểm tra địa chỉ IP bằng tay vì dễ sót các cách mã hoá lạ.
- **Đoán hoặc đánh cắp "tay cầm" trạng thái.** MCP không có phiên theo kết nối; nếu server tạo handle (như mã giỏ hàng) thì không được coi việc cầm handle là đã xác thực. Hãy dùng giá trị ngẫu nhiên khó đoán và gắn với người dùng đã xác thực.
- **Cấp quá nhiều quyền (scope).** Token có quyền rộng như `files:*` hay `admin:*` làm thiệt hại lớn hơn khi bị lộ. Hãy bắt đầu bằng tập quyền tối thiểu (chủ yếu đọc), chỉ yêu cầu nâng quyền khi thao tác đặc quyền thực sự cần, và tránh quyền "tất cả". Nên ghi log mỗi lần nâng quyền (quyền được yêu cầu và phần được cấp) để kiểm toán.

## Nguyên tắc 4: server cục bộ chạy với quyền của bạn

Server cục bộ là chương trình chạy ngay trên máy bạn, với cùng quyền với ứng dụng khởi chạy nó. Tài liệu nêu các rủi ro: lệnh khởi động độc hại trong cấu hình, mã độc nằm trong gói server, hoặc server mở cổng localhost bị truy cập qua DNS rebinding. Khuyến nghị gồm:

- Client phải hiển thị **đúng nguyên văn lệnh sẽ chạy** và xin người dùng đồng ý trước khi kết nối server cục bộ cấu hình bằng một cú nhấp.
- Nên chạy server trong môi trường cách ly với quyền tối thiểu về tệp và mạng.
- Người viết server cục bộ nên dùng `stdio` để chỉ client mới nói chuyện được với nó; nếu dùng HTTP thì yêu cầu token xác thực hoặc dùng kênh liên tiến trình có giới hạn quyền.

Với bạn, điều đó nghĩa là: chỉ cài MCP server từ nguồn bạn tin, đọc kỹ lệnh khởi chạy trong cấu hình, và không cấp cho tiến trình quyền quản trị.

## Danh sách kiểm nhanh trước khi cho AI gọi công cụ thật

1. Mỗi tool làm một việc, tên và mô tả rõ.
2. Lược đồ đầu vào chặt, có danh sách cho phép thay cho chuỗi tự do.
3. Tài khoản hoặc token của server chỉ có quyền cần thiết, tách đọc và ghi.
4. Thao tác không thể hoàn tác (xoá, gửi, đẩy mã) phải qua bước người xác nhận.
5. Có giới hạn tần suất, thời gian chờ và log đủ để truy vết.
6. Bí mật như khoá hay token nằm ngoài mã nguồn và ngoài kết quả trả về. Xem thêm [[Quản lý bí mật trong kho mã và CI/CD: không commit khoá, quét rò rỉ và xoay vòng khi lộ]].

## Tóm lại

An toàn với MCP đến từ nhiều lớp: người duyệt các thao tác nhạy cảm, server kiểm tra đầu vào và giới hạn quyền, token chỉ dùng đúng nơi được cấp và server cục bộ chạy trong phạm vi hẹp. Không lớp nào đủ một mình, nhưng cộng lại chúng thu nhỏ hậu quả khi mô hình sai hoặc bị dẫn dắt.

## Tham khảo

- [Security Best Practices – Model Context Protocol Specification](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices)
- [Tools – Security Considerations – Model Context Protocol Specification](https://modelcontextprotocol.io/specification/latest/server/tools)
- [Architecture overview – Model Context Protocol](https://modelcontextprotocol.io/docs/learn/architecture)
