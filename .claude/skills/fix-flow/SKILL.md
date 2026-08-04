---
name: fix-flow
description: End-to-end pipeline for fixing a defect - reproduce, diagnose, plan, write a test that provably fails, fix, verify, build, branch, commit, PR, then checkpoint the docs. Use whenever the user reports a bug, says "fix this", pastes a stack trace or a screenshot of broken behaviour, or asks to run the fix flow. Also use when a fix is already written but was never proved to fail beforehand.
---

# fix-flow — from a report to a merged fix

A defect is not fixed when the symptom disappears. It is fixed when something would fail if
it came back. Every step below exists to protect that sentence.

Run the stages in order. They are cheap individually and each one has, at least once,
caught an error the previous stage missed.

## 0. Reproduce before anything else

Get the failure in front of you — a failing command, a request log, a screenshot with the
network panel open. Write down the observable symptom in one line.

If you cannot reproduce it, say so and stop. Everything downstream is guesswork, and a
confident guess is worse than an admission.

**Separate the symptom from the diagnosis.** "Search spins forever and shows nothing, while
every request returns 200 with the right user" is a symptom. "The effect depends on an
unstable callback" is a diagnosis, and at this stage it is a hypothesis.

## 1. Diagnose

Delegate breadth to the **`Explore`** agent when the cause could be in any of several
places; read directly when you already know the file. Keep going until you can state the
mechanism as a causal chain, each link checkable:

> RTK Query trigger updates query state → parent re-renders → new callback identity →
> effect re-runs → trigger fires again

**A mechanism that does not explain every part of the symptom is incomplete.** If the
symptom includes "and no result is ever displayed", a mechanism that only explains the
repeated requests is not finished. Two symptoms usually mean two links.

## 2. Plan, and have the plan reviewed

For anything beyond a one-line change, state: what changes, what stays, and what could
break. Use the **`Plan`** agent when the fix has structural options worth weighing.

Ask specifically whether the fix belongs at the call site, in the component, or both.
Fixing only the caller leaves the component as fragile as its next caller.

## 3. Write the test — and prove it fails

**This is the stage that is worth the whole skill.** Write the test *before* the fix, run it
against the unfixed code, and watch it fail with the message you expect.

If you have already fixed the code, revert the fix temporarily, run the test, confirm it
fails, then restore. Do not skip this because the fix is obviously right.

A test that passes against the bug is not a weak test — it is a *false* one, and it will be
read forever after as proof that the bug cannot recur.

**Reproduce the whole mechanism, not the shape of it.** The most common failure here is a
harness simpler than reality: a test parent that never re-renders keeps one stable callback
identity, so the loop never forms and the test passes against the bug. Every link in the
chain from stage 1 must exist in the test. If a link is awkward to reproduce, that awkward
link is usually the bug.

Record what the failure looked like — the assertion text — in the commit message.

## 4. Fix

Apply the fix. Prefer defence at both ends when the failure came from a contract between
two components: memoise at the caller *and* make the component independent of its caller's
discipline. Say in a comment why both exist, or someone will remove one as redundant.

## 5. Verify

- The new test passes.
- The **full suite** passes — `npm run test` in `ClientApp`, and `dotnet build WebChat.sln -c Release` from `WebChat/`. The repo builds with **0 warnings**; a new warning is a regression.
- Anything the fix touched still works, checked by exercising it, not by reasoning about it.

Then audit the bug *class*: grep for the same shape elsewhere. Record the grep so the audit
can be repeated. One instance found by a user usually means the pattern is habitual.

## 6. Branch, commit, PR

Follow **`.claude/skills/git-convention/SKILL.md`** for the branch name and commit format,
and **`.claude/skills/commit-authorship/SKILL.md`** for attribution. Never commit to
`master` directly.

The commit message carries the mechanism, not the diff — the diff is already in the commit.
State the symptom, the causal chain, why the fix sits where it does, and what proved the
test valid.

## 7. Checkpoint

Run **`.claude/skills/checkpoint/SKILL.md`**: correct anything the fix made untrue in
CLAUDE.md and ORIENTATION.md, then capture the ctx note.

**Last, not first.** A note written from stage 1 records a hypothesis. By here you know
which parts were confirmed, which were wrong, and what remains unverified — and the note
should say all three.

If the fix is deployed anywhere, state plainly whether the deployed instance has it yet.

## Rules

- **Never claim a fix without a test that provably failed.** If you skipped stage 3, say so
  rather than implying coverage you do not have.
- **Reproduce, then diagnose, then fix.** A fix that precedes a reproduction is a guess.
- **Correct your own diagnosis out loud.** A first hypothesis that turns out incomplete is
  normal; carrying it silently into the ctx note is not.
- **Report what the tests actually did**, including any that damp the real failure rather
  than reproducing it fully. Overclaiming here poisons every later reader.
- **One defect per branch.** Discovering a second bug means a second branch.
