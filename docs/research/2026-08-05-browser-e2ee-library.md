# Which library gives a browser chat client Signal-style E2EE for 1:1 threads in 2026, and does a maintained browser-capable one actually exist?

- **Date:** 2026-08-05
- **Status:** answered
- **Question:** If WebChat implements option B from issue #34 (E2EE inside the app rather than adopting Matrix), which crypto library does the browser client use — and is that even viable?
- **Recommendation:** Yes, a maintained, audited, browser-capable option exists: **vodozemac 0.10.x compiled to WASM** (Apache-2.0, ~184 KB gzipped, audited, actively released). Build the bindings yourself rather than trusting a third-party npm package. Do **not** use libsignal — it is Node-native, AGPL-3.0, and Signal has explicitly declined to maintain a browser target.

## The short answer

Your understanding is correct on both counts, and both facts are verifiable. `libsignal-protocol-javascript`
was archived by Signal on **2021-08-05** with a README telling you to move to `libsignal-client`;
`@signalapp/libsignal-client` is a Node-native addon (`node-gyp-build`, 145 MB unpacked, prebuilt
`.node` binaries) that cannot run in a browser; and Signal's maintainer stated on the record in
[libsignal#350](https://github.com/signalapp/libsignal/issues/350) that a WASM bridge "would qualify
as too much of a maintenance burden to land in the main repository" and that they are "not really
taking maintainers outside of Signal at this time."

But the conclusion "so there is nothing" is wrong, and the bundle-size fear is aimed at the wrong
target. **The multi-megabyte WASM blobs are the client SDKs, not the protocol libraries.**
Measured today by downloading the actual npm tarballs:

| Package | `.wasm` raw | `.wasm` gzipped | What it is |
|---|---|---|---|
| `@dtelecom/vodozemac-wasm@0.3.0` | 401 KB | **184 KB** | vodozemac 0.10 Olm primitives only |
| `@commapp/vodozemac@0.1.1` | 588 KB | 252 KB | vodozemac, Comm's build |
| `vodozemac-wasm-bindings@0.8.1` | 676 KB | 281 KB | vodozemac 0.8 (**pre-fix, see below**) |
| `@getmaapp/signal-wasm@0.5.0` | 777 KB | 294 KB | wasm-bindgen over `libsignal-protocol` crate |
| `@matrix-org/matrix-sdk-crypto-wasm@18.4.0` | 7.82 MB | **2.09 MB** | the whole Matrix crypto state machine |
| `@wireapp/core-crypto@10.2.0` (browser) | 7.65 MB | **2.81 MB** | Wire: MLS + Proteus + encrypted storage |
| `ts-mls@1.6.2` (pure TS, no WASM) | 229 KB min | **70 KB** | full RFC 9420 in TypeScript |

For reference, the current client bundle measured from `ClientApp/dist/assets` today is
**836,599 bytes raw / 260,065 bytes gzipped** in one chunk.

So: a protocol-only WASM module costs roughly **+70%** on the gzipped bundle if eagerly loaded,
and approximately **zero** if `import()`-ed lazily the first time an encrypted thread is opened —
which is exactly what per-conversation opt-in makes natural. A whole-SDK option costs **+800%**
and is genuinely disqualifying. That distinction is the whole finding.

## What decides it

**1. Licence, and it is the fastest way to shorten the list.** `signalapp/libsignal` is
**AGPL-3.0**. WebChat is a public MIT repo. Linking the `libsignal-protocol` crate into your SPA
via WASM makes the client a derivative work: the whole client becomes AGPL, and §13 obliges you to
offer corresponding source to anyone *interacting with the deployed instance over a network*. That
is a licence change to a repo you deliberately made MIT, for a personal project. vodozemac is
**Apache-2.0**, OpenMLS is **MIT**, ts-mls is **MIT**, mls-rs is **Apache-2.0**. Wire's core-crypto
is **GPL-3.0**. If you are unwilling to relicense, libsignal is out before any technical argument
starts — and it was already out for being Node-only.

**2. "Audited and boring" eliminates the pure-JS options.** ts-mls is the most attractive package
in the table on every axis except the one you named as the tiebreak. Its README says verbatim:
*"This library has not undergone a formal security audit. While care has been taken to implement
the MLS protocol correctly and securely, it may contain undiscovered vulnerabilities."* It is one
maintainer, first published 2025-07-10, currently v1.6.2. 70 KB gzipped and MIT is a genuinely
great trade — but not against "audited and boring".

Everything else is a consequence of those two.

## Options

### A. vodozemac 0.10.x → WASM (recommended)

Olm is X3DH + Double Ratchet — i.e. Signal-style 1:1, which is what you asked for. vodozemac is the
pure-Rust rewrite that replaced libolm; matrix-org **deprecated libolm in August 2024** and
**archived `matrix-org/olm` on GitHub** (last push 2026-02-23; `@matrix-org/olm` on npm is stuck at
3.2.15 from 2023-10-27 despite still pulling ~118k downloads/month — people do still ship it, and
they should stop).

- **Audited:** Least Authority, final report 2022-03-30, funded by gematik.
- **Maintained:** 0.10.0 released 2026-04-13; unreleased changes on `main` as of 2026-08-04.
- **Post-audit history matters here.** Soatok published "Cryptographic Issues in Matrix's Rust
  Library Vodozemac" on 2026-02-17, reporting a **High**-severity flaw (Olm's Diffie-Hellman
  accepted the identity element, giving a predictable shared secret) plus a MAC-truncation
  downgrade and five lesser issues. **vodozemac 0.10.0 fixes them**: the changelog credits
  "@soatok for raising" on PR #298, which makes `diffie_hellman()` return `Option` so key agreement
  is fallible, and PR #299 removes the `strict-signatures` flag so strict Ed25519 checking is now
  the default. That is the version to pin, and it is a hard floor —
  **`vodozemac-wasm-bindings@0.8.1` pins vodozemac 0.8 and therefore ships the vulnerable code.**
- **Size:** 184 KB gzipped for the dTelecom build, which pins `vodozemac = "0.10"`. An unreleased
  `precomputed-tables` feature flag on `main` will let size-sensitive builds drop ~40 KB more.
- **Setup cost — this is the real one.** matrix-org's own JS bindings
  (`matrix-org/vodozemac-bindings/javascript`) are a `wasm-pack` project that is **not published to
  npm at all** (its `package.json` has no `name` or `version`) and was last touched 2024-09-05. So
  you either add a Rust + `wasm-pack` step to a .NET + Vite repo, or you depend on a third-party
  package with 82–525 downloads/month. Building it yourself is ~50 lines of `wasm-bindgen` glue
  over a stable API; dTelecom's Apache-2.0 crate is a usable starting point.
- **Ongoing cost:** you now own a Rust toolchain in CI and a "did vodozemac ship a security
  release" watch. That watch is not optional — see the 0.8-vs-0.10 trap above.
- **Rules out later:** nothing structurally. Olm sessions are per device-pair and the wire format is
  yours, so migrating to MLS later is a re-key, not a rewrite. It does rule out post-quantum for now
  — Olm has no PQ story, unlike libsignal's PQXDH or MLS's ML-KEM ciphersuites.

### B. ts-mls (pure TypeScript, RFC 9420)

70 KB gzipped, MIT, zero WASM, zero build-toolchain change, works in browser/Node/serverless,
supports post-quantum ciphersuites (ML-KEM, X-Wing) and is listed in the MLS WG's implementation
list with status "RFC". Only hard dependency is `@hpke/core`; `@noble/curves` (audited by Trail of
Bits 2023, Kudelski 2023, Cure53 2024) covers curves HPKE does not.

The blocker is the audit disclaimer quoted above. If the goal is *learning how E2EE works* rather
than *shipping something you would tell a user to trust*, this is arguably the better choice: it is
the standards-track protocol, you can read the whole implementation, and it costs almost nothing in
bundle. If you pick it, label the feature experimental in the UI and mean it.

### C. OpenMLS → WASM

MIT, Rust, RFC 9420. **Audited by SRLabs**, sponsored by the Sovereign Tech Agency, 12 weeks from
2025-10-16 covering code to 2025-10-22; results published 2026-05-27; eight findings, one High,
seven fixed in openmls 8.1 and 7.3. Actively developed. The book documents a WASM target: enable
the `js` feature, and note that WASM provides neither secure randomness nor a clock, so it only runs
in a runtime exposing JS APIs via `web_sys`.

This is the only option that is simultaneously audited, permissively licensed, and post-quantum
capable. It loses to A only on unknowns: **nobody publishes an OpenMLS WASM npm build, so I have no
measured bundle size**, and the book does not claim the WASM target is tested in CI. If you are
already adding a Rust→WASM step for option A, costing OpenMLS at the same time is cheap and might
change the answer.

### D. Whole-SDK options — ruled out on size

`@matrix-org/matrix-sdk-crypto-wasm` (2.09 MB gz) and `@wireapp/core-crypto` (2.81 MB gz) are the
best-supported browser E2EE code that exists — 3.8M downloads/month for the former, it is what
Element Web ships. But each is ~8–11× your entire current gzipped bundle, and each assumes its own
server: `OlmMachine` is "no-network-IO" but emits Matrix-shaped requests, so using it means
implementing `/keys/upload`, `/keys/query`, `/keys/claim` and `/sendToDevice` with Matrix
semantics. At that point you have written half a homeserver, which is issue #34's option A wearing
a disguise. Rule these out unless you are adopting Matrix wholesale.

### E. Hand-rolled Double Ratchet over WebCrypto

Newly *possible* in a way it was not two years ago: **Curve25519 landed in the Web Cryptography
API across all three engines** — Safari 17 (2023), Firefox 129 (2024-08), Chrome 137 (2025-05,
the last to ship it enabled by default). So X25519 key agreement and Ed25519 signing are native, no
library needed, and `@noble/curves` (~15 KB gz for a curve, three external audits) covers the rest.

Do not do it anyway. The primitives were never the hard part; the ratchet state machine, skipped-key
handling, replay and reorder handling are. The two npm packages that occupy this niche illustrate
the risk rather than solving it: `2key-ratchet` (PeculiarVentures, X3DH + Double Ratchet over
WebCrypto, ~4.7k downloads/month) has not been published since **2020-05-25**; and
`webcrypto-ratchet@0.7.2` claims "PQXDH + Triple Ratchet", was **first published 2026-07-24**, has
two versions, one maintainer and **no repository field at all**. Treat that one as a supply-chain
hazard, not a candidate.

### Named traps

- **`@getmaapp/signal-wasm`** looks like the answer to this exact question — 294 KB gz, and its
  `Cargo.toml` really does depend on `signalapp/libsignal` pinned to a git rev (2026-07-16),
  proving the `libsignal-protocol` crate does compile to `wasm32`. But: created 2026-01-14,
  12 stars, one publisher, 921 downloads/month, AGPL-3.0, and its `SECURITY_AUDIT_REPORT.md` is
  **self-produced and in-repo** next to a `GEMINI.md`. It is a self-assessment, not an audit. Its
  real value is as an existence proof that Signal's own suggested approach (#350, option 2) works.
- **`@privacyresearch/libsignal-protocol-typescript`** — the TS port people still recommend in
  blog posts. Last publish **2023-05-06**, version **0.0.16**, ~28k downloads/month. Unmaintained.
- **`libsignal` on npm** (WhiskeySockets/libsignal-node) — 3.95M downloads/month, which looks like
  a strong signal until you notice it is a transitive dependency of Baileys (WhatsApp automation),
  is a fork of the *archived* JS library, is Node-targeted (`require('crypto')` in `src/crypto.js`,
  `src/curve.js`, `src/keyhelper.js`), GPL-3.0, and has 39 GitHub stars.

## Per-conversation opt-in: normal, not a fight

It fights the libraries not at all, and Matrix is the proof: `m.room.encryption` is a **per-room
state event** carrying an `algorithm` field, and rooms without it are plaintext. Per-room opt-in *is*
the Matrix model. Telegram's secret chats are the same idea.

Mechanically it is free here. Olm (and Signal) sessions are keyed by **device pair, not by
conversation**, and WebChat threads are 1:1 — so a thread maps onto exactly one peer, and "encrypt
this thread" means "ratchet with this peer". There is no per-conversation state the library
would object to.

What it costs is at the product layer, and Signal/WhatsApp's refusal to offer it is a product
decision rather than a protocol constraint:

- **Downgrade surface.** If "is this thread encrypted?" is a server-controlled flag, a malicious
  server clears it and the client cheerfully sends plaintext. Element's convention is that
  encryption is one-way — once on, never off. Note that I confirmed the per-room *shape* from the
  spec's `m.room.encryption` schema but **could not find the irreversibility mandated in the spec
  itself**; it appears to be client-enforced. If you build this, enforce it client-side and persist
  "this thread is encrypted" locally so the server cannot retract it.
- **Every server-side feature in issue #34's table becomes conditional rather than removed**, which
  is more code than removing them, not less: search must union SQL results over plaintext threads
  with client-side results over encrypted ones; the thread list shows a real preview for some rows
  and a padlock for others.

## Minimum server surface (unavoidable)

Confirmed against the X3DH specification: the server must let one party publish and another fetch
a bundle, because the whole point is starting a session while the recipient is offline. The spec's
list is identity key, signed prekey, prekey signature, and a set of one-time prekeys; on request the
server returns identity key + signed prekey + signature + "one of Bob's one-time prekeys **if one
exists, and then delete it**", omitting it when exhausted. It also says to rate-limit bundle fetches
to prevent one-time-key depletion, and that the signed prekey is rotated on an interval (weekly or
monthly) with the new value replacing the old.

Olm's model is slightly smaller than X3DH's — an Olm account has one identity key pair (Curve25519
for DH, Ed25519 for signing) plus a pool of one-time keys — but the server shape is the same, and
matches the four Matrix CS-API endpoints (`/keys/upload`, `/keys/query`, `/keys/claim`,
`/sendToDevice`). Minimum for WebChat:

1. `POST /api/keys` — publish this device's identity keys and a batch of signed one-time keys.
2. `GET /api/keys/{userId}` — return that user's identity keys (public, signed).
3. `POST /api/keys/claim/{userId}` — **atomically pop exactly one** unused one-time key.
4. A returned count of remaining one-time keys, so the client tops up before exhaustion.

Two tables (`DeviceKeys`, `OneTimeKeys`) and three endpoints. The ciphertext itself needs no new
transport — the existing SignalR hub and message table carry it, since the pre-key message that
opens a session is just the first message.

The one trap: **step 3 must be single-use under concurrency**, or two senders get the same one-time
key and forward secrecy for that session is gone. In Postgres that is a single statement —
`DELETE FROM "OneTimeKeys" WHERE "Id" = (SELECT "Id" FROM "OneTimeKeys" WHERE "UserId" = @u AND
"Used" = false ORDER BY "Id" LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING "Key"` — but it is not
something EF Core's change tracker will do correctly for you by accident.

None of this is heavy for a 512 MB instance: prekey storage is bytes per user, and the claim is one
indexed delete.

## What I could not confirm

- **OpenMLS WASM bundle size.** No published npm build exists; I did not compile it. This is the
  single measurement that could move the recommendation from A to C, and it is a half-day of work
  to get.
- **Whether the vodozemac WASM bindings expose everything a full 1:1 flow needs.** dTelecom's
  package is described as "Olm primitives ... tailored for non-Matrix chat use" and pins the right
  vodozemac version, but I read its `Cargo.toml`, not its exported API surface. Verify
  `Account`/one-time-key generation/`create_outbound_session`/`create_inbound_session` are all
  exported before depending on it — or before copying it.
- **Matrix spec mandating that room encryption cannot be disabled.** I confirmed the per-room state
  event from `m.room.encryption.yaml` in `matrix-org/matrix-spec` but not the irreversibility rule;
  I believe it is a client convention. Treat "once on, never off" as a design choice you must make,
  not one the spec makes for you.
- **Whether vodozemac 0.10.0 addressed *all* of Soatok's findings.** The changelog explicitly covers
  the High-severity DH identity-element issue and strict Ed25519; it also moved `SessionConfig::V2`
  behind an experimental flag, which is not obviously the same as fixing the V2→V1 downgrade.
  The deterministic-IV pickle format and the 40-skipped-message key drop are not mentioned.
- **mls-rs audit status.** Search results state it has been validated for RFC 9420 conformance but
  has **not** had a third-party security audit. I did not verify that against an AWS primary
  source, so treat it as unconfirmed — but it is the reason mls-rs is not option C.
- **All download counts, versions and sizes are as of 2026-08-05** and were measured by fetching
  npm tarballs and gzipping the artefacts, not read off a badge.

## What would change my mind

- An OpenMLS WASM build measuring under ~300 KB gzipped → switch to C. Same audit standing, MIT,
  standards track, post-quantum path, and it makes group chat a later feature rather than a rewrite.
- Post-quantum being a requirement → vodozemac is out entirely; C or B.
- Unwillingness to add a Rust toolchain to the repo → B (ts-mls), with the experimental label, and
  accept that "audited" was traded away.
- Any evidence that vodozemac's WASM path is not exercised by anyone shipping it → reconsider,
  because the audit covered the Rust crate, not the bindings.

Final caveat, and it is the one that matters most: **the library was always the cheap part.**
Issue #34's option-B cost — device verification, key backup, recovery, the trusted-delivery problem
inherent to browser-served E2EE — is unchanged by anything in this note. What this note establishes
is only that the library is not the blocker, and that the bundle is not either.

## Sources

- [signalapp/libsignal-protocol-javascript](https://github.com/signalapp/libsignal-protocol-javascript) — archived 2021-08-05; README: "no longer used by us or maintained", points to libsignal-client.
- [signalapp/libsignal](https://github.com/signalapp/libsignal) — active (last push 2026-08-04, v0.99.4); README lists Java, Swift, TypeScript/Node bindings only; AGPL-3.0.
- [libsignal issue #350 — "WASM Bridge / Build for libsignal-client"](https://github.com/signalapp/libsignal/issues/350) — Signal maintainer: a WASM bridge is "too much of a maintenance burden"; recommends a downstream wrapper crate; later notes the `boring` dependency has made the bridge/FFI routes harder.
- npm registry API for `@signalapp/libsignal-client` (0.99.4, 2026-08-04) — `node-gyp-build` dependency, 145 MB unpacked. Native, not browser.
- [matrix.org — Libolm Deprecation (Aug 2024)](https://matrix.org/blog/2024/08/libolm-deprecation/) — libolm deprecated in favour of vodozemac; three timing CVEs; no bandwidth to maintain both.
- [matrix-org/olm](https://github.com/matrix-org/olm) — archived on GitHub. `@matrix-org/olm` npm last published 2023-10-27.
- [matrix-org/vodozemac](https://github.com/matrix-org/vodozemac) — Apache-2.0, active; CHANGELOG confirms 0.10.0 (2026-04-13) made `diffie_hellman()` fallible (PR #298, crediting @soatok) and made strict Ed25519 the default (PR #299).
- [Least Authority — audit of Matrix vodozemac](https://leastauthority.com/blog/audit-of-matrix-vodozemac/) and the [final report PDF, 2022-03-30](https://matrix.org/media/Least%20Authority%20-%20Matrix%20vodozemac%20Final%20Audit%20Report.pdf).
- [Soatok — "Cryptographic Issues in Matrix's Rust Library Vodozemac" (2026-02-17)](https://soatok.blog/2026/02/17/cryptographic-issues-in-matrixs-rust-library-vodozemac/) — the High-severity identity-element finding. Note: written before 0.10.0 shipped, and its blanket "don't use Matrix" conclusion predates the fix. Authoritative on the bug, stale on the remedy.
- [matrix-org/vodozemac-bindings](https://github.com/matrix-org/vodozemac-bindings) — a `javascript/` directory using `wasm-pack`, README says "Web based environments are supported"; `package.json` has no name/version, so **not published**; last push 2024-09-05.
- [dTelecom/vodozemac-wasm](https://github.com/dTelecom/vodozemac-wasm) — Apache-2.0, `vodozemac = "0.10"`, `getrandom` with the `js` feature. npm 0.3.0 (2026-05-14), 165 downloads/month.
- [LukaJCB/ts-mls](https://github.com/LukaJCB/ts-mls) — MIT, v1.6.2, first published 2025-07-10, 16.6k downloads/month; README carries the verbatim "has not undergone a formal security audit" disclaimer; listed in the MLS WG implementation list with status "RFC".
- [OpenMLS independent security audit (phnx.im blog, published 2026-05-27)](https://blog.phnx.im/openmls-independent-security-audit/) — SRLabs, Sovereign Tech Agency, 12 weeks from 2025-10-16, eight findings (one High), seven fixed in openmls 8.1/7.3.
- [OpenMLS Book — WebAssembly](https://book.openmls.tech/user_manual/wasm.html) — the `js` feature; WASM lacks randomness and a clock, so it needs a JS runtime via `web_sys`.
- [Signal X3DH specification](https://signal.org/docs/specifications/x3dh/) — exact contents of the published key set and the returned prekey bundle; "delete it" semantics for one-time prekeys; rate-limiting advice; signed-prekey rotation.
- [Matrix client-server API — E2EE](https://spec.matrix.org/latest/client-server-api/#end-to-end-encryption) and [`m.room.encryption.yaml`](https://github.com/matrix-org/matrix-spec/blob/main/data/event-schemas/schema/m.room.encryption.yaml) — the four key endpoints; encryption as per-room state.
- [Igalia — "Ed25519 Support Lands in Chrome" (2025-08-25)](https://blogs.igalia.com/jfernandez/2025/08/25/ed25519-support-lands-in-chrome-what-it-means-for-developers-and-the-web/) — Chrome M137 was the last of the three engines to ship Ed25519/X25519 in Web Crypto by default. Corroborated by [MDN `SubtleCrypto.deriveBits`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits), which documents X25519 as a supported derivation algorithm.
- [paulmillr/noble-curves](https://github.com/paulmillr/noble-curves) — Trail of Bits (2023-02), Kudelski (2023-09), Cure53 (2024-09) audits; ~15 KB gzipped per curve.
- Bundle measurements: `npm pack` of each package on 2026-08-05, sizes from the extracted `.wasm`/bundled JS and `gzip -9`. ts-mls figure from an `esbuild --bundle --minify` of its main API surface. Current client bundle from `ClientApp/dist/assets/index-C0k5WyGa.js`.
- Traps checked directly on npm/GitHub: `@getmaapp/signal-wasm` (Cargo.toml pins `signalapp/libsignal` @ b5121d0; in-repo self-authored `SECURITY_AUDIT_REPORT.md`; `GEMINI.md`), `webcrypto-ratchet` (created 2026-07-24, no repository field), `2key-ratchet` (last publish 2020-05-25), `libsignal`/WhiskeySockets (Node `crypto` in `src/`).
