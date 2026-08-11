# The admin console UI, built entirely on mocks

- **Date:** 2026-08-11
- **Type:** change
- **Scope:** `ClientApp/src/types/admin.ts`, `services/admin-mocks.ts`,
  `services/admin-service.ts`, `app/api/adminApi.ts`, `app/store.ts`, `app/App.jsx`,
  `app/ChatApp.jsx`, `features/settings/SettingsDrawer.jsx`, `features/admin/` —
  `AdminConsole.jsx`, `adminNav.ts`, `adminAccess.ts`, `AdminIcon.jsx`, `Panel.jsx`,
  `AuditRow.jsx`, `StatusChip.jsx`, `MemberDetail.jsx`, `InviteDialog.jsx`, and
  `sections/AdminOverview.jsx`, `AdminMembers.jsx`, `AdminInvitations.jsx`,
  `AdminErrors.jsx`, `AdminAuditLog.jsx`, `AdminPolicies.jsx`
- **Status:** done (commit `e9d493b`, branch `feature/67-workspace-roles`, pushed, no PR
  yet); ~2,700 lines added. Depends on the workspace role in commit `6419ee0` — see
  `2026-08-11-workspace-roles-and-bootstrap-admin.md`.

## Context
Issue #64's first slice: the admin console screen itself, gated on the real workspace role
but reading and writing mock data for everything inside it. Built from
`Chat Admin Console.dc.html`, inside the existing design handoff bundle (external, not
checked into this repo).

## What changed
Six sections behind a left rail on desktop / bottom navigation below 600px: Overview,
Members, Invitations, UI errors, Audit log, Policies.

- `AdminConsole.jsx` is the shell; `adminNav.ts` describes the six sections; `AdminIcon.jsx`
  maps the design's Material Symbols glyph names onto `@mui/icons-material` components.
- `services/admin-service.ts` is a seam mirroring `services/chat-service.ts`: every
  component reads and writes through it, never touching `admin-mocks.ts` directly. Every
  function is `async` even though the mocks underneath are synchronous, so a call site
  written against it does not need rewriting when a real endpoint lands.
- `app/api/adminApi.ts` — a separate RTK Query API (`reducerPath: 'adminApi'`,
  `fakeBaseQuery`), not more endpoints bolted onto `chatApi`. Confirmed by reading the file:
  `getOverview`/`getMembers`/`getInvites`/`getAudit`/`getErrors` queries and
  `setMemberStatus`/`setMemberRole`/`revokeInvite`/`extendInvite`/`sendInvites`/
  `setErrorStatus` mutations, each a thin `queryFn` wrapper around `admin-service.ts` with
  tag invalidation (e.g. blocking a member invalidates `Members`, `Overview`, and `Audit`
  because Overview's stat cards count by status).
- `App.jsx` — `AdminConsole` is `lazy(() => import('@/features/admin/AdminConsole'))`,
  never prefetched (unlike `ChatApp`, which has an explicit `prefetchChatApp()` on mount —
  see `2026-08-09-bundle-splitting.md`). A new `/admin` route renders `AdminRoute`, a small
  component (`App.jsx:323-336`) that waits for `useGetProfileQuery()` to resolve before
  deciding: while loading it renders nothing, and only after the profile arrives does it
  check `isAdminRole(profile.role)` and redirect to `/dashboard` or render the console.
  Rendering the redirect while still loading would otherwise bounce an owner off `/admin`
  on every hard refresh.
- `features/admin/adminAccess.ts` — `isAdminRole(role)` returns true only for `'owner'` or
  `'admin'`, denying anything else (including `undefined`/`null`) — mirrors
  `WorkspaceRole.CanAdminister` on the server (see the companion note on commit `6419ee0`).
  Comment in the file states plainly it decides only what to draw/where to navigate; the
  server re-checks every request.
- `SettingsDrawer.jsx` — the admin-console entry row is rendered only inside
  `isAdminRole(profile?.role) && (...)` (`SettingsDrawer.jsx:197-256`); there is no disabled
  or greyed-out state for non-admins. A `Typography` line under the row reads "You see this
  because you are a workspace {role}."

## Decisions and trade-offs
- **A separate `adminApi`, not more endpoints on `chatApi`.** The whole slice is lazily
  loaded behind `/admin` and almost nobody is an admin; folding it into `chatApi` would put
  the console's reducer and every one of its endpoints into the bundle that signing in
  already pays for. It is never prefetched, unlike `ChatApp`.
- **The `admin-service.ts` seam**, deliberately mirroring `chat-service.ts` — see
  `2026-08-03-mui-redesign.md` and CLAUDE.md's "UI components talk to `chat-service.ts`"
  rule for the precedent this follows. Mock fixtures in `admin-mocks.ts` are kept verbatim
  from the design handoff's own data so the rendered screen can be diffed against the design
  directly.
- **The entry row is absent for non-admins, not disabled.** The spec calls a greyed row a
  small information leak — it tells a member a private console exists at all.
- **The route guard is navigation, not authorization.** It decides where somebody lands,
  never what they may do; every endpoint eventually behind `/admin` must re-check the
  workspace role server-side. `AdminRoute` waiting on the profile query (rather than
  rendering optimistically) is the specific fix for a refresh-bounces-an-owner bug that
  would otherwise exist.
- Icons are mapped from the design's Material Symbols names to tree-shaken
  `@mui/icons-material` imports in `AdminIcon.jsx` rather than loading an icon webfont for a
  dozen glyphs — the app currently loads no icon font at all.
- Multi-select and the bulk action bar are desktop-only, per the spec: a mis-tap that blocks
  eleven people at once is not worth making possible on a phone.

## A dead end worth recording
A newer `ADMIN-HANDOFF.md` was provided as a URL but **404s at the server itself** — the
preview token is bound to that exact path, no file exists there, and every filename
variation tried returns "invalid preview token". If that document turns out to have
revisions beyond `Chat Admin Console.dc.html`, this console needs reconciling against it;
until then, do not spend time retrying the link.

## Not real
Every section reads and writes mock state that resets on reload: bulk block/unblock,
invite/extend/revoke/resend, error triage, and all nine policy switches. The only real
thing on the screen is the workspace role that gates reaching it at all — everything past
that gate is fixtures.

## Verified
`npm run verify` green per the commit message: 132 client tests, 0 lint warnings, Prettier
clean, typecheck clean. **Not verified in a browser** — no visual pass against the design
was performed, so any claim of matching the handoff pixel-for-pixel is inferred from the
markup, not confirmed by eye.

## Known issues / follow-ups
- No React-level test drives any admin component end to end (component files were read to
  confirm they exist and their shape; no test run was independently repeated for this note
  beyond the commit's own claim).
- No implementation plan yet for turning the five mocked sections into real endpoints —
  explicitly still owed, same as the "still mocked" features tracked for the main chat app
  (`mocks.ts`, per CLAUDE.md).
- Audit entries are unimplemented server-side; `AdminAuditLog.jsx` renders fixtures only.
- Mobile bottom navigation is implemented; other mobile adaptations the spec calls for
  (cards instead of tables) are only partly done.
- No PR opened yet for `feature/67-workspace-roles`.
