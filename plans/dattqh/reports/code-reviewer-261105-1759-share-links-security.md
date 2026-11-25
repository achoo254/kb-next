# Code Review: Share Links (C18/H02), OG page, C04/C06 flow, nginx

## Scope
- Server: `apps/server/src/access/share-links.ts`, `api/share-routes.ts`, `share/og-page.ts`, `access/review.ts` (keepPrivate), `review/moderation.ts`, `api/review-routes.ts`, `api/content-routes.ts`, `app.ts`, `server.ts`, `db/schema.ts`, `drizzle/0014_share-link-access-history.sql`
- Web: `api/share-api.ts`, `pages/shared-open-screen.tsx`, `pages/share-screen.tsx`, `pages/publish-screen.tsx`, `pages/submit-screen.tsx`, `routes.ts`, `app.tsx`
- Infra: `infra/nginx/kb.hoandat.com.conf`
- Read-only. No edits.

## Verification run
- `vitest run --maxWorkers=1 share/og-page.test.ts api/share-routes.test.ts`: 2 files, 14 tests passed.
- `drizzle-kit check`: "Everything's fine".
- `tsc --noEmit -p apps/server/tsconfig.json`: exit 0, no output.
- Web typecheck/lint and full suites: not run (asked to avoid heavy suites).

## Overall
Core security properties hold: 192-bit tokens; only sha256 + last4 stored; lookup by hash, so no timing oracle; token shown once. Revoke/expiry are checked before the document. The OG page resolves as GUEST, does not log, escapes attribute and title values, uses function replacers (no `$&` injection) and sends one generic page for every non-ok outcome. Log paths do not leak the token: the nginx access log is off for /l/ and /api/l/, the error log is at `crit`, `kb_notoken` logs `$uri` without the query, URIError is not logged, and `safeErrorText` is used. The login return path lives only in the sealed `/auth` cookie and is never sent to the IdP. C06 no longer auto-submits on load. No High issues found.

## High
None.

## Medium

### M1. Remix has no per-account limit, so one account can mass-create drafts
`apps/server/src/api/share-routes.ts:287`. `POST /api/l/:token/remix` only has `openLimit` (60/min per IP) and `auth`. Each call copies the full markdown into a new document plus version and enqueues a search sync.
Failure: a signed-in user (or a script spread over IPs) holding one remix link creates about 3,600 drafts per hour per IP. That bloats `documents` and `document_versions` and floods the index queue. A double-click guard exists only in the UI.
Fix: add `perAccountLimit(10)` after `auth`, the same as the other write routes. Optionally return the existing remix when the same account remixed the same document within N seconds.

### M2. A link revives automatically when an unpublished text is published again
`apps/server/src/access/share-links.ts:157-166`. A link that is not revoked and not expired only reports `private` while `!isPublic(doc)`. No hide, send-back or reject path revokes links; only `createShareLink` does.
Failure: an admin hides an approved text, or sends it back. The author rewrites it, possibly with different content, and it is approved again. Every old token now opens again, without the author re-sharing. Recipients the author assumed were cut off regain access to new content.
Fix (product decision): either (a) revoke live links in the decide/send-back path (keep them on a temporary admin hide if that is intended), or (b) record `documentVersion` or `approvedAt` on the link and treat a newer approval as `off`. At minimum, document the behaviour in the C18 UI ("link works again when re-published").

### M3. PATCH on an expired link silently re-enables it
`apps/server/src/access/share-links.ts:114-131`, line 123. The live-link query is `revokedAt IS NULL`, which includes expired links. Changing `expiry` resets `expiresAt` from now. Even an `access`-only PATCH targets the expired link.
Failure: the owner opens C18, sees "expired" and toggles access view to remix. The old token now works again for 7, 30 or unlimited days with remix rights. The UI does not make this obvious.
Fix: in `changeShareLink`, return `no-link` (or `expired`) when `expiresAt <= now`, and have the UI offer "Tạo link mới". If revival is intended, require it explicitly (e.g. `{renew: true}`) and test it.

## Low

### L1. Share pages outside the single `/l/<token>` shape now hit Express's raw 404
`infra/nginx/kb.hoandat.com.conf:39`, `apps/server/src/share/og-page.ts:127`. nginx now proxies everything under `/l/` to Node, but Express only handles `/l/:token`. `/l/`, `/l/x/y`, etc. fall through to finalhandler ("Cannot GET /l/x/y"). The token-like path is echoed in the body, and the SPA X02 page no longer shows. Previously nginx served index.html.
Fix: add `router.get(/^\/l\/.*/, ...)` that renders the generic template with no preview, or narrow the nginx regex to `^/(api/)?l/[A-Za-z0-9_-]+(/remix)?$`.

### L2. The OG page is not rate limited
`apps/server/src/share/og-page.ts:127`. Each hit is one indexed DB query and is cheap. Token guessing is infeasible at 192 bits. Still, it is the only token-resolving endpoint with no limit.
Fix: reuse an IP limiter (e.g. 120/min).

### L3. /l/ page headers differ from `location /`
- `Permissions-Policy` is no longer sent. nginx adds it only in `location /`, and helmet does not set it. Fix: set it in `ogPageRoutes` alongside CSP.
- `og-page.ts:145-146`: any `nodeEnv !== 'production'` deployment (staging) removes the CSP entirely. Fix: drop it only when the template came from the Vite dev server, not by `nodeEnv`.
- Verified fine: HSTS, nosniff and Referrer-Policy come from helmet (`app.ts:101`); the route also sets `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and `Cache-Control: no-store`. `index.html` also has `<meta name="referrer" content="no-referrer">`.

### L4. The header comment contradicts the code for deleted texts
`share-links.ts:9-11` says a deleted text is `private`. `liveDocument` excludes trashed rows, so lines 163-164 return `not-found`. The behaviour is acceptable; fix the comment or the code so they agree, and add a test.

### L5. The remix credit is built from a raw title inside markdown link syntax
`share-routes.ts:299-302`. A title containing `]` or `)` breaks the credit link or injects arbitrary link text and URL into the copy. react-markdown's default URL filter blocks `javascript:` (`reader-markdown.tsx:3`), so the impact is cosmetic or phishing-ish inside the remixer's own draft.
Fix: escape `[]()\` in the title before interpolating.

### L6. `canRemix` can be true for a text that cannot be remixed
`share-routes.ts:271` excludes only `office`. Lines 296-297 then return 409 for any version with `markdown === null` (stored-file `web`/`journey` types). The UI shows Remix, then a generic failure.
Fix: compute `canRemix` from the latest version having markdown, or use the same predicate in both places.

### L7. One live link per document is enforced only by the application
Migration 0014 has no partial unique index. Correctness relies on `createShareLink` taking `FOR UPDATE` on the documents row (it does). A future code path inserting links outside that lock would create two live links, and `changeShareLink`'s `[live]` would pick one arbitrarily.
Fix: `CREATE UNIQUE INDEX share_links_one_live ON share_links(document_id) WHERE revoked_at IS NULL`.

### L8. The 90-day prune has no index and no test
`share-links.ts:230-236`. The hourly `DELETE ... WHERE kind='opened' AND visited_at < ...` scans the table, because the only index is `share_link_id`. Each opening (every page load, 60/min/IP) inserts a row. `pruneShareOpenings` has no test (grep: referenced only in `server.ts` and `share-links.ts`).
Fix: add an index on `(visited_at)` filtered to `kind='opened'`, or `(kind, visited_at)`. Add a test that keeps an 89-day opening and drops a 91-day one, and keeps created/changed/revoked rows.

### L9. Opening counts include the owner, admins and reloads
`share-links.ts:170-176` logs every successful GET, including the author previewing their own link and every reload. `openings7d` overstates real recipients. If the number is meant as a signal, skip logging when `viewer.userId === doc.authorId`.

## Informational (not defects in this diff)
- **The guest "preview only" gate is UX, not a boundary.** `/api/l/:token` returns `document.id` (`share-routes.ts:273`). A link can only be `ok` for a guest when the text `isPublic`, and `canRead` lets guests read public texts in full via `GET /api/documents/:id` (`visibility.ts:27`, `content-routes.ts:261`). The preview response itself is correct: title, author, sections (max 8), first-chunk peek (max 280 chars, markup stripped), reading minutes and the space brief. It never includes full text, status, tags, approver or history. If guests must not read full text, the change belongs in `canRead`/`visibleTo`, which is outside this diff.
- **Access history exposes openers' account names to the author and admins** (`shareHistory`). This is per the C18 spec. Confirm the privacy page mentions it.
- **nginx regex check.** `^/(api/)?l/` does not match `/login`, `/library`, `/api/links`, `/api/library` or `/l` (needs a literal `l/`). It is declared before `^/(api|auth)/`, and no `^~` prefix covers `/api/l/`, so it wins for `/api/l/...`. nginx matches on the decoded URI, so `%6c` variants are covered. `/L/...` (uppercase) misses the regex, lands in `location /`, is access-logged, and the SPA shows X02. Negligible.
- **C04/C06.** `SubmitScreen` submits only with a `request` prop from C04's explicit "Gửi duyệt". `history.replaceState` moves the address to /submit, so a reload or visit shows the status or redirects to C04 and never re-sends. `keepPrivate` locks the row, refuses approved texts (409) and clears pending notices.

## Positive (risk calibration only)
- Hash lookup, token never persisted, and tests assert that no token or token prefix is stored or returned (`share-routes.test.ts:132-136`).
- The OG tests cover: escaping, no logging, the same generic page for wrong/malformed/revoked/hidden links, and CSP parity with nginx.

## Recommended actions
1. M1: add `perAccountLimit` to remix.
2. M3: refuse PATCH on expired links, or make renewal explicit.
3. M2: decide the revive-on-republish policy; revoke on send-back/reject, or tie the link to its approval.
4. L1/L3: add a catch-all `/l/*` page and Permissions-Policy; CSP keyed on the template source, not `nodeEnv`.
5. L7/L8: partial unique index plus prune index (migration 0015), and a prune test.

## Unresolved questions
- Is Cloudflare Web Analytics automatic injection enabled for the zone? CSP allows `static.cloudflareinsights.com`, and `index.html` has no beacon. If CF injects it, the beacon reports `location.href`, i.e. `/l/<token>`, to Cloudflare. Cloudflare edge logs also see the path regardless. Confirm injection is off, or exclude `/l/*`.
- M2: should an admin's temporary hide followed by show keep links alive, while a send-back/reject kills them?

Status: DONE_WITH_CONCERNS
