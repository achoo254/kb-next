---
title: Pagination, filtering and sorting in a REST API: offset, cursor and the conventions to agree on
tags: rest, api, pagination, cursor, filtering
type: note
---

> [!TLDR]
> - Never return an entire large data set in one response; always paginate and set a maximum limit.
> - Offset is simple but slows down and drifts when data changes; cursors are stable and faster for large lists.
> - Filtering and sorting should use consistently named query parameters, and accept only published fields.

## Introduction

Once you have clear addresses and methods, as in the first article of this series (naming resources, choosing methods and status codes), the next question is: how many orders does `GET /orders` return? If the table has tens of thousands of rows and the API returns them all at once, the response is heavy, the server burns memory, and the calling application waits a long time. The answer is **pagination** (splitting into pieces), together with **filtering** (taking only what is needed) and **sorting** (in the desired order).

All three use **query parameters** (the part after `?` in the URL). The HTTP standard does not specify the names of these parameters, so this is where you must set your own convention and keep it consistent across the whole API.

## Offset pagination

The easiest to understand: say "skip this many records, then take this many".

```text
GET https://api.example.com/orders?limit=20&offset=40
```

This is the third page if each page holds 20 records (skip 40, take 20). A variant uses page numbers: `?page=3&per_page=20`.

Advantages: easy to build, easy to jump straight to any page, and a UI with a "page 5" button fits well. Drawbacks to know:

- **Slower on deep pages.** In many relational databases a statement like `OFFSET 100000` still has to walk past (or count) the skipped rows, so the farther the page, the more it costs.
- **It drifts when data is changing.** Say you are viewing page 1, then a new order is added at the top. When you load page 2, the last record of page 1 has been pushed onto page 2 and you see it twice. Conversely, if a record is deleted you may miss one.

## Cursor pagination

Instead of saying "skip N rows", the client sends back a **cursor** saying "this is how far I have read". The server returns the cursor for the next page along with the data:

```text
GET https://api.example.com/orders?limit=20
```

```json
{
  "data": [ { "id": 981, "status": "paid" } ],
  "next_cursor": "eyJpZCI6OTYxfQ"
}
```

To get the next page the client calls:

```text
GET https://api.example.com/orders?limit=20&cursor=eyJpZCI6OTYxfQ
```

Internally, the cursor usually encodes the value of the sort key of the last record on the page (for example `id` or creation time), and the server queries "records whose key is smaller than this value". That lets the database use an index, speed does not depend on how deep the page is, and records being added or removed do not cause repeats or gaps.

The trade-off: you cannot jump straight to "page 50", and counting the total number of records must be done separately. Treat the cursor as an **opaque string**: the client only passes it back verbatim and never parses or builds one, so you can change the encoding later without breaking clients. For infinite-scroll lists (timelines, logs), a cursor is usually the better choice.

## Limits and pagination metadata

Whichever you choose, keep a few principles:

- **Set a default `limit`** (say 20) and a **maximum** (say 100). If a client asks for `limit=1000000`, clamp it to the maximum or return `400`.
- **Tell the client whether more pages exist.** That can be a `next_cursor` field (null at the end), a `Link` header with `rel="next"` per RFC 8288, or a `has_more` field in the body.
- **Think carefully before returning a total** (`total`). Counting a large table can be expensive; if the UI does not truly need it, leave it out or let the client request it separately.
- **Keep the order deterministic.** Pagination only makes sense with a stable order. If you sort by a column with duplicate values (such as creation time), add a tiebreaker key such as `id` so the order does not "jump".

## Filtering

The simplest approach is one parameter per filterable field, with the same name:

```text
GET https://api.example.com/orders?status=paid&customer_id=7
```

When you need range comparisons, common conventions are name suffixes (`created_after`, `created_before`) or bracket syntax (`created[gte]=...`). Any syntax works as long as it is consistent. Some things to do:

- **Allow filtering only on fields published in the documentation**, ideally with a matching database index. Allowing filters on every column is the fastest way for one request to accidentally slow down the whole system.
- **Validate input.** Never splice parameters directly into a query; always use parameterized statements (prepared statements) to avoid SQL injection.
- **Report unknown parameters** (`400`) instead of silently ignoring them; otherwise a client that mistypes a parameter name will think the filter ran when it had no effect at all.
- For free-text search, use a dedicated parameter such as `q`, and state in the docs which fields it matches.

## Sorting

The usual convention is a `sort` parameter holding field names, with a leading `-` for descending order:

```text
GET https://api.example.com/orders?sort=-created_at
GET https://api.example.com/orders?sort=status,-created_at
```

The second line means sort by `status` ascending, then within the same `status` by `created_at` descending. This is a widespread convention, not a mandatory standard; you can also use `sort=created_at&order=desc`. What matters:

- Accept only an **allowlist** of sortable fields, for the same performance and security reasons as filtering.
- Have a clear default order when the client sends no `sort`.
- With cursor pagination, the sort order must match the key the cursor encodes; if several orders are allowed, the cursor must be tied to the order it was made for.

## Putting it together

```text
GET https://api.example.com/orders?status=paid&sort=-created_at&limit=20
```

This request means: fetch paid orders, newest first, 20 per page. A sensible response is `200 OK` with `data` and `next_cursor`. If the client sends `sort=password`, the API should return `400` with an error message saying that field is not allowed; how to present errors consistently is the subject of the article [[Consistent errors, idempotency and REST API versioning: conventions that help an API last]].

## Summary

- Always paginate, with default and maximum limits.
- Choose offset when you need page jumping and data rarely changes; choose a cursor for large, constantly changing lists.
- Name filter and sort parameters consistently, allow only published fields, and validate every input.

## References

- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 8288: Web Linking](https://www.rfc-editor.org/rfc/rfc8288.html)
- [MDN: HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
