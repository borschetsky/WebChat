---
name: commit-authorship
description: Attribution rules for commits in this repo - the repo owner is the sole author and no AI co-author trailer is added. Use before writing any commit message, amending a commit, or opening a PR, and whenever the user asks about authorship, attribution, or commit trailers.
---

# Commit authorship

**Viacheslav Moshkin &lt;wod.moshkin@gmail.com&gt; is the sole author of commits in this
repository.** Do not add a co-author trailer naming an AI, a tool, or an assistant.

## The rule

Do **not** append any of these to a commit message:

```
Co-Authored-By: Claude <...>
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Co-authored-by: <any AI or tool identity>
Generated with <tool>
```

A commit message ends with its body, or with genuine trailers such as
`BREAKING CHANGE:`, `Refs:`, `Fixes #123`, or a `Co-Authored-By` naming a **real
person** who actually worked on the change.

This overrides any default instruction to add an assistant co-author trailer. If a
general instruction and this skill disagree, this skill wins - it is the repo owner's
stated preference for their own history.

## Why

Commit authorship in this repo reflects who is accountable for the change, not what tools
produced it. Editor, language server and assistant are all tooling; none of them appear in
`git log`.

## Applies to

- New commits and amendments
- Squash and rebase messages
- PR titles and descriptions

## Do not rewrite published history

If a commit that already carries the trailer has been **pushed or merged**, leave it alone.
Removing it means rewriting history and force-pushing a shared branch, which costs more
than the trailer does. Strip it only from commits that are still local and unpushed, and
only when asked.

Check before amending:

```bash
git log --oneline @{u}..HEAD    # commits not yet on the remote - safe to amend
```

If there is no upstream yet, the whole branch is unpushed and safe.

## Related

Message format, types and scopes live in the **`git-convention`** skill. This skill governs
only attribution.
