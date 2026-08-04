---
name: checkpoint
description: Close out a completed code change by updating CLAUDE.md when a fact in it has gone stale or a new trap is worth the context cost, and capturing a ctx note for back-tracking. Use after EVERY completed change - feature, refactor, upgrade, bug fix, dependency bump, config or infrastructure change - before reporting the work as done. Also use when the user says "checkpoint", "wrap this up", "update the docs", or asks whether CLAUDE.md is still accurate.
---

# checkpoint — close out a change

Three artefacts outlive any change: **CLAUDE.md**, which every session loads before doing
anything; **`docs/ctx/ORIENTATION.md`**, the repo map read when starting cold; and the dated
notes in **`docs/ctx/`**, read on demand. This skill decides what belongs in each and makes
sure none is left saying something that is no longer true.

Run it *before* reporting work as done, not as a separate task later. The facts are
freshest now, and a change reported as finished rarely gets revisited.

## The split

|  | CLAUDE.md | ORIENTATION.md | `docs/ctx/` note |
|---|---|---|---|
| Read | Every session, always | Starting cold on an area | On demand, when relevant |
| Costs | Context in every conversation | Nothing until opened | Nothing until opened |
| Holds | What is true *now* and changes how you approach a task | Where things live, how they fit | What was learned, decided, tried and rejected |
| Bar | High — must earn permanent context | Medium — keep the map accurate | Low — one per non-trivial change |

A ctx note is nearly always the right home. CLAUDE.md is for the handful of facts that would
send someone down the wrong path if they did not know them up front. ORIENTATION.md is not
a log — it is a map, so it gets *corrected*, never appended to.

## Step 1 — audit CLAUDE.md for staleness

**Do this first, and do it every time.** It matters more than adding anything new: a stale
line in CLAUDE.md is worse than a missing one, because it is loaded as fact and actively
misleads, while a missing one merely costs a lookup.

Read CLAUDE.md **and `docs/ctx/ORIENTATION.md`** and check every claim your change could have
touched. Verify against the repo, not from memory: prose has no compiler to catch it
drifting, so these files rot silently and in step with how much the repo improves.

Four patterns account for nearly all of it — check each explicitly:

| Pattern | How to check |
|---|---|
| Dependency versions in prose | Read them out of `package.json` / `.csproj`, never recall them |
| File extensions after a JS→TS migration | `ls` each path the docs name — `config.js`, `mocks.js` and `theme.js` were all cited long after becoming `.ts` |
| Renamed or deleted paths, profiles, commands | Confirm each one resolves; launch profiles and script names go stale quietly |
| A replaced technology named in passing | `grep -i` the old name across the docs — a swapped database or bundler leaves mentions scattered far from the section about it |

Both files are prone to it. A single pass found eight stale claims in CLAUDE.md and four in
ORIENTATION.md, none of them in the section the change had touched.

If a claim is now false: fix it, or delete it if it no longer earns its place.

## Step 2 — decide whether anything new belongs in CLAUDE.md

Add a line **only** if it clears this bar. Ask: *would an agent starting cold waste real
time, or make a wrong decision, without knowing this?*

Add when the change introduced:

- **A trap that is invisible from the code.** A library that fails in a way whose error
  message points somewhere else; a platform default that breaks a working setup; an
  ordering requirement nothing in the source hints at.
- **A hard constraint on future work.** "Every stored DateTime must be UTC — Npgsql throws
  rather than guessing" stops a whole class of bug before it is written.
- **A changed workflow or command.** How to build, run, migrate, deploy, or supply secrets.
- **A deliberate choice that looks like a mistake.** Anything a reader would otherwise
  "fix" — Newtonsoft over System.Text.Json here being the standing example.

Do **not** add:

- Feature descriptions, or what a class does — that is what reading it is for.
- Anything discoverable from a file the agent would open anyway.
- The reasoning behind a decision. State the constraint in CLAUDE.md; put the reasoning in
  the ctx note and link it.
- A bug fix, unless it leaves behind a rule that future work must respect.

Keep the existing voice: terse, load-bearing, and always saying *why*, because a rule
without a reason gets overridden the first time it is inconvenient.

**Adding costs something.** CLAUDE.md is loaded in full, every session, forever — it only
grows unless someone actively prunes it. So when you add:

- Prefer **editing an existing bullet** over adding a neighbouring one. Related facts
  belong in one place; two bullets on the same subject drift apart.
- Ask what can now **go**. A trap that the build fails on, or a constraint the type system
  enforces, no longer needs a line — the code catches it. `IncludeSpaOutput` erroring on an
  empty `dist` is exactly that kind of replacement.
- If a bullet needs more than a few lines to explain, it belongs in a ctx note, with at
  most a one-line pointer here.

## Step 3 — capture the ctx note

Follow **`.claude/skills/ctx/SKILL.md`** — it owns the format, the filename convention and
the index update. Do not restate its rules here or write a note in a different shape.

Delegate it to the `ctx-writer` subagent in the background and carry on; give it the facts,
including anything you could not verify.

## Step 4 — reconcile, then commit

Documentation that contradicts itself is worse than none, because both copies then have to
be checked. Before committing:

- Every CLAUDE.md line you added or changed states a **constraint**; the ctx note carries
  the **reasoning**. Neither should duplicate the other, and neither should contradict it.
- The row you added to `docs/ctx/README.md` makes the note findable from the area it
  concerns — not just from its date.
- ORIENTATION.md's map matches what the change actually left behind.

Then commit. **Running this skill after committing the code is normal and fine** — the code
lands when it is verified, and documentation follows. In that case put it in its own
`docs: …` commit rather than amending. Only fold it into the code commit when you happen to
run the skill first.

`ctx-writer` writes files but never commits, so its note is yours to stage.

## Rules

- **Staleness beats novelty.** Correcting a wrong line is worth more than adding a right
  one. Never skip Step 1 because the change seemed small.
- **Verify before writing.** Both files are read later as fact. Check versions and paths
  against the repo; mark anything unconfirmed as unconfirmed.
- **Nothing in CLAUDE.md without a reason attached.**
- **You own the commit.** `ctx-writer` writes files; it does not commit. Documentation goes
  in the same commit as the change it describes, or immediately after as `docs: …`.
- **Skip only for genuinely trivial edits** — a typo, formatting, a one-line rename. When
  unsure, the ctx note is cheap; write it.
