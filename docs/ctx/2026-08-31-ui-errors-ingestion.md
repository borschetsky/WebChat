# UI errors: hand-rolled ingestion, not Sentry

- **Date:** 2026-08-31
- **Type:** change
- **Scope:** issue #74, slice 5 of 6 (#64) and the one that makes UI errors the last admin
  section to stop being mocked. Branch `feature/74-ui-errors-ingestion`, cut from master
  `cbe5723`, landed as `0e4a416`. Server: `WebChat.Data/{ClientErrorIssue,ClientErrorEvent,
  ClientErrorLevel,ClientErrorStatus}.cs`, `WebChat.Data/ViewModels/AdminErrorViewModel.cs`,
  `WebChat.Services/ClientErrors/*`, `WebChat/Controllers/ClientErrorsController.cs`,
  `AdminController`, `Startup.cs`, `WebChatContext`, migration `20260831154900_AddClientErrors`.
  Client: `src/lib/error-reporter.ts`, `src/components/AppErrorBoundary.jsx`, `index.jsx`,
  `App.jsx`, `AdminConsole.jsx`, `api-service.js`, `admin-service.ts`, `adminApi.ts`,
  `admin-mocks.ts` (deleted), `types/admin.ts`, `auditSentence.ts`, `AuditRow.jsx`,
  `vite.config.ts`.
- **Status:** done, no browser pass and no run against real PostgreSQL (see below)

## Context

The issue existed to take one decision the #64 plan note left to a person: **Sentry, or
hand-rolled ingestion.** `docs/research/2026-08-10-admin-console-charts-and-client-errors.md`
recommended `@sentry/react`, and the fit was genuinely close — Sentry's `stats["14d"]` *is*
the spec's sparkline, and `culprit` *is* component-plus-function. The owner chose hand-rolled.
The deciding cost, from the research note and repeated in the reporter's own docblock
(`error-reporter.ts:1-9`): Sentry must initialise at app start to catch anything, so its
+28.3 kB gzip lands on the render-blocking payload of *every* visitor, including the
overwhelming majority who never open `/admin` — and the console is lazy-routed precisely so
it costs nothing until used. Third-party custody of stack traces and the free tier's
one-user/30-day limits pointed the same way.

That decision pulled two things into scope that Sentry would have absorbed for free: literal
boundary names (fingerprinting needs stable names, and `vite build`'s minifier renames
`AdminOverviewCard` to `t`), and a retention job against the shared 512 MB production
database.

## What changed

**Server, new** — all confirmed present on disk:
`WebChat.Data/{ClientErrorIssue,ClientErrorEvent,ClientErrorLevel,ClientErrorStatus}.cs`,
`WebChat.Data/ViewModels/AdminErrorViewModel.cs`, `WebChat.Services/ClientErrors/`
(`ClientErrorOptions`, `ClientErrorReport` with truncation, `ClientErrorQueue`,
`ClientErrorService`, `ClientErrorIngestService` and `ClientErrorRetentionService` as
`BackgroundService`s, `BrowserName`, `IClientErrorService`),
`WebChat/Controllers/ClientErrorsController.cs`, migration `20260831154900_AddClientErrors`.

**Server, modified:** `AdminController.cs:205-226` adds `GET api/admin/errors` and
`POST api/admin/errors/{id}/status`, under the class's existing
`[Authorize(Roles = owner,admin)]` — no separate authorization added. `Startup.cs:43,189,
372-385` adds a `ClientErrors` rate-limit policy and an `AddClientErrors` DI block
(`ClientErrorQueue` singleton, `ClientErrorService` transient, both `BackgroundService`s
hosted). `WebChatContext` gains two `DbSet`s. `AuditAction.cs:49` gains `Error = "error"`.
`appsettings.json` gains a `ClientErrors` section — no secrets, every value has a code
default (`ClientErrorOptions.cs`), so no new required configuration.

**Client, new:** `src/lib/error-reporter.ts` (breadcrumb ring buffer capped at 12,
`fetch(keepalive)` transport, a `reporting` re-entrancy flag, a 20-reports-per-page cap,
global `error`/`unhandledrejection` handlers, capturing click breadcrumbs) and
`src/components/AppErrorBoundary.jsx` — **the first error boundary this client has ever
had**; its own docblock says so and I found nothing to contradict it. `index.jsx` installs
the reporter and a root boundary; `App.jsx` wraps `ChatApp`/`AdminConsole` and records
navigation breadcrumbs; `AdminConsole.jsx` gets a per-section boundary keyed by tab with a
literal-name table.

**Client, modified:** `api-service.js` gains the two endpoints plus axios interceptors
recording fetch breadcrumbs with the query string stripped; `admin-service.ts` and
`adminApi.ts` go real and token-carrying (`getErrors` had been the one mock endpoint that
ignored authentication entirely); `services/admin-mocks.ts` **deleted**; `types/admin.ts`,
`auditSentence.ts`, `AuditRow.jsx` updated for real facts instead of rendered strings;
`vite.config.ts` bakes `VITE_RELEASE` from `package.json`.

## Decisions worth recording

1. **Retention deletes issues not seen for N days (default 90), not resolved-after-N.**
   `ClientErrorOptions.cs:34-45` states the reasoning directly: a resolved issue that recurs
   is a regression and must survive, and the growth risk is the untriaged long tail of
   one-off failures, which resolved-after-N would keep forever. `ClientErrorService.PruneAsync`
   (`ClientErrorService.cs:226-248`) deletes events past `EventRetentionDays` (default 30) and
   issues past `IssueRetentionDays` (default 90), both clamped so the event window can never
   land inside the 14-day sparkline (`Math.Max(SparkDays + 1, …)`). `PruningEnabled` can turn
   the job off entirely, and the defaults are documented to delete nothing on a fresh deploy
   (`ClientErrorOptions.cs:7-11`).
2. **Two tables, not pre-aggregated counters.** `ClientErrorEvent` is cumulative;
   `ListAsync` (`ClientErrorService.cs:123-193`) computes `Users`/`Spark`/`Browsers` over only
   the retained 14-day window, so `Events` (the all-time counter on the issue row) can
   legitimately exceed the sum of `Spark` — that is by design, not a bug, once events older
   than the window are pruned or simply never bucketed.
3. **Triage is audited.** `SetStatusAsync` (`ClientErrorService.cs:196-224`) records the new
   `AuditAction.Error` action with `{status, from, name}` — the issue's `Name`, not its
   fingerprint, "because the log is read by a person".
4. **Rate limiting reuses the existing per-IP mechanism**, a second policy
   (`Startup.ClientErrorPolicy`) rather than partitioning by caller — the controller's own
   doc comment (`ClientErrorsController.cs:43-48`) states why: `UseRateLimiter` runs before
   `UseAuthentication`, so there is no identity to partition on at that point in the
   pipeline. Three layers shed load, none of them block: the limiter, the client's own
   20-per-page cap (`error-reporter.ts:58-66`), and the bounded queue.
5. **The endpoint is authenticated** (`[Authorize]`, `ClientErrorsController.cs:28`), so
   crashes on sign-in, register, invite and reset are not reported at all — stated as a
   deliberate trade in both the controller's docblock and the reporter's `send()`
   (`error-reporter.ts:236-239`), chosen over an unauthenticated write endpoint anyone can
   put rows through.
6. **Global-handler fingerprints are coarse** — `component: 'window'`, `function: 'error'` or
   `'unhandledrejection'` (`error-reporter.ts:123-129`) — so those group by error name alone;
   only boundary-caught errors carry a real component name, supplied as a literal prop
   (`AppErrorBoundary.jsx:37-41`).
7. `ClientErrorLevel` accepts `warning` as a value but nothing in this change emits it
   (asserted by reading the reporter and controller; not independently exhaustively grepped
   across every call site).

## Verified

Re-run directly in this pass, not taken on the implementing session's word:

```
dotnet build WebChat.sln -warnaserror --no-incremental → Build succeeded, 0 Warning(s), 0 Error(s)
dotnet test WebChat.Tests → Failed: 0, Passed: 370, Skipped: 2, Total: 372   (was 324/2/326 as of
                             the #101 note, the last one to record a .NET count)
npm run verify → lint clean · "All matched files use Prettier code style!" · tsc clean
                 Test Files 26 passed (26) · Tests 325 passed (325)
                 vite build ✓ built in 229ms
                 AdminConsole-CbyanEJy.js  37.19 kB │ gzip 11.59 kB
                 index-NkcRvZLF.js         44.19 kB │ gzip 13.89 kB   (the eager entry chunk)
```

Both the entry-chunk and `AdminConsole` chunk gzip figures match the numbers given in the
summary exactly, confirmed by running `vite build` myself rather than trusting the report.

Also confirmed directly by reading the source:

- Every `DateTime` written in the new server code is `DateTime.UtcNow` or
  `DateTime.SpecifyKind(..., Utc)` (`ClientErrorService.cs:138-139,228`,
  `ClientErrorsController.cs:85`) — no `Local`/`Unspecified` value can reach Npgsql.
- `ClientErrorsController.Report` takes `UserId` from `User.Identity?.Name`
  (`ClientErrorsController.cs:83`), never from the body, stamps `OccurredAtUtc` server-side,
  and calls `report.Truncate()` before enqueueing (`:88-92`).
- The new admin endpoints inherit `AdminController`'s class-level
  `[Authorize(Roles = owner,admin)]` — grepped, no separate attribute added.
- Migration `20260831154900_AddClientErrors.cs`: both timestamp columns are
  `type: "timestamp with time zone"` (`:45-46,62`), the issue→event FK is
  `onDelete: ReferentialAction.Cascade` (`:74`), and it creates
  `IX_ClientErrorEvent_IssueId_OccurredAtUtc`, `IX_ClientErrorEvent_OccurredAtUtc`,
  a unique `IX_ClientErrorIssue_Fingerprint`, and `IX_ClientErrorIssue_LastSeenUtc`.
- `BoundedChannelFullMode.DropWrite`'s trap is documented in the source itself
  (`ClientErrorQueue.cs:54-57`) and the fix (an `itemDropped` callback incrementing `dropped`,
  since `TryWrite` returns `true` for a discarded item) is in place at `ClientErrorQueue.cs:69-79`.
- `CLAUDE.md` and `docs/ctx/ORIENTATION.md` diffs read directly (`git diff` on the commit):
  CLAUDE.md's mock-seam bullet now says the admin console has nothing mocked behind it and
  that `admin-mocks.ts` had been reachable from `store.ts` (eagerly bundled); a new bullet
  states the literal-string-for-grouping rule, covering both boundary names and
  `class X extends Error` needing `this.name = 'X'` as a literal; the forwarded-headers
  bullet now says "the rate limiters" plural and names the `ClientErrors` policy.
  ORIENTATION's `src/` tree names `AppErrorBoundary` and `error-reporter` (marked not pure);
  the Routes section adds `ClientErrorsController` and explains the split from `api/admin`;
  the mock-seam section states all six remaining mocks are in the chat.

**Proved by breaking it — two mutations re-derived in the reviewing session**, independently
of the session that wrote the code, each restored afterwards with `git status` clean:

- Fingerprint made to include the message (`report.Name + report.Message` at the call site,
  `ClientErrorService.cs:69`) →
  `Two_occurrences_differing_only_in_the_message_are_one_issue` fails with
  `Assert.Single() Failure: The collection contained 2 items`. 1 failed / 45 passed of 46.
- `AppErrorBoundary.jsx:38` made to report `this.constructor.name` instead of
  `this.props.name` → `reports under the literal name it was given, as fatal` fails with
  `expected 'AppErrorBoundary' to be 'AdminOverview'`. 1 failed / 3 passed of 4.

Those two are the load-bearing ones: the first is the whole grouping contract, the second is
the prerequisite the hand-rolled decision created.

**Not independently re-derived** — reported by the implementing session only, stated here so
it is not silently promoted to fact:

- The retention-semantics mutation, the dropped-token mutation, and the
  removed-per-page-cap mutation.
- The honest negative about the transport's `.catch` test (11/11 passing with the `.catch`
  deleted, replaced by a narrower test plus a source scan) — plausible given `send()`'s
  structure (`error-reporter.ts:233-252`), not re-run.

## Not verified — carried forward, this matters more than usual here

- **No browser pass, at all.** The Chrome extension on this machine has only remote macOS
  instances attached and cannot reach `localhost`. Nothing on the errors screen, no boundary
  fallback, no triage audit row has been seen rendered. This is #86's territory (still open).
- **The migration has never been applied to a real PostgreSQL database.** Docker Desktop's
  Linux engine on this machine returns 500 for every API call, so there was no compose run
  and no end-to-end exercise through Npgsql. The migration was inspected as generated
  Postgres SQL (confirmed above: `timestamp with time zone`, `ON DELETE CASCADE`, the
  indexes) and exercised on SQLite. A native PostgreSQL 18 service is reportedly running on
  this workstation on port 5432 — its availability was not used or investigated here.
- The 64 KiB `keepalive` body cap is respected by construction (truncation on both the
  client and server sides) but was never measured against a real browser's actual limit.
- Nothing deployed; no `.do/app.yaml`, CORS or DNS change — none was needed for this slice.

## Known issues / follow-ups

- `BoundedChannelFullMode.DropWrite` makes `Channel.Writer.TryWrite` return **`true`** for an
  item it silently discarded — the return value means "accepted for processing", not "kept".
  Handled here via the `itemDropped` callback (`ClientErrorQueue.cs:54-57,69-79`). Worth
  keeping in mind for any other future use of a bounded `Channel` in this codebase: the API
  reads correct and is not.
- The window `error` handler's docblock (`error-reporter.ts:119-122`) says it fires for
  errors React re-throws after a boundary already handled them — that is dev-mode behaviour;
  in production React reports caught errors through `onCaughtError` rather than re-throwing
  to `window`. Not a functional bug, just a comment that slightly overstates when the second,
  coarser report appears. Flagged, not fixed.
- Epic #64 status after this slice: audit log (#70), member statuses (#71), invitations
  (#72), overview (#73) and UI errors (#74) are done. Only **#75 policies** remains, and per
  `2026-08-14-policies.md` it already shipped — so #64 itself may be ready to close; not
  confirmed here.

## Related

`docs/ctx/2026-08-11-admin-console-implementation-plan.md` (names this as slice 5 and the
Sentry-vs-hand-rolled decision as one of four left to a person),
`docs/ctx/2026-08-13-overview.md` (closest sibling slice; its "Known issues" section is where
the Sentry-vs-hand-rolled choice was still listed as blocking #74),
`docs/research/2026-08-10-admin-console-charts-and-client-errors.md` (the research this issue
decided against on the ingestion question, and whose fingerprint/transport/never-block
guidance this implementation follows almost exactly where it applies to the hand-rolled
branch).
