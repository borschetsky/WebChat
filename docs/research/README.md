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
| 2026-08-05 | [Browser E2EE library for 1:1 threads](2026-08-05-browser-e2ee-library.md) | Which crypto library gives the browser client Signal-style 1:1 E2EE, and does a maintained browser-capable one exist? | **vodozemac 0.10.x compiled to WASM** — Apache-2.0, audited, ~184 KB gzipped, build the bindings yourself. libsignal is out: Node-native, AGPL-3.0, and Signal has refused to maintain a browser target. The multi-MB WASM fear applies to client SDKs (2.1–2.8 MB gz), not protocol libraries (184–294 KB gz). |
