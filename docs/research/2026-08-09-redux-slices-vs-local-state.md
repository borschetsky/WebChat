# What does Redux Toolkit's own guidance say about "all state in slices, RTK Query everywhere" — and where is local component state still correct?

- **Date:** 2026-08-09
- **Status:** answered
- **Question:** How much of the instruction "RTK Query everywhere, no plain functions in the ts files, all state in slices, no local state" should the client actually adopt, and which parts are contradicted by Redux's own documentation?
- **Recommendation:** Adopt **two** of the four asks (route the three remaining hand-written fetches through RTK Query; take auth through the seam per issue #29) — and reject **"no local state"** and **"no plain functions"** outright, because Redux's own Style Guide contains a Priority B rule written specifically to refute "all state in Redux", a Priority C rule titled *Avoid Putting Form State In Redux*, and a Priority A rule that this repo would violate by moving two of the `useState`s into slices at all.

## The short answer

Redux's published guidance does not say what the instruction assumes it says, and has not since 2022. The Style Guide's Priority B rule **Evaluate Where Each Piece of State Should Live** exists to correct exactly this over-reading: *"This phrasing has been over-interpreted. It does not mean that literally every value in the entire app must be kept in the Redux store."* A separate Priority C rule, **Avoid Putting Form State In Redux**, says *"Most form state shouldn't go in Redux"* and names dispatching on every change event as the failure mode. Meanwhile the one part of the instruction Redux *does* endorse — **Use RTK Query for Data Fetching**, *"We recommend against writing data fetching logic by hand in almost all cases"* — is the part this repo has not finished: `ComposeDialog` still hand-rolls a debounced directory search with its own `loading` flag while `chatApi` already exposes `searchDirectory`, and the six auth screens hand-roll `sending`/`sent`/`failed` triples for requests that never enter the api at all.

So the honest reframing for the owner is: **the goal is right, the mechanism named is wrong.** Of the 31 `useState` declarations in the 12 non-test files, roughly 13 should disappear — but they disappear into **RTK Query's own cache**, which *is* Redux state (the api reducer is a slice, and mutation status lives in the store), not into hand-written slices. Another ~5 are load-bearing local state that Redux's Priority A rule forbids putting in the store. The rest are form fields, which the Style Guide tells you to leave alone.

The existing `fakeBaseQuery` + `queryFn` seam is **not** a workaround to be undone. The RTK Query docs state it directly: *"at its core, RTK Query is really about tracking loading state and cached values for **any** async request/response sequence, not just HTTP requests"*, and list third-party-SDK delegation among the supported `queryFn` use cases. It has four concrete, enumerable costs (below), none of which this repo is currently paying.

## What decides it

**Fact 1 — the deciding one. Redux wrote the rebuttal to this instruction itself, and it is still the current text.** The Style Guide's last substantive commit is `2022-12-27` ("Add 'Side Effects Approaches' doc and update recommendations"); the only later change to the file is `2023-11-25`, a cosmetic ES2015 wording sweep (checked via the GitHub API against `reduxjs/redux`, path `docs/style-guide/style-guide.md`, 2026-08-09). There is no newer "all state in slices" era to catch up with — the "all state in Redux" era ended *before* the guidance the repo is being measured against was written. Any argument for the instruction has to be made on this project's own merits, not as "what Redux says".

**Fact 2 — the React Compiler is not in this build, so the performance argument cuts the other way.** `ClientApp/vite.config.ts` calls a bare `react()` and `babel-plugin-react-compiler` is absent from `package.json`; `@vitejs/plugin-react`'s README states React Compiler support requires explicitly opting in via `reactCompilerPreset` plus `@rolldown/plugin-babel` and `babel-plugin-react-compiler`. The repo has the compiler *lint rules* (`.oxlintrc.json` loads `eslint-plugin-react-hooks` v7 and enables `rh/purity`, `rh/immutability`, `rh/preserve-manual-memoization`) — but lint rules memoize nothing. So there is no auto-memoisation to lean on, and the React-Redux docs are explicit about the cost of dispatching often: *"`useSelector()` will also subscribe to the Redux store, and run your selector whenever an action is dispatched"*, and *"Each call to `useSelector()` creates an individual subscription to the Redux store."* There are **18 selector call sites** in `src` outside tests. Moving `AuthScreen`'s three text fields into a slice means three selector-sweeps per keystroke where today there are zero — and the repo already has a render-counting regression test (`src/test/rerender.test.tsx`) asserting five keystrokes produce zero message-row renders. `composerSlice` is the *exception that proves the rule*: it exists only because nothing else subscribes to it, and `docs/ctx/2026-08-03-redux-toolkit-refactor.md` records that even `ChatApp` is forbidden from reading the draft for this reason.

Two facts that look decisive and are not: bundle size (RTK Query is already installed, so the marginal cost of more endpoints is ~0) and time-travel debugging (real, but the Style Guide itself waves it off for forms: *"You probably don't need to time-travel backwards one character from `name: \"Mark\"` to `name: \"Mar\"`."*).

## Verdict on each of the four asks

| Ask | Redux's own position | Verdict here |
|---|---|---|
| "RTK Query is everywhere" | **Endorsed.** Priority C: *"we recommend using RTK Query as the default approach for data fetching and caching in a Redux app… We recommend against writing data fetching logic by hand in almost all cases."* | **Adopt.** Three sites still hand-roll fetching. Highest-value work in the whole list. |
| "All state is in slices" | **Contradicted.** Priority B: *"there should be a single place to find all values that you consider to be global and app-wide. Values that are 'local' should generally be kept in the nearest UI component instead."* | **Reject as stated; adopt in spirit.** ~13 `useState`s go away by becoming RTK Query cache state — which *is* store state. ~5 more must not. |
| "No local state" | **Contradicted twice.** Priority C *Avoid Putting Form State In Redux*; Priority A *Do Not Put Non-Serializable Values in State or Actions*. The Redux FAQ says flatly: ***"Using local component state is fine."*** | **Reject.** Two current `useState`s hold `HTMLElement`s; moving them violates a Priority A ("Essential") rule. |
| "No plain functions in the ts files" | **Contradicted.** The Style Guide pushes logic *into* plain functions: *"Reducers are always easy to test, because they are pure functions"*; *"We still encourage moving complex synchronous or async logic outside components"*; *"We strongly recommend using memoized selector functions."* | **Reject.** `services/adapters.ts` is pure functions with 18 tests against it. Reducers, selectors, thunks and adapters *are* plain functions. |

Note the pleasing consequence of the first row: **converting the auth screens' `sending`/`sent`/`failed` flags to `useMutation` genuinely satisfies "all state in slices"** — RTK Query's `api` reducer is a slice, mutation status lives in the store, and the DevTools show it. The owner gets what they asked for by deleting code rather than writing slices.

## Options

### Option A — Finish RTK Query where fetching is still hand-written (recommended, do first)

**What it covers.** `ComposeDialog.jsx`'s `people` + `loading` + the 250 ms debounce effect, replaced by `useSearchDirectoryQuery(term, { skip: !term })` — the endpoint already exists in `chatApi.ts` and is currently reached only via a prop-drilled `onSearch` callback.

**Cost.** Small; one component. **Ongoing burden: negative** — it deletes the effect that caused the documented request loop in `docs/ctx/2026-08-04-compose-search-render-loop.md`, along with the `useRef(onSearch)` workaround and the `oxlint-disable-next-line rh/set-state-in-effect` suppression that effect needs. Debounce becomes a `useDeferredValue` or a small `useDebounce` on the query arg only.

**What it rules out later.** Nothing. RTK Query dedupes and caches directory searches across dialog opens, which the current code cannot.

**Watch item.** The existing regression test pins the loop behaviour; it must be rewritten, not deleted, or the guard is lost.

### Option B — Take auth through the seam and the api (recommended, do second; this is issue #29)

**What it covers.** `register` / `login` / `confirm` / `resendConfirmation` / `forgotPassword` / `resetPassword` as `build.mutation` entries in `chatApi` (or a sibling api), each a `queryFn` delegating to `chat-service`, matching the pattern the other 10 endpoints already use. Kills the `sending`/`sent`/`failed`/`busy`/`error`/`saving`/`resending`/`resent` flags in `CheckYourEmail` (3), `ConfirmEmail` (1), `ForgotPassword` (3 of 4), `ResetPassword` (2 of 4) and `SettingsDrawer` (2 of 4) — **11 declarations** replaced by `isLoading` / `isSuccess` / `isError` from the mutation tuple, which the RTK Query docs define exactly as *"indicates that the mutation has been fired and is awaiting a response"* / *"…has data from a successful request"* / *"…resulted in an error state"*.

**This is what RTK Query's own authentication example does.** I read `examples/query/react/authentication/src/features/auth/{authSlice.tsx,Login.tsx}` in `reduxjs/redux-toolkit@master`: a `useLoginMutation()` supplying `isLoading`, and an `authSlice` with a `setCredentials` reducer holding `{ user, token }`. Note what that same official example does with the form itself:

```tsx
const [formState, setFormState] = React.useState<LoginRequest>({ username: '', password: '' })
const [login, { isLoading }] = useLoginMutation()
```

**Redux's own reference implementation of "auth via RTK Query" keeps the credential form in `useState`.** That is the single most useful artefact in this note for the conversation with the owner.

**Cost.** Medium — six endpoints plus the `chat-service`/`mocks` entries. **What it rules out later:** nothing; it *removes* the current asymmetry where auth is the only feature bypassing the seam. Reversible.

**Watch item.** By default *"separate instances of a `useMutation` hook are not inherently related to each other. Triggering one instance will not affect the result for a separate instance."* If two components must observe the same login attempt, that needs `fixedCacheKey`. Also decide up front whether `authSlice` is populated by an explicit `dispatch(setCredentials(...))` or by `extraReducers` + `chatApi.endpoints.login.matchFulfilled` — the official example shows both; `matchFulfilled` keeps the component from having to remember.

### Option C — Move theme mode/density into `uiSlice` (optional, genuine judgement call)

`ThemeModeProvider.jsx`'s `storedMode` and `density` are the *only* two current `useState`s that clear the Redux FAQ's rules of thumb — *"Do other parts of the application care about this data? … Is the same data being used to drive multiple components? … Do you want to keep this data consistent while hot-reloading UI components (which may lose their internal state when swapped)?"* — all yes.

**Cost.** Medium and diffuse: every consumer of the context changes, and the provider currently works independently of the store. **Constraint that must be respected:** the built MUI `theme` object must **not** enter the store — Priority A, *"Avoid putting non-serializable values such as Promises, Symbols, Maps/Sets, functions, or class instances into the Redux store state"*. Keep `buildTheme(mode)` in a `useMemo` fed by a selector. Also note `mode = storedMode ?? (prefersDark ? 'dark' : 'light')` is *derived*; only `storedMode` should be stored, per *Keep State Minimal and Derive Additional Values*.

**Would make it right:** if a thunk, middleware or hub handler ever needs to read the theme, or if the preference needs to round-trip to the server profile. Neither is true today, so this is the one item I would defer.

### Option D — Move form fields and menu anchors into slices (recommended against)

- **Form fields** — `AuthScreen` (username/email/password/errors), `ComposeDialog.q`, `SettingsDrawer` (name/email), `ResetPassword` (password/confirm), `ForgotPassword.email`. Directly against *Avoid Putting Form State In Redux*: *"the data is not truly global, is not being cached, and is not being used by multiple components at once… connecting forms to Redux often involves dispatching actions on every single change event, which causes performance overhead and provides no real benefit."* The rule names its own exception — *"WYSIWYG live previews of edited item attributes"* — which is exactly why `composerSlice` is legitimate and these are not. `errors` is worse still: it is derivable from the fields at submit time, and *You Might Not Need an Effect* says *"When something can be calculated from the existing props or state, don't put it in state. Instead, calculate it during rendering."*
- **`Composer.tsx:56 anchor`** (`HTMLElement | null`) and **`ThreadList.jsx:65 bell`** (an MUI `anchorEl` DOM node). These are **Priority A** violations, not preferences. RTK's `serializableCheck` middleware would warn on them in development. There is no correct way to do this ask.
- **`PresenceAvatar.tsx:36 broken`** — set from an `<img onError>`, one instance per avatar, and it must reset when `avatarFileName` changes. In the store it becomes a global registry of failed image loads with no eviction. Leave it.
- **`App.jsx:67 pending`** — already carries an in-code justification for being local ("worthless after a reload"). Redux state has no unmount, and React's `key`-based reset (*"By passing `userId` as a `key`… you're asking React to treat two `Profile` components with different `userId` as two different components that should not share any state"*) has no Redux equivalent; you would have to hand-write teardown actions to emulate it.

### Option E — Replace `fakeBaseQuery` + `queryFn` with `fetchBaseQuery` (recommended against)

Supported pattern, not a workaround — the docs' `queryFn` use-case list includes *"Queries that make requests using a third-party library SDK"* and *"Queries that perform async tasks that are not a typical request/response"*, and the `fakeBaseQuery` JSDoc reads *"Creates a 'fake' baseQuery to be used if your api only uses the `queryFn` definition syntax."* CLAUDE.md already records why the seam exists. The four things it actually costs, all verified:

1. **`transformResponse` / `transformErrorResponse` are unavailable.** `createApi.mdx` marks both *"(optional, not applicable with `queryFn`)"*, as it does `rawResponseSchema` and `rawErrorResponseSchema`. Not a loss here — `services/adapters.ts` does that job and has 18 tests.
2. **`retry` cannot fire.** `packages/toolkit/src/query/retry.ts` is a `BaseQueryEnhancer` whose loop calls `await baseQuery(args, api, extraOptions)`; a `queryFn` endpoint never invokes `baseQuery`, and `fakeBaseQuery` *throws* if anything does. Per-endpoint retry must be hand-written inside the `queryFn`. **Not documented anywhere — established by reading the source.**
3. **`@rtk-query/codegen-openapi` output is unusable.** It injects `query:`-style endpoints into an existing `apiFile` that must already supply a working `baseQuery`. Irrelevant unless the API grows an OpenAPI document.
4. **Request cancellation is not currently plumbed.** `queryFn` receives `api.signal`, and none of the 10 `queryFn`s in `chatApi.ts` forward it to `chat-service`. Unmounting mid-flight abandons the promise rather than aborting the HTTP request. This is a real, cheap fix and is orthogonal to everything else in this note.

Everything else is unaffected: tags and invalidation, `onQueryStarted` and optimistic updates, cache lifecycle, polling, `selectFromResult`, request dedup, `keepUnusedDataFor`, generated hooks.

## The rule to apply per `useState`

Ordered; first match wins. This replaces case-by-case taste.

1. **Is the value non-serializable** — DOM node, `File`, `Promise`, `Map`/`Set`, class instance, function, `HubConnection`? → **Must stay out of the store.** Priority A. Stop. *(`Composer.anchor`, `ThreadList.bell`; the repo already applies this to `File` and to the SignalR connection.)*
2. **Is it derivable** from props, other state, or the store? → **It is not state at all.** Compute during render. *(`AuthScreen.errors`, `ThemeModeProvider.mode`, `ComposeDialog`'s empty-term clearing.)*
3. **Is it the lifecycle or result of a server request** — loading / succeeded / failed / the data? → **RTK Query owns it.** Not a hand-written slice, not `useState`. *(all 11 auth/settings flags; `ComposeDialog.people` + `loading`.)*
4. **Would it be wrong for this to survive unmount or a route change?** → **local.** Redux has no unmount and cannot use React's `key` reset. *(`App.pending`, `PresenceAvatar.broken`.)*
5. **Does something outside this subtree need it** — a sibling, middleware, a thunk, a hub handler, or persistence? → **slice.** *(`ThemeModeProvider` if Option C is taken.)*
6. **Does it change per keystroke or per frame?** → **local**, unless it gets a dedicated slice that *nothing else subscribes to* and the isolation is covered by a test. *(the `composerSlice` exception.)*
7. **Otherwise → local.** The store is opt-in. *"Using local component state is fine."*

## Migration order and cost

Ranked on **value per unit of risk**, not on lines removed.

| # | Change | `useState`s removed | Risk | Reversible? |
|---|---|---|---|---|
| 1 | `ComposeDialog` → `useSearchDirectoryQuery` (Option A) | 2 of 5 | Low — one file, existing regression test must be rewritten | Trivially |
| 2 | Forward `api.signal` from the 10 `queryFn`s into `chat-service` | 0 | Low | Trivially |
| 3 | Auth + settings mutations through the seam (Option B, issue #29) | 11 | Medium — six new endpoints, mocks, and the `authSlice` population choice | Yes, per endpoint |
| 4 | Theme mode/density → `uiSlice` (Option C) | 2 | Medium, diffuse — touches every context consumer | Yes, but tedious |
| — | Form fields, menu anchors, `broken`, `pending` → slices (Option D) | — | **Net negative** — Priority A/C violations, threatens the render-count invariant | n/a |
| — | `fetchBaseQuery` instead of the seam (Option E) | — | **Net negative** — destroys the mock seam CLAUDE.md exists to protect | Expensive to undo |

Items 1–3 leave **~18** `useState` declarations, essentially all form fields and per-instance UI — which is what Redux's own auth example looks like. **Every item here is reversible**; none changes a data format, a wire protocol or anything persisted. That argues for doing 1 and 2 immediately without further deliberation, and treating 3 as the real piece of work.

## What I could not confirm

- **No measured numbers exist for the "dispatch per keystroke" cost in any Redux primary source.** The React-Redux docs give the *mechanism* ("run your selector whenever an action is dispatched") and the Style Guide asserts "performance overhead" without quantifying it. The Redux performance FAQ actively downplays reducer cost (*"reducer speed is unlikely to be a problem"*). The 18-selector figure and the render-counting test are this repo's own evidence, not Redux's. Anyone citing a millisecond figure for this is not citing Redux.
- **`retry` not applying to `queryFn` endpoints is undocumented.** Established by reading `retry.ts` and `fakeBaseQuery.ts` at `reduxjs/redux-toolkit@master` on 2026-08-09. I did not write a test to prove it.
- **`@rtk-query/codegen-openapi` output shape** is inferred from the code-generation doc's requirement of a pre-existing `apiFile` carrying a `baseQuery`; I did not read a generated file.
- **Whether the React Compiler would change item 4's calculus** — untested, because the compiler is not installed. Its docs do claim it can *"avoid re-rendering `<MessageButton>` as the count changes"*, i.e. it can suppress child re-renders from a parent's state change. Adopting `babel-plugin-react-compiler@1.0.0` would weaken the *performance* argument for lifting state, but not the Priority A or form-state arguments, which are about correctness rather than speed. Worth its own note if it is ever considered.
- **React 19 `useActionState` / `useOptimistic` as a form alternative** — verified they exist and what they do, but I did not evaluate them against MUI v9 controlled inputs or against RTK Query's `onQueryStarted` optimistic path, which this repo already uses for optimistic send. `useOptimistic`'s set function *must* be called inside an Action or Transition or the state reverts immediately; that constraint makes mixing it with an RTK Query mutation non-obvious. Do not adopt either on the strength of this note.
- **Version currency:** `@reduxjs/toolkit@2.12.0` is npm `latest`, published 2026-05-15; `react@19.2.8`; `babel-plugin-react-compiler@1.0.0`. The repo's `package.json` is on `^2.12.0` and `^19.2.8`, i.e. current. Re-check the Style Guide's last-modified date before relying on the "guidance has not changed" claim after mid-2027.

## Sources

All fetched 2026-08-09.

- [Redux Style Guide](https://redux.js.org/style-guide/) — established the full rule list and priorities, and the verbatim text of *Evaluate Where Each Piece of State Should Live* (B), *Avoid Putting Form State In Redux* (C), *Do Not Put Non-Serializable Values in State or Actions* (A), *Use RTK Query for Data Fetching* (C), *Put as Much Logic as Possible in Reducers* (B), *Keep State Minimal and Derive Additional Values* (B), *Use Selector Functions to Read from Store State* (C), *Move Complex Logic Outside Components* (C). This is the single most load-bearing source in the note.
- [Redux FAQ: Organizing State](https://redux.js.org/faq/organizing-state) — *"Using local component state is fine"* and the six rules-of-thumb the per-`useState` rule is built from.
- [Redux FAQ: Performance](https://redux.js.org/faq/performance) — establishes that Redux does **not** publish numbers for high-frequency dispatch, and downplays reducer cost.
- [React-Redux: Hooks API](https://react-redux.js.org/api/hooks) — *"run your selector whenever an action is dispatched"*; *"Each call to `useSelector()` creates an individual subscription."*
- [RTK Query: Customizing Queries](https://redux-toolkit.js.org/rtk-query/usage/customizing-queries) (and the raw [`customizing-queries.mdx`](https://raw.githubusercontent.com/reduxjs/redux-toolkit/master/docs/rtk-query/usage/customizing-queries.mdx)) — *"RTK Query is really about tracking loading state and cached values for any async request/response sequence"*; the `queryFn` use-case list; the `fakeBaseQuery` + third-party-SDK example. Establishes the seam as supported.
- [`createApi` API reference](https://redux-toolkit.js.org/rtk-query/api/createApi) (raw [`createApi.mdx`](https://raw.githubusercontent.com/reduxjs/redux-toolkit/master/docs/rtk-query/api/createApi.mdx)) — the four *"not applicable with `queryFn`"* options.
- [`packages/toolkit/src/query/retry.ts`](https://raw.githubusercontent.com/reduxjs/redux-toolkit/master/packages/toolkit/src/query/retry.ts) and [`fakeBaseQuery.ts`](https://raw.githubusercontent.com/reduxjs/redux-toolkit/master/packages/toolkit/src/query/fakeBaseQuery.ts) — source proof that `retry` wraps `baseQuery` only, and that `fakeBaseQuery` throws if invoked.
- [RTK Query: Mutations](https://redux-toolkit.js.org/rtk-query/usage/mutations) — `isLoading`/`isSuccess`/`isError`/`reset`, per-instance isolation, `fixedCacheKey`, `unwrap()`.
- `reduxjs/redux-toolkit@master`, `examples/query/react/authentication/src/features/auth/{authSlice.tsx,Login.tsx}` (read via the GitHub contents API) — **the official auth example keeps the login form in `React.useState`.** The rendered [Examples page](https://redux-toolkit.js.org/rtk-query/usage/examples) is *not* usable for this: the code lives in CodeSandbox iframes and does not appear in the fetched HTML. Go to the repo.
- [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — derived state ("calculate it during rendering") and the `key`-based state reset that Redux cannot replicate.
- [React: useActionState](https://react.dev/reference/react/useActionState) and [useOptimistic](https://react.dev/reference/react/useOptimistic) — signatures and the Action/Transition constraint.
- [React Compiler: Introduction](https://react.dev/learn/react-compiler/introduction) — *"React Compiler is now stable"*; it can avoid re-rendering children. Describes a **build-time** tool; the docs nowhere claim lint rules alone memoize.
- [`@vitejs/plugin-react` README](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) — React Compiler requires explicit opt-in via `reactCompilerPreset`; confirms it is off in this repo.
- `reduxjs/redux` commit history for `docs/style-guide/style-guide.md` via the GitHub API — last substantive change 2022-12-27, cosmetic 2023-11-25.
- npm registry (`@reduxjs/toolkit`, `react`, `babel-plugin-react-compiler`) — version and publish-date currency.
- Repo-local, re-verified rather than assumed: `ClientApp/package.json`, `ClientApp/vite.config.ts`, `ClientApp/.oxlintrc.json`, `src/app/api/chatApi.ts`, `src/features/threads/ComposeDialog.jsx`, `src/features/composer/Composer.tsx`, `src/components/PresenceAvatar.tsx`, `src/theme/ThemeModeProvider.jsx`, `src/app/App.jsx`, and `docs/ctx/2026-08-03-redux-toolkit-refactor.md`. Counts: **31 `useState` declarations across 12 non-test files** (the "42" in the brief is raw `useState|useReducer` occurrences including imports and tests — 42 with tests, 40 without); **18 `useSelector`/`useAppSelector` call sites**; **10 `chatApi` endpoints**, all `queryFn`, none forwarding `api.signal`.
