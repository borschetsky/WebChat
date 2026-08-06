# Client lint and format: oxlint + Prettier

- **Date:** 2026-08-06
- **Type:** change
- **Scope:** `WebChat/WebChat/ClientApp` (all of `src`), `.editorconfig`,
  `.git-blame-ignore-revs`, `CLAUDE.md`, `docs/ctx/ORIENTATION.md`
- **Status:** done, with one deliberate gap — nothing runs the linter automatically yet
  (see follow-ups)

## Context

The client had no linter and no formatter — the only automated checks were `tsc --noEmit`
and vitest. The ask was "a linter along with Prettier", which normally means ESLint. It
could not.

The decision was researched first, in
[`docs/research/2026-08-06-client-lint-format-setup.md`](../research/2026-08-06-client-lint-format-setup.md);
this note records what actually landed and what the implementation turned up that the
research did not predict. **Research notes expire — that one's version numbers rot; this one
records the shape of the setup, which does not.**

## What I found

**ESLint is unavailable here, and it is not a close call.** `typescript-eslint` declares
`typescript: ">=4.8.4 <6.1.0"`; the client runs `typescript@7.0.2`. Installing fails
ERESOLVE, and forced through with `--legacy-peer-deps` it throws *"typescript-eslint does
not support TS 7.0"* at config load. There is no parser, so ESLint would silently cover only
the 20 `.js`/`.jsx` files and leave the 41 `.ts`/`.tsx` ones unlinted. TypeScript 7.0 ships
no programmatic API at all.

**The linter's value is highest exactly where `tsc` is blind.** `tsconfig.json` sets
`allowJs: true, checkJs: false`, so `tsc` checks *nothing* in the 20 `.js`/`.jsx` files — and
those are the components: `ChatApp`, `ComposeDialog`, `ThreadList`, `ConversationPane`, every
auth screen, `ThemeModeProvider`. That is where hooks bugs live.

**oxlint's `jsPlugins` bridge works, and it is the whole reason for the tool choice.** It
loads `eslint-plugin-react-hooks@7.1.1` verbatim, including the React Compiler rules
(`set-state-in-effect`, `static-components`, `purity`, `refs`, `immutability`, …). Biome has
no equivalent and cannot get one from config.

**Two naming traps in `.oxlintrc.json`, both load-bearing:**

- `"react-hooks"` is a *reserved* plugin name in oxlint — using it for the JS plugin is a
  hard config error. Hence the alias `rh`. So `rh/*` are the ESLint plugin's rules, while
  bare `react-hooks/exhaustive-deps` is oxlint's own native Rust port. Both are wanted.
- `react/react-in-jsx-scope` must be `off` or it produces ~137 findings against the
  automatic JSX runtime.

**The finding count was 20, not "hundreds"** — 5,516 lines across 61 files, written recently
and in a modern style. Reaching zero was one sitting, as the research predicted.

**A formatter can silently break a linter suppression.** This was the one genuine surprise.
`// oxlint-disable-next-line` is *line-addressed*, and Prettier expanded
`if (!term) { setPeople([]); return undefined; }` into a block — which moved the offending
statement two lines down and detached the directive from it. Lint went from clean to failing
purely from reformatting. The fix is to put the directive on the statement, not on the
construct wrapping it (`ComposeDialog.jsx:83`).

**Prettier is not always idempotent.** `src/test/smoke.test.tsx` failed `--check`
immediately after a `--write` pass: the first pass broke
`vi.fn().mockResolvedValue({...})` across lines, the second collapsed it back. Two passes
converged. This is a known class of wobble on method chains, not a mistake in the config —
and it is a concrete argument for keeping `format:check` in the verify chain.

## What changed

**Tooling** — three dev dependencies: `oxlint@1.77.0`, `eslint-plugin-react-hooks@7.1.1`,
`prettier@3.9.6`. New `.oxlintrc.json`, `.prettierrc.json`, `.prettierignore` in
`ClientApp`; `.editorconfig` at the repo root, deliberately **without a `[*.cs]` section**
because Visual Studio and Rider read it for C# analyzer severities and the .NET side builds
clean at 0 warnings today.

**Five scripts**, changing none of the existing ones:

```
lint         oxlint --deny-warnings
lint:fix     oxlint --fix
format       prettier --write .
format:check prettier --check .
verify       lint && format:check && typecheck && test
```

**The 20 findings, resolved** (commit `2bfb28e`):

- 3 `unicorn/no-useless-fallback-in-spread` — auto-fixed. `...(x ?? {})` and `...x` are
  identical; spreading `undefined` into an object literal is a no-op.
- 3 unused identifiers removed — `ListItemButton` and `densityTokens` (plus its only
  consumer, `const d`) in `ThreadList.jsx`, `Skeleton` in `ConversationPane.jsx`.
- `ThemeModeProvider.jsx:52-63` — `setMode`/`setDensity`/`toggleMode` wrapped in
  `useCallback`, and the context value's `useMemo` now lists them. They were new functions
  every render, which is *why* the dependency was missing rather than merely unlisted.
- `ConfirmEmail.jsx:21` — a link with no token is now derived in the initial state,
  `useState(() => (token ? 'working' : 'invalid'))`, instead of being set from the effect.
  Also removes a frame of "Activating your account…" before it is replaced.

**Formatting** (commit `b51baba`) — `prettier --write .`, 46 files, +1,727/−589. Kept as its
own commit and listed in `.git-blame-ignore-revs` (commit `1dd7cac`).

## Decisions and trade-offs

**oxlint over Biome.** Biome is one binary instead of two dependencies and is genuinely
credible, but it has no React Compiler rules and no route to them from config —
`biome explain noSetStateInEffect` is an unrecognised option. Those rules are the reason to
adopt a linter here at all.

**oxlint over the TypeScript-6 alias escape hatch.** Microsoft documents running
`typescript: "npm:@typescript/typescript6@^6"` alongside `@typescript/native`, which would
make `typescript-eslint` work. Rejected: it demotes `npm run typecheck` to the TS 6 checker
and puts two compilers in the tree, undoing a deliberate TS 7 adoption, purely to keep a
tool that a different tool replaces cleanly.

**Errors, not a warning ratchet.** A permanent warning backlog would clash with the .NET
side's 0-warning standard, and at 20 findings there was nothing to ratchet.
`--deny-warnings` makes warnings fail too.

**`jsx-a11y/no-autofocus` turned off wholesale.** All six sites are dialogs and search
fields where focusing on open *is* the interaction. Removing `autoFocus` would be a UX
regression chosen by a linter, and new dialogs here should behave the same way, so a global
`off` is more honest than six inline suppressions.

**`jsx-a11y/prefer-tag-over-role` kept on, suppressed twice inline.** Different call: the
two sites are MUI components where the native tag cannot carry the styling — a `Chip` acting
as a radio inside a correct `radiogroup` (`ThreadList.jsx:94`), and a pill acting as a
separator (`DaySeparator.tsx:15`). Both are deliberate, but the rule is worth keeping for
new code.

**`rh/static-components` on `AttachmentCard.tsx:51` is a false positive, suppressed.**
`iconForFile` only looks a component up from the module-level `ICONS` map, so its identity is
stable per file extension and no state can be reset. The rule flags any capitalised local
rendered as JSX.

**Three `rh/set-state-in-effect` sites suppressed rather than fixed** — `ComposeDialog.jsx`
(×2) and `SettingsDrawer.jsx`. All three are the "reset state when a prop changes" shape,
whose idiomatic fix is remounting from a `key` at the call site — a change to `ChatApp`, and
a behaviour change, which does not belong in the commit that introduces the linter. One of
them is the very effect that caused the request loop in
[the ComposeDialog note](2026-08-04-compose-search-render-loop.md) and is pinned by a
regression test. **This is deferred work, not a verdict that the rule is wrong** — see
follow-ups.

**Prettier kept despite oxlint having its own formatter.** `oxfmt` is at 0.62.0 and not
boring yet; Prettier is.

## Verified

Run in `WebChat/WebChat/ClientApp` on the final tree:

- `npm run verify` → exit 0: oxlint clean, `prettier --check` reports *"All matched files use
  Prettier code style"*, `tsc --noEmit` clean, **61/61 tests in 7 files pass**.
- `npm run build` → succeeds (vite, 665 ms). Checked because Prettier reformatted
  `vite.config.ts`, `tsconfig.json` and `index.html`.
- **The react-hooks bridge was proved live, not assumed.** An empty lint run is
  indistinguishable from a plugin that failed to load, so a temporary file containing a
  deliberate `setState`-in-effect was linted: it reported `rh(set-state-in-effect)` as
  expected, then was deleted. The clean run is real.

**Not verified:** nothing was driven in a real browser. The `ThemeModeProvider` and
`ConfirmEmail` changes are behaviour-affecting and are covered only by the existing unit
tests and typecheck. Theme toggling, density switching and the activation screen were not
exercised by hand.

## Known issues / follow-ups

- **Nothing runs the linter automatically.** `.githooks/pre-commit` exists only on the
  unmerged `chore/checkpoint-hook` branch, and this work branched from `master`, so there was
  nowhere to add a gate without guaranteeing a merge conflict on that file. Add a client lint
  step to that hook once it lands — or in CI, of which the repo currently has none
  (`.github/workflows` does not exist).
- **The three deferred `set-state-in-effect` sites**, all suppressed with a reason at the
  site: `ComposeDialog.jsx:83` and `:113`, `SettingsDrawer.jsx:50`. The fix for all three is
  a `key` at the call site in `ChatApp`.
- **`oxlint --type-aware` is the recovery path** for what `typescript-eslint` would have
  given (`no-floating-promises` and friends). It uses `oxlint-tsgolint`, built on
  typescript-go, which does work with TS 7. Not installed, and **not evaluated at all here**.
- **`jsPlugins` is officially alpha.** It behaved correctly throughout, but if it breaks, the
  degradation is one line: delete `jsPlugins` and the `rh/*` rules, and oxlint's native
  `react-hooks/exhaustive-deps` and `rules-of-hooks` still work. Only the compiler rules are
  lost.
- **Pre-existing, untouched:** `npm audit` reports 2 high-severity advisories in
  `react-router` (RSC-mode CSRF bypass, GHSA-qwww-vcr4-c8h2). This app does not use RSC mode,
  and the fix is a downgrade to `7.11.0`. Present before this change; unrelated to it.
- **`.git-blame-ignore-revs` needs opting into once per clone**, the same as `core.hooksPath`:
  `git config blame.ignoreRevsFile .git-blame-ignore-revs`. GitHub honours it automatically.
