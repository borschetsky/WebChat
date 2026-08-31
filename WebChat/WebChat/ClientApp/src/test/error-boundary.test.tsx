import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const reportError = vi.fn();

vi.mock('@/lib/error-reporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/error-reporter')>()),
  reportError: (...args: unknown[]) => reportError(...args),
}));

const { default: AppErrorBoundary } = await import('@/components/AppErrorBoundary');

/**
 * The first error boundary this client has ever had (#74).
 *
 * Before this there were none at all - no `componentDidCatch`, no `getDerivedStateFromError`
 * anywhere in `src` - so any render error blanked the whole document with nothing reported and
 * nothing shown.
 */

function Explodes(): never {
  throw new TypeError('render exploded');
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    reportError.mockReset();
    // React logs a caught render error to the console on purpose. Silenced so a passing test
    // does not print a stack trace that reads like a failure.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows a fallback instead of a blank page', () => {
    render(
      <AppErrorBoundary name="AdminOverview">
        <Explodes />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  /**
   * The literal name is the whole reason this component takes a `name` prop. `Component.name`
   * is `t` in a production build - Vite 8 minifies and this app ships no sourcemap - and the
   * server fingerprints on it, so a runtime name would change every deploy and re-open every
   * issue with it.
   */
  it('reports under the literal name it was given, as fatal', () => {
    render(
      <AppErrorBoundary name="AdminOverview">
        <Explodes />
      </AppErrorBoundary>,
    );

    expect(reportError).toHaveBeenCalledTimes(1);

    const [error, context] = reportError.mock.calls[0] as [Error, Record<string, string>];
    expect(error.message).toBe('render exploded');
    expect(context.component).toBe('AdminOverview');
    expect(context.function).toBe('render');
    expect(context.level).toBe('fatal');
  });

  it('renders its children untouched when nothing throws', () => {
    render(
      <AppErrorBoundary name="ChatApp">
        <p>the app</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('the app')).toBeInTheDocument();
    expect(reportError).not.toHaveBeenCalled();
  });
});

/**
 * A source scan, in the same spirit as `mui-drift.test.tsx`: the mistake this guards is silent
 * and would only surface as an errors section that re-opens itself on every deploy - by which
 * point nobody would connect the two.
 *
 * It is deliberately narrow. It does not try to prove a name is a *literal* - one legitimate
 * use passes `SECTION_BOUNDARY[tab]`, a lookup in a table of literals - only that a boundary
 * always has a name, and that no name is ever read off a component at runtime.
 */
describe('every AppErrorBoundary names itself', () => {
  const root = join(process.cwd(), 'src');

  // `src/test` is skipped, and it has to be: this file contains the pattern below as a
  // literal, so a scan that included itself would report its own regex as a boundary with no
  // name. Test fixtures are not shipped and do not report anything anyway.
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return entry === 'test' ? [] : sources(path);
      return /\.(jsx?|tsx?)$/.test(entry) ? [path] : [];
    });

  it('passes a name that is not derived from a minifiable identifier', () => {
    const offenders: string[] = [];
    let found = 0;

    for (const path of sources(root)) {
      const text = readFileSync(path, 'utf8');

      for (const match of text.matchAll(/<AppErrorBoundary([^>]*)>/g)) {
        found += 1;
        const props = match[1];

        if (!/\bname=/.test(props)) offenders.push(`${path}: no name prop`);
        if (/name=\{[^}]*\.name\b/.test(props)) {
          offenders.push(`${path}: name derived from a runtime .name`);
        }
      }
    }

    expect(offenders).toEqual([]);

    // A scan that matches nothing passes for the wrong reason, and would go on passing after
    // a rename made the pattern stale.
    expect(found).toBeGreaterThan(0);
  });
});
