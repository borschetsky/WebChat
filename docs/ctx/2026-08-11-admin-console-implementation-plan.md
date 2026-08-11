# Turning the mocked admin console into real functionality — the plan

- **Date:** 2026-08-11
- **Type:** plan
- **Scope:** issue #64, everything past the workspace-role gate. Server: a new
  `AdminController`, an audit table, `User.Status`, an `Invitation` entity, workspace
  settings. Client: `services/admin-service.ts`, `types/admin.ts`, `app/api/adminApi.ts`,
  `features/admin/`.
- **Status:** proposed. Nothing here is implemented. Prerequisites are done — the workspace
  role (`2026-08-11-workspace-roles-and-bootstrap-admin.md`) and the console UI on mocks
  (`2026-08-11-admin-console-ui-mocks.md`).

## What this plan is answering

The console renders six sections and every one of them reads and writes fixtures that reset
on reload. The only real thing on the screen is the role that gates reaching it. This is the
order to make the rest real, what each slice actually costs, and the four decisions that
have to be taken by a person rather than inferred.

## Two cross-cutting findings, before the slices

**1. The `admin-service.ts` seam does not absorb everything.** The claim in
`types/admin.ts` — "making a section real is a change to `services/admin-service.ts` and
nothing else" — holds for four sections and fails for one, because the mocks store *rendered
display strings* where a server can only send data:

| Field | Mock holds | Server can only send |
|---|---|---|
| `AdminAudit.text` / `.meta` | `"Alice blocked Bob"` | kind + ids + resolved names |
| `AdminAudit.time` | `"2h ago"` | an instant |
| `AdminMember.last` / `.joined` | `"2h ago"` / `"Mar 2025"` | instants |
| `AdminInvite.sent` / `.days` | `"3 days ago"` / `12` | an instant + an expiry |
| `AdminError.first` / `.last` | `"2h ago"` | instants |

Relative time has to be computed at render anyway or it goes stale on a screen left open.
And the audit sentence must be built client-side for the same reason system messages are —
CLAUDE.md's rule: *a system message carries JSON facts, never a rendered sentence, so the
wording is not frozen in the actor's language*. An audit log is the same object.
`AuditRow.jsx` currently prints `entry.text` straight through; it will build the sentence
instead, exactly as `systemMessage.ts` does. **Do this shape change once, in slice 1**, not
five times.

**2. No chart library is needed — the existing markup already renders every chart in CSS.**
`AdminOverview.jsx` draws the 14-day volume bars and the activation funnel as `<Box>`
elements with percentage heights and widths; `AdminErrors.jsx` draws its 14-day sparkline
the same way. There is no `<svg>` anywhere in `features/admin/`. So
`2026-08-10-admin-console-charts-and-client-errors.md`'s recommendation — hand-roll with
`d3-scale` + `d3-shape`, +10 kB gzip — is a *further* option, not a requirement: today the
cost is **zero bytes**. Its load-bearing finding still stands and still decides the
question if the charts ever get smarter: `FunnelChart` ships only in `@mui/x-charts-pro`
($299/yr/dev, no free tier), so the funnel is hand-drawn under every option, which removes
the reason to pay a chart library's ~100 kB fixed engine cost for the other two.

## The slices

Six, in dependency order. Issue #64 suggests its own split; this differs in two places and
says why.

### Slice 1 — the admin API surface and the audit log

**First, because #64 is right that block/unblock is only defensible with it**, and because
the shape change above is cheapest before four sections depend on the old shapes.

Server:

- `AdminController`, `[Authorize(Roles = "owner,admin")]`. `Startup.cs:244` already adds a
  `ClaimTypes.Role` claim in `OnTokenValidated`, and JWT bearer's default `RoleClaimType` is
  `ClaimTypes.Role`, so this should work as written — **but write the test that proves it
  before writing the endpoints**. A member must get 403 and an owner 200. The failure mode
  is quiet: if the claim never arrives, *everyone* gets 403, which reads as "the attribute is
  wrong" and invites removing it.
- `AuditEntry` entity: `ActorId`, `Action`, `TargetType`, `TargetId`, `DetailJson` (jsonb),
  `OccurredAtUtc`. `DateTime.UtcNow` — Npgsql throws on `Local`/`Unspecified`.
- Migration adds a btree index on `OccurredAtUtc DESC` and a
  `BEFORE UPDATE OR DELETE … RAISE EXCEPTION` trigger in raw SQL. Append-only is a
  convention until something enforces it, and revoking `UPDATE`/`DELETE` at the role level
  is not available to us — the app owns its role on DO managed Postgres.
- `IAuditService.RecordAsync(...)` writes in the **same transaction** as the action it
  records. An audit row for something that did not happen, or an action with no row, are
  both worse than no log.
- Ids inside `DetailJson` resolve to names **server-side at read time** — reuse
  `SystemDataJson.NamesFor`, which already exists and solves exactly this. It is the same
  problem #63 hit: the person a removal is about has stopped being someone the client can
  resolve.
- `GET /api/admin/audit?before=&limit=` — keyset pagination on `OccurredAtUtc`, not offset;
  the list grows under the reader.
- Set a retention window and prune. 512 MB is the whole database.

Client: `AdminAudit` becomes `{ id, kind, actorId, targetId, data, names, occurredAtUtc }`;
`AuditRow.jsx` builds the sentence; a shared relative-time helper replaces every
pre-formatted string in the table above.

### Slice 2 — Members and the four statuses

The section with real consequences, and the one with the most traps.

- `User.Status`, `[Required] [MaxLength(20)]`, constants in an `AccountStatus` class next to
  `WorkspaceRole`. Four values, not collapsed — #64 is explicit.
- **The trap this repo has already paid for once:** the migration backfills existing rows to
  `active`, and that backfill will disguise a write path that never sets the column.
  Registration must assign it explicitly, and a test must prove a newly registered user has
  it. This is exactly how #63's "new groups have no owner" bug survived a green migration.
- `OnTokenValidated` already fetches `SecurityStamp` and `Role` in one query per request;
  add `Status` to the same projection — free — and fail the token for blocked/deactivated.
  Login refuses with distinct codes mirroring `email_not_confirmed`.
- **Blocking rotates `SecurityStamp`.** That is what "all sessions ended" means here, and the
  mechanism is already there from #28.
- **A rotated stamp does not close a live SignalR connection.** The hub authenticates at
  connect and nothing re-checks afterwards, so a blocked user who is currently connected
  keeps receiving messages until they reconnect. Blocking must also look the user up in the
  connection mapping (`HubDirectory` / `IConnectionMapping<string>`) and abort those
  connections. Without this, "all sessions ended" is false for precisely the person you most
  wanted it true for.
- Deactivating additionally removes the account from every group — and each removal should
  emit the same system message a manual removal does, so the group can see why someone
  vanished rather than silently losing a member.
- Guards, all of which need a test: you cannot act on yourself; you cannot block or demote
  the last owner; an admin cannot change an owner's role (`WorkspaceRole` says only an owner
  appoints and removes admins).
- Endpoints: `GET /api/admin/members`, `POST /api/admin/members/status` (bulk — the table has
  a bulk bar), `POST /api/admin/members/{id}/role`. Every one writes an audit entry.
- **Undo is the inverse mutation, not a server-side undo**, and it writes its own audit
  entry. A log that can be rewound is not a log.

### Slice 3 — Invitations

- `Invitation`: `Email`, `TokenHash`, `SentAtUtc`, `ExpiresAtUtc`, `InvitedByUserId`, `Role`,
  `RedeemedAtUtc`, `RevokedAtUtc`.
- Create the `User` row with `Status = pending` at invite time. That is what makes #64's
  "revoking deactivates the pending account immediately" expressible, and what puts pending
  people in the Members table.
- Token mechanics are already solved twice over (confirmation, reset) and get copied
  unchanged: 256-bit CSPRNG, store the SHA-256 only, look up *by hash*, constant-time
  compare, base64url, single use.
- Redemption must be race-safe: one conditional `UPDATE … WHERE RedeemedAtUtc IS NULL AND
  RevokedAtUtc IS NULL AND ExpiresAtUtc > now()` and check the affected row count. A
  read-then-write lets a double-clicked link create two memberships.
- Redemption branches on whether an account exists, and a registration through an invitation
  must inherit the confirmed-email status — do not make someone confirm an address you just
  proved they control.
- Reuse the existing `EmailSendPolicy` rate limiter on send and resend. Per CLAUDE.md that
  limiter partitions by remote IP and therefore depends on `ForwardedHeaders__Enabled`.
- `AdminInvite.days` becomes `expiresAtUtc`; the client computes the number and the
  within-a-week highlight.

### Slice 4 — Overview

Nearly free once 2 and 3 land, which is why it moves ahead of UI errors here (#64 puts it
after).

- Four stat cards are counts by `Status`.
- 14-day volume: group messages by day. Note the endpoint returns `Dictionary<DateTime, …>`
  and the client parses those keys as dates — this is one of the places Newtonsoft.Json is
  load-bearing, per CLAUDE.md.
- Activation funnel: registered → confirmed → joined a group → sent a message, all four
  derivable from columns that already exist.
- No new dependency: see finding 2.

### Slice 5 — UI errors

Last of the functional slices because it is the only one carrying an unresolved dependency
decision (below). Whichever branch is taken:

- `POST /api/client-errors` returns **202 and never blocks the UI**. Client side that means
  not awaiting the report, wrapping the reporter in `try/catch`, and holding a re-entrancy
  flag so a failure inside the reporter cannot re-enter the error path.
- Transport is `fetch(…, { keepalive: true })`, not `sendBeacon`, because the request needs
  an `Authorization` header and `sendBeacon` cannot set headers. Both cap the body at 64 KiB;
  truncate before sending.
- Server side, 202 plus a bounded `Channel` with `BoundedChannelFullMode.DropWrite` drained
  by a `BackgroundService` — shedding load rather than growing is the point.

### Slice 6 — Policies

Nine toggles. **A toggle with no enforcement point is worse than a mock**: it tells an
administrator the workspace is configured a way it is not. So the slice is: inventory the
nine, ship only those with a real enforcement point, and label the rest as not yet enforced
rather than leaving them switchable. Storage is a single-row `WorkspaceSettings` with a
jsonb column behind a cached accessor.

## The four decisions that need a person

1. **"Extend" — move the deadline, or rotate the token and resend?** #64 says extend moves
   the deadline *without issuing a new link*, and `types/admin.ts` records that. The research
   note argues the opposite: the 30-day cap exists to bound how long a mailed secret stays
   live, so silently extending it extends exactly that exposure, invisibly to the invitee —
   and if you rotate you *must* resend, which collapses extend and resend into one operation.
   Both positions are defensible. This is a product call, and whichever way it goes, the
   comment in `types/admin.ts` changes with it.
2. **Sentry, or hand-rolled error ingestion?** The research recommends `@sentry/react` for
   ingestion with our screen reading Sentry's issues API through the server, because
   `stats["14d"]` *is* the spec's sparkline and `culprit` *is* component-plus-function. The
   honest cost against it: **+28.3 kB gzip eager** (~+13 % of the render-blocking payload),
   because Sentry must initialise at app start, and it is a third party holding stack traces.
   The hand-rolled branch is not just an endpoint: production minification renames
   `AdminOverviewCard` to `t`, so fingerprints need literal boundary names passed by hand,
   plus a retention job against a 512 MB shared database.
3. **Bearer or address-bound invitation links.** Bound is safer and breaks forwarding, which
   invitations are often forwarded on purpose. If bearer, compensate with single-use, revoke,
   and an audit entry naming who actually redeemed it.
4. **Does an owner-only tier exist in the API?** `WorkspaceRole` says only an owner appoints
   and removes admins, so at least one endpoint needs `Roles = "owner"` rather than the
   blanket policy. Worth settling before the controller is written rather than after.

## Standing rules for every slice

- **The route guard is navigation, never authorization.** Every endpoint re-checks the role
  server-side. This is already recorded and is the thing most likely to be quietly skipped
  because the UI "already hides it".
- **A workspace admin still has no authority inside a group they do not administer.**
  `GroupPermissions` must not learn about `WorkspaceRole`. If that ever changes it is a
  product decision needing an explicit, audited, confirmed action — not a quiet grant.
- Every mutation writes an audit entry in the same transaction.
- Follow `fix-flow` for anything defect-shaped: prove the test fails before the fix exists.
- `npm run verify` and a 0-warning `-warnaserror` build gate everything; CI job names stay
  `api` and `client`.

## Known gaps this plan does not close

- **No React test drives any admin component**, and none of the six sections has one today.
  Each slice should land at least one.
- **No visual pass has been done** against the design — the console's fidelity is inferred
  from markup, not confirmed by eye. Worth an `fe-qa` pass independent of these slices.
- **`ADMIN-HANDOFF.md` 404s at its own server.** If it has revisions beyond
  `Chat Admin Console.dc.html`, this plan may be reconciling against a stale source. Do not
  retry the link; ask for it to be re-shared.
- Mobile adaptations #64 calls for (tables becoming cards) are only partly done.
