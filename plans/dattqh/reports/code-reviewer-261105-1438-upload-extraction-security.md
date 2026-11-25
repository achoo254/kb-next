# Code Review: upload, download, editor saves, text extraction (security + correctness)

## Scope
- Commit `6a71879` (apps/server/src/extract/*, access/extraction.ts, migration 0011) plus the uncommitted working tree (file-routes, src/files/*, access/files.ts, migration 0012, trash purge, infra/nginx/*, deploy.sh, kb-server.service, web upload/import/sync/office-* pages).
- Read-only. Tests, lint and typecheck were not run: another session was running `vue-tsc` and free memory was 31%, so the process rules said to wait. All findings come from reading the source. The nginx X-Accel header behaviour was checked against `ngx_http_upstream_headers_in` in nginx master.

## Overall
Access control on the server is solid. Every download and save goes through `documentAccess`, `historyScope` and `editRight`. Storage keys are random and validated before any path is built. The MIME type comes from the name and is then checked against the magic bytes, never taken from the client. Busboy limits are set to 1 file, 0 fields and 2 parts. `saveFileVersion` holds `FOR UPDATE` on the document row, so two saves from the same base cannot both create a version. The origin and source checks on postMessage are correct. CSRF is covered by SameSite=Lax plus `requireSameOrigin`.

The real risks are elsewhere: availability (the extraction runs inside the 400 MB API process and has no limit on attempts after a crash) and client-side loss of unsynced drafts.

## High

### H1. A file that crashes the server is retried forever, contradicting the docs
- `extract/job-store.ts:32-49` `claimNextJob` claims any `queued` job and increments `attempts`, but never checks `attempts < MAX_ATTEMPTS`.
- `job-store.ts:83-90` `requeueInterrupted` sets `running` jobs back to `queued` at startup.
- `extraction-queue.ts:163-164` checks MAX_ATTEMPTS only in the `catch` path. A process crash never reaches that path.
- With `kb-server.service` `Restart=on-failure`: OOM kill, restart, resume, crash again, without end. Each loop takes the whole API down (login, reading, search).
- The docs claim the opposite. `docs/text-extraction.md:144` says the interrupted attempt is counted "nên tệp làm sập server không chạy mãi" ("so a file that crashes the server does not run forever"). That is false.
- Fix: in `requeueInterrupted`, set `status: 'failed', errorCode: 'internal'` where `attempts >= MAX_ATTEMPTS` (else requeue). Or add `lt(attempts, MAX_ATTEMPTS)` to `due` in `claimNextJob` and fail the rest. Add a test that simulates two restarts.

### H2. Any signed-in user can OOM-kill the API with one PDF (pdf.js in-process, no image or memory cap)
- `pdf-inspector.ts:125-131` calls `getDocument` without `maxImageSize`, so the default is `-1`, unlimited. The worker runs on the main thread (`pdf-inspector.ts:31-32`). `getOperatorList()` (line 144) decodes every image XObject in that thread.
- A 25 MB PDF with a highly compressed Flate image declaring, say, 30000x30000 pixels decodes to gigabytes. That breaks `MemoryMax=400M` (`infra/kb-server.service:20`) and systemd kills the whole API. Combined with H1, it is a crash loop. `POST /api/files/:id/retry` resets attempts to 0, so the user can also restart the loop at will.
- Even without a bomb, a legitimate PDF costs a lot of memory:
  - `pipeline.ts:75` holds two copies of the file (`new Uint8Array(await readFile())` copies the buffer).
  - `pdf-inspector.ts:126` makes a third copy.
  - `pdf-subset.ts:11` re-parses the whole PDF with pdf-lib for every 4-page OCR batch. A 200-page scan means 50 full parses.
  - `tika-client.ts:113` adds the request body.
  - pdf.js parsing also blocks the API's event loop (the worker is in-thread).
- Fix:
  - Set `maxImageSize` (for example 40e6 pixels).
  - Better: run `inspectPdf` and `pdfWithPages` in a `worker_threads` Worker with `resourceLimits` (or a child process), so a bad file kills the worker and not the API.
  - Load the pdf-lib document once per job, not once per batch.
  - Drop the extra `new Uint8Array(...)` copy.

### H3. A draft sent while the user saves again is marked "synced" and its newest edits are lost
- `office-sync.ts:41-46`: `send()` uploads a snapshot `entry`. On success it calls `updateEntry(documentId, {state:'synced', fileId, editedAt:null})`. `office-store.ts:255-260` `updateEntry` is a non-atomic read-merge-write that merges these fields onto whatever record is there now. It never checks that the record is still the one that was sent.
- Scenario. Any overlap between `syncAll` and a save triggers it: page load or the `online` event (`installOfficeSync`, `office-sync.ts:146-152`), the H04 "Gửi" button, or two tabs.
  1. `syncAll` starts a PUT of draft v1 (base F0).
  2. The user clicks Save, and `keepDraft` writes v2 (`office-view.tsx:176`).
  3. The v1 PUT succeeds, and `updateEntry` marks the record synced with v2's bytes and `fileId=F1`.
  4. The view's `syncEntry` sees `synced` and does nothing (`office-sync.ts:60`).
  5. v2 is now evictable (`makeRoom`). On the next online open, `bytesToOpen` fetches F1 and `keepServerCopy` overwrites v2.
  
  Variant: the view's own PUT of v2 gets 409 and records the conflict, then syncAll's later `updateEntry(synced)` wipes the conflict.
- `office-store.ts:206-219` `makeRoom` has the same root cause. It lists the `synced` entries and deletes them later by id. A draft written to such a record in between, from another tab, is deleted.
- This contradicts `docs/office-editor.md:215` ("bản nháp không bao giờ bị xoá trước khi server có", "a draft is never deleted before the server has it").
- Fix:
  - Do every state change in one `readwrite` transaction that compares a revision token (`editedAt`, or a counter) with the snapshot that was sent. If the record changed meanwhile, only move its base `fileId` to the new file and keep `state:'draft'`.
  - Route `syncEntry` through the same single-flight lock as `syncAll`.
  - In `makeRoom`, delete inside a transaction that checks `state === 'synced'` again.

## Medium

### M1. Office drafts and copies in IndexedDB are not tied to an account
- `office-store.ts` keys records by `documentId` only. Nothing clears `kb-office` on sign-out (`app.tsx:74`), and `installOfficeSync` runs on every page load (`main.tsx:26`).
- On a shared browser, user B sees user A's private drafts on H04, and the bytes of A's server copies stay readable.
- B's session sends A's drafts. If B is an admin, they are saved as B's versions. Otherwise they fail with 403.
- "Giữ cả hai" (`office-sync.ts:133-141`, "keep both") uploads A's draft as a new document owned by B.
- Fix: store `userId` in each record and filter by the current account, or ask on sign-out and clear the store when no drafts are pending.

### M2. An expired session flips every draft to `failed`, and they are never retried automatically
- `office-sync.ts:22-24`: a 401 is not "passing", so each draft becomes `failed` with `sign-in-required`. `syncAll` only sends `draft` records (line 84), so after signing in again each draft needs a manual "Thử lại" ("Retry").
- This is likely after a long offline period: the `online` event fires before the user signs in.
- Fix: treat 401/`sign-in-required` as waiting and stop the run, or skip the sync when there is no session.

### M3. No storage quota; queue starvation and Tika amplification
- `file-routes.ts:141-143`: 60 uploads per minute per account at 25 MB each, about 1.5 GB/min of disk, with no per-account byte quota.
- Each upload queues up to 15 minutes of serial OCR. One account can starve the extraction of everyone else.
- `retry` and `cancel` (`file-routes.ts:325-340`, 60/min each) abort only the client fetch. Tika keeps OCRing the request it was given, so retry/cancel loops stack concurrent OCR work on a host with about 2.5 GB free (`docs/text-extraction.md:23`).
- Fix: a per-account byte quota (sum of `files.size`), a per-account cap on queued jobs, and queue order fair across accounts. Make retry a no-op while a job is `queued` or `running`, and rate-limit retry more tightly than 60/min.

### M4. An admin's editor save takes the document out of the author's C16 view
- `access/files.ts:200` writes `ownerId: writer.userId` on each new version.
- `listUploads` (`files.ts:250-254`) requires `files.ownerId = viewer` and `documents.authorId = viewer`. `mayFollowFile` and `answerSuggestions` (`files.ts:293`) also gate on `ownerId`.
- After an admin saves, the author no longer sees the document's processing and cannot retry or answer it. The admin does not see it either (`authorId` is not theirs).
- Fix: authorise C16 by the document's author (plus admins) instead of the file's owner.

### M5. Production downloads may be blocked by SELinux (needs checking)
- The `/etc/pki/nginx` paths suggest an EL host. Files under `/var/lib/kb/files` get the `var_lib_t` label, which `httpd_t` cannot read when SELinux is enforcing, so X-Accel downloads would return 403.
- Nothing in docs/ or infra/ mentions SELinux.
- Fix: check `getenforce`. If enforcing, run `semanage fcontext -a -t httpd_sys_content_t '/var/lib/kb/files(/.*)?' && restorecon -R /var/lib/kb/files` (or `public_content_t`), and add it to `deploy.sh setup` and the guide.

## Low
- **L1. X-Accel path not validated.** `file-routes.ts:269` builds `X-Accel-Redirect` from `files.storageKey` without `isStorageKey` (the node path validates it through `storedPath`). Every key in the DB comes from `newStorageKey` today, and Node rejects CR/LF in headers, so this is defence in depth only: call `storedPath`/`isStorageKey` there too.
- **L2. Header differences on X-Accel downloads.** nginx passes only Content-Type, Content-Disposition, Cache-Control, Expires, Set-Cookie and Accept-Ranges through to the file response:
  - helmet's CSP, X-Frame-Options and CORP are dropped (the response is still `attachment` + `nosniff`, so the risk is low);
  - the sha256 ETag that `file-routes.ts:265` documents is replaced by nginx's mtime-size ETag;
  - `Cache-Control` is sent twice (upstream plus `add_header`).
  
  If CSP is wanted, add `add_header Content-Security-Policy "default-src 'none'; sandbox"` to `location ^~ /_kb_files/`.
- **L3. Orphaned file on a DB error.** `file-routes.ts:176`: if the `users` lookup throws after `receive`, the stored file is left behind (it is outside the `try`). Move it inside, or before `receive`.
- **L4. Duplicate documents in "Giữ cả hai".** `keepBoth` uploads first. If `keepServer` then throws (fetching the server bytes fails), the record stays `conflict` and a second click uploads a duplicate document. The same happens after an upload that is cancelled or fails on the network after the server stored it (`upload-queue.ts`).
- **L5. Decompression bomb in the browser.** `office-text.ts:47-55` inflates whole parts with no output cap on H04. Only the author or an admin can create the server version, so the impact is self-limited. Cap the output, for example by reading the stream until about 2 MB.
- **L6. Suggestions from an older version.** `answerSuggestions` accepts suggestions from a non-current file's job (an older version). Restrict it to the latest file of the document.
- **L7. Lost retry after cancel.** A retry sent while a cancelled job is still `running` in the DB is dropped (`queueJob` `setWhere status <> 'running'`), then `failJob` marks it `cancelled`. The user has to click again.
- **L8. Late writes after cancel or timeout.** After a cancel or a timeout, the orphaned run can still call `saveSuggestions` (not guarded by the signal), which writes suggestions onto a failed or requeued job.
- **L9. CSP hardcodes the editor origin.** The `frame-src` in nginx is fixed to `https://kb-office.hoandat.com` while `OFFICE_EDITOR_ORIGIN` is configurable. The docs mention it, but a changed env breaks the editor silently.

## Docs that do not match the code
1. `docs/text-extraction.md:144`: claims a crashing file does not run forever. False (H1).
2. `docs/office-editor.md:215,221`: claims drafts are never deleted before the server has them. Broken by the races in H3.
3. `file-routes.ts:11,265` / `docs/deployment-guide.md`: ETag sha256 is true only in `node` delivery (L2).

## Checked, no issue found
- Path traversal: random keys checked by regex in both `storedPath` and the pipeline.
- Content-Disposition: control characters are stripped in `cleanFileName`, the ASCII fallback escapes `"` and `\`, and `filename*` is percent-encoded.
- Size cap: the Content-Length precheck plus busboy `fileSize` covers chunked bodies. nginx `client_max_body_size 26m` also caps chunked bodies with request buffering off. Draining stops at 26 MB.
- Multipart tricks: 1 file, 0 fields, 2 parts; a second `file` part is ignored or refused. Busboy 1.x destroys the file stream when the form is destroyed, so partial files are removed.
- Zip sniffing: only the central directory is read (≤4 MB), nothing is decompressed, so no zip bomb on the server side. Tika parses the content in its own JVM.
- `internal` location: not reachable from outside.
- PUT conflict: serialised by `FOR UPDATE` on the document row. Version numbers stay unique.
- Accepting a suggestion: a Collection must be public or in the author's personal Space, and only tags that were offered are applied.
- Trash purge: files are unlinked after the commit. The `document_versions.file_id` foreign key (no cascade) stops a restore racing with the purge from deleting live files.
- postMessage: `event.origin` and `event.source` are both checked, and the target origin is explicit.

## Recommended order
1. H1 (one-line guard in the job store, plus a test) and H2 `maxImageSize`, before any production upload is enabled. Then move pdf work off the API thread.
2. H3: atomic, revision-checked IndexedDB transitions and single-flight sync.
3. M1, M2, M3, M5.
4. Fix the docs (text-extraction.md:144, office-editor.md:215).

## Metrics
- Tests, lint and typecheck were not run (machine under load from another session's `vue-tsc`; 31% free memory).

## Unresolved questions
- Is SELinux enforcing on .65 (M5)?
- Is sign-up open to any IdP account? That decides how serious M3 and H2 are.
- Should guests download approved public Office files? Today `GET /api/files/:id` needs a session while the reader page shows the file card.
