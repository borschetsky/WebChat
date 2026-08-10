# What does the admin console cost us in dependencies and licences, and how should client-error ingestion be built?

- **Date:** 2026-08-10
- **Status:** answered
- **Question:** Before building the workspace admin console from `SPEC-groups-and-admin.md`, which charting library is actually free to use, and should client-error ingestion be hand-rolled or delegated?
- **Recommendation:** Hand-roll the three charts with `d3-scale` + `d3-shape` (ISC, **+10 kB gzip**) rather than any chart library, and wire `@sentry/react` rather than building `/api/client-errors` — then render the spec's UI-errors table from Sentry's issues API, whose `stats["14d"]` field *is* the spec's 14-day sparkline.

## The short answer

**Licence: nothing here is blocked, but one thing is.** `@mui/x-charts@9.11.1` is MIT and its bar chart *and* sparkline are both in the MIT package — so the two charts the spec draws most are free. **The activation funnel is not:** `FunnelChart` ships only in `@mui/x-charts-pro`, which is commercial at **$299/year/developer** with no free tier for personal projects (50 % education/non-profit discount only). So the funnel has to be hand-drawn whatever else you choose.

That is what settles the charting question, because once you are hand-drawing the funnel, paying a chart library's fixed engine cost for the other two is poor value. I measured it: `@mui/x-charts` costs **+100 kB gzip to render a single sparkline** — almost all of it fixed engine, since adding the bar chart on top only takes it to +110 kB. Recharts 3.10.1 is +97.5 kB gzip for the same job. `d3-scale` + `d3-shape` and your own `<svg>` is **+10.0 kB gzip** and draws all three. Against a client whose entire render-blocking payload is currently ~216 kB gzip, a 100 kB library for 14 rectangles and a polyline is the wrong trade even on a lazy route.

**Client errors: do not build the ingestion pipeline.** Two facts in this repo make a hand-rolled `fingerprint` of "component + function + error name" *not computable in production* as things stand: `vite.config.ts` deliberately ships **no sourcemaps**, and I verified that Vite 8's default minifier renames `AdminOverviewCard` to `t` — so `errorInfo.componentStack` in production reads `at t / at n`. You would be fingerprinting mangled single letters that change every deploy. Fixing that costs either `mangle.keepNames` (+5.9 kB gzip, measured) or passing literal boundary names by hand; and you would still be building storage, grouping, retention and a symbolication story into a **512 MB** DigitalOcean dev database. Sentry's free Developer plan does all of it for $0: 5 k errors/month, 30-day retention, and an issues endpoint that returns `count`, `userCount`, `culprit`, `lastSeen` and `stats` with `statsPeriod=14d`.

**Audit log: write your own append-only table.** EF Core temporal tables are a SQL Server provider feature and do not exist for Npgsql. Audit.NET (MIT, 32.2.0) audits *entity diffs*, not the business events the spec's audit log lists. **Invitations:** "extend" should rotate the token and re-send, which means resend and extend are one operation — a silent deadline extension lengthens the life of a secret that has already been sitting in an inbox.

## What decides it

**Charting — the deciding fact is that the funnel is Pro.** Verified two ways: `mui.com/x/react-charts/funnel/` carries a "Pro plan" badge and imports from `@mui/x-charts-pro/FunnelChart`, and `index.d.ts` of the published `@mui/x-charts@9.11.1` tarball exports `BarChart, LineChart, PieChart, ScatterChart, SparkLineChart, Gauge, RadarChart` and no funnel. `@mui/x-charts-pro`'s own `LICENSE` file reads "MUI X Pro is commercial software. You MUST agree to the End User License Agreement". So the funnel is hand-rolled in every scenario. The second deciding fact is the measured **+100 kB gzip fixed cost** of the MUI X chart engine — it is not proportional to how many charts you draw.

**Client errors — the deciding fact is that this repo has no symbolication path and no name preservation.** These are both consequences of decisions already recorded in `docs/ctx/2026-08-09-bundle-splitting.md` and the comment in `vite.config.ts:50-62`, which says in as many words: *"Dropping it is the only option that keeps the map off the server; there is no error tracker to upload it to yet."* Sentry is precisely the thing that resolves that sentence — `sourcemap: 'hidden'`, upload at build, delete from `dist`. The second deciding fact is the **512 MB dev database at $7/month**, shared with all application data: it is the wrong place to accumulate stack traces and breadcrumbs.

Things that do **not** decide it: MUI theming integration (you pass `theme.palette` values into an `<svg>` in one line); React 19 compatibility (every option here supports it); and Sentry's 5 k/month quota (a personal project will not approach it, and the failure mode is dropped events, not a bill).

## Options

### 1. Charting

Measured 2026-08-10 on a scratch project: Vite 8.2.1, default rolldown/oxc minify, no sourcemap, gzip level 9. Baseline = React 19.2.8 + react-dom + `@mui/material@9.3.1` (Card/Table/Typography/Box) + emotion + `@reduxjs/toolkit@2` + `react-redux@9` = **87.1 kB gzip / 270.4 kB raw**. Figures below are the *marginal* increase over that baseline.

| Option | Licence | Marginal gzip | Draws the funnel? | Notes |
|---|---|---|---|---|
| **`d3-scale` 4.0.2 + `d3-shape` 3.2.0 + own SVG** | ISC | **+10.0 kB** | Yes (you write it) | ~150 lines for 14 bars, a polyline sparkline and 4 trapezoids |
| `recharts` 3.10.1 (Bar+Line+axes+tooltip+ResponsiveContainer) | MIT | +97.5 kB | No | Requires a `react-is` peer; ships `@reduxjs/toolkit`/`react-redux`/`immer`/`reselect` as **runtime deps**, which dedupe against ours (2.x/9.x ranges) — that dedupe is already reflected in the +97.5 |
| `@mui/x-charts` 9.11.1 (BarChart + SparkLineChart) | MIT | +110.2 kB | No | Sparkline **alone** is +100.4 kB — the cost is the engine, not the charts. Peer accepts `@mui/material ^9.0.0`, so it fits |
| `@mui/x-charts-pro` 9.11.1 | **Commercial** | (superset) | Yes | **$299/yr/dev**, perpetual-use model with 12 months of updates; 30-day non-production evaluation; runtime licence-key check via `@mui/x-license` |
| `visx` | MIT | ~+10 kB per primitive package | Yes (you compose it) | `@visx/shape` alone is 10.7 kB gzip; essentially the d3 option with React wrappers and more packages |
| `uPlot` 1.6.32 | MIT | +21.9 kB | No | Canvas, time-series oriented, imperative — fights both MUI theming and SSR-free React idioms for what is fundamentally a 14-bar bar chart |
| Nivo | MIT | not measured | Yes (funnel exists) | d3-based, comparable weight to Recharts; not measured because the funnel-is-Pro logic already removes the reason to take a library |

**Recommendation: hand-roll with `d3-scale` + `d3-shape`.** Four reasons, in order: the funnel forces hand-rolling anyway; 10 kB vs 100 kB; the charts are static (14 bars, a sparkline, a 4-stage funnel — no zoom, no brush, no live update); and there is no licence to re-check in a year. `d3-scale`/`d3-shape` are ISC and have been stable for years. **What would change my mind:** if the console grows past ~5 chart types, or needs interaction (tooltips on hover with crosshairs, zoom, legend toggling), take Recharts — that is where hand-rolled stops being 150 lines. If you ever buy MUI X Pro for the data grid, take `@mui/x-charts-pro` and stop thinking about it.

**Reversibility:** high. Charts are leaf components behind a lazy route; swapping the implementation touches no data shape and no API.

### 2. Client-error ingestion

**Do not build it. Wire `@sentry/react` 10.70.0 (MIT, React 19 peer).** Measured marginal cost with `Sentry.init` + `ErrorBoundary` and no tracing/replay: **+28.3 kB gzip / +86.2 kB raw**. Note the asymmetry with charts: this is an **eager** cost — Sentry must initialise at app start to catch anything — so it lands on the ~216 kB gzip render-blocking payload, roughly +13 %. That is the real price, and it is the honest argument against.

Then build the spec's UI-errors screen against Sentry's own API rather than a table of ours. `GET /api/0/projects/{org}/{project}/issues/?statsPeriod=14d` returns, per issue: `title`, `culprit` (Sentry's "module in function" string — the spec's *component + function*), `count` (event count), `userCount` (users affected), `firstSeen`, `lastSeen`, and `stats["14d"]` as `[[timestamp, count], …]` — the sparkline series, precomputed. `14d` is one of exactly three documented `statsPeriod` values (`24h`, `14d`, `""`). The spec's row is that response object. Call it from the API with an org auth token so the token never reaches the browser.

**If you build it anyway** (self-contained is the point, or you refuse a third party), the minimum that actually works:

- **Fingerprint** — copy Sentry's *shape*, not its implementation. Sentry's documented precedence is "`fingerprint` first, the `stack trace` next, then the `exception`, and then finally the `message`", grouping only on frames "that the SDK reports and associates with your application". For us the stack-trace tier is unavailable (mangled, unsymbolicated), so we are in Sentry's second tier: exception `type` + `value`. Minimum viable:
  `fingerprint = sha256("v1|" + boundaryName + "|" + error.name + "|" + normalise(error.message)).slice(0,16)`
  with a version prefix so you can re-group later without a migration.
- **Get the component name by declaring it, not by parsing.** `errorInfo.componentStack` from `createRoot`'s `onCaughtError`/`onUncaughtError` is the only production-available stack, and I verified its names are mangled to single letters by Vite 8's default minifier. `React.captureOwnerStack` is worse than useless here: the React docs state it "will always return `null` outside of development" and that it "is only exported in development builds. It will be `undefined` in production builds." So pass a literal: `<AppErrorBoundary name="AdminOverview">`. Zero bytes, exact, and inherently low-cardinality. The alternative — `rolldownOptions.output.minify.mangle.keepNames` — works (verified: the name survives) but costs **+5.9 kB gzip** applied globally and still gives you unsymbolicated line numbers.
- **`error.name` has the same trap.** Built-ins (`TypeError`, `RangeError`) are safe. A `class ApiError extends Error` gets its name from the constructor, which the minifier renames — so any custom error must set `this.name = 'ApiError'` as a string literal.
- **Never put a filename or line number in the fingerprint.** Vite emits content-hashed chunk names, so `app-CQokkebT.js:1:4823` changes on every deploy and would re-open every issue each release.
- **Bound the cardinality in three places:** normalise the message (strip digits, UUIDs, hex, quoted strings, URLs, then truncate) — this is the spec's own "never the raw message" rule made concrete; dedupe client-side so a given fingerprint is sent at most N times per session; and cap distinct *new* fingerprints per day server-side, folding the overflow into a single `too-many-groups` bucket. Without the third, one bad release writes unbounded rows into a 512 MB database.
- **Transport: `fetch(url, { method:'POST', keepalive:true, … })`, not `sendBeacon`.** The deciding constraint is the `Authorization` header — this app authenticates with a bearer JWT and `sendBeacon` cannot set headers at all (MDN: use `fetch` with `keepalive` "for use cases that need … to change any request properties"). MDN compat data 8.0.10 (2026-08-06) puts `Request.keepalive` at Chrome 66, **Firefox 133**, Safari 13; on an older browser the unknown init property is ignored and the request simply degrades to a normal one. Both transports cap the body at **64 KiB**, which a stack trace plus breadcrumbs can genuinely exceed — truncate before sending. Reserve `sendBeacon` for a `visibilitychange` → hidden flush only, and note it must then be an anonymous endpoint with a `text/plain` body: Chrome refuses `Blob`s whose type is not CORS-safelisted, so `application/json` is a hazard and `text/plain` also avoids a preflight.
- **"Never block the UI"** is mostly a client property, not a server one: do not `await` the report, wrap the reporter in `try/catch`, and hold a re-entrancy flag so a failure inside the reporter cannot re-enter the error path. Server-side, 202 + a bounded `System.Threading.Channels.Channel` with `BoundedChannelFullMode.DropWrite` drained by a `BackgroundService` — in-box, no dependency, and *bounded* is the point: shed load rather than grow. Rate-limit it with the existing per-IP limiter, which per `CLAUDE.md` already depends on `ForwardedHeaders__Enabled`.

### 3. Sentry vs GlitchTip vs hand-rolled — the honest comparison

| | Per-unit | Fixed / month | Setup | Ongoing | Exit cost |
|---|---|---|---|---|---|
| **Sentry Developer (free)** | 5 k errors/mo, then dropped ("data sent after you've run through your reserved volume … will be dropped and you won't be charged") | **$0** | DSN + `Sentry.init` + sourcemap upload in CI | none | Low — SDK is Sentry-protocol; GlitchTip "is compatible with Sentry client SDKs", so switching is a DSN change |
| **GlitchTip hosted free** | **1 k events/mo** (worse than Sentry) | $0, $15 at 100 k | same | none | same |
| **GlitchTip self-hosted** | unlimited | ~**$12/mo** on DO (an extra $5 app + $7 dev DB), plus its own Postgres 14+ and optional Valkey/Redis | container + DB + migrations | upgrades, backups, disk (their guide: "a 1 million event per month instance may require 30GB of disk") | Low on the client side, but you own the data move |
| **Hand-rolled table** | free | $0 marginal, but shares the 512 MB DB | ingest endpoint, fingerprinting, grouping, retention job, admin UI, plus fixing minified names | grouping bugs, cardinality blowups, pruning | Zero third-party lock-in; highest build cost |

GlitchTip self-hosting is lighter than its reputation — the docs say "512 MB RAM" recommended, "256 MB RAM when using all-in-one setup" — so this is not ruled out on resources. It is ruled out on *value*: it doubles the monthly bill and adds an upgrade treadmill to buy something Sentry gives free at this volume, and its free hosted tier is five times smaller. Take it only if not sending user data to a third party is itself the requirement.

Two caveats against Sentry, stated plainly. **Retention is 30 days on the Developer plan** (90 on Team/Business) — enough for the spec's 14-day window, not enough to answer "was this happening in June". And **the free plan is one user**, so the "workspace admin console" cannot delegate to a second admin through Sentry's own UI — which is another argument for the hybrid: our console reads the API with a service token and shows it to whoever we say.

**Recommendation, with the branch made explicit:**
- *If the goal is working error tracking* → Sentry alone; skip the spec's UI-errors screen.
- *If the goal is the console screen itself* (the likely one, since the spec draws it in detail) → **Sentry for ingestion, our screen reading Sentry's issues API.** You get the spec's UI verbatim and skip grouping, retention, symbolication and cardinality entirely. This is the recommendation.
- *If self-contained is non-negotiable* → build it, but budget the two prerequisites first: literal boundary names, and a retention/pruning job against the 512 MB database.

**Reversibility:** the ingestion choice is more reversible than it looks, because `@sentry/react` speaks a protocol GlitchTip also implements. What is *not* reversible cheaply is the fingerprint scheme, if you hand-roll: change it and every historical issue re-opens. Hence the `v1|` prefix.

### 4. Audit log

**Write your own append-only table.** Both alternatives are ruled out by a single fact each:

- **EF Core temporal tables are SQL Server only.** The feature is documented under "Microsoft SQL Server Database Provider — Temporal Tables"; the generated DDL is `PERIOD FOR SYSTEM_TIME … WITH (SYSTEM_VERSIONING = ON …)`, T-SQL with no Npgsql equivalent. This repo is on PostgreSQL 16. Not a trade-off — it does not exist.
- **Audit.NET (MIT, 32.2.0, published 2026-06-12) solves a different problem.** Its EF provider intercepts `SaveChanges` and records *entity-level diffs*. The spec's audit log is a list of business events with an actor, a target and a human sentence — "Alice revoked Bob's invitation", "policy X changed". Deriving that from a `ThreadParticipant` row diff needs a mapping layer per event type, which is the same work as just writing the event, plus a dependency and an interceptor in the `SaveChanges` path.

Practical notes for the hand-rolled version:
- Append-only is a *convention* unless enforced, and revoking `UPDATE`/`DELETE` is not available to us — the app connects to DO managed Postgres as the owning role. A `BEFORE UPDATE OR DELETE … RAISE EXCEPTION` trigger is the cheapest real enforcement, and it survives anything EF does. Add it in a migration with raw SQL.
- Store the actor id, action enum, target type + id, a `jsonb` detail column, and `OccurredAtUtc`. Render the sentence at read time from the enum, not at write time — a stored sentence cannot be re-localised or corrected.
- **`DateTime.UtcNow`**, per `CLAUDE.md`: Npgsql throws on `Kind == Local|Unspecified` against `timestamp with time zone`.
- A plain btree on `(occurred_at DESC)` is right at this scale. BRIN is for "very large tables in which certain columns have some natural correlation with their physical location"; at personal-project row counts it buys nothing.
- Set a retention window and prune. 512 MB is the whole database.

### 5. Invitations — what is new versus confirmation and reset

The token mechanics are already solved and should be copied unchanged: 256-bit CSPRNG, store only the SHA-256 hash, look up *by hash*, constant-time compare, base64url. Four things are genuinely new:

1. **An invitation has no `User` row to hang off.** It is keyed by `(workspaceId, email)`, and redemption branches: existing account → join; no account → register-then-join, and the registration must inherit the invitation's confirmed-email status or you will make the user confirm an address you just proved they control.
2. **Decide bearer-vs-bound explicitly.** Binding redemption to the invited address is safer (a leaked link is useless to anyone else) but breaks forwarding, which invitations are often forwarded on purpose. Bearer is the common product choice; if you take it, compensate with single-use + revoke + an audit entry naming who redeemed it.
3. **"Extend" should rotate the token and re-send — which collapses it into "resend".** The security-sane reasoning: the 30-day cap exists to bound how long a secret that has been mailed, sat in an inbox, passed a scanner and possibly landed in a mail archive stays live. Silently moving the deadline extends exactly that exposure and is invisible to the invitee. Rotating costs nothing. But note the trap that makes this a single operation rather than two: **if you rotate, you must re-send**, because otherwise the admin clicking "extend" to help someone silently breaks the link that person already has. So implement one endpoint; if the design insists on two buttons, make "extend" a label for it. OWASP's guidance is consistent but does not settle it directly — it requires tokens be CSPRNG-generated, "single use and expire after an appropriate period" and "invalidated after they have been used", and is silent on reissue. Treat the rotation argument as reasoning, not citation.
4. **Redemption must be race-safe and revoke must be immediate.** `UPDATE invitations SET accepted_at = … WHERE id = … AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()` and check the affected row count — a read-then-write lets a double-clicked link create two memberships. Revocation is a status the redemption path checks, not merely a deleted row. Reuse the existing per-address cooldown and per-IP limiter on resend, since each one costs a Brevo send.
5. 30 days is long next to this app's 24-hour confirmation and 1-hour reset, but the token grants *workspace membership*, not account control, so it is defensible — provided it is single-use, revocable, and every issue/resend/revoke lands in the audit log the same spec asks for.

## What I could not confirm

- **Sentry's Web API rate limits for the free plan.** `docs.sentry.io/api/ratelimits/` describes a fixed-window per-second limiter and a concurrency limiter and says "Each endpoint has its own maximum number of requests and window size", but publishes no numbers and no per-plan breakdown. If the console polls the issues endpoint, read `X-Sentry-Rate-Limit-*` from a real response and cache server-side. Unverified.
- **Whether Chrome's "Blob whose type is not CORS safelisted" restriction on `sendBeacon` applies same-origin.** MDN's compat note (via crbug 40087600, still open) does not qualify it. Using `text/plain` sidesteps the question; I did not test the `application/json` case in a browser.
- **Nivo's marginal bundle cost** — not measured, because the funnel-is-Pro finding removed the reason to take any chart library. If you decide you want a library after all, measure Nivo the same way before choosing between it and Recharts.
- **MUI's pricing page rendered both "perpetual" and "annual" framings around the same $299 figure** and I could not cleanly separate two SKUs from it. The number that matters — $299/year/developer, no free tier for personal or open-source use, 50 % education/non-profit discount — is confirmed; the exact perpetual-vs-subscription mechanics are not. Only matters if you decide to buy.
- **`@sentry/react` against GlitchTip** is GlitchTip's own claim ("Our app is compatible with Sentry client SDKs, but easier to run"), not something I tested. It is the basis of the low-exit-cost claim, so verify it before relying on it as an escape hatch.
- All bundle figures are my own measurements on a scratch project, not vendor figures; they will drift with library versions. Bundlephobia and bundlejs were both unavailable (rate-limited / empty) on the day, which is why they were measured locally. Method is recorded above so they can be re-run.

## Sources

Checked 2026-08-10.

- [registry.npmjs.org/@mui/x-charts/latest](https://registry.npmjs.org/@mui/x-charts/latest) — v9.11.1, `"license": "MIT"`, peer `@mui/material ^7.3.0 || ^9.0.0`, React 19 supported.
- [registry.npmjs.org/@mui/x-charts-pro/latest](https://registry.npmjs.org/@mui/x-charts-pro/latest) — v9.11.1, `"license": "SEE LICENSE IN LICENSE"`, depends on `@mui/x-license`.
- `unpkg.com/@mui/x-charts@9.11.1/index.d.ts` and `unpkg.com/@mui/x-charts-pro@9.11.1/index.d.ts` — the authoritative split. MIT exports `BarChart … SparkLineChart, Gauge, RadarChart`; Pro adds `Heatmap`, `SankeyChart`, `FunnelChart`, `ChartZoomSlider`. **This contradicted a docs-overview reading** that put Sankey and Treemap in Community — the shipped typings are what to trust.
- [mui.com/x/react-charts/funnel/](https://mui.com/x/react-charts/funnel/) — "Pro plan" badge, `import { FunnelChart } from '@mui/x-charts-pro/FunnelChart'`.
- `unpkg.com/@mui/x-charts-pro@9.11.1/LICENSE` — "MUI X Pro … is commercial software. You MUST agree to the End User License Agreement".
- [mui.com/pricing/](https://mui.com/pricing/) — "$299 / year / dev" for Pro, "$599 / year / dev" for Premium; "we offer a 50% discount … to students, instructors, non-profit, and charity entities"; no free tier beyond MIT Community.
- [mui.com/x/introduction/licensing/](https://mui.com/x/introduction/licensing/) — per-developer seat rule; 30-day non-production evaluation.
- [registry.npmjs.org/recharts/latest](https://registry.npmjs.org/recharts/latest) — 3.10.1, MIT, React 19 peer, `react-is` peer, RTK/react-redux/immer as runtime deps.
- Local measurement (Vite 8.2.1, gzip -9) — baseline 87.1 kB gz; `+10.0` d3-scale+d3-shape, `+97.5` recharts, `+100.4` x-charts sparkline only, `+110.2` x-charts bar+sparkline, `+28.3` @sentry/react, `+5.9` `mangle.keepNames`.
- Local build test — `AdminOverviewCard` occurs **0** times in default-minified output and **1** time with `mangle.keepNames`; `rolldown` `MangleOptions.keepNames` is documented in `node_modules/rolldown/dist/shared/binding-CVtkJvyl.d.mts`.
- `docs/vendor/react/reference/react/captureOwnerStack.md` (vendored React docs) — "Owner Stacks are only available in development"; "It will be `undefined` in production builds."
- `docs/vendor/react/reference/react-dom/client/createRoot.md` — `onCaughtError` / `onUncaughtError` / `onRecoverableError` and `errorInfo.componentStack`.
- [docs.sentry.io/concepts/data-management/event-grouping/](https://docs.sentry.io/concepts/data-management/event-grouping/) — "All versions consider the `fingerprint` first, the `stack trace` next, then the `exception`, and then finally the `message`."
- [docs.sentry.io/api/events/list-a-projects-issues/](https://docs.sentry.io/api/events/list-a-projects-issues/) — `count`, `userCount`, `culprit`, `firstSeen`, `lastSeen`, `stats`; `statsPeriod` ∈ `24h` (default), `14d`, `""`.
- [sentry.io/pricing/](https://sentry.io/pricing/) — Developer plan: 5 k errors, 50 replays, 5 M spans, one user; Team from $26/mo.
- [docs.sentry.io/security-legal-pii/security/data-retention-periods/](https://docs.sentry.io/security-legal-pii/security/data-retention-periods/) — errors: Developer 30 days, Team 90, Business/Enterprise 90.
- [glitchtip.com/pricing](https://glitchtip.com/pricing) — free "Up to 1,000 events/mo"; $15 at 100 k. [glitchtip.com/documentation/install](https://glitchtip.com/documentation/install) — PostgreSQL 14+, optional Valkey/Redis 7+, "512 MB RAM" recommended / "256 MB … all-in-one". [glitchtip.com](https://glitchtip.com/) — "Our app is compatible with Sentry client SDKs". [gitlab.com/glitchtip/glitchtip-backend](https://gitlab.com/glitchtip/glitchtip-backend) — MIT.
- [MDN: Navigator.sendBeacon](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon) — POST only, 64 KiB, no custom headers; MDN itself points to `fetch` + `keepalive` for anything else. [MDN: RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit) — keepalive body limited to 64 KiB. `@mdn/browser-compat-data` 8.0.10 (2026-08-06) — `Request.keepalive`: Chrome 66, Firefox 133, Safari 13; `sendBeacon` Chrome note on non-safelisted Blob types (crbug 40087600).
- [learn.microsoft.com — SQL Server provider: Temporal Tables](https://learn.microsoft.com/en-us/ef/core/providers/sql-server/temporal-tables) — the feature is documented as a SQL Server provider capability; generated DDL is T-SQL `SYSTEM_VERSIONING`.
- [nuget.org/packages/Audit.NET/](https://www.nuget.org/packages/Audit.NET/) — MIT, 32.2.0, published 2026-06-12, targets through .NET 10.
- [postgresql.org/docs/16/brin-intro.html](https://www.postgresql.org/docs/16/brin-intro.html) — BRIN is for "very large tables in which certain columns have some natural correlation with their physical location within the table".
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) — CSPRNG, "single use and expire after an appropriate period", "invalidated after they have been used". **Looked authoritative for the resend/extend question and is not** — it does not address reissue at all.
- Repo constraints that narrowed this: `WebChat/WebChat/ClientApp/vite.config.ts:50-62` (no production sourcemaps, "there is no error tracker to upload it to yet"), `.do/app.yaml` (`basic-xxs` 512 MB $5/mo, single instance; `databases: engine PG, version 16, production: false`), `docs/ctx/2026-08-09-bundle-splitting.md` (216 kB gz render-blocking payload), [DO App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/) ("Development databases cost $7.00 per month per 512 MB database").
