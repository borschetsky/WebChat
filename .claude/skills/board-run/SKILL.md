---
name: board-run
description: Work the board end to end - pick items in priority order, delegate each to the board-item agent, then checkpoint, commit, PR, merge and move the card. Use when the user says "work the board", "continue with the backlog", "keep going down the ladder", or names several issues to work through. For a single issue with no intention of merging, use the board-item agent directly instead.
---

# board-run — drive the board, one item at a time

This runs in the **main session**, not in a subagent. Subagents cannot spawn subagents here —
`board-item` has no `Agent` tool — so the thing that delegates has to be you.

One item at a time, start to finish, then the next. Never several at once: every ctx note
adds a row at the top of `docs/ctx/README.md`, so two branches in flight always collide
there. That has already cost three rebases and a squashed integration branch.

## The loop

For each item, in order:

1. **Move the card to In Progress.** Not after — before. See *Updating the board*.
2. **Delegate to `board-item`** with a brief that carries the facts you already have.
3. **Verify its report yourself.** See *Never relay an agent's claim unchecked*.
4. **Run `checkpoint`** — CLAUDE.md and ORIENTATION audit, then the ctx note and its index row.
5. **Commit, push, open the PR.** `git-convention` for the message, `commit-authorship` for
   attribution.
6. **Wait for CI to be green.** `api` and `client` are required; the merge is blocked until
   both report.
7. **Merge**, confirm the issue closed, **move the card to Done**, and comment the outcome on
   the issue.
8. **Report to the user**, then start the next item.

Stop the loop and ask when an item needs a decision only the owner can make, when CI fails
for a reason you did not introduce, or when you find a defect outside the item's scope.

## Updating the board — the step that gets forgotten

**Closing an issue does not move its card.** `gh issue close` and the PR's `Closes #n` both
leave `Status` untouched, so the card sits wherever it was. Nine cards once ended up with no
`Status` at all, and two closed issues sat in Backlog, because `gh project item-add` sets
membership and nothing else.

The project is **V-Tech WebChat**, number 1, owner `borschetsky`:

```
project  PVT_kwHOAOppOs4BfZbr
Status   PVTSSF_lAHOAOppOs4BfZbrzhZsnTo
  Backlog     d1dbc5e8      In Progress  0f5fa2bd
  Todo        dcc7e83b      Done         ae295f5d
```

```bash
# the item id is per-card, not the issue number - look it up first
gh project item-list 1 --owner borschetsky --limit 60 --format json

gh project item-edit --id <ITEM_ID> --project-id PVT_kwHOAOppOs4BfZbr \
  --field-id PVTSSF_lAHOAOppOs4BfZbrzhZsnTo --single-select-option-id ae295f5d
```

A new issue needs `gh project item-add` **and** a `Status`, or it is invisible in every
column. **Before reporting the loop finished, re-list the board and confirm no item has an
empty `Status`** — that check is the only reason the last drift was found.

## Never relay an agent's claim unchecked

The agents are good and have still been wrong about load-bearing things. Both of these were
caught only because someone re-ran the check:

- An agent was briefed that the repo stores CRLF blobs. It checked: `git ls-files --eol`
  reports every tracked file as `i/lf`. **The brief was wrong**, and the agent was right to
  contradict it. Take the correction.
- An agent reported that a signed-out visitor never downloads the chat chunk, citing
  `index.html`, which genuinely does not preload it. The **browser network panel showed it
  fetched anyway**, by a prefetch on mount. The citation was true and the conclusion was not.

So: re-run the decisive command yourself, and prefer the check the agent could not do. If its
report contradicts something you told the user earlier, **correct the user** in the same
message you report the result.

## Traps this repo has actually hit

- **`dotnet build` alone is not a warning audit.** An incremental build skipped the test
  project and hid a real CS8603 while reporting 0 warnings. Use `--no-incremental`, and
  `-warnaserror` is what CI runs.
- **`npm run verify` never runs the bundler.** Lint, format, typecheck and tests all pass
  against a broken `vite build`. If the change touches the client build, build it.
- **Prove a fix by breaking it.** Revert the fix, watch the new test fail with the message you
  expect, restore. State plainly which tests reproduce the defect and which are only guards —
  a guard counted as a reproduction is an overclaim that outlives the PR.
- **Look at UI changes in a browser.** This repo shipped an unreachable forgot-password link
  and a group avatar stack that could only ever draw initials, both green in every test.
- **The design handoff predates MUI v9.** Slot names have been stale twice; which failure you
  get is luck — `additionalAvatar` is a type error, `inputProps` is dropped in silence.

## Rules

- **One item per branch, one branch at a time.**
- **The board update is part of finishing**, not follow-up. An item is not done until its card
  says so.
- **Verify before relaying.** Paste real output with real counts.
- **Say what you did not check.** Every note and PR here carries that section; it is what
  makes the rest trustworthy.
- **Do not decide what is the owner's to decide.** Canonical hostnames, sender addresses,
  anything with blast radius — surface it and stop.
