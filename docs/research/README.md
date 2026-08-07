# Research notes

Answers to open questions that needed facts from outside this repository — providers,
protocols, pricing, standards, libraries. Newest first.

Written by the **`researcher`** agent (`.claude/agents/researcher.md`). Give it a question
and the constraints that matter; it does the searching and writes the note.

These are **not** the same as [`../ctx/`](../ctx/README.md). A ctx note records what was done
to this repository and why. A research note records what is true of the world outside it, on
the day it was checked — so unlike ctx notes, **these expire**. Prices, free-tier limits and
library versions all rot. Every note carries the date it was verified; treat anything old as
a starting point rather than a fact.

| Date | Note | Question | Recommendation |
|---|---|---|---|
| 2026-08-07 | [Unit-testing a SignalR Hub](2026-08-07-signalr-hub-unit-testing.md) | How should `ChatHub` be unit-tested on .NET 10 with xUnit, and what should `WebChat.Tests` adopt? | **Assert on `IClientProxy.SendCoreAsync`, never `SendAsync`** — `SendAsync` is a static extension, so no mock can see it, and `Received().SendAsync(...)` fails at runtime *even with the identical payload instance* because the extension allocates a fresh `object?[]` each call. Add **NSubstitute 6.0.0 + NSubstitute.Analyzers.CSharp 1.0.17** to the existing `WebChat.Tests` (the analyzer turns that mistake into a build error); hand-write `HubCallerContext`; keep plain `Assert` and xUnit v2. Moq is out for being 23 months stale, not for SponsorLink. The payload is an anonymous type — `internal`, so reflection only and `dynamic` throws; give it a name. Verified by compiling and running the tests. |
| 2026-08-06 | [Client lint and format setup](2026-08-06-client-lint-format-setup.md) | What linting/formatting should the React client adopt in 2026, and is Prettier still right alongside ESLint? | **oxlint + `eslint-plugin-react-hooks` (via oxlint `jsPlugins`) + Prettier.** ESLint is unavailable: `typescript-eslint` hard-refuses the `typescript@7.0.2` this repo runs, which would leave 41 of 61 files unlintable. Biome is credible but has no React Compiler rules. Adoption cost is 20 findings, not hundreds. Verified empirically: `react-hooks/exhaustive-deps` would **not** have caught the ComposeDialog render loop. |
| 2026-08-05 | [Browser E2EE library for 1:1 threads](2026-08-05-browser-e2ee-library.md) | Which crypto library gives the browser client Signal-style 1:1 E2EE, and does a maintained browser-capable one exist? | **vodozemac 0.10.x compiled to WASM** — Apache-2.0, audited, ~184 KB gzipped, build the bindings yourself. libsignal is out: Node-native, AGPL-3.0, and Signal has refused to maintain a browser target. The multi-MB WASM fear applies to client SDKs (2.1–2.8 MB gz), not protocol libraries (184–294 KB gz). |
