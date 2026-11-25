---
title: What is MCP: the protocol that connects AI applications to tools and data
tags: mcp, model context protocol, ai agent, json-rpc, tools
type: note
---

> [!TLDR]
> - MCP (Model Context Protocol) is an open protocol that lets AI applications fetch context and call tools from outside programs in one consistent way.
> - There are three roles: the host (the AI application), the client (one connection to one server) and the server (the program that provides context).
> - A server offers three main kinds of building blocks: tools (actions), resources (data) and prompts (templates).
> - Messages are JSON-RPC 2.0, carried over stdio (local machine) or Streamable HTTP (remote).

## Introduction

A language model is good at writing and reasoning, but on its own it cannot read your code repository, look at a server's logs or create a ticket. To do those things, an AI application needs a bridge to the outside world. In the past every application wrote its own bridge for each service, so the effort was duplicated and hard to reuse.

The Model Context Protocol, MCP for short, solves exactly that: it defines a common way for an AI application to ask "what do you offer?" and "please do this for me" with any program that speaks the same protocol. This article explains what MCP consists of and how the parts work together. It is based on the official MCP documentation, specification version 2026-07-28, as of November 2026.

## Three roles in MCP: host, client and server

The official documentation describes MCP as a client–server model with three components:

- **MCP host**: the AI application that coordinates everything, for example Claude Code or Visual Studio Code.
- **MCP client**: a component inside the host that keeps a dedicated connection to exactly one server.
- **MCP server**: the program that provides context to the client.

An easy point to miss is that the host does not talk to servers directly. The host creates **one client per server**. If you connect a file-system server and an error-tracking server, the host has two clients, each handling one line.

The word "server" here only means a program that serves context; it says nothing about where it runs. A server that runs on your own machine, started by the host, is usually called a local server. A server that runs on a provider's platform and is reached over the network is called a remote server.

## Two layers: data and transport

MCP is split into two layers:

- The **data layer** defines what is exchanged, based on JSON-RPC 2.0: discovering what a server can do, the building blocks such as tools, resources and prompts, and notifications.
- The **transport layer** defines the channel that carries those messages. MCP has two options:
  - **stdio**: the host runs the server as a child process and the two sides exchange messages over standard input and output. There is no network, which suits local servers.
  - **Streamable HTTP**: the client sends HTTP POST requests, optionally with Server-Sent Events for streaming. This is meant for remote servers and supports ordinary HTTP authentication such as bearer tokens; the documentation recommends using OAuth to obtain tokens.

Because the layers are separate, the same JSON-RPC message works over both channels, so you write the logic once.

## The three building blocks a server offers: tools, resources, prompts

This is the most important part of MCP. A server can offer:

| Building block | Used for | Example |
| --- | --- | --- |
| **Tool** | performing an action | calling an API, querying a database, working with files |
| **Resource** | providing data as context | file contents, a database schema |
| **Prompt** | a template that structures a conversation with the model | a system prompt, few-shot examples |

Each kind has a discovery method of the form `*/list` and a matching method to fetch or run it: `resources/read`, `prompts/get`, `tools/call`. For example, a database server might expose a tool for querying, a resource holding the schema and a prompt containing example usage of those tools.

On the client side, the specification has **elicitation** (the `elicitation/create` method): the server asks the user for more input or for confirmation of an action.

## A realistic exchange

Suppose a host has just connected to a server. A typical flow looks like this:

1. The client may send `server/discover` to learn which versions and capabilities the server supports. This step is optional, because every request already carries the protocol version and the client's capabilities in the `_meta` field.
2. The client sends `tools/list`. The server returns the list of tools, each with a `name`, a `description` and an `inputSchema` (a JSON Schema describing the parameters).
3. The host gives that list to the model. When the model decides to use a tool, the host asks the client to send `tools/call` with the `name` and `arguments`.
4. The server runs the tool and returns `content`, an array of text, images, audio or links to resources. The result goes back to the model so it can continue its answer.

A tool-call request looks like this (shortened, without `_meta`):

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

What stands out in the new version of the specification is that MCP **does not keep per-connection state**: each request carries everything needed to process it. If a server needs to remember something across calls, it returns an explicit "handle" and receives it back as an ordinary parameter. Older versions of the specification have an `initialize` handshake and sessions, so you may come across both styles in older documentation and tools.

## Notifications when the list changes

The list of tools can change over time. A client that wants to know opens a `subscriptions/listen` stream and names the notification types it wants, such as `toolsListChanged`. When the list changes, the server sends `notifications/tools/list_changed`; the client usually reacts by calling `tools/list` again. The documentation notes that notifications are best effort, so a client should still ask again from time to time to keep its data fresh.

## What MCP does not do

MCP only handles the exchange of context. It does not dictate how an application uses a language model or manages context. It also does not make a tool safe by itself: permissions, authentication and letting the user approve actions are the responsibility of the host and the server. This topic has its own article: [[Permissions and safety when letting AI call real tools through MCP]].

In addition, specification 2026-07-28 marks roots, sampling (client features) and protocol logging (a server feature) as **deprecated**. A stdio server should log to `stderr`, or use OpenTelemetry.

## Summary

MCP is the standard layer between AI applications and the outside world: the host creates one client per server, the parties speak JSON-RPC 2.0 over stdio or Streamable HTTP, and the server exposes tools, resources and prompts for the model to use. Once you understand this picture, the next step is to build a small server yourself: see [[Writing your first MCP server in TypeScript: two tools over stdio]]. After you can call tools, read the safety section carefully before connecting to real systems.

## References

- [Architecture overview – Model Context Protocol](https://modelcontextprotocol.io/docs/learn/architecture)
- [Tools – Model Context Protocol Specification](https://modelcontextprotocol.io/specification/latest/server/tools)
