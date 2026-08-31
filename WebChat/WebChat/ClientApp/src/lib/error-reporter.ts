/**
 * Reports the client's own crashes to `POST /api/client-errors`.
 *
 * **Hand-rolled rather than Sentry, and that was the decision the issue existed to take**
 * (#74). Sentry has to initialise at app start to catch anything, so its ~28 kB gzip would
 * land on the render-blocking payload of *every* visitor - including the overwhelming
 * majority who will never open `/admin`. The console itself hides behind a lazy route
 * precisely so it costs nothing until used; paying 13% of the initial bundle to report on it
 * inverts that. This file is what pays instead, and it is why it stays small.
 *
 * Three rules it must never break, because it runs at the exact moment the app is already
 * failing:
 *
 * 1. **Never throw.** Every entry point is wrapped. A reporter that throws turns one broken
 *    screen into a broken screen plus an error nobody can see the cause of.
 * 2. **Never block.** Nothing here is awaited by a caller, and the endpoint answers 202
 *    without touching the database.
 * 3. **Never re-enter.** A failure *inside* the reporter must not become a report, or one
 *    error becomes a loop. Hence `reporting` below, and hence the transport swallowing its
 *    own rejection rather than leaving one for `unhandledrejection` to find.
 *
 * The transport is `fetch(..., { keepalive: true })` and not `navigator.sendBeacon`: the
 * request needs an `Authorization` header and `sendBeacon` cannot set headers at all. Both
 * cap a body at 64 KiB, which a stack plus breadcrumbs can genuinely exceed, so everything is
 * truncated before it is sent. It deliberately does not go through `api-service`: that file is
 * axios, and this one call must not be - and routing it through there would make the import
 * cycle (api-service records `fetch` breadcrumbs here) real rather than one-directional.
 */

import Config from '@/config';

/** One breadcrumb, in the shape the errors screen renders. */
export interface Crumb {
  /** Wall-clock time on *this* machine - the reader wants the user's clock, not their own. */
  t: string;
  k: string;
  v: string;
}

export interface ErrorContext {
  /**
   * A **literal** name, never `Component.name`. Vite 8's minifier renames `AdminOverviewCard`
   * to `t`, and the production build ships no sourcemap, so anything derived at runtime is a
   * single letter that changes every deploy - and it is half the server's fingerprint, so the
   * whole section would re-open on every release.
   */
  component: string;
  /** The other half. `'render'` for an error boundary. */
  function: string;
  /** Defaults to `'error'`. An error boundary reports `'fatal'`: a screen stopped rendering. */
  level?: 'fatal' | 'error' | 'warning';
}

/** How many breadcrumbs are kept. Matches the server's own cap, so nothing is sent to be cut. */
const MAX_CRUMBS = 12;

/**
 * How many reports one page load may send.
 *
 * The last line of defence against a render loop, and the cheapest: it costs nothing and it
 * acts at the source, before the network. The server has two more - a rate limiter and a
 * bounded queue that drops - but by the time a loop is producing thousands of reports a
 * second, the issue is recorded and its count is already alarming. Nothing is learned from
 * report ten thousand that report twenty did not say.
 */
const MAX_REPORTS_PER_PAGE = 20;

const MAX_STACK_FRAMES = 40;
const MAX_MESSAGE = 500;
const MAX_CRUMB_VALUE = 200;

const crumbs: Crumb[] = [];

let sent = 0;
let reporting = false;
let getToken: () => string | null = () => null;

const clip = (value: unknown, length: number): string => {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length <= length ? text : text.slice(0, length);
};

/** "12:04:02" in the user's own clock. See `Crumb.t`. */
const now = (): string => new Date().toTimeString().slice(0, 8);

/**
 * Records something that happened, for the trail attached to the next report.
 *
 * A ring buffer, so it is bounded whether or not anything ever fails - this is called on every
 * click and every API call in a session that may run for hours.
 */
export const breadcrumb = (kind: string, value: unknown): void => {
  try {
    crumbs.push({ t: now(), k: clip(kind, 40), v: clip(value, MAX_CRUMB_VALUE) });
    if (crumbs.length > MAX_CRUMBS) crumbs.shift();
  } catch {
    /* a breadcrumb is never worth an exception */
  }
};

/** Only for tests: the buffer is module state and would otherwise leak between them. */
export const resetErrorReporter = (): void => {
  crumbs.length = 0;
  sent = 0;
  reporting = false;
  getToken = () => null;
};

/**
 * Wires up the token source and the two global handlers. Called once, from the entry point.
 *
 * The token is read through a function rather than passed in, because the reporter outlives
 * every session: someone signs in an hour after the page loaded, and the crash that happens
 * after that has to carry *their* token.
 */
export const installErrorReporter = (tokenSource: () => string | null): void => {
  getToken = tokenSource;

  // `error` fires for anything that escapes to the top, including errors React re-throws
  // after an error boundary has already handled them - which is why a boundary marks its own
  // report `fatal` and this one stays `error`, so the two are distinguishable rather than
  // deduplicated into whichever arrived first.
  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, { component: 'window', function: 'error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, { component: 'window', function: 'unhandledrejection' });
  });

  // The click listener is the only automatic breadcrumb source that costs anything on a
  // healthy session, and it is deliberately cheap: one capturing listener, one `closest`, no
  // work at all unless the click landed on something interactive.
  document.addEventListener(
    'click',
    (event) => {
      try {
        const target = event.target as Element | null;
        const control = target?.closest?.('button, a, [role="button"]');
        if (!control) return;

        const label =
          control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.tagName;

        breadcrumb('ui.click', label);
      } catch {
        /* see breadcrumb() */
      }
    },
    { capture: true, passive: true },
  );
};

/**
 * Reports one error. Fire and forget - callers must not await this, and there is nothing
 * useful to await.
 */
export const reportError = (error: unknown, context: ErrorContext): void => {
  // The re-entrancy guard. Anything that throws below is caught, but a *synchronous* failure
  // inside this function while it is already running - a global handler firing on our own
  // code - would otherwise recurse.
  if (reporting) return;
  reporting = true;

  try {
    if (sent >= MAX_REPORTS_PER_PAGE) return;
    sent += 1;

    // The exception crumb goes in *before* the payload is built, so the trail this report
    // carries ends with the failure rather than with whatever happened just before it. It also
    // stays in the ring buffer, which is what makes a second, different error downstream of
    // this one legible.
    const name = nameOf(error);
    breadcrumb('exception', `${name} in ${context.component}`);

    send(buildPayload(error, context, name));
  } catch {
    // Rule 1. There is nowhere to report a failure of the reporter to, and trying would be
    // the loop rule 3 exists to prevent.
  } finally {
    reporting = false;
  }
};

interface Payload {
  level: string;
  name: string;
  message: string;
  component: string;
  function: string;
  route: string;
  release: string;
  stack: string[];
  crumbs: Crumb[];
}

/**
 * A rejected promise carries anything at all, including a string or `undefined`. `Error` is
 * the common case and not the only one, so neither `error.name` nor `String(error)` is enough
 * on its own - and this is a third of the server's fingerprint, so getting it wrong groups
 * unrelated failures together.
 */
const nameOf = (error: unknown): string => {
  const named = (error as { name?: unknown } | null)?.name;
  if (typeof named === 'string' && named) return named;

  return error instanceof Error ? 'Error' : 'UnhandledRejection';
};

const buildPayload = (error: unknown, context: ErrorContext, name: string): Payload => {
  const err = error as { message?: unknown; stack?: unknown } | null;

  return {
    level: context.level ?? 'error',
    name: clip(name, 100),
    message: clip(typeof err?.message === 'string' ? err.message : error, MAX_MESSAGE),
    component: clip(context.component, 100),
    function: clip(context.function, 100),
    route: clip(window.location.pathname, 200),
    release: clip(import.meta.env.VITE_RELEASE ?? 'web@dev', 50),
    stack:
      typeof err?.stack === 'string'
        ? err.stack
            .split('\n')
            .slice(0, MAX_STACK_FRAMES)
            .map((frame) => frame.trim())
        : [],
    // A copy: the buffer keeps filling while the request is in flight.
    crumbs: crumbs.slice(),
  };
};

const send = (payload: Payload): void => {
  const token = getToken();

  // Nothing to send with. The endpoint is authenticated, so a crash on the sign-in or
  // invitation screens is not reported at all - a known blind spot, and a much better trade
  // than an unauthenticated endpoint anyone on the internet can write rows through.
  if (!token) return;

  // `keepalive` is what makes this survive the navigation or reload that often follows a
  // crash. It is also why the body has to be small: the browser caps a keepalive body at
  // 64 KiB, and exceeding it fails the whole request rather than truncating it.
  void fetch(`${Config.network.api}api/client-errors`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Swallowed rather than logged. An unhandled rejection here would be caught by the
    // handler this module installed, reported, fail again, and so on - rule 3.
  });
};
