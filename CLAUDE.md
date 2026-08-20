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
  sending, so the link is in the log and the flow still works offline. `login` also answers
  403 `account_blocked` / `account_deactivated` — both checked *after* the password, so
  neither becomes a way to probe which addresses exist.
- **"Ending a user's sessions" takes two things, and the stamp is only one of them.**
  Rotating `SecurityStamp` refuses the next request that presents a token — and a SignalR
  connection presents its token once, at connect, then holds a socket nothing
  re-authenticates. So a member blocked mid-session went on receiving everything their
  groups produced until they reloaded. Anything that revokes access must also call
  `IConnectionAborter.AbortAll`, which closes their live hub connections. It is a
  process-local singleton: on a second instance it would silently disconnect nobody on the
  other node.
- **A system message is a real row with `Text = null`**, carrying `Type`, `SystemKind` and
  `SystemData` (JSON facts, never a rendered sentence — the client builds the wording, so it
  is not frozen in the actor's language). Any endpoint that returns messages must project all
  three, or system rows arrive looking like ordinary messages with no text and render as
  blank gaps; `getmessages` and the `getthreads` preview each shipped that way once. The ids
  inside `SystemData` are resolved to names **server-side at read time** (`SystemDataJson`),
  because the client resolves names from current members and the person a removal is about
  has just stopped being one. **`Message.Type` is NULL on every row written before the column
  existed**, and those are ordinary user messages — so "not a system message" is
  `("Type" IS NULL OR "Type" <> 'system')` in hand-written SQL. EF's `!=` already means that;
  a raw `<> 'system'` drops the legacy rows silently, which reads as the endpoint
  undercounting when the query is what is wrong.
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
  whole gate — lint, format:check, typecheck, test, **build** — and warnings fail it,
  matching the .NET side's 0-warning standard. Formatting is Prettier; run `npm run format`
  before committing rather than hand-aligning anything. **`build` is in that list because it
  had to be:** `vite build` resolves imports that `tsc` and the dev server do not, and an
  import of a non-existent icon (`@mui/icons-material/MailOutline`, which does not exist —
  the export is `MailOutlined`) passed the whole gate, passed CI, and broke only
  `docker compose build`. It costs ~200 ms.
- **UI components talk to `services/chat-service.ts`, never to `api-service` or `mocks`
  directly.** That seam is what keeps mocked features indistinguishable from real ones;
  six features are mocked because the API cannot back them — the settings drawer lists
  them, and `mocks.ts` names the endpoint each would need.
- **`adapters.ts` maps DTOs to view models field by field, so a field it does not name is
  dropped — silently, and the type system will not save you.** `toProfile` omitted `role`
  for five slices: `/users/getprofile` sent it, `ProfileDto` and `Profile` never declared it,
  and the two readers (`SettingsDrawer.jsx`'s admin link, `App.jsx`'s `/admin` route guard)
  are `.jsx`, where nothing type-checks a property that does not exist. The result was an
  admin console **unreachable from a browser** while its API answered every request — an
  owner saw no link and was redirected away from the URL. **Adding a field to a view model
  means editing the DTO, the model and the adapter, and testing the adapter**; and when a
  feature works over `curl` but not in the app, suspect this seam first. Same blind spot as
  the `inputProps` drift below: the components that matter are `.jsx`, so verifying an API
  is not verifying a feature.
- **A workspace policy ships only with an enforcement point.** Seven of the nine switches on
  the Policies screen are drawn as inert rows labelled "Not enforced yet" — that is
  deliberate, not unfinished. A toggle nothing reads is worse than a mock: a mock is
  obviously a mock, while a switch backed by a database tells the one person whose job is to
  know how the workspace is configured that it is configured a way it is not. The server's
  `WorkspacePolicy.Defaults` is the authority on which are real, and the client renders any
  row missing from the response as inert — so wiring a new switch means finding the code path
  that will read it *first*. Defaults must equal the behaviour that predates the policy, or
  deploying one silently takes something away from every member.
- **Porting a component from the design handoff? On `Checkbox`, `Switch` and `Radio`,
  translate `inputProps` to `slotProps`.** The handoff predates MUI v9, which drops
  `inputProps` from the `SwitchBase` family **silently** — no warning, no error, the control
  simply loses the attributes it carried, which for a bare control is its only accessible
  name. Four sightings so far, all found by accident, because these are used from `.jsx`
  where nothing type-checks the props — so `src/test/mui-drift.test.tsx` now *scans* `src`
  for it rather than waiting for the next one. **`InputBase` and `TextField` never lost the
  prop**: `SearchField` and `Composer` use it correctly, and a sweep for the bare prop name
  would break working code. Same family as the `Stack` prop-dropping bug that the same file
  guards.
- **Design tokens come from the handoff and are final** (`src/theme/tokens.js`). Prefer an
  existing token over a new value.
- **The Vite dev server lies about your code more than once, and each way looks like a bug in
  the source.** Three distinct failures, all of which have cost real time here:
  - *Upgrading a dependency across a major:* restart with `--force`. Vite pre-bundles deps into
    `node_modules/.vite/deps` and a running server keeps serving the old bundle — *"does not
    provide an export named 'Navigate'"* while the installed package is correct.
  - *Adding a dependency, in compose:* `docker compose up -d --build` is **not enough**. The
    `react-app` service puts an anonymous volume at `/app/node_modules` so the source bind
    mount does not mask the image's deps, and Docker reuses anonymous volumes across a
    rebuild — so the stale one wins and Vite reports "Failed to resolve import" for a package
    `package.json` plainly lists. Use `--renew-anon-volumes`.
  - *Editing a source file, in compose:* **`vite.config.ts` sets no `server.watch.usePolling`,
    and inotify events do not cross a Windows bind mount**, so the watcher never fires and the
    browser runs code that no longer exists on disk. This produced a confident, wrong bug
    report — a browser check against a stale module is worse than no check, because it looks
    like evidence. Restart `react-app` after editing, and confirm the served module matches the
    file before trusting what you saw.
- **"Removed" is a third avatar state, not an absence.** `AvatarRemovedAt` is a retention
  marker: while it is set every read path must report no avatar, but the keys and the crop
  columns are **kept**, which is the only reason Undo can restore the photo *and* its framing
  exactly — the server cannot re-derive a crop, because cropping is client-side by design.
  **Undo never accepts a filename from the client**; `restore` takes no parameters at all,
  because a client-supplied key would let anyone point their avatar at any object in the
  bucket. Any new query that reads `AvatarFileName` must gate on the marker — `AvatarVisibility`
  states the rule, and EF projections spell it inline because it has to translate to SQL.
- **An avatar is now two objects with two different delete rules, and `/images/{name}` must
  never serve one of them.** The cropped avatar keeps its anonymous GUID path; the *original*
  lives under `originals/` and is reachable only through `GET api/avatars/original`, which
  checks the caller owns it — because the original holds the pixels the user deliberately
  cropped out. `GetImage` presigns whatever key it is handed, so the prefix guard in it is the
  whole of that protection. **Uploading a new photo deletes both the old crop and the old
  original; re-cropping deletes the old crop and *keeps* the original.** Every derived crop
  must still write a fresh `{Guid}.{ext}` — a stable per-user key would serve the old face
  from the memoised presigned URL and the browser cache at once, invisibly to the one person
  who just re-cropped.
- **Checking a responsive change needs a same-origin iframe, because the browser tool cannot
  narrow the viewport.** `resize_window` reports success, moves the OS window, and leaves the
  tab reporting its old `innerWidth` — so a "mobile check" silently runs at desktop width and
  passes. Load the app into an iframe sized to the device instead: an iframe gets its own
  viewport and evaluates media queries against it, so `useIsMobile()` and every `sx` breakpoint
  behave for real. Inject it into the live page — `document.write` gives the outer document an
  opaque origin and locks you out of `contentDocument`. This is not hypothetical tidiness: the
  avatar cropper shipped to production with its circle sliced flat on every phone, because the
  one gap #84 declared unverified was the one that could not be checked the obvious way.
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
  DigitalOcean. **Merging to `master` does not deploy.** The file declares a `github:` source
  with `deploy_on_push: true`, but the live app was created from a plain `git:` clone source,
  which App Platform never auto-deploys — so the flag describes an integration the app does
  not have, and a merge that "should have shipped" silently sits there. Ship with
  `doctl apps create-deployment 7337e1b0-3696-44f8-9462-df84a75c5bab`, and **never**
  `doctl apps update --spec`: that replaces the entire spec, and the secrets read back as
  encrypted `EV[…]` placeholders, so a round-trip writes those placeholders in as literal
  values. Two settings are load-bearing and easy to miss when adding an origin:
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
