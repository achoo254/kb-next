---
title: Writing your first MCP server in TypeScript: two tools over stdio
tags: mcp, typescript, nodejs, stdio, zod, inspector
type: lab
---

> [!TLDR]
> - Build a small MCP server in TypeScript with two tools, `add_note` and `list_notes`, running over stdio.
> - Use the `@modelcontextprotocol/server` and `zod` packages to declare parameters; test with the MCP Inspector on the command line.
> - With a stdio server, never log with `console.log`, because stdout is reserved for JSON-RPC messages.

## Goal

After this article you have a working MCP server with two tools: one saves a note and one lists the titles of saved notes. You also know how to test the server without an AI application. The article assumes you have read the introduction to what MCP is (host, client, server, tools, resources, prompts) and know a little TypeScript.

The notes live in the process memory, so they are lost when the server stops. The purpose of this article is to understand the MCP skeleton, not to build a storage system.

## Preparation

- Ubuntu 24.04 LTS with Node.js version 20 or later (the official guide requires this level; this article was tested with Node.js 22). Install it from nodejs.org if you do not have it.
- Check the versions:

```bash
node --version
npm --version
```

This article was tested with `@modelcontextprotocol/server` 2.4.0, `zod` 4.6.7, `typescript` 7.0.2 and `@types/node` 26.6.10. The SDK API is still changing, so if you install other versions and hit compile errors, compare with the "Build an MCP server" guide in the References.

## Steps

### Step 1: create the project

```bash
mkdir notes-mcp && cd notes-mcp
npm init -y
npm install @modelcontextprotocol/server zod
npm install -D typescript @types/node
mkdir src
```

Open `package.json` and add `"type": "module"` so Node treats the source as ES modules.

Create `tsconfig.json`:

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

### Step 2: write the server

Create `src/index.ts`:

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

A few points to understand:

- `McpServer` is the object that represents the server; `registerTool` declares a tool with a name, a description and an `inputSchema`.
- `zod` both validates input at run time and generates the JSON Schema so the client and the model know which parameters are valid. Set clear limits such as `min` and `max`, because the input is produced by a model and cannot be fully trusted.
- `createServer` is a factory function: the official documentation stresses that every call must return a **new** `McpServer`, because `serveStdio` may call it several times.
- Keep a tool's description short and accurate, because the model relies on it to choose a tool.

### Step 3: build

```bash
npx tsc
```

The command creates a `build/` directory containing `index.js`.

## Verification

The MCP Inspector has a command-line mode that lets you call the server without an AI application. The official documentation recommends testing in the modern "protocol era":

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js --protocol-era modern --method tools/list
```

The output must list `add_note` and `list_notes` together with the JSON Schema of their parameters. The Inspector defaults to the `legacy` era, which only tries the old-style handshake, so run it once more with `--protocol-era legacy`: `serveStdio` is designed to serve both.

Call a tool:

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js --protocol-era modern \
  --method tools/call --tool-name add_note --tool-arg title=demo --tool-arg text=hello
```

The result has a `content` containing the line `Saved note "demo"`. Note that every Inspector command starts a new server process, so `list_notes` in the next command will report that there are no notes: data in memory does not survive between runs. For something more durable, write to a file or a database.

To use it in an AI application, you declare the start command (for example `node` with the absolute path to `build/index.js`) in that application's MCP configuration; the way to configure it differs between applications, so see its documentation.

## Common errors

- **The server "hangs" or the client reports a JSON parsing error.** The usual cause is `console.log`. For a stdio server, stdout is the JSON-RPC channel; any log line mixed in corrupts the messages. Use `console.error`, which writes to stderr. HTTP servers do not have this restriction.
- **Forgetting to rebuild.** If you edit `src/index.ts` without running `npx tsc`, the Inspector still runs the old version in `build/`.
- **Import errors when `module` is `Node16`.** A missing `"type": "module"` in `package.json` is a common cause.
- **Wiring the server by hand with `server.connect(new StdioServerTransport())`.** According to the documentation this still compiles but only serves old-style clients; use `serveStdio`.
- **Wrong parameters.** If the data does not match the schema (for example a `title` longer than 80 characters), the SDK returns an `isError: true` result with an `Input validation error` message without running your code; this was tried with the versions above. For business errors inside a tool, return `isError: true` yourself with a clear message so the model can fix it and retry.

## Summary

You built an MCP server with `McpServer`, `registerTool`, `zod` and `serveStdio`, then tested it with the Inspector. The real difficulty comes next: once a tool does real work, who may call it, with which parameters and whether a person must confirm. The next article answers that: [[Permissions and safety when letting AI call real tools through MCP]].

## References

- [Build an MCP server – Model Context Protocol](https://modelcontextprotocol.io/docs/develop/build-server)
- [Tools – Model Context Protocol Specification](https://modelcontextprotocol.io/specification/latest/server/tools)
