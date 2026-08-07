# WebChat

Real-time chat app: ASP.NET Core (.NET 10) REST API + SignalR hub, with a React SPA client
built by Vite.

## Context notes — read these first

**→ [`docs/ctx/README.md`](docs/ctx/README.md)** is the index of context notes for this repo.
**→ [`docs/research/README.md`](docs/research/README.md)** indexes answers to questions that
needed facts from outside it — providers, pricing, protocols, standards. Written by the
**`researcher`** agent (`.claude/agents/researcher.md`). Unlike ctx notes, research notes
**expire**: each carries the date it was verified, and prices and limits rot.

Before exploring a subsystem or starting a change, check the index for a note covering that
area — it will usually save you the investigation. **Before committing** any non-trivial
change, run the **`checkpoint`** skill — and enable the reminder that catches it when you
forget.

**Three settings are per-clone and none of them are cloned.** Run all three once, in a fresh
checkout, or the tooling quietly misbehaves rather than complaining:

```bash
git config core.hooksPath .githooks                       # the checkpoint reminder
git config blame.ignoreRevsFile .git-blame-ignore-revs    # skip the Prettier sweep in blame
git rm --cached -r . && git reset --hard                  # apply .gitattributes to an existing tree
```

The third is only needed in a clone made *before* `.gitattributes` existed, and it converts
the working tree to LF without changing a single committed byte. Skip it and `npm run
verify` fails locally on every client file — see the note on line endings below.

Fixing a reported defect has its own
pipeline: the **`fix-flow`** skill (`.claude/skills/fix-flow/SKILL.md`), whose load-bearing
step is proving the new test fails *before* the fix exists.

After finishing any non-trivial exploration or change, run the **`checkpoint`** skill
(`.claude/skills/checkpoint/SKILL.md`): it re-checks this file for claims the change made
untrue, then captures the note via the **`ctx`** skill (`.claude/skills/ctx/SKILL.md`).

## Layout

The solution lives one level down, at `WebChat/WebChat.sln`. Seven projects:

| Project | Path | Role |
|---|---|---|
| `WebChat` | `WebChat/WebChat` | ASP.NET Core host, controllers, SPA hosting |
| `WebChat.Models` | `WebChat/WebChat.Data` | Entities and view models (note: folder and project names differ) |
| `WebChat.Connection` | `WebChat/WebChat.Connection` | EF Core `DbContext` and migrations |
| `WebChat.Services` | `WebChat/WebChat.Services` | Business logic, JWT issuing, mapping |
| `WebChat.Hubs` | `WebChat/WebChat.Hub` | SignalR `ChatHub` and connection tracking |
| `WebChat.AvatarWriter` | `WebChat/WebChat.AvatarWriter` | Avatar image validation and writing |
| `WebChat.Tests` | `WebChat/WebChat.Tests` | xUnit. Run with `dotnet test WebChat.Tests` |

The React client is at `WebChat/WebChat/ClientApp`.

## Build and run

```bash
cd WebChat
dotnet build WebChat.sln            # Debug/Release both clean, 0 warnings
dotnet run --project WebChat/WebChat.csproj
```

EF Core tooling is pinned as a local tool:

```bash
cd WebChat
dotnet ef migrations list -p WebChat.Connection -s WebChat/WebChat.csproj
```

Full stack (API + PostgreSQL + client dev server):

```bash
cd WebChat
docker compose up --build
```

The API is reachable on `https://localhost:8081` and the Vite dev server on
`http://localhost:3000`; both serve the SPA, and `ClientApp/src/config.ts` defaults the API
base to `/` so requests stay same-origin either way.

Secrets come from `WebChat/.env`, which compose loads automatically — copy `.env.example`
and fill it in, or the command stops naming the variable it wanted.

## Things worth knowing

- **Auth is hand-rolled JWT**, not ASP.NET Identity. Controllers identify the caller via
  `User.Identity.Name`, which carries the *user id* — not the username.
- **`register` returns no token, and sign-in requires a confirmed address.** The account is
  created, an activation link is emailed, and `login` answers 403 `email_not_confirmed`
  until it is opened — so any test or script that registered and used the token straight
  away must now confirm first. Without SMTP credentials the app logs the message instead of
  sending, so the link is in the log and the flow still works offline.
- **Serialization is Newtonsoft.Json on purpose.** Some endpoints return
  `Dictionary<DateTime, …>` and the client parses those keys as dates; System.Text.Json
  formats non-string dictionary keys differently and would break the UI.
- **The database is PostgreSQL** (Npgsql), moved off SQL Server because SQL Server needs
  ~2 GB of RAM just to start, which tripled the DigitalOcean droplet size it deploys onto.
- **Every stored `DateTime` must be UTC.** Postgres columns are `timestamp with time zone`,
  and Npgsql *throws* when handed a value whose `Kind` is `Local` or `Unspecified` — so
  `DateTime.Now` fails at insert time rather than merely being wrong. Use `DateTime.UtcNow`;
  see the note on `BaseEntity`.
- **The database bootstraps itself.** `PrepDB.MigrateDatabaseAsync` runs in `Program.Main`
  before the host starts: it creates the database if missing and applies pending migrations,
  retrying while the server comes up. Turn it off with `Database:AutoMigrate = false` and
  use `dotnet ef database update` instead.
- **The client is React 19 + MUI v9 + Redux Toolkit, built with Vite 8.** JSX must live in
  `.jsx` files — Vite does not transform JSX in `.js`. Build output is `ClientApp/dist`,
  which `AddSpaStaticFiles` points at.
- **CI runs on every PR, and `.gitattributes` is what makes it mean anything.**
  `.github/workflows/ci.yml` runs two jobs, `api` (build at `-warnaserror`, then the xUnit
  suite) and `client` (`npm run verify`). Those two names are what branch protection
  requires, so **renaming a job silently un-requires it**, and a `paths:` filter would leave
  a docs-only PR waiting forever on a check that never runs. Every blob here is LF and
  `.gitattributes` pins the working tree to LF everywhere, because Prettier's `endOfLine`
  defaults to `lf`: without it a Windows clone checks out CRLF and `format:check` fails on
  every client file locally while passing in CI — the same command meaning two different
  things.
- **The client lints with oxlint, and ESLint is not an option — do not try to add it.**
  `typescript-eslint` refuses TypeScript 7 (`"does not support TS 7.0"` at config load, and
  an ERESOLVE before that), and the client runs TS 7, so ESLint would leave two thirds of
  `src` unparsed. oxlint has its own parser and loads `eslint-plugin-react-hooks` through
  `jsPlugins`, which is the only source of the React Compiler rules. `npm run verify` is the
  whole gate — lint, format:check, typecheck, test — and warnings fail it, matching the .NET
  side's 0-warning standard. Formatting is Prettier; run `npm run format` before committing
  rather than hand-aligning anything.
- **UI components talk to `services/chat-service.ts`, never to `api-service` or `mocks`
  directly.** That seam is what keeps mocked features indistinguishable from real ones;
  six features are mocked because the API cannot back them — the settings drawer lists
  them, and `mocks.ts` names the endpoint each would need.
- **Porting a component from the design handoff? Translate `inputProps` to `slotProps`.**
  The handoff predates MUI v9, which drops `inputProps` **silently** — no warning, no error,
  the control simply loses the attributes it carried. Copying its `ComposeDialog` verbatim
  produced a checkbox with no accessible name at all, caught only because a test queried by
  label. Same family as the `Stack` prop-dropping bug that `theme.d.ts`'s drift test guards.
- **Design tokens come from the handoff and are final** (`src/theme/tokens.js`). Prefer an
  existing token over a new value.
- **After upgrading a client dependency across a major, restart the Vite dev server with
  `--force`.** Vite pre-bundles dependencies into `node_modules/.vite/deps` and a running
  dev server keeps serving the old bundle, producing errors like *"does not provide an
  export named 'Navigate'"* even though the installed package is correct and the production
  build is fine.
- **Vite 8 needs Node ≥ 20.19**, so the client Dockerfile cannot drop below `node:22`.
- **Publishing must build the SPA, and the csproj is what does it.** The `BuildSpa` and
  `IncludeSpaOutput` targets run `vite build` and map `dist` into the published output at
  `ClientApp/dist`. Nothing else does — for years publishing produced an app with no client
  at all, and Development hid it completely because `UseSpa` proxies to the dev server
  instead of reading that directory. `IncludeSpaOutput` now fails the publish when `dist` is
  empty. Docker passes `-p:SkipSpaBuild=true` and builds the SPA in a Node stage, because
  the .NET SDK image has no Node.
- **The app runs at `https://chat.vtechsolutions.site`** on DigitalOcean App Platform, with
  `.do/app.yaml` as the source of truth for its configuration. DNS is at the registrar, not
  DigitalOcean. Two settings are load-bearing and easy to miss when adding an origin:
  `Cors__AllowedOrigins__n` must list it, or SignalR silently fails to connect — the policy
  uses `AllowCredentials()`, so a wildcard is not permitted, and it presents as "chat is
  broken" rather than as a CORS error. And `App__PublicUrl` is what activation and reset
  links are built from, so it must be the address a browser can reach.
- **Outbound mail must come from an authenticated domain.** A `gmail.com` sender relayed
  through Brevo fails SPF and DKIM alignment — nothing but Google can authenticate as
  gmail.com — so DMARC fails and activation email lands in spam. Sending from
  `noreply@vtechsolutions.site` with Brevo's DKIM records published passes all three. Never
  set `Email__FromAddress` to an address on a domain someone else controls.
- **Behind a TLS-terminating proxy, set `ForwardedHeaders__Enabled=true` and point the
  platform's health check at `/health`.** The platform answers HTTPS and forwards plain
  HTTP, so `UseHttpsRedirection` sees `http`, redirects to `https`, and the proxy forwards
  `http` again — an infinite loop. The flag is off by default because enabling it clears the
  known-proxy lists, which means trusting `X-Forwarded-*` from anyone. `/health` is
  registered *ahead* of `UseHttpsRedirection` so it answers 200 regardless of scheme: a
  probe from inside the platform's network carries no `X-Forwarded-Proto`, would otherwise
  get a 307, and would roll back a deployment that is in fact healthy. Keep it shallow — the
  app cannot start without a reachable database, so probing one here only adds a way for a
  transient fault to kill a working instance. **The email rate limiter partitions by remote
  IP and so depends on this too:** with forwarded headers off, every request looks like the
  proxy, the whole world shares one bucket, and the first five callers each window lock
  everyone else out.
- **Secrets are supplied per runner, never committed.** Visual Studio reads
  `appsettings.Secrets.json`; docker compose reads `WebChat/.env`; a deployment sets
  environment variables. All three land on the same keys, because ASP.NET Core maps `__` to
  the section separator (`R2__AccessKeyId` → `R2:AccessKeyId`) — so no templating or
  placeholder substitution is needed anywhere, and nothing is baked in at image build time.
  Development-only values live in `appsettings.Development.json`, which is loaded only in
  that environment; outside it `Startup.ValidateRequiredConfiguration` fails at boot naming
  what is missing. Do not reintroduce a default into `appsettings.json` — a shared fallback
  is what lets a misconfigured deployment start and sign tokens with a public key.
  The keys already in git history remain compromised until rotated.
