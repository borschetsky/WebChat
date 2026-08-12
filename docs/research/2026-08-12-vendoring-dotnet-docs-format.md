# In what format should .NET 10 / C# documentation be vendored into this repo?

- **Date:** 2026-08-12
- **Status:** answered
- **Question:** where does authoritative, fetchable .NET 10 documentation live, and what on-disk format serves an agent best?
- **Recommendation:** fetch `learn.microsoft.com` with `Accept: text/markdown`, prune to one moniker, keep upstream's prose byte-for-byte, and index the result in a small table.

## The short answer

**Microsoft Learn serves a plain-markdown variant of every page under content negotiation** —
send `Accept: text/markdown` and you get `200 text/markdown; charset=utf-8`. Use it. It is
not the same document as the `.md` in `dotnet/docs` on GitHub, and the difference is not
cosmetic: Learn has already resolved the `:::code source="…"` transclusions, which is where
the code samples actually live. It also hands you `git_commit_id` in the frontmatter, so
provenance is exact rather than approximated.

Then **prune it to one version yourself**, because `?view=` does not do it for you. That
pruning is the whole design. Everything else — naming, frontmatter, the index — is
bookkeeping around it.

There is **no `llms.txt`** for Microsoft Learn (`learn.microsoft.com/llms.txt` → 404) and no
`.md` URL suffix (`…/integration-tests.md` → 404). There *is* a Learn MCP server at
`https://learn.microsoft.com/api/mcp`, unauthenticated and free, but it is a search-and-fetch
service for live use, not a vendoring source — it gives you no commit to pin to.

## What decides it

**Two facts, both verified by fetching, and both counter-intuitive.**

**1. The GitHub source markdown does not contain its own code samples.**
`dotnet/AspNetCore.Docs`'s `aspnetcore/test/integration-tests.md` has **36 `:::code
source="~/…"` transclusions against 4 inline fenced blocks**. Those samples live in
`dotnet/AspNetCore.Docs.Samples`, a different repository. Vendor the raw source and you have
vendored a tutorial with ninety percent of its code removed — and nothing in the file says so.
The Learn markdown variant of the same page has **137 inline fenced code blocks and zero
`:::code`**. This single fact rules out the obvious approach of cloning the docs repos the way
`docs/vendor/react/` was cloned.

**2. `?view=` is ignored by the markdown variant.** Verified twice:

| Page | `?view=` A | `?view=` B | Result |
|---|---|---|---|
| `aspnet/core/test/integration-tests` | `aspnetcore-3.1` | `aspnetcore-10.0` | byte-identical, 267 383 bytes |
| `dotnet/api/…jwtbeareroptions` | `aspnetcore-2.0` | `aspnetcore-10.0` | byte-identical, 21 514 bytes |

Both return `defaultMoniker: aspnetcore-10.0` and a canonical URL pointing at 10.0 regardless
of what was asked for. The document is the **union of every version the page has ever applied
to**, delimited by `::: moniker range=" aspnetcore-10.0 aspnetcore-11.0 "` markers.

That union is the trap that makes vendored .NET docs dangerous rather than merely stale. An
unpruned page reads as authoritative .NET 10 documentation while containing paragraphs that
were true in .NET Core 3.1. A dated research note announces its own fallibility; a page of
Microsoft's own prose does not.

So the deciding constraint is: **the moniker markers must be resolved at vendoring time, by
us, because nobody upstream will resolve them for us.**

## Where the documentation actually lives

| Content | Repository | Format |
|---|---|---|
| .NET conceptual + C# language guide | `dotnet/docs` | Learn-flavoured markdown |
| ASP.NET Core conceptual | `dotnet/AspNetCore.Docs` | Learn-flavoured markdown |
| EF Core conceptual | `dotnet/EntityFramework.Docs` | Learn-flavoured markdown |
| .NET API reference (`/dotnet/api/`) | `dotnet/dotnet-api-docs` | **ECMA XML**, not markdown |
| ASP.NET Core API reference | `dotnet/AspNetApiDocs` | **ECMA XML** |
| EF Core API reference | `dotnet/EntityFramework.ApiDocs` | **ECMA XML** |
| C# language proposals and specs | `dotnet/csharplang` | plain markdown |

The API reference repositories hold ECMA XML, so there is no markdown to vendor from GitHub
at all for `/dotnet/api/` pages — the Learn markdown variant is the *only* markdown form of
that content that exists. Confirmed from a vendored page's own frontmatter, which names
`…/xml/Microsoft.Extensions.DependencyInjection/EntityFrameworkServiceCollectionExtensions.xml`
as its source path.

The raw GitHub markdown carries the Learn extensions in full: in the one article measured,
36 `:::code`, 78 `:::zone` (a three-way xUnit/MSTest/NUnit pivot, so every sample appears
three times), 5 `[!INCLUDE]`, 25 `<xref:>`, plus YAML frontmatter and `monikerRange`. The
Learn markdown variant strips `:::code`, `[!INCLUDE]` and `<xref:>` entirely, and **normalises**
what it keeps: `::: moniker` and `::: zone` survive, but with ranges **expanded from
`>= aspnetcore-10.0` into explicit version enumerations**. Expanded enumerations are exactly
what makes mechanical pruning safe — no range arithmetic, just string matching.

## The format, and why

**One file per Learn page.** Not per API surface. A Learn page is already the unit upstream
maintains, it is the unit `git_commit_id` is defined over, and it is therefore the unit that
can be diffed against upstream. Any other granularity means re-cutting the content ourselves,
which forfeits diffability — the one property that makes a vendored doc trustworthy.

**Paths mirror the Learn URL after the locale.** This follows `docs/vendor/react/`, which
mirrors `react.dev`'s `src/content/`. It also pays off specifically here: for `/dotnet/api/`
pages **the Learn slug is the lowercased fully-qualified name**, so
`ls docs/vendor/dotnet/api/ | grep -i configuredbcontext` lands on the file without opening
anything, and the path round-trips back to the URL for re-fetch.

**Prune monikers; never touch prose.** Whole `::: moniker` blocks that do not name the target
version are deleted. Whole `::: zone pivot` blocks for frameworks this repo does not use are
deleted (this repo tests with xUnit). Nothing is rewritten. The distinction is not stylistic:
a deletion is visible in a diff and reversible by re-running the script, whereas a paraphrase
is neither, and a reader cannot tell whose words they are reading. **A summarised vendored
doc is worse than no doc.**

**Frontmatter earns its bytes**, and `applies-to-version` is why. Every other field can be
recovered from the source URL; that one cannot, because the URL's `?view=` is a lie. The
header also carries `upstream-commit`, which turns staleness-checking into a one-line
operation: re-fetch, compare the commit, and if it matches there is nothing to review.

**Finding the file is a separate problem from storing it**, and it is the one vendoring
efforts usually botch. Grep for `AddDbContext` across a corpus and every page mentions it.
The fix is a **small manifest** — `docs/vendor/dotnet/README.md`, one row per page naming
every API that page documents. An agent greps the table, not the corpus. An unindexed page is
an unfound page.

## What the React precedent got right, and where it was thin

`docs/vendor/README.md` is better than expected. It already records the commit SHA and date
per tree, already says in as many words that "a snapshot is correct on the day it is taken
and drifts silently afterwards", already forbids editing, and already ships
`scripts/refresh-vendor-docs.sh` to retake it. Provenance and staleness are **not** the gaps.

Three things genuinely do not carry over:

1. **Whole-tree cloning does not scale to .NET**, and cannot work anyway given the code
   samples live in separate repositories and the API reference is XML.
2. **Tree-level provenance does not survive cherry-picking.** A table row per tree works when
   the tree came from one `git clone`; pages fetched one at a time need per-file provenance.
   Hence the frontmatter block.
3. **React's docs have no version multiplexing.** `react.dev` documents one React. Nothing in
   the existing precedent has any reason to think about monikers, so nothing in it does.

## What I could not confirm

- **Whether `Accept: text/markdown` is a supported, documented feature or an implementation
  detail.** It works and returns a correct content type, but I found no Microsoft
  documentation describing it. If it disappears, the fallback is the Learn MCP server or
  GitHub source plus manual sample resolution — both worse. Worth re-checking if a fetch
  starts returning HTML.
- **Whether the markdown variant is throttled** for bulk use. One page at a time was fine.
- **How `::: zone pivot` interacts with pruning on pages where a pivot wraps a moniker block**
  rather than nesting inside one. The script handles them as independent, which is right for
  every page inspected but is not proven in general.
- **Sibling-relative links** (`](microsoft.entityframeworkcore.dbcontext)`) are left as-is;
  only root-relative `](/en-us/…)` links are absolutised. The former resolve against the
  canonical URL's directory, which a reader must know.
- `IDbContextOptionsConfiguration<TContext>` **has no standalone `/dotnet/api/` page** under
  the name I first tried (`microsoft.entityframeworkcore.idbcontextoptionsconfiguration-1`
  → 404); it lives under `Microsoft.EntityFrameworkCore.Infrastructure`. Its registration
  story is on the `ConfigureDbContext` page, which is what was vendored.

## Sources

- `https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests` with
  `Accept: text/markdown` — established the markdown variant, the 267 KB union, and the
  `::: moniker` / `::: zone` normalisation. Same URL without the header established the
  `git_commit_id` / `original_content_git_url` / `monikers` / `default_moniker` meta tags.
- `https://raw.githubusercontent.com/dotnet/AspNetCore.Docs/main/aspnetcore/test/integration-tests.md`
  — established the 36-transclusions-to-4-inline-blocks ratio that rules out GitHub as a source.
- `https://learn.microsoft.com/en-us/dotnet/api/…entityframeworkservicecollectionextensions.configuredbcontext`
  — the vendored example; established that method pages carry moniker markers and that EF
  Core's API reference comes from `dotnet/EntityFramework.ApiDocs` as ECMA XML.
- `https://learn.microsoft.com/en-us/dotnet/api/…jwtbeareroptions` — established that type
  pages carry **no** moniker markers and are therefore version-ambiguous.
- `https://learn.microsoft.com/en-us/training/support/mcp` — the Learn MCP server, endpoint,
  auth and pricing.
- `https://learn.microsoft.com/llms.txt` → 404, and `…/integration-tests.md` → 404. Both
  looked plausible and neither exists.
- `https://github.com/dotnet/dotnet-api-docs` — confirmed the API reference is ECMA XML.
