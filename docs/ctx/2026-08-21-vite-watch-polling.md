# The dev server stops lying about your code

- **Date:** 2026-08-21
- **Type:** fix
- **Scope:** `ClientApp/vite.config.ts`, `WebChat/docker-compose.yml`
- **Status:** done

## Context

Issue #91, branch `chore/91-vite-watch-polling`. Filed during #84 and deliberately kept out of
that PR so the crop change stayed one subject.

Under `docker compose`, the container bind-mounts the host's source. **inotify events do not
cross a Docker bind mount on a Windows or macOS host**, so Vite's watcher never fired, the module
graph was never invalidated, and the dev server kept serving the transform it had cached the
first time the browser asked. The file on disk and the file in the browser silently disagreed.

The cost is not a missing reload. It is that **a browser check becomes evidence for the wrong
thing** — during #84 this produced a confident, wrong bug report (a PNG reported as stored
unconverted, on the strength of a page running code that no longer existed). The documented
workaround was to restart `react-app` after every edit and to distrust any browser check until
the served module had been compared to the file.

## Reproduced first

Not inferred from the absence of a config key — demonstrated against the running stack. Request a
module so Vite caches its transform, edit the file on the host, request again:

```
1. prime cache -> marker in served module: 0
2. marker now on disk:                     1
3. served module after edit:               0     <- stale
```

## The fix

`docker-compose.yml` sets `VITE_USE_POLLING=true` on the `react-app` service; `vite.config.ts`
turns that into `server.watch: { usePolling: true, interval: 300 }`.

Same probe after the change:

```
polling active in container: true
1. prime cache ->      0
2. on disk ->          1
3. served after edit -> 1     <- the watcher fired
```

No container restart involved.

## Decisions

- **Opt-in, not unconditional.** Polling wakes the process on a timer and costs CPU for the whole
  session; a native `npm run dev` on the host has working inotify and should not pay for it. The
  variable is set in `docker-compose.yml` and nowhere else.
- **The consequence of opt-in, stated because it is the failure mode:** any *other* way of
  running the dev server over a bind mount — a hand-written `docker run`, a different compose
  file, a devcontainer — brings the trap straight back, silently. There is nothing in the code
  that can detect it.
- **300 ms**, a compromise: fast enough that saving and alt-tabbing feels immediate, slow enough
  not to spin a core over a few hundred files.
- Left `watch: undefined` rather than `{}` when the variable is absent, so Vite's own default
  applies rather than an empty override.

## Verified

- The before/after probe above, against the real compose stack.
- `npm run verify` — 284 tests across 21 files, `vite build` clean. No source file changed, so
  no test moves; this is configuration, and the probe is the test that matters.
- Diff confined to the two config files (`git status` checked after reverting the probe, because
  the reproduction edits a source file and leaving that marker behind would have been the actual
  regression here).

## Not verified

That a browser now hot-reloads visually — only that the **served module** changes, which is the
mechanism underneath the reload and the thing the false bug report turned on. A macOS host: the
inotify limitation is documented for both, but only Windows was reproduced here. CPU cost of
polling was not measured.

## Follow-up

Both `CLAUDE.md` and `ORIENTATION.md` carried this trap and its restart-the-container workaround.
Both are corrected rather than deleted — the shape of the failure is still worth knowing, because
the fix is opt-in and can be left off.
