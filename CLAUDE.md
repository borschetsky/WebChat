# WebChat

Real-time chat app: ASP.NET Core (.NET 10) REST API + SignalR hub, with a Create React App
SPA client.

## Context notes — read these first

**→ [`docs/ctx/README.md`](docs/ctx/README.md)** is the index of context notes for this repo.

Before exploring a subsystem or starting a change, check the index for a note covering that
area — it will usually save you the investigation. After finishing any non-trivial
exploration or change, record what you learned with the **`ctx`** skill
(`.claude/skills/ctx/SKILL.md`), which writes a new note and updates the index.

## Layout

The solution lives one level down, at `WebChat/WebChat.sln`. Six projects:

| Project | Path | Role |
|---|---|---|
| `WebChat` | `WebChat/WebChat` | ASP.NET Core host, controllers, SPA hosting |
| `WebChat.Models` | `WebChat/WebChat.Data` | Entities and view models (note: folder and project names differ) |
| `WebChat.Connection` | `WebChat/WebChat.Connection` | EF Core `DbContext` and migrations |
| `WebChat.Services` | `WebChat/WebChat.Services` | Business logic, JWT issuing, mapping |
| `WebChat.Hubs` | `WebChat/WebChat.Hub` | SignalR `ChatHub` and connection tracking |
| `WebChat.AvatarWriter` | `WebChat/WebChat.AvatarWriter` | Avatar image validation and writing |

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

Full stack (API + SQL Server + CRA dev server):

```bash
cd WebChat
docker compose up --build
```

The API is reachable on `https://localhost:8081` (this is what `ClientApp/src/config.js`
points at); the CRA dev server is on `http://localhost:3000`.

## Things worth knowing

- **Auth is hand-rolled JWT**, not ASP.NET Identity. Controllers identify the caller via
  `User.Identity.Name`, which carries the *user id* — not the username.
- **Serialization is Newtonsoft.Json on purpose.** Some endpoints return
  `Dictionary<DateTime, …>` and the client parses those keys as dates; System.Text.Json
  formats non-string dictionary keys differently and would break the UI.
- **Connection strings need `TrustServerCertificate=True`** against the containerised SQL
  Server, because `Microsoft.Data.SqlClient` defaults `Encrypt` to true.
- **The database bootstraps itself.** `PrepDB.MigrateDatabaseAsync` runs in `Program.Main`
  before the host starts: it creates the database if missing and applies pending migrations,
  retrying while SQL Server comes up. Turn it off with `Database:AutoMigrate = false` and
  use `dotnet ef database update` instead.
- **The client is React 18 + MUI v9, built with Vite.** JSX must live in `.jsx` files — Vite
  does not transform JSX in `.js`. Build output is `ClientApp/dist`, which `AddSpaStaticFiles`
  points at.
- **UI components talk to `services/chat-service.js`, never to `api-service` or `mocks`
  directly.** That seam is what keeps mocked features indistinguishable from real ones;
  seven features are mocked because the API cannot back them — the settings drawer lists
  them, and `mocks.js` names the endpoint each would need.
- **Design tokens come from the handoff and are final** (`src/theme.js`). Prefer an existing
  token over a new value.
- **After upgrading a client dependency across a major, restart the Vite dev server with
  `--force`.** Vite pre-bundles dependencies into `node_modules/.vite/deps` and a running
  dev server keeps serving the old bundle, producing errors like *"does not provide an
  export named 'Navigate'"* even though the installed package is correct and the production
  build is fine.
- **Vite is pinned to 6.x because the host runs Node 18.** Vite 8 needs Node ≥ 20.19; once
  Node is upgraded it should be a straight version bump.
- Secrets are currently committed in `appsettings.json` and `docker-compose.yml`. Do not
  add more; prefer user secrets or environment variables.
