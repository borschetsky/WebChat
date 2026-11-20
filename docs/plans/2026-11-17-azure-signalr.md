# Plan: Azure SignalR Service behind a provider switch

Date: 2026-11-17 · Status: plan, nothing started · Follows: `2026-11-17-entra-id-migration.md`

## Goal

Let the real-time layer run either **in-process (today)** or through **Azure SignalR Service**,
chosen by configuration, with no client change and an instant rollback (flip one variable,
restart). Learn Azure SignalR on the trial subscription without making production depend on it.

Out of scope for the first cut: running more than one app instance. That is what Azure SignalR
ultimately enables, but it needs the process-local state fixed first (phase 5).

## How it works today

- `services.AddSignalR()` and `MapHub<ChatHub>("/chat")` (`Startup.cs`). The browser holds a
  WebSocket **to our app**; one instance on DO (`instance_count: 1`, "no backplane").
- Auth: the client's `accessTokenFactory` token reaches the hub as `?access_token=` on `/chat`
  (`AuthenticationSetup.ReadHubToken`), validated by the same schemes as REST.
- Users are addressed by `Clients.User(s)` through `NameUserIdProvider`, i.e. `Identity.Name`
  = the **local user id** (`webchat_uid`). Plus a few `Clients.All` broadcasts (avatar, profile).
  No `Groups` are used.
- Three pieces of **process-local** state: `ConnectionMapping` (presence and the admin
  "connections" count), `ConnectionAborter` (holds `HubCallerContext`s so blocking a member
  closes their sockets), `WorkspacePolicyCache`.

## How it works with Azure SignalR (Default mode)

```
browser ──POST /chat/negotiate (Bearer, our auth)──▶ our app
browser ◀── { url: https://<name>.service.signalr.net/client/?hub=chathub, accessToken: <ASRS JWT> }
browser ══ WebSocket ═════════════════════════════▶ Azure SignalR ◀════ server connections ══ our app
```

- The hub class **still runs in our app**: `OnConnectedAsync`, `OnTyping`, `Clients.User(...)`
  all execute here; the service only holds the client sockets and relays frames.
- Our app sees only `negotiate`. During it the SDK mints an Azure-signed token that carries the
  user's claims (filterable with `ClaimsProvider`) and the user id from `IUserIdProvider`;
  when a client connects, the service hands those claims back and the SDK rebuilds
  `Context.User` from them.
- The JS client follows the negotiate redirect by itself, so **the client needs no code change**.
- **Default** mode (app server present) is the right mode; **Serverless** rejects server
  connections and expects Functions, and would mean rewriting the hub.

## Key decisions

| Question | Decision | Why |
|---|---|---|
| Switch shape | `SignalR:Provider` = `Local` (default) \| `Azure`, read once at startup | Same pattern as `Auth:Oidc`: absent config means today's behaviour, so deploying the code changes nothing. |
| Where the switch acts | Only in `Startup`: `AddSignalR()` vs `AddSignalR().AddAzureSignalR(...)` | Hub, controllers and `IHubContext<ChatHub>` are the same API either way; no abstraction layer over SignalR itself is needed. |
| What is abstracted | The **process-local services** (`IConnectionMapping`, `IConnectionAborter`), not SignalR | They are what breaks or changes meaning under the service. |
| Service auth | Access-key connection string first; Entra app (`AuthType=azure.app`) as a practice step | DO is outside Azure, so no managed identity; a service principal secret is still a secret, so it buys rotation/RBAC, not secret-freedom. |
| Tier | **Free** (20 concurrent connections, 20k messages/day, no SLA) | Enough for practice and for this app's real traffic today. Standard is ~$49/unit/month (third-party figure — check the calculator), only if prod outgrows Free. |
| Package | `Microsoft.Azure.SignalR` **1.33.1** pinned exactly | 1.34.0 is 4 days old (13 Nov 2026); same age rule as MSAL. Targets net8.0, runs on net10. |
| Claims sent to the service | Only `webchat_uid`, `webchat_provider`, role (via `ClaimsProvider`) | By default *every* claim of the Entra token is copied into a token that travels in a query string; and `Identity.Name` must survive the round-trip (see risks). |
| Rollback | Set `SignalR__Provider=Local`, redeploy | Clients' automatic reconnect renegotiates against the app and lands back in-process. |

## Phase 0. Spike: prove the three unknowns (≈2 h, throwaway branch)

These decide whether the rest is plain sailing. Do them against a real Free instance (phase 1
first), locally:

1. **`Identity.Name` after the round-trip.** With Azure on, does `Context.User.Identity.Name`
   in the hub still equal the local user id? The SDK records the name-claim type in the token
   (`asrs.s.nt`), but there are reports of it coming back as `name` and `Identity.Name` being
   null. Every hub method and `NameUserIdProvider` depend on this — a null here means typing,
   presence and `Clients.User` silently stop.
2. **Does `HubCallerContext.Abort()` close the browser's socket through the service?**
   `ConnectionAborter` relies on it to end a blocked member's session. If it does not, the
   fallback is the Management SDK (`ClientManager.CloseConnectionAsync(connectionId)`).
   Not documented either way — test it: block a member while their tab is open.
3. **Negotiate with an Entra token.** Confirm the bearer header (not the query string) carries
   the token on negotiate and our status check (`AccountStatus.CanSignIn`) still runs there.

Write the answers into the ctx note; adjust phases 2–3 if any of them fails.

## Phase 1. Azure portal (≈30 min, no code)

1. Resource group `webchat-rg` (or the one from the Entra plan's phase 0).
2. Create **SignalR Service**: name e.g. `webchat-signalr`, region **Germany West Central** or
   **West Europe** (the app runs in DO FRA1), pricing tier **Free_F1**, **Service mode: Default**.
3. *Settings → Keys*: copy the **primary connection string** → local secrets only
   (`appsettings.Secrets.json` / `WebChat/.env`), never git.
4. *Settings → CORS*: leave `*` for the spike; later restrict to
   `https://chat.vtechsolutions.site`, the `ondigitalocean.app` origin and `http://localhost:3000`.
5. *Monitoring → Metrics*: pin **Connection Count** and **Message Count** — the Free tier's
   20k/day is the limit we can actually hit (a message to N recipients counts N times,
   typing events included).

Optional, for practice (after phase 3 works with keys):

6. App registration `webchat-signalr-server` + client secret; on the SignalR resource
   *Access control (IAM) → Add role assignment → **SignalR App Server*** for it.
7. Switch the connection string to
   `Endpoint=https://webchat-signalr.service.signalr.net;AuthType=azure.app;ClientId=…;ClientSecret=…;TenantId=…;Version=1.0;`
   and then *Settings → Keys → Disable access key auth*.

## Phase 2. Backend: the switch (PR 1)

1. **Options** — `WebChat/Realtime/RealtimeOptions.cs`:
   `Provider` (`Local`|`Azure`), `Azure.ConnectionString`, `Azure.ServerConnectionCount`
   (optional). `Problems()` like `AuthOptions`: unknown provider, or `Azure` without a
   connection string → fail at boot in every environment (`ValidateRequiredConfiguration`).
2. **Registration** — replace the bare `services.AddSignalR()`:
   ```csharp
   var signalR = services.AddSignalR();
   if (realtime.Provider == RealtimeProvider.Azure)
       signalR.AddAzureSignalR(o =>
       {
           o.ConnectionString = realtime.Azure.ConnectionString;
           o.ClaimsProvider = ctx => ctx.User.Claims.Where(c => ForwardedClaims.Contains(c.Type));
       });
   ```
   `MapHub<ChatHub>("/chat")` stays as it is (the SDK hooks the same endpoint).
3. **Package**: `Microsoft.Azure.SignalR` 1.33.1 in `WebChat.csproj`; check CI's
   `-warnaserror` and the NuGet advisory audit pass with it.
4. **Identity fix-up, only if phase 0 #1 failed**: set the claim types explicitly so the hub's
   `Identity.Name` is `webchat_uid` again (or have `NameUserIdProvider` read `webchat_uid`
   directly instead of `Identity.Name` — the more robust option either way).
5. **Abort, only if phase 0 #2 failed**: an `AzureConnectionAborter` that closes via
   `ServiceManager`/`ClientManager.CloseConnectionAsync`, chosen by the same switch.
6. **Logging**: the SDK logs server-connection drops; make sure a lost service connection is
   visible (negotiate then answers 500 "no server available") — a log line, not a health
   probe failure (keep `/health` shallow, as `CLAUDE.md` requires).
7. **Tests** (`WebChat.Tests/Realtime/`):
   - `Provider=Azure` with no connection string fails startup with a clear message
     (use `ConfigureAppConfiguration`, **not** `UseSetting` — the trap in `CLAUDE.md`).
   - Unknown provider fails startup.
   - `ClaimsProvider` keeps `webchat_uid`/role and drops everything else.
   - Default (no section) still registers the plain in-process hub — the existing hub tests
     keep passing unchanged.

## Phase 3. Local end-to-end, then production (PR 1 continued)

1. Locally: `SignalR__Provider=Azure` + connection string, `dotnet run` + Vite.
2. Check in the browser network tab: `negotiate` → 200 with a `url` to
   `*.service.signalr.net`; the WebSocket goes to Azure, not to `localhost:7199`.
3. Walk the real-time features with two users (two browsers): message delivery, typing,
   online/offline, group events, avatar and profile broadcasts, **block a member while
   connected** (they must be disconnected), sign-in through both local and Entra.
4. Watch the portal metrics move (connections 2, messages counting).
5. Production — in the DO dashboard (doctl token is currently invalid; **never**
   `apps update --spec`):
   - `SignalR__Provider` = `Azure` (RUN_TIME)
   - `SignalR__Azure__ConnectionString` (RUN_TIME, **Encrypt**)
   - then **Actions → Deploy** after the merge — saving variables alone redeploys the
     *previous* commit.
6. Add the same keys to `.do/app.yaml` (secret as `REPLACE_ME`) and `.env.example`.
7. Restrict the service's CORS to the real origins (phase 1 step 4).

## Phase 4. Hardening (small PR)

- Restrict CORS on the service; optionally Entra auth for the server (phase 1 steps 6–7).
- Decide what happens when the Free limits are hit (20 connections / 20k messages): the
  service refuses new connections — document it, and the rollback.
- ctx note + `CLAUDE.md` bullet: what the switch is, the claim round-trip, what is still
  process-local.

## Phase 5 (optional). Actually scale out to 2 instances

Only now does `instance_count: 1` stop being a hard rule — Azure SignalR routes
`Clients.User(...)` across app servers, which is the backplane the `.do/app.yaml` comment says
is missing. But first, the process-local state:

| State | Problem with 2 instances | Fix |
|---|---|---|
| `ConnectionMapping` (presence, admin counts) | Each instance sees only its own clients → users look offline | Shared registry (Postgres table or Redis) keyed by connection id, with expiry; or Management SDK `UserExistsAsync` for the online flag |
| `ConnectionAborter` | Blocking closes only sockets owned by the instance that handled the admin request | Management SDK `CloseConnectionAsync` over connection ids from the shared registry |
| `WorkspacePolicyCache` | A policy change is seen by one instance only until its cache expires | Short TTL or a change notification |
| "online" announcements | `alreadyOnline` is computed per instance → duplicate/missing presence events | Same shared registry |

Then `instance_count: 2` (doubles the DO bill) and a test that blocks a user connected to the
other instance.

## Cost on the trial

| Resource | Per month |
|---|---|
| SignalR Free_F1 | $0 |
| SignalR Standard_S1 (only if needed) | ~$49 per unit (verify in the calculator) |

When the trial ends the subscription must be converted to pay-as-you-go or its resources are
disabled — Free costs nothing, but a disabled resource means negotiate fails, so **roll back
to `Local` before the trial ends** unless the subscription is upgraded.

## Risks and traps

- **`Identity.Name` after the claim round-trip** — the same class of silent break as the
  `NameClaimType` trap in the Entra plan: everything reads it as the local id (phase 0 #1).
- **Abort semantics** through the service are undocumented (phase 0 #2). Blocking a connected
  member is a security feature, not a nicety — do not ship phase 3 to prod without it proven.
- **Claims in a URL**: the service token is a query-string parameter; keep it small
  (`ClaimsProvider`) and never log URLs with `access_token`.
- **Free tier limits** are low; a message to a 10-person group costs 10 messages, typing too.
- **Production depends on the trial** once switched — rollback is one variable.
- **Health check**: a dead service connection makes negotiate fail while `/health` stays 200.
  Accept it (shallow check is deliberate) but alert/log on it.
- **CORS** exists in two places now: our app's policy (negotiate) and the service's (socket).

## Order of work

Phase 1 (portal) → phase 0 (spike) → phase 2 → phase 3 locally → phase 3 prod → phase 4 →
(phase 5 only if scaling out is wanted). Each phase that changes code is its own PR; run the
`checkpoint` skill before committing, as `CLAUDE.md` requires.

## Sources (checked 2026-11-17)

- Pricing tiers: https://azure.microsoft.com/pricing/details/signalr-service/ (USD unit price
  not shown on the page; ~$49/month from https://ably.com/topic/azure-signalr-pricing)
- Package: https://www.nuget.org/packages/Microsoft.Azure.SignalR (1.34.0 of 13 Nov 2026, 1.33.1 of 24 Jun 2026)
- Claims and `ClaimsProvider`: https://learn.microsoft.com/azure/azure-signalr/signalr-howto-troubleshoot-guide
- Name-claim report (a single user report, mirrored from an azure-signalr issue): https://lightrun.com/answers/azure-azure-signalr-usernameclaimtype-changed-from-default-to-name-breaking-authentication-
- Entra auth for the app server: https://learn.microsoft.com/azure/azure-signalr/concept-connection-string ,
  https://learn.microsoft.com/azure/azure-signalr/authorize-access-azure-active-directory
