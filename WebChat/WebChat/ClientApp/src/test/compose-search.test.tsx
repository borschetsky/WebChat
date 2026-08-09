import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';
import ComposeDialog from '@/features/threads/ComposeDialog';

/**
 * Guards an infinite request loop that reached production: opening "New conversation" and
 * typing a name issued /api/users/search forever, the spinner never stopped, and no result
 * was ever shown - while the API answered every single request correctly.
 *
 * The original mechanism needed two halves: the dialog listed an `onSearch` prop among its
 * effect's dependencies, and `ChatApp` passed a fresh arrow around an RTK Query trigger whose
 * call re-rendered the parent. Each search re-rendered the parent, which minted a new callback
 * identity, which re-ran the effect, which searched again.
 *
 * **That shape no longer exists.** The dialog runs `useSearchDirectoryQuery` itself, so there
 * is no effect, no callback prop, and nothing whose identity a parent can destabilise - the
 * bug is gone structurally rather than fixed. These tests therefore no longer *reproduce* it;
 * they pin the guarantees it violated, against the implementation that replaced it, so a
 * rewrite back toward hand-rolled fetching fails here. The parent still re-renders on every
 * search for exactly that reason: a harness with a static parent could not tell the difference.
 */

const RESULT = [
  { id: '701f6296', name: 'test2', role: '', presence: 'online', avatarFileName: null },
];

const searchDirectory = vi.fn();

vi.mock('@/services/chat-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/chat-service')>()),
  searchDirectory: (term: string, token: string) => searchDirectory(term, token),
}));

const { makeStore } = await import('@/app/store');

// The query reads the token from the store, so a session must be present or every search
// fails as "Not authenticated" and the list stays empty for the wrong reason.
const session = { token: 'jwt', tokenExpirationTime: 9e9, id: 'me' };

const PARENT = { renders: 0 };

/**
 * Re-renders on every search, the way ChatApp did when the RTK Query trigger updated query
 * state. If the dialog ever becomes sensitive to its parent's render count again, this catches
 * it. The store is built once per mount so the query cache behaves as it does in the app.
 */
function Harness() {
  PARENT.renders += 1;
  const [, setTick] = useState(0);
  const [store] = useState(() => makeStore({ user: session, busy: false }));

  searchDirectory.mockImplementation(async (term: string) => {
    setTick((n) => n + 1);
    return term === 'test2' ? RESULT : [];
  });

  return (
    <Provider store={store}>
      <ThemeModeProvider>
        <ComposeDialog
          open
          fullScreen={false}
          onClose={() => {}}
          onStart={() => {}}
          onStartGroup={async () => {}}
        />
      </ThemeModeProvider>
    </Provider>
  );
}

function type(el: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Advances the debounce, then drains the promise chain the query resolves through. Both are
 * needed: `advanceTimersByTimeAsync` gets the request issued, but the fulfilled action and
 * the re-render it causes land a few microtasks later.
 */
const flush = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await Promise.resolve();
    await Promise.resolve();
  });

describe('ComposeDialog search', () => {
  beforeEach(() => {
    PARENT.renders = 0;
    searchDirectory.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('issues one request per term however often the parent re-renders', async () => {
    render(<Harness />);

    await act(async () => {
      type(screen.getByRole('textbox'), 'test2');
    });

    await flush(300); // past the 250ms debounce - the one legitimate call
    await flush(3000); // a loop fired roughly once per debounce; this would add ~12 more

    expect(searchDirectory).toHaveBeenCalledTimes(1);
    expect(searchDirectory.mock.calls[0][0]).toBe('test2');
    expect(PARENT.renders).toBeGreaterThan(1); // the parent really did re-render
  });

  it('shows the result rather than discarding it', async () => {
    render(<Harness />);

    await act(async () => {
      type(screen.getByRole('textbox'), 'test2');
    });
    await flush(300); // debounce fires, request goes out
    await flush(300); // fulfilled action commits and the list re-renders

    // Each re-run's cleanup used to set cancelled = true, throwing away the response already
    // in flight. The list stayed empty however many times the request succeeded.
    expect(screen.getByText('test2')).toBeInTheDocument();
  });

  it('searches again when the term changes, and only then', async () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');

    await act(async () => {
      type(input, 'ab');
    });
    await flush(300);
    await act(async () => {
      type(input, 'abc');
    });
    await flush(300);
    await flush(2000);

    expect(searchDirectory.mock.calls.map(([t]) => t)).toEqual(['ab', 'abc']);
  });

  it('debounces keystrokes into a single request', async () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');

    for (const v of ['t', 'te', 'tes', 'test']) {
      await act(async () => {
        type(input, v);
      });
      await flush(50);
    }
    await flush(300);

    expect(searchDirectory).toHaveBeenCalledTimes(1);
    expect(searchDirectory.mock.calls[0][0]).toBe('test');
  });

  it('serves a repeated term from cache instead of asking again', async () => {
    // New behaviour: the hand-rolled version had no cache, so returning to a previous term
    // always meant another round trip.
    render(<Harness />);
    const input = screen.getByRole('textbox');

    for (const term of ['test2', 'abc', 'test2']) {
      await act(async () => {
        type(input, term);
      });
      await flush(300);
    }

    expect(searchDirectory.mock.calls.map(([t]) => t)).toEqual(['test2', 'abc']);
    expect(screen.getByText('test2')).toBeInTheDocument();
  });
});
