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

/**
 * "12 min ago" / "Yesterday, 16:42" / "12 Mar 2025" - the admin console's timestamp.
 *
 * Computed at render rather than sent pre-formatted, and that is the whole reason this
 * exists. The console's mocks held strings like `'2 h ago'`, which a server cannot send:
 * it does not know when the page will be read. An admin screen is exactly the kind that
 * sits open on a second monitor for an afternoon, and a frozen "2 h ago" on it is worse
 * than a bare timestamp, because it looks current.
 */
export const getRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return '';

  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const minutes = Math.floor((Date.now() - then.getTime()) / 60_000);

  // A clock skewed a little ahead of the server would otherwise read "-1 min ago".
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;

  const days = calendarDaysAgo(iso);
  if (days === null) return '';
  if (days <= 0) return `${Math.floor(minutes / 60)} h ago`;
  if (days === 1) return `Yesterday, ${timeOf(iso)}`;
  if (days < 7) return `${days} days ago`;

  return getAbsoluteDate(iso);
};

/** "12 Mar 2025" - for the fields that are a date, not an age. */
export const getAbsoluteDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Whole days from now until `iso`, rounded up, floored at zero.
 *
 * Rounded up because an invitation with 18 hours left has one day left, not zero - and
 * "expires in 0 days" reads as already expired. Floored because a lapsed invitation is
 * shown as expired, never as a negative countdown.
 */
export const getDaysUntil = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const until = new Date(iso);
  if (Number.isNaN(until.getTime())) return null;
  return Math.max(0, Math.ceil((until.getTime() - Date.now()) / MS_PER_DAY));
};

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
