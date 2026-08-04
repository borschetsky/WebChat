import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState, useCallback } from 'react';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';
import ComposeDialog from '@/features/threads/ComposeDialog';

/**
 * Guards an infinite request loop that reached production: opening "New conversation" and
 * typing a name issued /api/users/search forever, the spinner never stopped, and no result
 * was ever shown - while the API answered every single request correctly.
 *
 * The mechanism needs both halves to be reproduced, which is easy to get wrong:
 *
 *   1. ComposeDialog listed the onSearch prop among its effect's dependencies.
 *   2. ChatApp passed `(t) => triggerDirectory(t).unwrap()` - a new function each render -
 *      and triggerDirectory is an RTK Query lazy trigger, so calling it updates query state
 *      and re-renders ChatApp.
 *
 * So each search re-rendered the parent, which minted a new callback identity, which re-ran
 * the effect, which searched again. A test whose parent never re-renders keeps one stable
 * identity and passes against the bug, proving nothing - the parent below therefore
 * re-renders on every call, exactly as the RTK Query hook did.
 */

const PARENT = { renders: 0 };

function Harness({ onSearch }: { onSearch: (t: string) => Promise<unknown> }) {
  PARENT.renders += 1;
  // Stands in for RTK Query's query-state update: calling the search re-renders this parent.
  const [, setTick] = useState(0);
  const search = useCallback(async (t: string) => {
    const result = await onSearch(t);
    setTick((n) => n + 1);
    return result;
  }, [onSearch]);

  return (
    <ThemeModeProvider>
      <ComposeDialog
        open
        onClose={() => {}}
        onStart={() => {}}
        // Inline arrow, recreated on every parent render - what ChatApp used to pass.
        onSearch={(t: string) => search(t)}
      />
    </ThemeModeProvider>
  );
}

function type(el: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const flush = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});

describe('ComposeDialog search', () => {
  beforeEach(() => { PARENT.renders = 0; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('issues one request per term even when every parent render remints the callback', async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<Harness onSearch={onSearch} />);

    await act(async () => { type(screen.getByRole('textbox'), 'test2'); });

    await flush(300);   // past the 250ms debounce - the one legitimate call
    await flush(3000);  // a loop fires roughly once per debounce; this would add ~12 more

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('test2');
  });

  it('shows the result rather than discarding it', async () => {
    const onSearch = vi.fn().mockResolvedValue([
      { id: '701f6296', name: 'test2', role: '', presence: 'online', avatarFileName: null },
    ]);
    render(<Harness onSearch={onSearch} />);

    await act(async () => { type(screen.getByRole('textbox'), 'test2'); });
    await flush(300);

    // Each re-run's cleanup set cancelled = true, so the setPeople of the request already
    // in flight was thrown away moments before it would have committed. The list stayed
    // empty however many times the request succeeded.
    expect(screen.getByText('test2')).toBeInTheDocument();
  });

  it('searches again when the term changes, and only then', async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<Harness onSearch={onSearch} />);
    const input = screen.getByRole('textbox');

    await act(async () => { type(input, 'ab'); });
    await flush(300);
    await act(async () => { type(input, 'abc'); });
    await flush(300);
    await flush(2000);

    expect(onSearch.mock.calls.map(([t]) => t)).toEqual(['ab', 'abc']);
  });

  it('debounces keystrokes into a single request', async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<Harness onSearch={onSearch} />);
    const input = screen.getByRole('textbox');

    for (const v of ['t', 'te', 'tes', 'test']) {
      await act(async () => { type(input, v); });
      await flush(50);
    }
    await flush(300);

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('test');
  });
});
