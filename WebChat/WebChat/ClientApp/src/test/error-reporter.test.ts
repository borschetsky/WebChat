import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  breadcrumb,
  installErrorReporter,
  reportError,
  resetErrorReporter,
} from '@/lib/error-reporter';

/**
 * The crash reporter (#74).
 *
 * Everything here is a property of code that runs *while the app is already failing*, which is
 * why it is worth testing rather than eyeballing: the failure mode of a reporter that throws,
 * blocks or re-enters is a browser that hangs or loops on the one screen a user is already
 * unhappy with, and none of that is visible from reading the call site.
 */

const post = vi.fn();

const bodyOf = (call: unknown[]) =>
  JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;

describe('the client error reporter', () => {
  beforeEach(() => {
    resetErrorReporter();
    post.mockReset();
    post.mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', post);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const install = (token: string | null = 'jwt') => installErrorReporter(() => token);

  it('posts the literal component and function it was given, not a derived one', () => {
    install();

    reportError(new TypeError('boom'), {
      component: 'AdminOverview',
      function: 'render',
      level: 'fatal',
    });

    expect(post).toHaveBeenCalledTimes(1);

    const body = bodyOf(post.mock.calls[0]);
    expect(body.component).toBe('AdminOverview');
    expect(body.function).toBe('render');
    expect(body.name).toBe('TypeError');
    expect(body.message).toBe('boom');
    expect(body.level).toBe('fatal');
  });

  /**
   * `keepalive` is what makes a report survive the reload that often follows a crash, and the
   * `Authorization` header is why this is `fetch` and not `sendBeacon` - which cannot set
   * headers at all.
   */
  it('sends with keepalive and a bearer token', () => {
    install('a-real-token');

    reportError(new Error('boom'), { component: 'ChatApp', function: 'render' });

    const [url, init] = post.mock.calls[0] as [string, RequestInit & { keepalive: boolean }];

    expect(url).toContain('api/client-errors');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer a-real-token');
  });

  /**
   * The endpoint is authenticated, so this is a real blind spot rather than an oversight: a
   * crash on the sign-in or invitation screens is not reported. Asserted so that nobody
   * "fixes" it by sending an unauthenticated request that the server would refuse anyway.
   */
  it('sends nothing when there is no session', () => {
    install(null);

    reportError(new Error('boom'), { component: 'AuthScreen', function: 'render' });

    expect(post).not.toHaveBeenCalled();
  });

  it('attaches the recent breadcrumbs, oldest first, and its own exception crumb', () => {
    install();

    breadcrumb('navigation', '/dashboard');
    breadcrumb('fetch', 'GET /api/threads · 200');

    reportError(new TypeError('boom'), { component: 'ThreadList', function: 'render' });

    const crumbs = bodyOf(post.mock.calls[0]).crumbs as { k: string; v: string }[];

    expect(crumbs.map((c) => c.k)).toEqual(['navigation', 'fetch', 'exception']);
    expect(crumbs[2].v).toBe('TypeError in ThreadList');
  });

  /** A ring buffer, because this is called on every click of a session that may run for hours. */
  it('keeps only the most recent breadcrumbs', () => {
    install();

    for (let i = 0; i < 40; i++) breadcrumb('ui.click', `click-${i}`);

    reportError(new Error('boom'), { component: 'ChatApp', function: 'render' });

    const crumbs = bodyOf(post.mock.calls[0]).crumbs as { v: string }[];

    expect(crumbs.length).toBeLessThanOrEqual(12);
    // The ones nearest the failure, not the ones nearest the page load.
    expect(crumbs.at(-2)?.v).toBe('click-39');
  });

  /**
   * The cap is the cheapest defence against a render loop and the only one that acts before
   * the network. The server has two more behind it.
   */
  it('stops after a bounded number of reports from one page load', () => {
    install();

    for (let i = 0; i < 100; i++) {
      reportError(new Error(`boom ${i}`), { component: 'ChatApp', function: 'render' });
    }

    expect(post).toHaveBeenCalledTimes(20);
  });

  /**
   * Rule 1: never throw. A reporter that throws turns one broken screen into a broken screen
   * plus a second error with no visible cause.
   */
  it('does not throw when the transport itself fails', () => {
    install();
    post.mockImplementation(() => {
      throw new Error('network is down');
    });

    expect(() =>
      reportError(new Error('boom'), { component: 'ChatApp', function: 'render' }),
    ).not.toThrow();
  });

  /**
   * A refused report produces exactly one call and no throw - it is not retried, and the
   * failure does not propagate to the caller, which is what "never block, never throw" means
   * for the transport.
   *
   * **This does not prove the rejection is swallowed**, and the distinction is worth stating
   * rather than glossing: with the transport's `.catch` deleted the whole file still passes,
   * because neither vitest nor a `process.on('unhandledRejection')` listener surfaces the
   * rejection in this environment - both were tried. The scan below is what actually guards
   * it.
   */
  it('does not retry or rethrow a refused report', async () => {
    install();
    post.mockRejectedValue(new Error('502'));

    reportError(new Error('boom'), { component: 'ChatApp', function: 'render' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(post).toHaveBeenCalledTimes(1);
  });

  /**
   * A rejected promise carries anything at all. `Error` is the common case, not the only one,
   * so neither `error.name` nor `String(error)` is enough on its own.
   */
  it('names a rejection that is not an Error at all', () => {
    install();

    reportError('just a string', { component: 'window', function: 'unhandledrejection' });

    const body = bodyOf(post.mock.calls[0]);
    expect(body.name).toBe('UnhandledRejection');
    expect(body.message).toBe('just a string');
    expect(body.stack).toEqual([]);
  });

  /**
   * The transport caps a keepalive body at 64 KiB and the server's columns have lengths.
   * Truncating on both sides is not redundant: the client is what stops the request failing
   * outright, and the server is what stops it trusting the client.
   */
  it('truncates the message and the stack before sending', () => {
    install();

    const error = new Error('m'.repeat(10_000));
    error.stack = Array.from({ length: 500 }, (_, i) => `    at frame${i}`).join('\n');

    reportError(error, { component: 'ChatApp', function: 'render' });

    const body = bodyOf(post.mock.calls[0]);
    expect((body.message as string).length).toBe(500);
    expect((body.stack as string[]).length).toBe(40);
  });

  it('reports the route it happened on', () => {
    install();

    reportError(new Error('boom'), { component: 'AdminConsole', function: 'render' });

    expect(bodyOf(post.mock.calls[0]).route).toBe(window.location.pathname);
  });
});

/**
 * A source scan, in the same spirit as `mui-drift.test.tsx`, and here for the same reason: the
 * thing it guards cannot be observed from a test, and its failure mode in production is a
 * self-sustaining loop.
 *
 * Delete the `.catch` on the transport and the fetch rejection becomes an unhandled rejection.
 * This module's own `unhandledrejection` handler catches it, reports it, that report fails,
 * and the app reports its way to the per-page cap over a network that is already refusing
 * requests. Nothing in the test run notices - verified by deleting it.
 */
describe('the transport swallows its own failure', () => {
  it('attaches a catch to the report request', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/error-reporter.ts'), 'utf8');

    // The whole `fetch(...)` call expression, up to the statement's end.
    const call = source.slice(source.indexOf('fetch(`'));

    expect(call.slice(0, call.indexOf('};'))).toContain('.catch(');
  });
});
