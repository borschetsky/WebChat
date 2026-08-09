# Vendored upstream documentation

Full documentation trees for Redux Toolkit and React, copied into this repo so they can be
read and searched offline, and by an agent that has no network.

**Nothing in here is ours, and nothing in here should be edited.** These are verbatim
snapshots. Fix an upstream page upstream; refresh the snapshot with the script below.

| Directory | Source | Licence | Snapshot |
|---|---|---|---|
| [`redux-toolkit/`](redux-toolkit/) | [reduxjs/redux-toolkit](https://github.com/reduxjs/redux-toolkit) `docs/` | MIT — see [`redux-toolkit/LICENSE`](redux-toolkit/LICENSE) | `45277d9ad4f5c4bd3b4f1b012523e248f1dce7f5`, taken 2026-08-09 |
| [`react/`](react/) | [reactjs/react.dev](https://github.com/reactjs/react.dev) `src/content/` | CC-BY-4.0 — see [`react/LICENSE-DOCS.md`](react/LICENSE-DOCS.md) | `c7d6b700038c63d1aaf2c649af1aefe01ebbacac`, taken 2026-08-09 |

303 files, 8.0 MB. Markdown and MDX only — no images, no site machinery.

RTK Query's documentation lives inside the `redux-toolkit/` tree
([`rtk-query/`](redux-toolkit/rtk-query/)); it is not a separate project.

## These go stale, and nothing tells you when

This is the cost of vendoring, and it is worth being blunt about it: a snapshot is correct on
the day it is taken and drifts silently afterwards. The commit SHA and date above are the
only way to tell how far. **Check them before trusting a version number, an API signature, or
anything described as "new".**

The same caveat the research notes carry applies here, more strongly — those at least state
what they were verified against.

## Refreshing

```bash
./scripts/refresh-vendor-docs.sh
```

Re-clones both sources at `HEAD`, replaces the trees, and rewrites the SHAs and dates in this
file. Review the diff before committing: an upstream restructure will show up as a large
rename, and that is worth looking at rather than merging blind.

## What this is not

Not a substitute for `docs/ctx/` or `docs/research/`. Those record what *this* repo decided
and why, which upstream documentation cannot tell you — for example that `composerSlice`
exists to keep a keystroke from re-rendering the message list, or that the client cannot use
ESLint because `typescript-eslint` refuses TypeScript 7.

When the two disagree about this codebase, `docs/ctx/` wins.
