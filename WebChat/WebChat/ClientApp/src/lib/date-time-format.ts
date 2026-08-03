/**
 * Display formatting for message and thread timestamps.
 *
 * Rewritten during the TypeScript conversion because the original compared
 * `new Date().getDate()` with `new Date(iso).getDate()` - that is day-of-month, not a
 * date. Across a month boundary the difference went negative (3 Aug vs 31 Jul gives -28),
 * matched none of the branches, and getDateInfoForThread returned undefined, rendering a
 * blank timestamp in the thread list. It also carried a `case (boolean)` inside a switch
 * on a number, which could never match, and a stray console.log.
 */

const MS_PER_DAY = 86_400_000;

const startOfDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Whole calendar days between `iso` and today. Negative for future timestamps. */
const calendarDaysAgo = (iso: string): number | null => {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return Math.round((startOfDay(new Date()) - startOfDay(then)) / MS_PER_DAY);
};

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const dateOf = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });

/** Thread-list timestamp: time today, "Yesterday", otherwise a short date. */
export const getDateInfoForThread = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const days = calendarDaysAgo(iso);
  if (days === null) return '';
  if (days <= 0) return timeOf(iso);
  if (days === 1) return 'Yesterday';
  return dateOf(iso);
};

/** Message timestamp: always the clock time. */
export const getDateInfoForMessage = (iso: string | null | undefined): string =>
  iso && !Number.isNaN(new Date(iso).getTime()) ? timeOf(iso) : '';

/** Day-separator label above the first message of each day. */
export const getDateInfoForSeparator = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const days = calendarDaysAgo(iso);
  if (days === null) return '';
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days === 7) return 'Week ago';
  return dateOf(iso);
};
