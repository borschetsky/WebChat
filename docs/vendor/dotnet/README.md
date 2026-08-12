# Vendored .NET documentation

Individual pages from `learn.microsoft.com`, pinned to a version and snapshotted here so an
agent can read them without a network round-trip and without guessing which .NET they
describe.

Written by the **`doc-vendor`** agent (`.claude/agents/doc-vendor.md`) via
[`scripts/vendor-learn-page.sh`](../../../scripts/vendor-learn-page.sh). **Nothing here is
ours and nothing here should be hand-edited** — re-run the script instead, so the diff means
something.

This tree works differently from [`react/`](../react/) and
[`redux-toolkit/`](../redux-toolkit/), which are whole-repo snapshots taken at one commit.
.NET's documentation is far too large to mirror wholesale, so pages are vendored **one at a
time, on demand**, and each carries its own provenance in its own frontmatter rather than
inheriting it from a table.

## Find the page before you grep the pages

Grep across this tree and you will match `AddDbContext` in a dozen files. Grep **this table**
instead — it is small, and every API a vendored page actually documents is named in it.

| Page | Covers | Version | Fetched |
|---|---|---|---|
| [`api/…entityframeworkservicecollectionextensions.configuredbcontext.md`](api/microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.configuredbcontext.md) | `ConfigureDbContext<TContext>` — both overloads, and how it composes with `AddDbContext`, `AddDbContextPool`, `AddDbContextFactory`, `AddPooledDbContextFactory` and `OnConfiguring`. The mechanism behind `IDbContextOptionsConfiguration<TContext>`. | `efcore-10.0` | 2026-08-12 |

Paths mirror the Learn URL after the locale, so a path round-trips back to the page it came
from. For `/dotnet/api/` pages the Learn slug **is** the lowercased fully-qualified name, so
`ls api/ | grep -i configuredbcontext` finds the file without opening anything.

## Is this still true?

Every page carries the answer in its own first fifteen lines:

```
applies-to-version: efcore-10.0     <- what it describes
upstream-commit: a39622ba…          <- the exact commit it was rendered from
fetched-on: 2026-08-12              <- when we took it
learn-all-monikers: efcore-9.0 efcore-10.0
```

`applies-to-version` is the one that matters and the one no other doc source gives you.
To check a page for drift, re-run the script and compare `upstream-commit` — same commit
means the page has not been touched upstream since, and no diff is needed.

## Two traps that make .NET docs different

**`?view=` does not do what it looks like it does.** Learn's markdown variant ignores the
moniker entirely — `?view=efcore-10.0` and `?view=efcore-3.1` return byte-identical
documents containing *every* version, interleaved with `::: moniker range="…"` markers.
Every page here has been pruned to one version by the script; that pruning is the reason
this tree exists rather than a folder of raw fetches.

**`/dotnet/api/` type pages carry no moniker markers at all.** A class page lists the union
of every member the type has ever had, with nothing saying which version each arrived in.
Method pages *do* carry markers. So a vendored type page is version-ambiguous even after
pruning — prefer the method page when the question is "does this exist in .NET 10".

## What this is not

Not a substitute for [`../../ctx/`](../../ctx/README.md) or
[`../../research/`](../../research/README.md). Those record what *this* repo decided and why.
When upstream documentation and a ctx note disagree about this codebase, the ctx note wins.
