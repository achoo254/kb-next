---
title: MCP là gì: giao thức giúp ứng dụng AI kết nối với công cụ và dữ liệu
tags: mcp, model context protocol, ai agent, json-rpc, công cụ
type: note
---

> [!TLDR]
> - MCP (Model Context Protocol) là giao thức mở để ứng dụng AI lấy ngữ cảnh và gọi công cụ từ các chương trình bên ngoài theo một cách thống nhất.
> - Có ba vai: host (ứng dụng AI), client (kết nối tới một server) và server (chương trình cung cấp ngữ cảnh).
> - Server cung cấp ba loại thành phần chính: tool (hành động), resource (dữ liệu) và prompt (mẫu câu lệnh).
> - Thông điệp là JSON-RPC 2.0, chạy qua stdio (máy cục bộ) hoặc Streamable HTTP (từ xa).

## Mở đầu

Một mô hình ngôn ngữ giỏi viết và suy luận, nhưng tự nó không đọc được kho mã của bạn, không xem được log của máy chủ và không tạo được ticket. Muốn làm những việc đó, ứng dụng AI cần cầu nối tới thế giới bên ngoài. Trước đây mỗi ứng dụng tự viết cầu nối riêng cho từng dịch vụ, nên công sức bị lặp lại và khó dùng lại.

Model Context Protocol, gọi tắt là MCP, giải quyết đúng chỗ đó: nó định nghĩa một cách chung để ứng dụng AI hỏi "bạn có những gì?" và "hãy làm việc này giúp tôi" với bất kỳ chương trình nào nói cùng giao thức. Bài này giải thích MCP gồm những phần nào và chúng phối hợp ra sao. Nội dung dựa trên tài liệu chính thức của MCP, phiên bản đặc tả 2026-07-28, tính đến tháng 11/2026.

## Ba vai trong MCP: host, client và server

Tài liệu chính thức mô tả MCP theo mô hình client–server với ba thành phần:

- **MCP host**: ứng dụng AI điều phối mọi thứ, ví dụ Claude Code hoặc Visual Studio Code.
- **MCP client**: một thành phần bên trong host, giữ một kết nối riêng tới đúng một server.
- **MCP server**: chương trình cung cấp ngữ cảnh cho client.

Điểm dễ nhầm là host không nói chuyện trực tiếp với server. Host tạo ra **một client cho mỗi server**. Nếu bạn nối một server hệ thống tệp và một server theo dõi lỗi, host sẽ có hai client, mỗi client lo một đường.

Chữ "server" ở đây chỉ nghĩa là chương trình phục vụ ngữ cảnh, không nói nó chạy ở đâu. Server chạy ngay trên máy bạn, do host khởi chạy, thường gọi là server cục bộ. Server chạy trên nền tảng của nhà cung cấp và truy cập qua mạng thì gọi là server từ xa.

## Hai tầng: dữ liệu và vận chuyển

MCP chia làm hai tầng:

- **Tầng dữ liệu** định nghĩa nội dung trao đổi, dựa trên JSON-RPC 2.0: khám phá khả năng của server, các thành phần như tool, resource, prompt và thông báo.
- **Tầng vận chuyển** định nghĩa kênh chuyên chở các thông điệp đó. MCP có hai cách:
  - **stdio**: host chạy server như một tiến trình con và hai bên trao đổi qua luồng vào/ra chuẩn. Không có mạng, phù hợp server cục bộ.
  - **Streamable HTTP**: client gửi HTTP POST, có thể kèm Server-Sent Events để truyền luồng. Cách này dành cho server từ xa và hỗ trợ xác thực HTTP thông thường như bearer token; tài liệu khuyến nghị dùng OAuth để lấy token.

Nhờ tách tầng, cùng một thông điệp JSON-RPC chạy được trên cả hai kênh, nên bạn viết logic một lần.

## Ba thành phần server cung cấp: tool, resource, prompt

Đây là phần quan trọng nhất của MCP. Một server có thể cung cấp:

| Thành phần | Dùng để | Ví dụ |
| --- | --- | --- |
| **Tool** | thực hiện hành động | gọi API, truy vấn cơ sở dữ liệu, thao tác tệp |
| **Resource** | cung cấp dữ liệu làm ngữ cảnh | nội dung tệp, lược đồ cơ sở dữ liệu |
| **Prompt** | mẫu để cấu trúc cuộc trò chuyện với mô hình | câu lệnh hệ thống, ví dụ mẫu |

Mỗi loại có phương thức khám phá dạng `*/list` và phương thức lấy hoặc chạy tương ứng: `resources/read`, `prompts/get`, `tools/call`. Ví dụ, một server về cơ sở dữ liệu có thể đưa ra tool để truy vấn, một resource chứa lược đồ và một prompt chứa ví dụ mẫu cách dùng các tool đó.

Về phía client, đặc tả có thành phần **elicitation** (phương thức `elicitation/create`): server xin người dùng nhập thêm thông tin hoặc xác nhận một hành động.

## Một vòng trao đổi thực tế

Giả sử host vừa nối vào một server. Luồng điển hình như sau:

1. Client có thể gửi `server/discover` để biết server hỗ trợ phiên bản và khả năng nào. Bước này là tuỳ chọn, vì mỗi yêu cầu đã mang sẵn phiên bản giao thức và khả năng của client trong trường `_meta`.
2. Client gửi `tools/list`. Server trả về danh sách tool, mỗi tool có `name`, `description` và `inputSchema` (một JSON Schema mô tả tham số).
3. Host đưa danh sách đó cho mô hình. Khi mô hình quyết định dùng một tool, host nhờ client gửi `tools/call` kèm `name` và `arguments`.
4. Server chạy tool rồi trả về `content`, một mảng gồm văn bản, hình, âm thanh hoặc liên kết tới resource. Kết quả đưa lại cho mô hình để nó trả lời tiếp.

Một yêu cầu gọi tool trông như sau (rút gọn, bỏ phần `_meta`):

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "add_note",
    "arguments": { "title": "demo", "text": "hello" }
  }
}
```

Điều đáng chú ý ở bản đặc tả mới là MCP **không giữ trạng thái theo kết nối**: mỗi yêu cầu tự mang đủ thông tin để xử lý. Server cần nhớ điều gì qua nhiều lần gọi thì trả về một "tay cầm" (handle) rõ ràng và nhận lại nó như một tham số thường. Các phiên bản đặc tả cũ hơn có bước bắt tay `initialize` và phiên làm việc, nên bạn có thể gặp cả hai cách trong tài liệu và công cụ cũ.

## Thông báo khi danh sách đổi

Danh sách tool có thể thay đổi theo thời gian. Client muốn biết thì mở luồng `subscriptions/listen` và nêu loại thông báo cần nhận, chẳng hạn `toolsListChanged`. Khi danh sách đổi, server gửi `notifications/tools/list_changed`; client thường phản ứng bằng cách gọi lại `tools/list`. Tài liệu lưu ý thông báo chỉ là "cố gắng hết sức", nên client vẫn nên thỉnh thoảng hỏi lại để dữ liệu luôn mới.

## Những điều MCP không làm

MCP chỉ lo việc trao đổi ngữ cảnh. Nó không quy định ứng dụng dùng mô hình ngôn ngữ thế nào hay quản lý ngữ cảnh ra sao. Nó cũng không tự làm cho một công cụ trở nên an toàn: quyền, xác thực và việc cho người dùng duyệt hành động là trách nhiệm của host và server. Chủ đề này có bài riêng: [[Phân quyền và an toàn khi cho AI gọi công cụ thật qua MCP]].

Ngoài ra, đặc tả 2026-07-28 đánh dấu roots, sampling (tính năng phía client) và ghi log theo giao thức (tính năng phía server) là **đã bị loại bỏ dần**. Server stdio nên ghi log ra `stderr`, hoặc dùng OpenTelemetry.

## Tóm lại

MCP là lớp chuẩn giữa ứng dụng AI và thế giới bên ngoài: host tạo một client cho mỗi server, các bên nói JSON-RPC 2.0 qua stdio hoặc Streamable HTTP, và server đưa ra tool, resource, prompt để mô hình dùng. Hiểu bức tranh này rồi, bước tiếp theo là tự tay dựng một server nhỏ: xem [[Viết MCP server đầu tiên bằng TypeScript: hai công cụ chạy qua stdio]]. Khi đã gọi được công cụ, hãy đọc kỹ phần an toàn trước khi nối vào hệ thống thật.

## Tham khảo

- [Architecture overview – Model Context Protocol](https://modelcontextprotocol.io/docs/learn/architecture)
- [Tools – Model Context Protocol Specification](https://modelcontextprotocol.io/specification/latest/server/tools)
