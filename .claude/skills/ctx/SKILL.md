---
name: ctx
description: Capture a durable context note for any exploration or change made to this repo. Use whenever you finish investigating an area of the codebase, complete a non-trivial change (upgrade, refactor, new feature, bug fix), or discover something about the system that is not obvious from the code itself. Also use when the user says "write a ctx", "log this", "capture context", or asks what was learned/changed previously.
---

# ctx — repo context notes

Every exploration or change to this repo gets a note under `docs/ctx/`. The point is
that the *next* person (or agent) starts from what was already learned instead of
re-deriving it. Code and git history already record *what* changed — a ctx note records
**what was learned, what was decided, and what is still true afterwards**.

## When to write one

Write a note when any of these happen:

- You explored a subsystem and now understand something non-obvious about it.
- You completed an upgrade, migration, refactor, feature, or bug fix.
- You hit a constraint, footgun, or breaking change that cost real time to diagnose.
- You made a judgment call that a reviewer might otherwise reverse without knowing why.

Do **not** write one for trivial edits (typo, formatting, a one-line rename), or to
restate something the code or `git log` already says plainly.

## Procedure

1. **Check for an existing note first.** Read `docs/ctx/README.md`. If a note already
   covers this area, update it in place rather than adding a near-duplicate. Append a
   dated `## Update — YYYY-MM-DD` section to the existing file.

2. **Pick the filename**: `docs/ctx/YYYY-MM-DD-<kebab-slug>.md`, where the date is
   today's date and the slug names the area of work — e.g.
   `2026-08-02-dotnet-10-upgrade.md`, `2025-11-14-signalr-connection-mapping.md`.
   Do not guess the date; get it from the environment or `git log -1 --format=%cd`.

3. **Write the note** using the template below. Keep it to what a reader actually needs:
   findings and decisions, not a transcript of your steps.

4. **Update the index** `docs/ctx/README.md` — add one row to the table, newest first.

5. **Verify every claim you write down.** A ctx note is read later as fact. If you did
   not confirm something, mark it explicitly as unverified rather than stating it flatly.

## Template

```markdown
# <Title>

- **Date:** YYYY-MM-DD
- **Type:** exploration | change | both
- **Scope:** <paths / projects / subsystems touched or read>
- **Status:** done | partial | blocked

## Context
Why this work happened — the question asked or the problem being solved. 2-4 sentences.

## What I found
The non-obvious facts about the system. Cite `file.cs:line` so claims are checkable.
This is the most valuable section; be specific and skip anything self-evident from the code.

## What changed
Concrete edits, grouped by intent. Omit this section for a pure exploration.

## Decisions and trade-offs
Each decision, the alternatives rejected, and why. This is what stops a future reader
from silently undoing the work.

## Verified
How the work was actually checked — commands run and their outcome. Say plainly what
was *not* verified.

## Known issues / follow-ups
Problems found but deliberately left alone, with enough detail to act on later.
Mark anything pre-existing as such so it is not mistaken for a regression.
```

## Rules

- **Findings over narrative.** "EF Core 7+ flipped the SqlClient `Encrypt` default to
  true, so every connection string needs `TrustServerCertificate=True`" is useful.
  "I looked at the connection string and then updated it" is not.
- **Cite locations** as `path/to/file.ext:line` so a reader can jump straight there.
- **Separate verified from assumed.** Never present an untested assumption as fact.
- **Flag pre-existing bugs as pre-existing.** Do not let them read as new breakage.
- **One note per unit of work**, not per file touched.
- Keep notes append-only in spirit: correct them with a dated update section rather than
  rewriting history, unless the original was simply wrong — then fix it and say so.
