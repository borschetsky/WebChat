# ClientApp dependency modernization (React 16 → 18, CRA 3 → 5)

- **Date:** 2026-08-02
- **Type:** both
- **Scope:** `WebChat/WebChat/ClientApp` (package.json, `src/index.js`, `Dashboard.js`, `message-list.js`, `edit-profile.js`)
- **Status:** done

## Context

The SPA was on React 16.13 with `react-scripts` 3.0.0 (webpack 4), which only builds on
Node ≤ 16. The host has Node 18, so `npm start` / `npm run build` could not run at all.
Earlier notes assumed a large Material-UI migration was required; that turned out to be
wrong — see below.

## What I found

**Three of the seven dependencies were never used.** This is the headline finding and it
collapsed the estimated effort:

- `@material-ui/core` and `@material-ui/icons` — **zero imports anywhere in `src/`**. The
  only reference is a `<script src="https://unpkg.com/@material-ui/core/...">` in
  `public/index.html`, and it is *already inside an HTML comment* (lines 8-11). The UI is
  hand-rolled CSS across 15 `.css` files.
- `sudo` — a Node process-elevation package, entirely unused. It had no business in a
  browser bundle's dependency list.

So no component rewrite was needed. Earlier notes flagged "MUI v3 → v5+" as the largest
remaining work item; that was wrong, and this note supersedes it.

**The real external API surface is tiny** — 40 JS files import only: `react` (18),
`react-router-dom` (3), `axios` (2), `react-dom` (1), `@aspnet/signalr` (1).

**Router usage is v5-shaped**: `BrowserRouter`, `Switch`, `Route`, `Link`, and six
`history.push` calls. All 12 components are class components with zero hooks, so a move to
react-router v6/v7 would mean rewriting every one of them (`withRouter` was removed in v6;
`useNavigate` is hooks-only). That is why the router was deliberately left on v5.

**Only two React-19-blocking patterns existed**, both in
`src/components/message-list/message-list.js` and both part of the same scroll-to-bottom
feature: a string ref (`ref="messages"`) and `componentWillUpdate`. Everything else was
already modern — no `findDOMNode`, no `defaultProps`, no other legacy lifecycles.

## What changed

**package.json**
| Package | Before | After |
|---|---|---|
| `react` / `react-dom` | 16.13.1 | **18.3.1** |
| `react-scripts` | 3.0.0 | **5.0.1** |
| `axios` | 0.18.1 | **1.19.0** |
| `@aspnet/signalr` | ^1.1.4 | **`@microsoft/signalr` ^10.0.0** |
| `react-router-dom` | ^5.2.0 | **^5.3.4** (stays on v5, see below) |
| `@material-ui/core`, `@material-ui/icons`, `sudo` | present | **removed** |

Also fixed the `start` script: `./node_modules/.bin/react-scripts start` →
`react-scripts start`. The path form is a POSIX-ism that fails on Windows.

**Code**
- `src/index.js` — `ReactDOM.render` → `createRoot(...).render(...)`
- `Dashboard.js` — SignalR import repointed to `@microsoft/signalr` (the API surface used,
  `HubConnectionBuilder().withUrl(url, { accessTokenFactory })`, is unchanged)
- `message-list.js` — string ref → `React.createRef()`; `componentWillUpdate` →
  `getSnapshotBeforeUpdate`, with the scroll decision passed through the `snapshot`
  argument of `componentDidUpdate`. Added null guards on the ref.
- Removed three dead imports that CRA 5's stricter ESLint promoted to build errors:
  `_baseUrl` (Dashboard.js), `authHeader` and `Axios` (edit-profile.js). Verified each
  appeared exactly once — the import line itself.

## Decisions and trade-offs

**React 18, not 19.** After the two fixes above nothing blocks React 19 technically, but
`react-scripts` 5.0.1 predates React 19 by two years and nobody tests that combination.
React 18 + CRA 5 is a well-trodden path and it is verified working here. The legacy
patterns were removed anyway, so a later jump to 19 is now cheap.

**react-router stays on v5.3.4.** v7 would require converting all 12 class components to
function components with hooks, because `withRouter` is gone and `useNavigate` cannot be
called from a class. That is a real refactor, not a dependency bump, and it belongs in its
own change. v5.3.4 works fine with React 18.

**Kept CRA rather than migrating to Vite.** The ask was to update libraries. Vite is the
right long-term destination (see follow-ups) but it changes the build tool, `index.html`
location, and env-var handling — again, its own change.

## Verified

- `npm install` — clean, 1321 packages, no peer-dependency errors.
- **Production build passes with warnings-as-errors** (`CI=true react-scripts build`):
  `Compiled successfully`, 92.41 kB gzipped JS + 3.21 kB CSS.
- **Dev server runs on Node 18** — `npm start` reached `Compiled successfully!`,
  `http://localhost:3000` returned HTTP 200, and the served HTML contains both
  `<div id="root">` and `/static/js/bundle.js`. This was impossible before the upgrade.

**Not verified:** the app was not exercised against a running API in a browser, so the
SignalR client swap and the reworked scroll logic are compile-verified and API-compatible
but not behaviourally tested. No automated tests exist to run.

## Known issues / follow-ups

**`npm audit` reports 28 vulnerabilities (9 low, 5 moderate, 14 high) and this is expected.**
Every one traces into `react-scripts` 5.0.1's build/test chain — `jsdom`/`jest` via
`@tootallnate/once`, `nth-check` via `svgo`, `postcss` via `resolve-url-loader`, and
`serialize-javascript` via `workbox-build`/`rollup-plugin-terser`. **None reach the shipped
bundle**; they are build- and test-time only. Do **not** run `npm audit fix --force` — it
will attempt to change `react-scripts` itself and break the build. CRA is unmaintained
(5.0.1 is from 2022), so these cannot be resolved while staying on it.

**The genuine fix for the audit noise is to leave CRA.** Migrating to Vite would drop the
entire vulnerable build chain, cut install size sharply, and unblock React 19. For a
40-file app with no CRA-specific tricks this is mostly mechanical: move `index.html` to the
project root, rename `process.env.REACT_APP_*` to `import.meta.env.VITE_*` (none are
currently used), and swap the scripts.

**Remaining modernization, in dependency order:** Vite → React 19 → react-router v7 (which
forces the class-to-function-component conversion).

> **Vite migration is done** — see *Update — 2026-08-02: migrated CRA → Vite* below.
> The audit findings are resolved (0 vulnerabilities).

**Node version.** The host runs Node 18.18.0, installed machine-wide at
`C:\Program Files\nodejs` (no nvm/fnm/volta). Latest is v26.5.1 (Current); latest LTS line
is v24 "Krypton". Upgrading requires administrator rights. Note CRA 5 on Node 26 is
untested — Node 24 LTS is the safer target while `react-scripts` remains in play.

## Update — 2026-08-02: migrated CRA → Vite

`react-scripts` is gone. The build tool is now Vite 6.4.3 with `@vitejs/plugin-react` 4.7.0.

**Why Vite 6 and not Vite 8.** Vite 8 (and `@vitejs/plugin-react` 6) declare
`engines.node: ^20.19.0 || >=22.12.0`. The host is on Node 18.18.0, so Vite 8 would not
run. Vite 6 is the newest line that supports Node 18, and it is verified working here. A
verified-working build beats a newer-but-unrunnable one. **Once Node ≥ 20.19 is installed,
moving to Vite 8 is a version bump in `package.json` and nothing else** — no config or
source changes are expected.

**What the migration required** (the app turned out to have almost no CRA coupling):

- **18 of 40 `src` files contain JSX and were renamed `.js` → `.jsx`** using `git mv`, so
  rename history is preserved. Vite only applies the JSX transform to `.jsx` by default.
  The other 22 files (barrel `index.js` files, `services/`, `helpers/`, `config.js`)
  contain no JSX and stayed `.js`. Extensionless imports keep working because Vite's
  default `resolve.extensions` already includes `.jsx`.
- `public/index.html` → **`index.html` at the ClientApp root** (Vite treats it as the entry,
  not a static asset). `%PUBLIC_URL%/favicon.ico` → `/favicon.ico`, and an explicit
  `<script type="module" src="/src/index.jsx">` was added. Title changed "React App" →
  "WebChat".
- New `vite.config.js`: react plugin, `server.port 3000` + `strictPort` + `host: true`
  (so the API container can reach it by service name), `build.outDir: 'dist'`, sourcemaps on.
- `package.json`: added `"type": "module"`, moved build tooling to `devDependencies`,
  scripts are now `dev` / `build` / `preview` (kept `start` as an alias for `dev` so muscle
  memory and the Dockerfile still work). Dropped the `test` and `eject` scripts — there are
  no tests, and `eject` is a CRA concept.
- **`Startup.cs`: `AddSpaStaticFiles` RootPath `"ClientApp/build"` → `"ClientApp/dist"`.**
  This is the only server-side change the migration needed.
- `ClientApp/Dockerfile`: Node 16 → **Node 22**, `npm install` → `npm ci`, no more global
  `react-scripts` install, and it now copies only `WebChat/ClientApp/` instead of the whole
  solution. The Node 16 pin existed solely because of webpack 4; that constraint is gone.
- `docker-compose.yml`: added an anonymous `/app/node_modules` volume to the `react-app`
  service. The existing bind mount `./WebChat/ClientApp:/app` masks the image's
  `node_modules`, which CRA tolerated via its global install but Vite would not.
- `.gitignore`: added `/dist`, `.vite`, `*.local`.

**Results**

| | CRA 5 | Vite 6 |
|---|---|---|
| Install size | 1321 packages | **124 packages** |
| `npm audit` | 28 (9 low, 5 mod, 14 high) | **0 vulnerabilities** |
| Production build | ~30 s | **1.48 s** |
| Dev server startup | ~10 s | **478 ms** |
| Bundle (gzip) | 92.41 kB | 94.45 kB |

The bundle is ~2 kB larger; Vite's default chunking differs slightly and sourcemaps are
now enabled. Not worth chasing.

**Verified**

- `vite build` — succeeded, 184 modules, `dist/index.html` + hashed `assets/`.
- `vite dev` — ready in 478 ms, serves HTTP 200 on `localhost:3000`.
- **Through the ASP.NET SPA proxy (development)** — `GET https://localhost:7199/` returned
  200 with `<div id="root">` and `/src/index.jsx`; `GET /src/index.jsx` through the proxy
  returned 200, so Vite's on-demand module transform works via
  `UseProxyToSpaDevelopmentServer`.
- **Static serving (Production)** — with `ASPNETCORE_ENVIRONMENT=Production` the root
  returned the built `dist/index.html` referencing `assets/index-*.js` / `*.css`, and the
  hashed JS asset resolved with 302,040 bytes. This confirms the `RootPath` change.
- API unaffected in both modes — `/api/hey/getthreads` returned 401 alongside the SPA.
- `dotnet build WebChat.sln -c Release` — 0 warnings, 0 errors after the `Startup.cs` edit.

**Two benign build warnings** from `@microsoft/signalr`: Rollup cannot interpret two
`/*#__PURE__*/` annotations in `dist/esm/Utils.js` because of comment placement. Upstream
cosmetic issue; it only means those two calls are not tree-shaken.

**Still not verified:** no browser run against a live API, so the SignalR client and the
reworked scroll logic remain compile- and integration-verified but not behaviourally
tested. The `react-app` Docker image has still never been built (no Docker daemon).
