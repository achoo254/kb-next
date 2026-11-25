# Security + correctness review: review lifecycle, notifications, admin API

Date: 2026-11-05. Scope: the uncommitted working tree (`git diff` + untracked files, plans/ excluded). Read-only review, no suites run. One Express probe was run with tsx: `req.path` at `finish` for errored calls (see M3).

## Verdict

No auth bypass found. Token auth, the CSRF boundary, notification IDOR, review-reason and Jev-score exposure, and the state machine guards all hold. The real problems are abuse and amplification paths (an unauthenticated call-log flood, admin inbox spam), PATCH applying changes partly, notification writes after commit that can turn a successful action into a 500, and a confirmed bug that doubles the path in the call log.

## Verified OK (with evidence)

- **Token storage and compare.** `admin-tokens.ts:38` uses 256-bit `randomBytes`, stores sha256 only, and checks the shape regex before the DB lookup. The lookup by hash equality is not a useful timing oracle, because a caller cannot steer sha256 prefixes. `timingSafeEqual` is redundant but harmless.
- **Revoked, demoted, or deleted maker.** `useToken` rejects `revokedAt !== null`. `authenticate` (`admin-api-routes.ts:112`) re-checks `config.adminSubs.has(holder.sub)` on every call. A deleted maker sets `createdBy` to null, so the inner join drops the row.
- **Token never in logs or errors.** The call log stores `req.path` (no query, no headers). Errors are only the codes `token-required` / `invalid-token`. The token appears only in the 201 body of `POST /api/moderation/tokens`, with `no-store`. The web UI keeps the secret in component state only (`admin-api-screen.tsx:98`).
- **Mounting ahead of `requireSameOrigin`.** The `api` router ends with a catch-all 404 (`admin-api-routes.ts:157`). No cookie-session route lives under `/api/admin`, and the grep found no other `/api/admin` routes. Token management sits on `/api/moderation/*`, after `requireSameOrigin`, which covers every non-safe method including DELETE (`auth/origin-check.ts:12`). There are no CORS headers, so a browser cannot read admin API answers.
- **Rate-limit key.** `trust proxy` is `loopback` (`app.ts:95`) and the server binds 127.0.0.1, so `req.ip` is the address nginx appends and cannot be spoofed via X-Forwarded-For.
- **Inbox IDOR.** Every query filters by `userId` from the session (`notification-store.ts:77,92,110,121`). `place` is computed with the reader's own `viewerFor`, so it is null for texts the reader cannot read.
- **Review reasons and Jev scores.** History returns only `approved` reviews (reason null) at public scope (`history.ts:97`). `jevScores` are read only in `listReviewQueue`, which only admins reach. `SubmitResponse` exposes just `preReviewed: boolean`. Duplicate candidates are read as `GUEST`, so Jev never sees private texts.
- **State machine.** Every transition locks the row (`FOR UPDATE`, `review.ts:45`) and checks status inside the transaction. Approving a non-pending text gives 409, and withdrawing after approval gives `not-pending`. Authors cannot edit `pending` or `approved` texts (`authoring.ts:43`, also enforced in `files.ts` and `history-routes`).
- **Admin API placement.** `publicOnly=true` blocks personal Spaces (`moderation.ts:75`), and a Collection is checked to belong to the resolved Space.
- **XSS.** No `dangerouslySetInnerHTML` in the new pages. Titles and excerpts render as React text, and hrefs are built from ids with `encodeURIComponent`.
- **Mentions.** Only the text's author and people already in the discussion can be mentioned (`comment-notices.ts:42`), so nobody can mention an arbitrary account by name.

## High

None found.

## Medium

### M1. An unauthenticated caller can flood the admin call log and the DB
`admin-api-routes.ts:95-122`, `admin-tokens.ts:115-118`

`log` runs before `authenticate`, so every 401 call with no token or a garbage token inserts a row in `admin_api_calls` (with `tokenId` null). It also runs a range `DELETE` on every call.
- **Scenario:** one IP at the 60/min limit writes 86k rows a day. A few IPs push out the 20 rows A03 shows (`RECENT_CALLS`) within seconds, which hides a real compromised-token call from the admin.
- **Write load:** each junk request costs one INSERT, one DELETE, and one token lookup.
- **Fix:** log only calls that authenticated (tokenId set), or record 401s as a counter per minute or per IP instead of rows. Run the retention DELETE from the daily housekeeping, not per call. Optionally keep the client IP for authenticated calls, for forensics.

### M2. Submit/withdraw loop spams every admin's inbox and burns Jev calls
`review-routes.ts:82,95-110`, `moderation.ts:114-130`

Submit and withdraw share one 10/min per-account budget. Each submit makes one Jev call and inserts one `review/submitted` notification per admin. Withdraw does not clear those notifications.
- **Scenario:** a member scripts 5 submit/withdraw cycles a minute, which is 300 notifications per admin per hour and 300 Jev calls per hour. Re-submitting a `rejected` text works the same way.
- **Fix:** skip the admin notice when an unread `submitted` notice for the same document already exists, and delete or mark read the admins' notice on withdraw. Give submit its own small budget (for example 10 per hour per account), and reuse the last Jev scores when the content hash has not changed since the previous submission.

### M3. Every errored admin API call is logged under a doubled path (confirmed by probe)
`admin-api-routes.ts:97-98`

When `api` passes an error out with `next(err)`, Express restores `req.url` to the full URL before the app's error handler sends the response. At `finish`, `req.path` is therefore already `/api/admin/...`, and the code prefixes it again. Probe output:
```
'401 /api/admin/api/admin/review'
'200 /api/admin/review'
'404 /api/admin/api/admin/nope'
```
Every 401, 400, 404 and 409 row in A03 shows a wrong path. The test only asserts the 201 row (`admin-api-routes.test.ts:155`).
- **Fix:** capture the path when the request enters `log`, before any `next()`: `const path = `${req.baseUrl}${req.path}`.slice(0, 200)` (or `req.originalUrl` without its query string). Add a test that asserts the path of a 401 or 404 row.

### M4. Admin PATCH applies changes partly, and acts on any status
`moderation.ts:157-187`, `review.ts:169-197`

`updatePost` runs placement and tags, then the title (a new version via `saveDocument`), then `hidden`, each in its own transaction. With `{space: 'x', title: 'y', hidden: true}` on a non-approved document, the move and the new title version are committed, then the call answers 409 `not-approved`. The client thinks nothing changed, and a retry creates another version.

The function also never checks status, although the docs call this a "published text". So a token, which is a machine credential on another server, can rename a member's private draft (a new version written by the admin) and move it into a public Space.
- **Fix:** check `doc.status === 'approved'` first and answer 409 `not-approved` before any write (or at least whenever `hidden` is given). Run the whole patch in one transaction. If drafts are meant to be in scope for the web A02 route, restrict only the token route.

### M5. A failed notification after commit answers 500 although the action succeeded
`moderation.ts:120-128` (submit), `:139-142` (decide), `:180-183` (hide)

The state change is already committed when `notify`, `nameOf` or `adminUserIds` run without error handling. The comment route deliberately catches its notice errors (`activity-routes.ts:117-121`); review does not. If the notification insert fails, for example on a DB blip or a payload that fails to parse:
- submit answers 500, a retry gives 409 `already-pending`, and the UI shows a failure;
- `decide` answers 500, and the admin re-decides into a 409 `not-pending`.
- **Fix:** wrap these notice writes like `noticeComment` (`.catch` plus `console.error`). Alternatively, write the notification inside the same transaction as the event.

## Low

- **L1. Contradictory comments on what the call log records** (`admin-api-routes.ts:5-6` vs `:84`). The header says calls past the limit are logged; the inline comment and the code (the limiter runs before `log`) say they are not. Fix the header; `docs/admin-api.md:39` is consistent.
- **L2. A text can be flagged stale right after approval** (`review.ts:146,299-309`). `decideReview` and `setHidden` do not set `updatedAt`. A draft last saved more than 180 days ago, then submitted and approved, gets a "may be out of date" notice on the next daily run. Approved texts are also locked to their author (`authoring.ts:43`), so the notice cannot be acted on directly (see Unresolved questions). Fix: compare against the latest `approved` review event as well as `updatedAt`, or bump `updatedAt` on approval.
- **L3. The stale run is unbounded** (`stale-job.ts:16-25`). Everything goes into one multi-row INSERT, at 5 bind parameters per row. Past about 13k stale texts the 65535-parameter limit fails every run, permanently (only logged). A first deploy over an old corpus also drops hundreds of notices into one author's inbox. Fix: insert in chunks, and consider one digest notice per author.
- **L4. People who have lost access still get comment excerpts** (`comment-notices.ts:42-52`). Participants come from the existing comments, with no read-access check. Today `isPublic` is status-based and comments exist only on published texts, so the exposure is limited to a text that was hidden after they commented. Fix: filter recipients with `canRead` (one `viewerFor` per recipient), or skip notices when `doc.hidden`.
- **L5. `listComments` loads the whole thread on every comment POST** (`activity-routes.ts:112`), just to collect participant names. Fix: select distinct `authorId`s with their names.
- **L6. Pre-review holds the submit request for up to 6s plus the Meili/DB time** (`moderation.ts:120`), after the commit. Jev reads text the author controls, so prompt injection can bias scores. They are advisory and shown only to admins, so this is acceptable; consider labelling the scores as such in A01.
- **L7. Making a token revokes every admin's tokens** (`admin-tokens.ts:40`). This matches the spec ("Tạo token mới sẽ thu hồi token cũ"), but any admin can silently break another admin's pipeline. Informational: the call log has no record of who revoked.
- **L8. `POST /api/admin/posts` has no idempotency key**, so a pipeline retry after a timeout publishes a duplicate. Informational; consider `Idempotency-Key`, or a dedupe on `contentHash` plus Space within a short window.
- **L9. A member can submit from their personal Space, and approval then publishes the text there** (`review-routes.ts:98`, `publicOnly=false`). The queue item shows the Space, so the admin can see it. This depends on product intent.

## Edge cases checked

- Concurrent decide versus withdraw: serialized by `FOR UPDATE`, and the loser gets 409.
- Withdraw, then the Jev answer arrives: the scores land on the old `submitted` event; the queue reads the latest event with `DISTINCT ON`, so they are not misattributed.
- A Jev `duplicateOf` that points to a deleted or hidden text: the title is resolved with the admin viewer, and a missing one gives `duplicateOf: null`.
- Bell index: the migration adds a partial index on `notifications(user_id) WHERE read_at IS NULL`. Migration 0013 is additive only (a new table, a NOT NULL column with a default, indexes); safe on existing rows.

## Recommended actions (priority order)

1. M3: capture the path when the request arrives, and add a test on an error row.
2. M4: check status before writes in `updatePost`, and use one transaction.
3. M1: stop writing rows for unauthenticated calls, and move retention to housekeeping.
4. M5: catch notice failures after commit.
5. M2: dedupe admin `submitted` notices, clear them on withdraw, and add a slower submit budget.
6. L1–L3, then the rest as time allows.

## Unresolved questions

1. Should the token PATCH be allowed on non-approved documents (drafts, pending, private)? The docs say "published text", but the code allows any status.
2. A stale notice on an approved text: how is the author meant to act on it, given that approved texts are locked to their author? Is there a "propose update" flow, or should the notice go to admins?
3. Should A03's call log show unauthenticated attempts at all (as a security signal), or only authenticated calls?
