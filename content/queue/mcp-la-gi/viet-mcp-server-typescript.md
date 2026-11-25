---
title: Viết MCP server đầu tiên bằng TypeScript: hai công cụ chạy qua stdio
tags: mcp, typescript, nodejs, stdio, zod, inspector
type: lab
---

> [!TLDR]
> - Dựng một MCP server nhỏ bằng TypeScript với hai công cụ `add_note` và `list_notes`, chạy qua stdio.
> - Dùng gói `@modelcontextprotocol/server` và `zod` để khai báo tham số; kiểm tra bằng MCP Inspector ở dòng lệnh.
> - Với server stdio, không bao giờ ghi log bằng `console.log`, vì stdout dành cho thông điệp JSON-RPC.

## Mục tiêu

Sau bài này bạn có một MCP server chạy được, gồm hai tool: lưu một ghi chú và liệt kê tiêu đề các ghi chú đã lưu. Bạn cũng biết cách kiểm tra server mà không cần ứng dụng AI. Bài giả định bạn đã đọc bài giới thiệu MCP là gì (host, client, server, tool, resource, prompt) và biết sơ về TypeScript.

Ghi chú nằm trong bộ nhớ tiến trình, nên mất khi server dừng. Mục đích của bài là hiểu khung MCP, không phải xây kho lưu trữ.

## Chuẩn bị

- Ubuntu 24.04 LTS với Node.js từ phiên bản 20 trở lên (tài liệu hướng dẫn chính thức yêu cầu mức này; bài được thử với Node.js 22). Cài từ nodejs.org nếu chưa có.
- Kiểm tra phiên bản:

```bash
node --version
npm --version
```

Bài được thử với `@modelcontextprotocol/server` 2.4.0, `zod` 4.6.7, `typescript` 7.0.2 và `@types/node` 26.6.10. API của SDK còn đang thay đổi, nên nếu bạn cài bản khác và gặp lỗi biên dịch, hãy đối chiếu với tài liệu "Build an MCP server" ở phần Tham khảo.

## Các bước

### Bước 1: tạo dự án

```bash
mkdir notes-mcp && cd notes-mcp
npm init -y
npm install @modelcontextprotocol/server zod
npm install -D typescript @types/node
mkdir src
```

Mở `package.json` và thêm `"type": "module"` để Node hiểu mã nguồn là ES module.

Tạo `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "types": ["node"],
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

### Bước 2: viết server

Tạo `src/index.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

const notes = new Map<string, string>();

function createServer() {
  const server = new McpServer({ name: "notes", version: "1.0.0" });

  server.registerTool(
    "add_note",
    {
      description: "Save a short note under a title",
      inputSchema: z.object({
        title: z.string().min(1).max(80).describe("Note title"),
        text: z.string().max(2000).describe("Note text"),
      }),
    },
    async ({ title, text }) => {
      notes.set(title, text);
      return { content: [{ type: "text", text: `Saved note "${title}"` }] };
    },
  );

  server.registerTool(
    "list_notes",
    {
      description: "List the titles of all saved notes",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: "text", text: [...notes.keys()].join("\n") || "No notes yet" }],
    }),
  );

  return server;
}

serveStdio(createServer, {
  onerror: (error) => console.error("notes server error:", error),
});
console.error("notes MCP server running on stdio");
```

Mấy điểm cần hiểu:

- `McpServer` là đối tượng đại diện cho server; `registerTool` khai báo một tool gồm tên, mô tả và `inputSchema`.
- `zod` vừa kiểm tra đầu vào lúc chạy, vừa sinh ra JSON Schema để client và mô hình biết tham số nào hợp lệ. Hãy đặt giới hạn rõ ràng như `min`, `max`, vì đầu vào do mô hình sinh ra và không đáng tin tuyệt đối.
- `createServer` là một hàm tạo nhà máy: tài liệu chính thức nhấn mạnh mỗi lần gọi phải trả về một `McpServer` **mới**, vì `serveStdio` có thể gọi nó nhiều lần.
- Mô tả tool nên ngắn và đúng việc, vì mô hình dựa vào đó để chọn công cụ.

### Bước 3: biên dịch

```bash
npx tsc
```

Lệnh tạo thư mục `build/` chứa `index.js`.

## Kiểm tra

MCP Inspector có chế độ dòng lệnh, giúp gọi server mà không cần ứng dụng AI. Tài liệu chính thức khuyên kiểm tra theo "kỷ nguyên giao thức" hiện đại:

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js --protocol-era modern --method tools/list
```

Kết quả phải liệt kê `add_note` và `list_notes` cùng JSON Schema của tham số. Inspector mặc định dùng kỷ nguyên `legacy`, chỉ thử cách bắt tay kiểu cũ, nên hãy chạy thêm một lần với `--protocol-era legacy`: `serveStdio` được thiết kế để phục vụ cả hai.

Gọi thử một tool:

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js --protocol-era modern \
  --method tools/call --tool-name add_note --tool-arg title=demo --tool-arg text=hello
```

Kết quả có `content` chứa dòng `Saved note "demo"`. Lưu ý mỗi lệnh Inspector khởi chạy một tiến trình server mới, nên `list_notes` ở lệnh kế tiếp sẽ báo chưa có ghi chú nào: dữ liệu trong bộ nhớ không sống qua các lần chạy. Muốn bền hơn, hãy ghi ra tệp hoặc cơ sở dữ liệu.

Để dùng trong một ứng dụng AI, bạn khai báo lệnh khởi chạy (ví dụ `node` kèm đường dẫn tuyệt đối tới `build/index.js`) trong cấu hình MCP của ứng dụng đó; cách cấu hình khác nhau theo từng ứng dụng nên hãy xem tài liệu của nó.

## Lỗi hay gặp

- **Server "treo" hoặc client báo lỗi phân tích JSON.** Nguyên nhân thường là `console.log`. Với server stdio, stdout là kênh JSON-RPC; mọi dòng log chen vào sẽ làm hỏng thông điệp. Dùng `console.error`, vì nó ghi ra stderr. Server HTTP thì không bị hạn chế này.
- **Quên biên dịch lại.** Sửa `src/index.ts` mà không chạy `npx tsc` thì Inspector vẫn chạy bản cũ trong `build/`.
- **Lỗi import khi `module` là `Node16`.** Thiếu `"type": "module"` trong `package.json` là nguyên nhân hay gặp.
- **Tự nối server bằng `server.connect(new StdioServerTransport())`.** Theo tài liệu, cách này vẫn biên dịch được nhưng chỉ phục vụ client kiểu cũ; hãy dùng `serveStdio`.
- **Tham số sai.** Nếu dữ liệu không khớp lược đồ (ví dụ `title` dài hơn 80 ký tự), SDK trả kết quả `isError: true` kèm thông báo kiểu `Input validation error` mà không chạy mã của bạn; đã thử với phiên bản ở trên. Với lỗi nghiệp vụ bên trong tool, hãy tự trả `isError: true` kèm thông báo rõ để mô hình sửa và thử lại.

## Tóm lại

Bạn đã dựng một MCP server với `McpServer`, `registerTool`, `zod` và `serveStdio`, rồi kiểm tra nó bằng Inspector. Phần khó thật sự nằm ở bước sau: khi tool làm được việc thật, ai được gọi, gọi với tham số nào và có cần người xác nhận hay không. Bài kế tiếp trả lời câu hỏi đó: [[Phân quyền và an toàn khi cho AI gọi công cụ thật qua MCP]].

## Tham khảo

- [Build an MCP server – Model Context Protocol](https://modelcontextprotocol.io/docs/develop/build-server)
- [Tools – Model Context Protocol Specification](https://modelcontextprotocol.io/specification/latest/server/tools)
