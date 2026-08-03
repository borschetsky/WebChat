---
name: git-convention
description: Branch naming and commit message conventions for this repo. Use before creating a branch, before committing, or when opening a PR - and whenever the user says "create a branch", "commit this", "name this branch", "what should I call this branch", or asks about commit message format.
---

# Git conventions

Branch names and commit messages in this repo follow `type/kebab-description` and
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) respectively.

The default branch is **`master`**. Remote is `github.com/borschetsky/WebChat`.

## Branch naming

```
<type>/<short-kebab-description>
```

| Type | Use for | Example |
|---|---|---|
| `feature/` | New functionality | `feature/group-chat-threads` |
| `bugfix/` | Fixing a defect on a development branch | `bugfix/message-scroll-jump` |
| `hotfix/` | Urgent fix against production | `hotfix/jwt-expiry-check` |
| `refactor/` | Restructuring with no behaviour change | `refactor/extract-thread-mapping` |
| `docs/` | Documentation only | `docs/context-notes-index` |
| `test/` | Adding or improving tests | `test/auth-service-coverage` |
| `chore/` | Dependencies, tooling, build, upgrades | `chore/dotnet-10-upgrade` |
| `release/` | Release preparation | `release/1.2.0` |

**Rules**

- Lowercase only. Words separated by **hyphens**, never underscores or spaces.
- Alphanumerics and hyphens in the description; the only `/` is after the type.
- Keep it under ~50 characters. Describe the *change*, not the files touched.
- One topic per branch. If the description needs "and", it is probably two branches.
- Never commit directly to `master` — branch first, always.
- Avoid bare `dev/…`. The repo's history has `dev/docker`, which predates this
  convention; do not copy it.

Optionally prefix an issue id when one exists: `feature/42-group-chat-threads`.

## Commit messages

```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

**Types:** `feat` (new feature, MINOR), `fix` (bug fix, PATCH), `docs`, `style`,
`refactor`, `perf`, `test`, `build`, `ci`, `chore`.

**Scopes for this repo** — the project or area touched: `api`, `hub`, `services`,
`data`, `connection`, `avatar`, `client`, `docker`, `db`, `deps`.

**Breaking changes:** append `!` before the colon, and/or add a `BREAKING CHANGE:`
footer explaining the migration.

```
feat(hub): broadcast typing status per thread
fix(client): guard err.response so network errors do not crash the form
build(deps)!: retarget solution from netcoreapp3.1 to net10.0
docs: add context note for the Vite migration
```

**Rules**

- Subject in the **imperative** mood — "add", not "added"/"adds".
- Subject under 72 characters, no trailing period, lowercase after the colon.
- Explain **why** in the body, not what — the diff already shows what.
- One logical change per commit. Split unrelated work rather than bundling it.
- Never write `WIP`, `Some message`, `fixes`, or a bare filename as a subject.
- **No AI co-author trailer.** The repo owner is the sole author — see the
  **`commit-authorship`** skill.

## Procedure

1. **Check where you are.** `git status` and `git branch --show-current`. If on
   `master`, create a branch before doing anything else.
2. **Name the branch** from the table above, based on the dominant intent of the change.
3. `git switch -c <type>/<description>`
4. **Stage in logical groups.** Do not `git add -A` a mixed working tree — stage the
   files belonging to one concern, commit, then the next. Reviewers read commits.
5. **Verify before committing:** `git diff --cached --stat` to confirm the staged set is
   what the message claims.
6. Commit with a Conventional Commits message.
7. Do **not** push unless the user asked. Never force-push a shared branch.

## Notes

- Check `docs/ctx/README.md` for a context note covering the area first; if the work is
  non-trivial, record one with the `ctx` skill and commit it as `docs: …`.
- Generated output (`ClientApp/dist`, `bin`, `obj`, `node_modules`) is gitignored and must
  never be staged.
