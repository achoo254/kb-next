---
title: Designing a REST API: naming resources, choosing HTTP methods and picking the right status codes
tags: rest, api, http, api design, status codes
type: note
---

> [!TLDR]
> - REST API URLs should be nouns naming resources (in the plural); the action lives in the HTTP method.
> - GET, PUT and DELETE are idempotent; POST and PATCH are not by default.
> - Status codes tell the client what happened: 2xx success, 4xx caller error, 5xx server error.

## Introduction

When you build an API for a mobile app, a website or another service to call, the hardest part is usually not the code but **setting conventions** so that other people can guess how to use it without asking you. This article covers three foundational conventions of a REST API running over HTTP: how to name resources in the URL, how to choose an HTTP method, and how to choose the status code you return.

A small caveat: "REST" is an architectural style, not a certified standard. Most APIs called REST in the real world follow only part of that style. So the practical goal here is **consistency and predictability**, while the behavior of each method and status code is already well described by the HTTP standard (RFC 9110), so you should follow it.

## Naming resources

A **resource** is a "thing" the API manages: a user, an order, an invoice, an uploaded file. Each resource has an address (a URL). A few common conventions keep addresses readable:

- **Use nouns, not verbs.** `/users` rather than `/getUsers`. The action is already expressed by the HTTP method.
- **Use the plural for collections.** `/orders` is the list of orders, `/orders/42` is one specific order. Plural or singular both work, as long as the whole API is consistent.
- **Nest resources when ownership is clear.** `/orders/42/items` are the line items of order 42. Do not nest more than two or three levels; past that, give the child resource its own address such as `/items/9`.
- **Lowercase, separated by hyphens.** `/order-items` reads better than `/OrderItems`. Addresses should stay stable over time.
- **Keep sensitive information out of URLs**, because URLs can end up in server logs, proxies and browser history.

Some operations do not look like "create, update, delete a record", for example "cancel an order" or "resend the confirmation email". There are two common approaches. The first treats the result as a new resource: `POST /orders/42/cancellations`. The second accepts a "verb" at the end of the path: `POST /orders/42/cancel`. The latter is shorter but departs from the noun convention; either is fine, so document it and apply it consistently.

## Choosing HTTP methods

The method says what you want to do with the resource. The HTTP standard (RFC 9110) defines two properties worth remembering:

- **Safe:** the method is read-only and does not change state on the server. GET, HEAD and OPTIONS belong here.
- **Idempotent:** calling it once or several times in a row with the same content leaves the server in the same final state. GET, HEAD, OPTIONS, PUT and DELETE are idempotent; POST and PATCH are not guaranteed to be by default.

| Method | Used to | Example |
|---|---|---|
| GET | Read a resource or a list | `GET /orders/42` |
| POST | Create, or trigger an operation | `POST /orders` |
| PUT | Replace a whole resource | `PUT /orders/42` |
| PATCH | Partially modify a resource | `PATCH /orders/42` |
| DELETE | Delete a resource | `DELETE /orders/42` |

A few points that are often confused:

- **Never change data with GET.** Browsers, proxies and crawlers may call GET freely (to warm caches, to preview links). If `GET /orders/42/delete` deletes data, you will hit incidents that are very hard to explain.
- **PUT and PATCH differ.** PUT sends the complete new representation of the resource; a missing field may be treated as removed. PATCH sends only what changes.
- **What does an idempotent DELETE mean?** Deleting order 42 twice leaves order 42 gone after both calls. The second call may return `404`; that does not violate idempotency, because the property is about server state, not the returned code.
- **POST is the "general-purpose" method.** Since it is not idempotent by default, retrying a POST on a flaky network can create two orders. The article [[Pagination, filtering and sorting in a REST API: offset, cursor and the conventions to agree on]] continues with how to read lists, while preventing duplicate creation is covered in the last article of this series.

## Choosing status codes

A status code is the three-digit number on the first line of the response. Remember the class first:

- **2xx:** success.
- **3xx:** redirection or "unchanged" (for example `304 Not Modified`).
- **4xx:** the caller (client) sent a faulty request.
- **5xx:** the server failed.

The codes used most in APIs:

| Code | Meaning | When to use |
|---|---|---|
| 200 OK | Success, with a body | Successful GET, PUT, PATCH |
| 201 Created | A new resource was created | POST that creates; should include a `Location` header pointing at the new resource |
| 204 No Content | Success, no body | Successful DELETE |
| 400 Bad Request | Syntactically wrong request | Broken JSON, missing required parameter |
| 401 Unauthorized | Not authenticated or credentials wrong | Token missing or expired |
| 403 Forbidden | Authenticated but not allowed | The user may not view this resource |
| 404 Not Found | Not found | Address or id does not exist |
| 405 Method Not Allowed | Method not supported at this address | `DELETE /orders` when the API disallows it; should include an `Allow` header |
| 409 Conflict | Conflicts with current state | Creating a record that violates a unique key |
| 422 Unprocessable Content | Syntax is fine but the content is invalid | Malformed email, negative quantity |
| 429 Too Many Requests | Too many calls | Rate limit exceeded (defined in RFC 6585) |
| 500 Internal Server Error | Unexpected server failure | Unhandled exception |
| 503 Service Unavailable | Temporarily cannot serve | Maintenance, overload |

The two most confused pairs are **401 and 403** (401: "I do not know who you are"; 403: "I know you, but you are not allowed") and **400 and 422** (400: the request cannot be read; 422: it can be read but a value is invalid). Many APIs merge 400 and 422 into one, which is acceptable as long as you are consistent.

Do not return `200 OK` with a body like `{"error": "..."}` for a failure. Monitoring tools, caches and client libraries all rely on the status code to guess what happened; the wrong code makes everything downstream misread it.

## A small example

Suppose you create an order and read it back (addresses use the example domain):

```text
POST https://api.example.com/orders
Content-Type: application/json

{"customerId": 7, "items": [{"sku": "A-100", "quantity": 2}]}
```

A sensible response:

```text
HTTP/1.1 201 Created
Location: https://api.example.com/orders/42
Content-Type: application/json

{"id": 42, "status": "pending"}
```

After that `GET /orders/42` returns `200`, `DELETE /orders/42` returns `204`, and calling `GET /orders/42` again returns `404`. This sequence of codes is enough for a client to understand the whole lifecycle without reading anything else.

## Summary

- Name resources with nouns, use the plural consistently, nest at most a few levels.
- Let the HTTP method express the action; know which methods are safe and idempotent.
- Return status codes of the right class; do not hide errors in a `200` body.

Every convention is a commitment to your API's users. Choose few, choose them clearly, write them down and keep them.

## References

- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 6585: Additional HTTP Status Codes](https://www.rfc-editor.org/rfc/rfc6585.html)
- [MDN: HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [MDN: Idempotent](https://developer.mozilla.org/en-US/docs/Glossary/Idempotent)
