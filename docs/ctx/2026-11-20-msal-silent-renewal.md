# Entra sessions a day old: silent renewal needs MSAL's redirect bridge

- **Date:** 2026-11-20
- **Type:** change (bug fix)
- **Scope:** `WebChat/WebChat/ClientApp` - `redirect.html`, `src/redirect-bridge.ts`, `vite.config.ts`, `src/features/auth/externalAuth.ts`, `src/test/external-auth.test.tsx`; `CLAUDE.md` auth bullet and `docs/ctx/ORIENTATION.md` External sign-in row
- **Status:** done in code; **not pushed, not merged, not in production** (branch `hotfix/msal-silent-renewal` from `master`, commit `c9e01b3`). Blocked on one manual portal step, below.

## Context
Follow-up to [the Entra client note](2026-11-17-entra-id-client.md), whose "Not verified" list included renewal. A day after signing in with Microsoft, the login page showed "Signing you in..." for about 10 s, then "Signing in with Microsoft did not complete. Try again." Reproduced in the owner's Chrome against the real WebChat Dev External ID tenant, locally on `localhost:3000`.

## What I found
- No request reached the API. Calling `externalAuth.resume()` in the page rejected with `BrowserAuthError`, `errorCode: "timed_out"`, `subError: "redirect_bridge_timeout"`.
- MSAL cache inspection: access token expired about 20 h earlier, refresh token minutes earlier. Entra SPA refresh tokens have a 24 h hard lifetime, so the first load after that must renew some other way.
- **Mechanism.** Once the refresh token is dead, MSAL v5 renews in a hidden iframe and waits for the iframe's redirect page to call `broadcastResponseToMainFrame` from `@azure/msal-browser/redirect-bridge` (shipped in 5.27.0, `dist/redirect_bridge/index.mjs`). Our `redirectUri` was the app root, which boots the whole SPA and never calls it, so the wait timed out.
- `silent()` mapped only `InteractionRequiredAuthError` to `null` (signed out), so `timed_out` was rethrown and `useExternalSession` showed the error.
- **The stale account stayed active in MSAL's cache**, so the next `loginRedirect` carried its `login_hint` / `X-AnchorMailbox`, and Entra's own page failed with "We couldn't sign you in. Please try again." (email pre-filled). Clearing the `msal.*` localStorage keys for `localhost:3000` by hand made the clean button appear.
- **Not changed, and Entra-side:** after that, an Entra account-picker page still showed "We couldn't sign you in" (Entra's own `ciamlogin` session cookie) before the owner got through. This fix does not touch it.

## What changed
- `redirect.html` + `src/redirect-bridge.ts`: a page whose only job is `broadcastResponseToMainFrame()`; errors swallowed because the main window's own timeout reports the failure.
- `vite.config.ts:109-117`: `build.rolldownOptions.input` is now `{ index, redirect }`. The dev server serves `redirect.html` regardless, so forgetting the second input would break **production only**. The first is keyed `index` so app chunk names do not change. Reported, not re-measured here: `dist/index.html` still has no `vendor-msal` preload, and `dist/assets/redirect-*.js` is ~100 bytes importing the existing lazy `vendor-msal` chunk.
- `externalAuth.ts:74,116`: `acquireTokenSilent` passes `redirectUri: ${origin}/redirect.html`.
- `externalAuth.ts:126-133`: `InteractionRequiredAuthError` **or** `BrowserAuthError` with `errorCode === 'timed_out'` now means signed out: `pca.clearCache({ account })` (errors ignored), `pca.setActiveAccount(null)`, return `null`. `clearCache` drops only this app's local cache and signs nobody out at the provider.
- `CLAUDE.md` auth bullet states the `redirect.html` constraint; `ORIENTATION.md` External sign-in row mentions it.

## Decisions and trade-offs
- **Dedicated bridge page, not reusing the app root.** The root boots the SPA and would run `handleRedirectPromise` against a response the main frame must consume. Keeping the page minimal also keeps the iframe fast.
- **Treating `timed_out` as signed-out is a fallback, not the fix.** It stops the error screen and the poisoned hint even where the bridge is not registered or fails. The cost is that a genuine network timeout also reads as signed out and clears the local account; the user just signs in again.
- **`clearCache` per account, not `logoutRedirect`**, because the provider session is not ours to end here.

## Verified
- Reproduced the symptom and the cache state as above, in Chrome against the real Dev tenant.
- Three new tests in `src/test/external-auth.test.tsx` (fake MSAL module gained `BrowserAuthError` and `clearCache`), **red first against unfixed code**: `acquireTokenSilent` not called with the bridge `redirectUri`; `resume()` rejected with "timed_out" twice instead of returning `null` and clearing the account. `npm run verify` passed twice (349 tests, build), as reported by the implementer.
- Corroborated for this note: the files, `vite.config.ts` input keys and `externalAuth.ts` lines above exist as described.

## Known issues / follow-ups
- **Required portal step, not done.** Register `http://localhost:3000/redirect.html` and `https://chat.vtechsolutions.site/redirect.html` as **SPA** redirect URIs on the `webchat-spa` app registration (client id `a2d22260-a4b1-40f5-ba5e-c7828f68d114`) in the WebChat Dev tenant. Without it Entra rejects the redirect URI and the bridge cannot work; only the graceful fallback applies.
- **Not verified:** a real silent renewal through the bridge against Entra (needs the URI registered and an expired refresh token; can be forced by deleting the `RefreshToken` `msal.*` entry). Whether ASP.NET serves `/redirect.html` in production is expected but unchecked: `UseSpaStaticFiles` serves `dist` wholesale, `IncludeSpaOutput` publishes it wholesale, the Dockerfile copies `/spa/dist` wholesale.
- Production does not have this fix; merging does not deploy (see CLAUDE.md).
- Related, on other branches, notes not on this one: `hotfix/entra-sender-id` (`currentUserId` null for Entra users) and `hotfix/message-sender-from-token` (`hey/send` trusted the body's `senderId`).
