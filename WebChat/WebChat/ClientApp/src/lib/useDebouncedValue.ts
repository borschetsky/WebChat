import { useEffect, useState } from 'react';

/**
 * The value, but only after it has stopped changing for `delayMs`.
 *
 * This is the one piece of the old search effect worth keeping. Everything else it did -
 * holding the results, tracking a loading flag, cancelling a superseded response - RTK Query
 * does already; debouncing it does not, and without one every keystroke is a distinct query
 * key and therefore a distinct request.
 *
 * Deliberately a value rather than a callback: a debounced *callback* has an identity, and an
 * unstable identity crossing a component boundary is exactly what caused the request loop in
 * docs/ctx/2026-08-04-compose-search-render-loop.md. A string cannot have that problem.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
