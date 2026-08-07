# What linting and formatting should the React client adopt in 2026, and is Prettier still right alongside ESLint?

- **Date:** 2026-08-06
- **Status:** answered
- **Question:** What lint/format toolchain should `WebChat/WebChat/ClientApp` adopt, given it has none today — and does the mainstream "ESLint + Prettier" answer still hold?
- **Recommendation:** **oxlint + `eslint-plugin-react-hooks` (loaded as an oxlint JS plugin) + Prettier.** ESLint is not an option here — `typescript-eslint` hard-refuses TypeScript 7, which this repo already runs, and that rules out linting two thirds of the client.

## The short answer

The mainstream 2026 answer is still ESLint 10 + flat config + Prettier, and it is **not available to this repo**. The client has `typescript@7.0.2` installed; `typescript-eslint@8.66.0` declares `typescript: ">=4.8.4 <6.1.0"`, fails `npm install` with ERESOLVE, and — installed with `--legacy-peer-deps` anyway — throws at config load: *"typescript-eslint does not support TS 7.0."* No parser, no linting of the 41 `.ts`/`.tsx` files (of 61 total). TypeScript 7.0 ships no programmatic API at all; 7.1 is expected to, on no announced date.

That leaves tools with their own parsers. **oxlint 1.77.0** is the one that keeps everything worth keeping: it parses TS/TSX itself (never imports the `typescript` package), it has jsx-a11y, import, react and unicorn rules built in natively — which also sidesteps the fact that `eslint-plugin-jsx-a11y` and `eslint-plugin-import` still don't declare ESLint 10 support — and its `jsPlugins` feature loads `eslint-plugin-react-hooks@7.1.1` verbatim, compiler rules and all. I verified that end to end: the plugin's diagnostics under oxlint are byte-identical to ESLint's, including on `.tsx`.

Formatting stays **Prettier 3.9.6**. Biome's formatter is fine but you'd be adding a second Rust binary for a job Prettier already does; oxlint's own formatter (`oxfmt`) is 0.62.0 and not boring yet.

**Adoption cost is not "hundreds of errors."** Measured against the real `src/`: the config below produces **20 findings across 61 files**, 3 of which `--fix` clears automatically. Reaching zero is one sitting, which is what the repo's .NET 0-warning standard demands.

## What decides it

**One fact settles the tool choice: `typescript@7.0.2` is installed.** Everything else — speed, one-tool-vs-two, plugin taste — is secondary, because it eliminates the default answer outright.

Verified today by installing it:

```
npm error Could not resolve dependency:
npm error peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.66.0
```

and with `--legacy-peer-deps`:

```
typescript-eslint does not support TS 7.0.
Please see https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0
to run typescript-eslint using the TS 6 API.
See also https://github.com/typescript-eslint/typescript-eslint/issues/10940
```

There *is* an escape hatch — Microsoft's documented alias swap, `typescript: "npm:@typescript/typescript6@^6"` plus `@typescript/native: "npm:typescript@^7"` — but it demotes `npm run typecheck` back to the TS 6 checker, adds a second compiler to the tree, and undoes a deliberate TS 7 adoption (`tsconfig.json` even carries the comment *"TypeScript 7 removed baseUrl"*). For a personal project that is a bad trade against a tool that just works.

**The second deciding fact is narrower and points at oxlint over Biome:** only `eslint-plugin-react-hooks@7` has the React Compiler-powered rules (`set-state-in-effect`, `purity`, `refs`, `immutability`, `static-components`, `preserve-manual-memoization`). Biome has no equivalent — `biome explain noSetStateInEffect` returns *"Unrecognized option"*, and Biome's rule set stops at `useExhaustiveDependencies`. Those compiler rules are the only thing in the ecosystem that said anything at all about the effect that shipped the production loop (see below). oxlint can host them; Biome cannot.

Speed is **not** a deciding factor and should not be presented as one. On 61 files both oxlint and ESLint finish in ~3.5 s wall clock, nearly all of it npx/Node startup.

## Answers to the six questions

### 1. Flat config — the premise is one major version stale

It is **ESLint 10**, not 9. `eslint@10.8.0` is `latest` on npm (published 2026-07-24); v10.0.0 shipped February 2026.

- **`.eslintrc` is removed, not merely discouraged.** The migration guide states plainly: *"Starting with ESLint v10.0.0, the old configuration format is no longer supported."* `.eslintrc.*` and `.eslintignore` are not read, `--no-eslintrc` / `--env` / `--rulesdir` / `--ignore-path` are gone, `ESLINT_USE_FLAT_CONFIG` is ignored, and `new Linter({configType: "eslintrc"})` throws.
- The version that changed each thing: **v9.0.0** (April 2024) made `eslint.config.js` the default and eslintrc opt-in; **v10.0.0** (February 2026) removed eslintrc entirely.
- ESLint 10 requires Node ≥ 20.19. The client's Docker image is `node:22` and local Node is 24.18.1, so that is not a constraint here.

Moot for the recommendation, but worth recording so nobody writes an `.eslintrc` in 2026.

### 2. Prettier, Biome, or `@stylistic`?

**Prettier, yes — still.** But the *other* half of the pair changes.

- **`@stylistic`: skip it.** It exists because ESLint deprecated its core formatting rules in v8.53.0 (October 2023), and `@stylistic/eslint-plugin@5.10.0` is the maintained successor. But it solves "I want my linter to format." If Prettier formats, `@stylistic` is redundant surface area. Note also that ESLint **did not remove** the deprecated core formatting rules in v10 — ESLint's policy is not to remove rules — so nothing forces a decision here.
- **Biome is genuinely credible now** and the one-tool argument is real: `@biomejs/biome@2.5.7`, one binary, formatter + linter, own parser, TS-version-agnostic, 62 files linted in 19 ms. Default lint on the real `src/` gives 37 findings (13 errors, 24 warnings), 19 of them auto-fixable unused imports. It is a defensible choice and I nearly recommended it.
- **It loses on one specific thing**, which happens to be the thing this repo got burned by: no React Compiler rules, and its `useExhaustiveDependencies` is noisier in the wrong direction — 3 of its 5 hits on the current code are *"specifies more dependencies than necessary"*, which is a style opinion, while it says nothing about the compiler-rule violations oxlint found.
- **Formatting cost, either way:** Prettier `--check` fails on all 62 files; Biome `format` fails on all 62. A first-time format rewrites ~6,000 of 5,528 lines (12,176 diff lines at `printWidth: 100`; `printWidth: 120` only drops it to 11,739). That is a `git blame`-destroying commit. Do it as its own commit and add `.git-blame-ignore-revs`.

So: "ESLint + Prettier" as a *phrase* is still mainstream, but for this repo the correct shape is **fast-linter + Prettier**, and the fast linter is oxlint.

### 3. Which plugins earn their place

`tsc` already runs with `strict`, `noUnusedLocals` and `noUnusedParameters` — but note `allowJs: true, checkJs: false`. **`tsc` checks nothing at all in the 20 `.js`/`.jsx` files**, and those 20 files are the components (`ChatApp`, `ComposeDialog`, `ThreadList`, `ConversationPane`, every auth screen, `ThemeModeProvider`). That is exactly where hooks bugs live. The linter's marginal value is highest precisely where the typechecker is blind.

| Plugin | Verdict | What it catches that `tsc` does not |
|---|---|---|
| `typescript-eslint` | **Impossible** (TS 7) | Type-aware rules (`no-floating-promises`, `no-misused-promises`). Real loss, but recoverable later: oxlint has `--type-aware` via `oxlint-tsgolint@7.0.2001`, built on typescript-go, which *does* work with TS 7. |
| `eslint-plugin-react-hooks` | **Yes — the whole reason for the setup.** Load via oxlint `jsPlugins`. | Nothing in `tsc`'s vocabulary. Found 4 `set-state-in-effect` + 1 `static-components` in current code. See §4 for the caveat. |
| `eslint-plugin-react-refresh` | **No.** | Only relevant to HMR fast-refresh boundaries; a dev-loop nicety, and 0.5.3 is an ESLint-only plugin with no oxlint equivalent. Skip. |
| `eslint-plugin-jsx-a11y` | **Yes, but as oxlint's native `jsx-a11y`.** | Accessibility is invisible to `tsc`. Caveat: the npm plugin is at 6.10.2, last published **October 2024**, and its peer range tops out at `eslint@^9` — it does not claim ESLint 10 support. oxlint's native port dodges that. It fires 6× `no-autofocus` and 2× `prefer-tag-over-role` on current code; both are policy calls, not bugs. |
| `eslint-plugin-import` | **Marginal — use oxlint's native `import`.** | With `verbatimModuleSyntax` and `moduleResolution: bundler`, `tsc` already catches unresolved and type-only import mistakes. The npm plugin (2.32.0, June 2025) also caps at `eslint@^9`. Keep it for cycle detection only. |
| `@vitest/eslint-plugin` | **Use oxlint's native `vitest`, minus one rule.** | `require-mock-type-parameters` alone fires 14× on the test suite. Turn it off. |

### 4. Would `eslint-plugin-react-hooks` have caught the ComposeDialog loop?

**No. Not `exhaustive-deps`, not at any severity, not in v7.** I tested this rather than reasoning about it: checked out the pre-fix `ComposeDialog.jsx` and `ChatApp.jsx` from `4640633~1`, ran `eslint@10.8.0` with `reactHooks.configs.flat.recommended`, and `exhaustive-deps` reported **nothing** on `}, [q, open, onSearch]);`.

A control file confirmed the rule was live and correctly configured. It fires on:

- a genuinely missing dep — *"React Hook useEffect has a missing dependency: 'id'"* (warning);
- a function **defined in the same component** — *"The 'handler' function makes the dependencies of useEffect Hook change on every render. Move it inside the useEffect callback. Alternatively, wrap the definition of 'handler' in its own useCallback() Hook"* (warning).

It does **not** fire on a callback arriving as a **prop** and listed in the deps — the exact WebChat shape — because the rule is scope-local and cannot see the caller. And nothing fires at the call site on `onSearch={(t) => triggerDirectory(t).unwrap()}`. oxlint's native port and Biome's `useExhaustiveDependencies` behave identically on all four cases.

Severities in v7.1.1 `flat.recommended`, read from the package rather than the docs (react.dev's table says "error" for everything and is wrong on this): `exhaustive-deps` and `incompatible-library` and `unsupported-syntax` are **`warn`**; the other 13 rules are `error`.

**What it *would* have done is still worth something.** On the pre-fix file, `react-hooks/set-state-in-effect` fired twice — **at `error`** — at `ComposeDialog.jsx:26` (`if (!term) { setPeople([]); return undefined; }`) and `:44`, i.e. it put a build-breaking red flag on the exact effect that contained the bug, with the message *"Calling setState synchronously within an effect body causes cascading renders"* and a link to *You Might Not Need an Effect*. That is a different defect in the same code, and following the fix would have meant restructuring that effect. It is a real but **indirect** catch — do not record this as "the linter would have caught the loop," because it would not have.

Honest conclusion: **the plugin is worth adopting, but not on the strength of this bug.** Weight it for the 4 `set-state-in-effect` and 1 `static-components` errors it finds in *current* code, not for retroactive credit. The thing that would actually have caught the loop is the React Compiler itself (it auto-memoizes the inline arrow, removing the unstable identity) or the re-rendering-parent test harness that `compose-search.test.tsx` now has.

### 5. Adoption cost on this codebase

The "hundreds of errors" premise does not hold — the client is 5,516 lines across 61 files, written recently and in a modern style. Measured, not estimated:

| Setup | Findings on real `src/` |
|---|---|
| oxlint, default (correctness only, no plugins) | 6 |
| oxlint, config below (correctness + react-hooks JS plugin + a11y/import/vitest) | **20** (17 after `--fix`) |
| Biome, defaults | 37 (13 err / 24 warn) |
| ESLint 10 + `js/recommended` + react-hooks v7, **`.js`/`.jsx` only** | 24 (19 of them `no-unused-vars` on unused `import React`) |
| oxlint + `-W suspicious -W perf` | 185 — but 137 are `react/react-in-jsx-scope`, obsolete under the automatic JSX runtime. Disable it; the real number is 48. |

The 20 break down as: 4 `set-state-in-effect`, 1 `static-components`, 1 `exhaustive-deps` (6 genuine React findings), 6 `jsx-a11y/no-autofocus` + 2 `prefer-tag-over-role` (policy calls — the dialogs autofocus deliberately), 3 `no-unused-vars`, 3 `unicorn/no-useless-fallback-in-spread`.

**So skip the warn-first ratchet.** It is machinery for a problem this repo does not have, and a permanent warning backlog would clash with the .NET side's 0-warning standard. Land it as errors, fix the 20 in one sitting, and wire `--deny-warnings` so the client matches the same bar. Suggested order: (1) `oxlint --fix`, (2) fix the 6 React findings by hand, (3) decide the a11y rules — `no-autofocus` is a legitimate accessibility complaint, so either drop `autoFocus` or turn the rule off deliberately with a comment, (4) Prettier as a separate commit with `.git-blame-ignore-revs`.

### 6. Interaction with `tsc --noEmit` and `vitest`

- **They do not overlap much, which is the point.** `tsc` covers `.ts`/`.tsx` only (`checkJs: false`); the linter is the only thing looking at the 20 `.js`/`.jsx` files, and the only thing that understands hooks anywhere.
- **Do not turn on `checkJs`** to close that gap — it would fail the build on files mid-migration, which is what the tsconfig comment already says.
- `noUnusedLocals`/`noUnusedParameters` mean `tsc` and the linter both report unused variables in TS files. Harmless duplication; leave both on, since only one of them covers JSX files.
- **oxlint's `--type-aware` mode is the future recovery path** for what `typescript-eslint` would have given: it uses `oxlint-tsgolint@7.0.2001`, whose version tracks TS 7.0.2. I confirmed the mode launches and reads `tsconfig.json`; I did **not** verify any type-aware rule firing inside the real project. Treat it as a later upgrade, not part of day one.
- **Vitest:** oxlint's native `vitest` plugin is worth enabling but `require-mock-type-parameters` fires 14× — turn it off. Also add a test override: `react-hooks/immutability` errors on `compose-search.test.tsx:28` (`PARENT.renders += 1`), which is a deliberate render counter, not a bug.
- **Script ordering:** lint and typecheck are independent. Run lint first (cheaper, catches the mechanical stuff), then typecheck, then tests.

## Concrete config

All paths relative to `WebChat/WebChat/ClientApp`. This exact `.oxlintrc.json` was run against a copy of the real `src/` and produces the 20 findings above.

**Install** (4 dev deps):

```bash
npm i -D oxlint@^1.77.0 eslint-plugin-react-hooks@^7.1.1 prettier@^3.9.6
# optional, only when you want type-aware rules later:
# npm i -D oxlint-tsgolint@^7.0.2001
```

**`.oxlintrc.json`**

```json
{
  "plugins": ["react", "unicorn", "oxc", "import", "jsx-a11y", "typescript", "vitest"],
  "jsPlugins": [{ "name": "rh", "specifier": "eslint-plugin-react-hooks" }],
  "categories": { "correctness": "error" },
  "env": { "browser": true, "es2024": true },
  "rules": {
    "rh/rules-of-hooks": "error",
    "rh/set-state-in-effect": "error",
    "rh/set-state-in-render": "error",
    "rh/purity": "error",
    "rh/refs": "error",
    "rh/immutability": "error",
    "rh/static-components": "error",
    "rh/preserve-manual-memoization": "error",
    "rh/error-boundaries": "error",
    "rh/use-memo": "error",
    "react-hooks/exhaustive-deps": "error",
    "react/react-in-jsx-scope": "off",
    "vitest/require-mock-type-parameters": "off"
  },
  "overrides": [
    {
      "files": ["**/*.test.{ts,tsx,js,jsx}", "**/test/**"],
      "rules": { "rh/immutability": "off", "rh/purity": "off" }
    }
  ],
  "ignorePatterns": ["dist", "node_modules"]
}
```

Two things in there are load-bearing and non-obvious:

- **The alias `rh` is mandatory.** `"react-hooks"` is a reserved plugin name in oxlint — using it for a JS plugin is a hard config error, because oxlint has its own native `react-hooks`. So `rh/*` are the ESLint plugin's rules (including all the compiler rules), and bare `react-hooks/exhaustive-deps` is oxlint's native port. Both are wanted: keep the native `exhaustive-deps` (it's the Rust one, and the JS plugin's copy would duplicate it) and take everything else from `rh/`.
- **`react/react-in-jsx-scope: off`** is not optional. Left on it produces 137 findings against the automatic JSX runtime.

**`.prettierrc.json`**

```json
{
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "arrowParens": "always"
}
```

**`.prettierignore`**

```
dist
node_modules
package-lock.json
```

**`.editorconfig`** — put it at the repo root, but **without a `[*.cs]` section**. Visual Studio and Rider read `.editorconfig` for C# formatting and analyzer severities; adding C# sections risks new warnings on a .NET side that currently builds clean at 0.

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.{md,markdown}]
trim_trailing_whitespace = false
```

**`package.json` scripts** — add four, change none:

```json
"lint": "oxlint --deny-warnings",
"lint:fix": "oxlint --fix",
"format": "prettier --write .",
"format:check": "prettier --check .",
"verify": "npm run lint && npm run format:check && npm run typecheck && npm run test"
```

`--deny-warnings` makes warnings exit non-zero — the client equivalent of the .NET 0-warning standard.

## Options, and what each costs

**A. oxlint + react-hooks JS plugin + Prettier — recommended.**
Per-unit: free. Fixed: 3 dev deps (~2 native binaries: oxlint, plus Prettier's pure JS). Setup: one afternoon including the 20 fixes and the format commit. Ongoing: near zero; oxlint releases weekly but config is one JSON file. Rules out: nothing permanent. Right choice because it is the only option that keeps the React Compiler rules while working with TS 7.

**B. Biome alone (the one-tool answer).**
Per-unit: free. Fixed: 1 dep, 1 binary. Setup: slightly cheaper than A (37 findings, 19 auto-fixable). Ongoing: lowest of all. **What it costs you:** the compiler rules, permanently — that is a Biome roadmap question, not a config one. Right choice if you decide `useExhaustiveDependencies` + formatting is enough and you value one dependency over React-specific depth. Defensible; I would not argue hard against it.

**C. ESLint 10 + typescript-eslint + Prettier (the mainstream answer).**
Requires the TS 6 alias swap: `typescript: "npm:@typescript/typescript6@^6"`, `@typescript/native: "npm:typescript@^7"`, and rewiring `typecheck` to the native binary. Costs: two compilers in the tree, a downgraded checker, plus `eslint-plugin-jsx-a11y` and `eslint-plugin-import` both declaring peer `eslint@^9` and no `^10`. Becomes the right choice the day typescript-eslint supports TS 7.1 — at which point switching is half a day.

**D. ESLint on `.js`/`.jsx` only.**
Zero extra machinery, works today, but covers 20 of 61 files. Tempting because those 20 are the components. Rejected: it leaves the whole Redux/RTK Query/service layer unlinted and nobody will remember why.

**Cost to stop is low for all of them.** Lint config is one file; there is no data, no lock-in, no migration. `eslint-plugin-oxlint` even exists to run the two side by side and switch off duplicated rules. The only irreversible-ish act in this whole plan is the **Prettier reformat commit**, which rewrites ~6,000 lines and breaks `git blame` — mitigate with `.git-blame-ignore-revs` and `git config blame.ignoreRevsFile .git-blame-ignore-revs`, and note that hooks and git config are per-clone, same as `core.hooksPath` already is here.

## What I could not confirm

- **oxlint's `jsPlugins` is officially "in alpha"** (announced 2026-03-11, still labelled alpha in the docs today). This is the main risk in the recommendation. It worked correctly in every test I ran, and `eslint-plugin-react-hooks` is on oxlint's conformance-tested list — but it is alpha. **Graceful fallback if it breaks:** delete the `jsPlugins` line and the `rh/*` rules; you keep oxlint's native `react-hooks/exhaustive-deps` and `rules-of-hooks` and lose only the compiler rules. One-line degradation, no re-platforming.
- **`--type-aware` was not verified producing findings** in the real project — I confirmed only that the mode launches and reads `tsconfig.json` (it errored on missing `@types/node` in my scratch copy, which the real project has). Whether the type-aware rule set is worth enabling is untested.
- **No date for TypeScript 7.1** or for typescript-eslint's TS 7 support. Issue #10940 is open, labelled "blocked by external API", and lists three unsolved problems: ESLint has no async parser support, tsgo is consumed via native/WASM bindings, and AST/type marshalling between Go and JS needs design work. Treat "ESLint becomes available again soon" as unfounded.
- **Biome's Prettier-compatibility percentage** — the docs page lists intentional divergences but states no figure. Irrelevant to the recommendation, but do not repeat the "97%" number from older blog posts without rechecking.
- I did not benchmark Biome vs oxlint vs ESLint at a size where speed matters. At 61 files it does not.
- **Adjacent, found while researching a11y:** `index.html:6` sets `minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no`. If pinch-zoom is later disabled to make the app feel native, note that `user-scalable=no` / `maximum-scale=1` is a WCAG 1.4.4 failure, and no linter here will catch it — `jsx-a11y` and Biome both lint JSX, not `index.html`.

## Sources

Checked 2026-08-06 unless noted. Versions and peer ranges were read from the npm registry directly (`npm view`), not from documentation.

- **npm registry** — `eslint@10.8.0`; `typescript-eslint@8.66.0` peers `eslint: ^8.57.0 || ^9.0.0 || ^10.0.0`, `typescript: ">=4.8.4 <6.1.0"`; `eslint-plugin-react-hooks@7.1.1`; `eslint-plugin-jsx-a11y@6.10.2` (last published 2024-10-26, peers max `^9`); `eslint-plugin-import@2.32.0` (peers max `^9`); `@biomejs/biome@2.5.7`; `oxlint@1.77.0`; `oxfmt@0.62.0`; `prettier@3.9.6`; `@stylistic/eslint-plugin@5.10.0`; `typescript` dist-tags `latest: 7.0.2`, `next: 7.1.0-dev`. Established every version and compatibility claim above.
- [Migrate to v10.x — ESLint](https://eslint.org/docs/latest/use/migrate-to-10.0.0) — established that eslintrc is *removed*, the Node ≥ 20.19 floor, and the three new `eslint:recommended` rules.
- [ESLint v10.0.0 released](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/) — release date, February 2026.
- [Deprecation of formatting rules — ESLint](https://eslint.org/blog/2023/10/deprecating-formatting-rules/) — v8.53.0 deprecation; the reason `@stylistic` exists.
- [Announcing TypeScript 7.0 — Microsoft DevBlogs](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) — TS 7.0 released 2026-07-08, ships **no** API, 7.1 expected to; the exact npm-alias side-by-side recipe.
- [typescript-eslint issue #10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) — open, "blocked by external API", the three unsolved problems. Note: several blog posts claim this issue was "closed as not planned" — **that is wrong**, it is open. Do not trust the summaries here.
- [eslint-plugin-react-hooks — react.dev](https://react.dev/reference/eslint-plugin-react-hooks) — the v7 rule list. **Its severity column is unreliable**: it presents all rules as "error", whereas the shipped `flat.recommended` sets `exhaustive-deps`, `incompatible-library` and `unsupported-syntax` to `warn`. Severities above were read from the package.
- [Oxlint JS Plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html) and [the alpha announcement](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html) — `jsPlugins` syntax, alpha status, the conformance-tested list including `eslint-plugin-react-hooks`, and the two documented limitations (no custom parsers; no type-aware ESLint rules).
- [Biome — differences with Prettier](https://biomejs.dev/formatter/differences-with-prettier/) — intentional divergences; states no compatibility percentage.
- **Local, reproducible** — the ERESOLVE failure, the `"typescript-eslint does not support TS 7.0."` throw, the pre-fix `ComposeDialog.jsx` lint run showing zero `exhaustive-deps` output, the four-case control file, and every finding count. Scratch harness at `…/scratchpad/lintprobe`; re-run by copying `ClientApp/src` next to the configs above.
