# Code Review: DB roles, member removal, invites, audit, delete-my-data

## Scope
- Server: `apps/server/src/access/{roles,viewer,visibility,review,workspace-members,account-data,audit-trail,workspace-status}.ts`,
  `src/workspace/{invites,audit}.ts`, `src/api/{workspace-routes,me-routes,review-routes,admin-api-routes}.ts`,
  `src/auth/{auth-routes,session-store}.ts`, `src/admin/admin-tokens.ts`, `drizzle/0016_*.sql`, `src/db/schema.ts`
- Web (spot-checked): `pages/invite-screen.tsx`, `pages/settings-screen.tsx`, `api/workspace-api.ts`
- Docs: `docs/settings-and-roles.md` (claims checked against code)
- Tests run (targeted, `--maxWorkers=2`): `workspace-routes.test.ts`, `account-data.test.ts`, `visibility.test.ts` → 3 files, 119 tests passed, 0 failed.

## Overall
Authorization is mostly sound. Every C19/A02/A03 route checks `isAdminViewer`, A01 uses `isReviewerViewer`.
`viewerFor` re-reads role, `removedAt` and `deletedAt` on every request. Invite roles are a separate enum with no
`admin` value. The admin API re-checks the token maker's role and whether the maker is gone. CSRF is covered by the
global Origin check (`auth/origin-check.ts`). No privilege-escalation path to admin was found. The real problems are
deletion completeness versus the docs, a session check that relies only on deleting session rows, self-approval by
reviewers, and race windows in the invite and sign-in flows.

## High
None found.

## Medium

### M1. Trashed published texts survive "delete my data" (`account-data.ts:75-77`)
`unpublished = ne(documents.status, 'approved')`. Moving a text to the trash (`authoring.ts:378`) only sets `deletedAt` and
leaves `status` alone. So when an author trashes a published community text and then deletes their data with
`removePublished=false`, that text stays in the DB forever, under the tombstone, readable by admins. The docs table
says texts "trong thùng rác" are deleted for good. `keptPublished` (line 118-121) also counts these trashed rows.
The test (`account-data.test.ts:48`) only covers a trashed *draft*.
Fix: add `and(isNotNull(documents.deletedAt), ne(documents.origin, 'official'))` to the `or(...)` in `own`, and exclude
`deletedAt IS NOT NULL` from the `kept` count. Add a test for a trashed approved community text.

### M2. Being removed or deleted is enforced only by deleting session rows, which can race (`auth-routes.ts:158-167`, `require-user.ts:16-25`)
`findSession`/`requireUserId`/`signedIn` never look at `users.removedAt`/`deletedAt`. Only `viewerFor`, `me()` and
`findProfile` do. The sign-in callback checks `mayHoldSession` and then calls `createSession` outside any transaction:
- If an admin clicks "Gỡ" between the check and the insert, `removeMember` deletes sessions (none exist yet) and commits.
  The new session is then inserted and stays valid for up to 30 days.
- The same thing happens when `deleteAccountData` races with a sign-in that already resolved the old `userId`.
The resulting session is a guest to `viewerFor`-based routes. Routes that use only `userIdOf(res)`/`requireUserId`
(`canvas-routes`, `notification-routes`, parts of `review-routes`, `me-routes` PATCH/onboarding) still act for it,
for example creating canvases owned by a tombstone.
Fix: make the check part of session lookup, e.g. join `users` in `findSession` (or `requireUserId`) with
`removed_at IS NULL AND deleted_at IS NULL`, and delete the session when the join fails. Alternatively insert the session
with `INSERT ... SELECT ... FROM users WHERE id=$1 AND removed_at IS NULL AND deleted_at IS NULL`.

### M3. A reviewer can approve their own text (`review.ts:180-195`, `review-routes.ts:140-145`)
`decideReview` has no `doc.authorId !== reviewer.userId` guard. Before this change only admins could decide, and admins
can already publish directly. Now every `reviewer` (including anyone holding a reviewer invite, see M4) can submit and
approve their own text into "Cộng đồng" with no second person involved. `decide()` simply skips the notification
when author equals reviewer (`moderation.ts:173`).
Fix (product call): refuse self-decisions for non-admins (`if (!reviewer.isAdmin && doc.authorId === reviewer.userId)
return { kind: 'self' }` → 409). Optionally hide own items from a reviewer's queue.

### M4. A reviewer invite is a multi-use bearer grant (`invites.ts:5-10, 116-131`)
Any account that can sign in through the hoandat IdP and holds the URL becomes `reviewer`, for 7 days, with no cap on
how many accounts can use it. A reviewer reads every pending text, including ones in personal Spaces
(`visibility.ts:30,40`), and can publish (M3). Since every IdP account is already a `member` on first sign-in
(`upsertUser`), a `member` invite changes nothing. The only invite that does anything is the privileged one, and it is
the one with no limit. A link pasted into a large chat or leaked through a screenshot or chat log can mint reviewers
in bulk. `acceptedCount` lets an admin notice this only afterwards.
Fix options: single-use (or `max_uses`) for `reviewer` links, or have reviewer acceptance create a request an admin
confirms. At minimum, show `acceptedCount` and the accepting accounts prominently in C19, and document the risk in
`docs/settings-and-roles.md`.

## Low

### L1. Invite acceptance checks the link outside the transaction (`invites.ts:116-131`)
`findInvite` runs before `db.transaction`. A revoke, expiry or maker demotion between the two still raises the role
and increments the count. Fix: inside the tx, `UPDATE invite_links SET accepted_count = accepted_count + 1 WHERE id=$1
AND revoked_at IS NULL AND expires_at > now RETURNING id` (and re-check the maker), and abort when 0 rows. Also
re-check `removed_at/deleted_at IS NULL` on the locked account row (line 120). Right now only the route's
`viewerFor` checks this.

### L2. "One live link at a time" is not enforced under concurrency (`invites.ts:49-65`)
Two concurrent `POST /api/workspace/invite` requests under READ COMMITTED each revoke the existing rows and then each
insert one, leaving two live links. `liveInvite` shows only the newest, so the other is invisible and cannot be
revoked from the UI (it can be revoked by id). Fix: `pg_advisory_xact_lock` in `createInvite`, or a partial unique
index (`CREATE UNIQUE INDEX ... ON invite_links ((true)) WHERE revoked_at IS NULL`). Expiry would still need
handling, so the lock is simpler. The same pattern exists in admin tokens and share links.

### L3. Member changes return 404 after committing, beyond 500 accounts (`workspace-members.ts:35-53, 99-110`)
`listMembers` silently caps at 500, ordered by `createdAt asc`. `memberById` reloads the whole list and searches it,
so a change to account #501+ commits and then returns 404 `not-found`. The newest accounts are also invisible in C19.
Every change also reloads up to 500 rows with a grouped sessions subquery. Fix: have `memberById` query by id
directly, and paginate or say "showing first N" in the list.

### L4. Official, non-approved texts by a deleting admin are hard-deleted (`account-data.ts:75-78`)
The docs say "Bài chính thức (thuộc workspace)" are kept, but the code keeps only *approved* official texts. An admin's
official text that is pending, in draft, or (combined with M1) in any non-approved state is deleted, along with any
official text in their personal Space. This is unlikely today: imports and the API create `approved`. Fix:
`own = and(authorId, ne(origin,'official'), or(...))`, or align the docs.

### L5. The delete confirmation literal protects nothing on the server (`me-routes.ts:57`)
`confirm: 'DELETE'` is a constant the client always sends. The typed `XOÁ`/`DELETE` check is UI-only. This is
acceptable, since CSRF is blocked by the Origin check and the endpoint is rate-limited at 5/min, but the docs should not
suggest the server verifies what the person typed. Also, the `not-found` path (line 131) returns 401 without
`clearSessionCookie`.

### L6. Files uploaded concurrently are orphaned
Requests already running for the user (an upload or editor save in another tab) can commit `files` rows owned by the
tombstone after the deletion transaction. Nothing cleans those files up, on disk or in the DB. This is minor, but M2's
fix narrows it.

### L7. Migration 0016: `ALTER TYPE ... ADD VALUE` inside drizzle's single migration transaction
Postgres 12 and later allows this, but the new value cannot be *used* in the same transaction. 0016 does not use it,
so it is safe as written. A future migration that uses `'admin'` and is applied in the same batch as 0016 on a lagging
environment would fail. Existing `users.role` values (`member`, `reviewer`) are untouched. The new columns are
nullable or have constant defaults, so this is a metadata-only change and safe on existing prod rows. I could not
confirm the prod Postgres version from the repo.

### L8. Invite token in URL path
`/i/<token>` and `GET /api/invites/:token` put the token in nginx access logs, the same as share links `/l/<token>`.
The browser's default `strict-origin-when-cross-origin` keeps it out of third-party Referers, but setting
`Referrer-Policy: no-referrer` (helmet) on `/i/*` would make that explicit.

## Verified OK (risk calibration)
- No path grants admin through an invite: the `invite_role` enum is `member|reviewer`, the body is `z.enum(INVITE_ROLES)`,
  and the DB enforces it. Accepting never lowers a role (`RANK` comparison against `effectiveRole`). A bootstrap admin
  is never touched.
- An invite is off when it is revoked, expired, or its maker is not an admin, has been removed, or has deleted their
  data. A link from a reviewer is impossible because creation goes through `admin()`. Accepting needs a non-guest
  `viewerFor`, so removed or deleted accounts are refused.
- Tokens are 24 random bytes encoded as 32 base64url characters, stored as sha256 + last4, returned once with
  `Cache-Control: no-store`. The lookup is rate-limited at 20/min per IP (`trust proxy` is set to loopback).
- Reviewers are 403 on A02 (`/api/moderation/published`, PATCH), A03 (tokens, admin API), and all `/api/workspace/*`
  admin routes. The admin API accepts only a maker whose `effectiveRole` is admin and who is not gone.
- Removal: sessions are deleted, `pending` texts go to `draft` in the same transaction, and sign-in is refused with
  `?login=removed`. A bootstrap admin and your own account are locked (409). On restore the old role is kept.
- Audit `detail` holds only roles and counts. No token, email or body is stored. The C19 view exposes names, document
  titles and member emails to admins only.
- Delete-my-data: one transaction with `FOR UPDATE` on the account row. Files on disk are unlinked after commit, and
  failures are logged. Share links, admin tokens and invites the user made are revoked. The sub is replaced with
  `deleted:<uuid>`, which a real IdP sub will not collide with, so the same IdP account comes back as a fresh member
  account. FKs were checked: no `documentVersions.fileId` points to another document's file, so `deleteDocumentsWhere`
  cannot fail on an FK. Other users' journeys referencing deleted texts get `documentId=NULL` (set null). Their
  comments on deleted texts cascade, as expected.
- Search: hits are re-filtered with `visibleTo`. Reviewers do not see pending texts in search, which is inconsistent
  with A01 but does not leak anything.

## Recommended actions
1. M2: add the removed/deleted check to session lookup. This closes the removal and deletion races in one place.
2. M1 + L4: fix the delete predicate (trashed community texts; keep every official text) and add tests.
3. M3 + M4: decide on self-approval and reviewer-invite limits (product decision). Default recommendation: block
   self-decisions for non-admin reviewers, and make reviewer links single-use.
4. L1/L2: make invite acceptance and creation atomic.
5. L3: query `memberById` by id.

## Metrics
- Targeted tests: 119/119 pass (3 files). Full suite, lint and typecheck were not run (out of scope for a read-only
  review).

## Unresolved questions
- Is the hoandat IdP open sign-up? If yes, M4 becomes High.
- Is a reviewer approving their own text intended?
- Which Postgres version runs in prod (L7)?
