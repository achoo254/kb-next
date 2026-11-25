---
title: Permissions and safety when letting AI call real tools through MCP
tags: mcp, security, permissions, oauth, ai agent, least privilege
type: note
---

> [!TLDR]
> - MCP tools do real work with real privileges, so sensitive operations need human approval and privileges should be kept to the minimum.
> - A server must validate all inputs, enforce access control, rate limit calls and sanitize outputs; a client should let the user see the parameters before a call.
> - Do not pass through tokens from elsewhere: a server accepts only tokens issued to itself; grant small scopes and raise them step by step when needed.
> - A local server runs with the user's privileges, so install only from trusted sources and run it in an isolated environment.

## Introduction

Reading data rarely does great harm; dropping a table, sending an email or pushing code to a repository is different. When an AI application is connected to an MCP server, the model can decide on its own to call those tools, even when it misunderstood the request or was steered by a piece of malicious text. That is why permissions and safety are a core part of the design, not something added at the end.

This article summarizes the recommendations in the MCP specification (version 2026-07-28, as of November 2026) and the project's "Security Best Practices" page, with notes on how to apply them when writing a server. It also continues the hands-on part of writing a small MCP server in TypeScript. The article only explains technical documents; it is not a substitute for a security assessment of your own system.

## Principle 1: always keep a human in the loop

The specification says that, for trust, safety and security, there **should always be a human** able to deny tool invocations. Applications should:

- show clearly which tools are exposed to the model;
- give clear visual indicators when a tool is invoked;
- ask the user for confirmation on operations where it is needed.

On the client side it is also recommended to let the user **see the parameters before the call reaches the server**, to avoid accidental or deliberate data leaks, to log tool usage for auditing and to set a timeout for each call.

A subtle point: a tool may carry `annotations` describing its behavior, but the specification requires clients to treat them as **untrusted** unless the server comes from a trusted source. Do not rely on a label such as "read-only" from an unfamiliar server to skip the confirmation step.

## Principle 2: the server is strict and does not trust input

The specification lists what a server **must** do: validate all tool inputs, implement access control, rate limit tool invocations and sanitize tool outputs. In practice:

- **Declare a strict schema.** Use types, lengths and `enum`. If a tool reads documents, do not accept a free-form path; let the caller choose from an allowlist.
- **Separate read tools from write tools.** Two small tools are easier to grant privileges to and easier to review than one tool that "does everything".
- **Return useful errors without exposing internals.** Return business errors with `isError: true` so the model can correct itself; do not put internal paths or credentials in them.

An example of a read-only tool that accepts only names from an allowlist:

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

Because `name` can only be `intro` or `faq`, the model has no way to pass in a path such as `../../etc/passwd`. The code above assumes `DOCS` is a `Map` holding the contents of the documents.

## Principle 3: be careful with tokens and privileges (remote servers)

For a remote server using Streamable HTTP, the documentation recommends using OAuth to obtain tokens. The "Security Best Practices" page names several pitfalls:

- **Token passthrough.** This is a wrong pattern: the server takes a token from the client and forwards it unchanged to a downstream API without checking whether the token was issued to the server itself. The specification forbids it: a server **must not** accept tokens that were not explicitly issued for it. Passthrough bypasses controls such as rate limiting and makes access logs harder to trace.
- **Confused deputy with a proxy server.** An MCP proxy that uses a fixed client ID with a third-party service and also allows dynamic client registration can be abused when an old consent cookie causes the user prompt to be skipped. The defense is for the proxy to store and check consent per client, require the `redirect_uri` to match the registered string exactly and use a single-use `state` parameter.
- **Server-side request forgery (SSRF).** A client running on a server can be tricked by a malicious server into reaching internal addresses or a cloud provider's metadata service. You should require HTTPS, block private and internal address ranges, check redirect destinations as well and consider an egress proxy. The documentation also advises against writing IP address checks by hand, because they easily miss unusual encodings.
- **Guessing or stealing a state "handle".** MCP has no per-connection session; if a server creates handles (such as a basket ID), holding a handle must not count as being authenticated. Use hard-to-guess random values and bind them to the authenticated user.
- **Granting too many scopes.** A token with a broad scope such as `files:*` or `admin:*` makes the damage larger when it leaks. Start with a minimal scope set (mostly read), ask for elevation only when a privileged operation really needs it and avoid "all" scopes. You should log each elevation (the scope requested and the part granted) for auditing.

## Principle 4: a local server runs with your privileges

A local server is a program that runs on your own machine, with the same privileges as the application that starts it. The documentation names the risks: a malicious start command in a configuration, malicious code inside the server package, or a server that opens a localhost port reached through DNS rebinding. The recommendations include:

- A client must show the **exact command it will run** and ask for the user's consent before connecting a local server configured with one click.
- Run the server in an isolated environment with minimal file and network privileges.
- Authors of local servers should use `stdio` so that only the client can talk to it; if they use HTTP, they should require an authorization token or use an interprocess channel with restricted access.

For you, that means: install MCP servers only from sources you trust, read the start command in the configuration carefully and do not give the process administrator privileges.

## A quick checklist before letting AI call real tools

1. Each tool does one job, with a clear name and description.
2. The input schema is strict, with allowlists instead of free-form strings.
3. The server's account or token has only the necessary privileges, with reading and writing separated.
4. Operations that cannot be undone (delete, send, push code) go through a human confirmation step.
5. There are rate limits, timeouts and enough logging to trace what happened.
6. Secrets such as keys or tokens stay out of the source code and out of returned results. See also [[Secrets in code repositories and CI/CD: never commit keys, scan for leaks and rotate on exposure]].

## Summary

Safety with MCP comes in layers: people approve sensitive operations, the server validates input and limits privileges, tokens are used only where they were issued and local servers run in a narrow scope. No single layer is enough, but together they reduce the consequences when a model is wrong or is steered.

## References

- [Security Best Practices – Model Context Protocol Specification](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices)
- [Tools – Security Considerations – Model Context Protocol Specification](https://modelcontextprotocol.io/specification/latest/server/tools)
- [Architecture overview – Model Context Protocol](https://modelcontextprotocol.io/docs/learn/architecture)
