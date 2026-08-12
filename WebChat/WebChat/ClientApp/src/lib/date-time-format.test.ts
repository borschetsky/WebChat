import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAbsoluteDate,
  getDateInfoForThread,
  getDateInfoForMessage,
  getDateInfoForSeparator,
  getDaysUntil,
  getRelativeTime,
} from './date-time-format';

/**
 * Regression tests for a real bug.
 *
 * The original compared `new Date().getDate()` with `new Date(iso).getDate()` - that is
 * day-of-month, not a date. On the 3rd of a month, anything from the previous month gave a
 * negative difference, matched no branch, and returned undefined: a blank timestamp in the
 * thread list for every message older than two days.
 *
 * The dates below are chosen to straddle a month boundary precisely because that is where
 * the old implementation failed.
 */
describe('date-time-format', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 3 August 2026, 12:00 local. getDate() === 3, which is what broke the old logic.
    vi.setSystemTime(new Date(2026, 7, 3, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  const iso = (y: number, m: number, d: number, hh = 10, mm = 0) =>
    new Date(y, m, d, hh, mm).toISOString();

  describe('getDateInfoForThread', () => {
    it('shows a clock time for today', () => {
      expect(getDateInfoForThread(iso(2026, 7, 3, 9, 30))).toMatch(/^\d{2}:\d{2}$/);
    });

    it('says Yesterday for one day ago', () => {
      expect(getDateInfoForThread(iso(2026, 7, 2))).toBe('Yesterday');
    });

    it('crosses a month boundary instead of returning undefined', () => {
      // 31 July from 3 August. The old logic computed 3 - 31 = -28 and fell through.
      const result = getDateInfoForThread(iso(2026, 6, 31));
      expect(result).not.toBe('');
      expect(result).toBeTruthy();
      expect(result).toMatch(/Jul/);
    });

    it('handles a date from the previous year', () => {
      expect(getDateInfoForThread(iso(2025, 11, 25))).toMatch(/Dec/);
    });

    it('returns empty rather than undefined for missing or invalid input', () => {
      expect(getDateInfoForThread(null)).toBe('');
      expect(getDateInfoForThread(undefined)).toBe('');
      expect(getDateInfoForThread('not-a-date')).toBe('');
    });
  });

  describe('getDateInfoForSeparator', () => {
    it.each([
      [iso(2026, 7, 3), 'Today'],
      [iso(2026, 7, 2), 'Yesterday'],
      [iso(2026, 7, 1), '2 days ago'],
      [iso(2026, 6, 30), '4 days ago'],
      [iso(2026, 6, 27), 'Week ago'],
    ])('labels %s as %s', (input, expected) => {
      expect(getDateInfoForSeparator(input)).toBe(expected);
    });

    it('falls back to a date beyond a week', () => {
      expect(getDateInfoForSeparator(iso(2026, 6, 1))).toMatch(/Jul/);
    });

    it('never hits the dead branch the original had', () => {
      // The old switch contained `case (numberOfDays > 1 && numberOfDays < 7)` - a boolean
      // compared against a number, which could never match. 2-6 days must be covered.
      for (let d = 2; d < 7; d += 1) {
        const when = new Date(2026, 7, 3 - d);
        expect(getDateInfoForSeparator(when.toISOString())).toBe(`${d} days ago`);
      }
    });
  });

  describe('getDateInfoForMessage', () => {
    it('always renders a clock time', () => {
      expect(getDateInfoForMessage(iso(2026, 6, 31, 14, 5))).toMatch(/^\d{2}:\d{2}$/);
    });

    it('returns empty for invalid input', () => {
      expect(getDateInfoForMessage(null)).toBe('');
      expect(getDateInfoForMessage('nonsense')).toBe('');
    });
  });

  /**
   * The admin console's timestamps. These exist because the console's fixtures used to hold
   * the *rendered* strings - `'2 h ago'` - which a server cannot send and which stop being
   * true the moment the page is left open.
   */
  describe('getRelativeTime', () => {
    const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

    it('reads as an age up to an hour', () => {
      expect(getRelativeTime(minutesAgo(0))).toBe('Just now');
      expect(getRelativeTime(minutesAgo(1))).toBe('1 min ago');
      expect(getRelativeTime(minutesAgo(59))).toBe('59 min ago');
    });

    it('switches to hours, then to yesterday with a clock time', () => {
      expect(getRelativeTime(minutesAgo(60))).toBe('1 h ago');
      expect(getRelativeTime(minutesAgo(11 * 60))).toBe('11 h ago');
      expect(getRelativeTime(minutesAgo(24 * 60))).toMatch(/^Yesterday, \d{2}:\d{2}$/);
    });

    it('counts days up to a week, then falls back to the date', () => {
      expect(getRelativeTime(minutesAgo(3 * 1440))).toBe('3 days ago');
      expect(getRelativeTime(minutesAgo(30 * 1440))).toBe(getAbsoluteDate(minutesAgo(30 * 1440)));
    });

    /** A client clock a few seconds ahead of the server must not say "-1 min ago". */
    it('does not go negative for a timestamp slightly in the future', () => {
      expect(getRelativeTime(minutesAgo(-0.5))).toBe('Just now');
    });

    it('returns empty for invalid input', () => {
      expect(getRelativeTime(null)).toBe('');
      expect(getRelativeTime('nonsense')).toBe('');
    });
  });

  describe('getDaysUntil', () => {
    const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

    /** Rounded up: 18 hours left is one day left, and "expires in 0 days" reads as expired. */
    it('rounds a part-day up', () => {
      expect(getDaysUntil(inMinutes(18 * 60))).toBe(1);
      expect(getDaysUntil(inMinutes(25 * 60))).toBe(2);
    });

    /** Floored, so a lapsed invitation shows as expired rather than counting backwards. */
    it('never goes negative', () => {
      expect(getDaysUntil(inMinutes(-60))).toBe(0);
      expect(getDaysUntil(inMinutes(-90 * 1440))).toBe(0);
    });

    it('returns null for invalid input', () => {
      expect(getDaysUntil(null)).toBeNull();
      expect(getDaysUntil('nonsense')).toBeNull();
    });
  });
});
