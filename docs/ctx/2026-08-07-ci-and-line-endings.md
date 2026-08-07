# CI, and the line-ending problem that turned out to be the opposite of the diagnosis

- **Date:** 2026-08-07
- **Type:** change
- **Scope:** `.github/workflows/ci.yml` (new), `.gitattributes` (new), `CLAUDE.md`. Issue #41.
- **Status:** done — workflow committed, **never executed** until the PR opens

## Context

Nothing ran before a merge. No `.github/` directory, no workflow, `master` unprotected, and
the merge box offered only "No conflicts with base branch". Four PRs had merged that day on
nothing but locally-run checks.

## What I found

**The line-ending diagnosis I handed the agent was inverted, and it checked rather than
believed me.** I had reported — to the user, and in the brief — that the repo *stores* CRLF
blobs and that CI on a Linux runner would therefore fail `prettier --check` on every client
file. `git ls-files --eol` says otherwise: **233 tracked text files, all `i/lf`.** Nothing
CRLF has ever been committed; `core.autocrlf=true` converted on the way in, as designed.

My error came from checking with `git show HEAD:<file> | od -c | grep '\r'`, which on Windows
with `autocrlf=true` applies the checkout conversion to the output. It reports CRLF for a blob
that is LF. **`git ls-files --eol` is the authoritative check**; `git show` is not.

So the failure was **local, not CI**. On a Windows working tree `format:check` failed on 77
files; a clone made with `core.autocrlf=false` — which is what a Linux runner gets — passed
cleanly. CI would have been green on day one either way. The real defect was that the repo's
own gate could not be run by its author, which is worse than a red CI and much quieter.

**Two tests skip, and they are the only conditional ones in the suite.** Both are
`SmtpEmailSenderIntegrationTests`, gated on `Email__SmtpUser`, `__SmtpKey`, `__FromAddress`
and `__TestRecipient` all being set; they send through a real Brevo relay. The expected CI
line is `Passed: 63, Skipped: 2` — more than 2 skipped means something stopped executing
rather than something being deliberately excluded, which is why the number is in a comment on
the test step.

## What changed

- **`ci.yml`**: `pull_request` + `push` to `master`, `permissions: contents: read`, and a
  concurrency group that cancels superseded PR runs but never a master run. Two jobs with no
  `needs:` between them, so a broken API and a broken client both report instead of the
  second hiding behind the first.
  - `api` — .NET 10, hand-rolled NuGet cache keyed on the csproj hashes, `restore` as its own
    step *without* `-warnaserror` (NuGet emits NU1900-class warnings for transient source
    trouble, and a nuget.org hiccup should not read as a code failure), then
    `build --no-incremental -warnaserror`, then `test --no-build`.
  - `client` — Node 22, `npm ci`, `npm run verify` as one step because `verify` is already
    the repo's own definition of "the client is OK"; splitting it here would create a second
    definition that drifts.
- **`.gitattributes`**: `* text=auto eol=lf` plus explicit `binary` for images and PDFs.

## Decisions and trade-offs

- **`.gitattributes` over `"endOfLine": "auto"` in `.prettierrc.json`.** The one-line Prettier
  option silences the symptom and leaves the repo with no EOL policy at all — and it would
  make Prettier *accept* CRLF blobs if a clone with `autocrlf=false` ever committed some,
  which would then fail for everyone else. `.gitattributes` was cheap here specifically
  because the blobs were already LF: `git add --renormalize .` staged **zero** changes, so
  there is no content commit and nothing for `.git-blame-ignore-revs`. Had the blobs actually
  been CRLF as I claimed, this would have been a second repo-wide rewrite and the trade would
  have looked very different.
- **Cost: a third per-clone ritual.** An existing working tree does not re-convert on its own
  and needs `git rm --cached -r . && git reset --hard`. Now in CLAUDE.md alongside
  `core.hooksPath` and `blame.ignoreRevsFile`.
- **`build`, never `publish`, in CI.** `IncludeSpaOutput` fails a publish when `ClientApp/dist`
  is empty and the `api` job has no Node.
- **No `paths:` filter**, deliberately. With `api`/`client` required, a docs-only PR would
  wait forever on a check that never runs. If that is ever wanted, the answer is a no-op job
  of the same name, not a filter.

## Verified

- `git ls-files --eol` → 233 `i/lf`, 7 `-text`. Re-checked independently rather than taken
  from the agent's report, because it contradicted what I had told the user.
- `git add --renormalize .` against the new `.gitattributes` → **no staged changes**.
- `dotnet build --configuration Release --no-restore --no-incremental -warnaserror` →
  **0 warnings, 0 errors**. `dotnet test` → **63 passed, 2 skipped**.
- `npm run verify` on the **Windows** tree → oxlint clean, *"All matched files use Prettier
  code style!"*, tsc clean, **89 tests across 11 files**. That line is the point: before
  `.gitattributes` the same command failed on 77 files here.
- Workflow YAML parses.
- **Not verified: the workflow itself.** It has never run — no runner, no action resolution,
  no cache hit. `actions/setup-dotnet@v6` resolving `10.0.x` on `ubuntu-latest` is assumed,
  and the NuGet cache key is reasoning rather than observation. First real evidence is the
  PR that adds it.
- Branch protection was **not** applied by the agent, deliberately — it is a repo setting,
  and it must be applied *after* `ci.yml` is on master or every PR hangs on a context that
  has never reported.

## Known issues / follow-ups

- **`npm run build` — the actual Vite bundle — is not in CI.** `verify` is lint, format,
  `tsc --noEmit` and vitest; none of them run the bundler, so a break that only appears at
  build time still passes. Notable given this repo once shipped a publish with no client at
  all.
- **No `packages.lock.json`**, so `dotnet restore` is not reproducible and transitive versions
  can float between runs. It is also why `setup-dotnet`'s built-in cache is unusable and the
  NuGet cache is hand-rolled.
- Issue #41's own body quotes stale counts (~49 xUnit, 61 vitest); actual are 65 and 89.
