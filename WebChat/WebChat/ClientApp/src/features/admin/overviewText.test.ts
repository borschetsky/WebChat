import { describe, expect, it } from 'vitest';
import {
  expiringHint,
  funnelBars,
  invitationFootnote,
  joinedHint,
  weekdayLetter,
} from './overviewText';

/**
 * These exist because their absence is what let three invented numbers ship.
 *
 * The Overview had no test of any kind, so `"+3 in the last 30 days"` and `"2 expire within
 * a week"` sat on a real dashboard for as long as the section was mocked and survived the
 * change that made every other number real. Nothing here is clever; the point is that the
 * wording is now a pure function of the data and something reads it back.
 */

describe('joinedHint', () => {
  it('counts, and says so plainly when nobody joined', () => {
    expect(joinedHint(3)).toBe('+3 in the last 30 days');
    expect(joinedHint(1)).toBe('+1 in the last 30 days');
    expect(joinedHint(0)).toBe('None in the last 30 days');
  });

  it('never renders the literal it replaced unless it is true', () => {
    // The exact string that used to be hard-coded. It is a fine sentence - the defect was
    // that it appeared whatever the number was.
    expect(joinedHint(0)).not.toContain('+3');
    expect(joinedHint(7)).not.toContain('+3');
  });
});

describe('expiringHint', () => {
  it('agrees with itself about plurals', () => {
    expect(expiringHint(0)).toBe('Nothing expiring soon');
    expect(expiringHint(1)).toBe('1 expires within a week');
    expect(expiringHint(2)).toBe('2 expire within a week');
  });
});

describe('invitationFootnote', () => {
  it('says nothing is outstanding rather than "0 people have"', () => {
    expect(invitationFootnote(0, 0)).toBe('Nobody has an invitation outstanding.');
    // Vacuously true and still not worth saying: no invitations means none can expire.
    expect(invitationFootnote(0, 4)).toBe('Nobody has an invitation outstanding.');
  });

  it('conjugates one person and one expiry all the way through the sentence', () => {
    expect(invitationFootnote(1, 1)).toBe(
      '1 person has an open invitation. 1 expires within seven days — extend it from the ' +
        'Invitations tab before it lapses.',
    );
  });

  it('conjugates the plural all the way through too', () => {
    expect(invitationFootnote(5, 2)).toBe(
      '5 people have an open invitation. 2 expire within seven days — extend them from the ' +
        'Invitations tab before they lapse.',
    );
  });

  it('does not tell anyone to go extend nothing', () => {
    expect(invitationFootnote(5, 0)).toBe(
      '5 people have an open invitation. None expire in the next seven days.',
    );
    expect(invitationFootnote(5, 0)).not.toContain('Invitations tab');
  });

  it('never claims two expire when the count says otherwise', () => {
    // The literal that shipped. It was beside a real count, which is what made it dangerous.
    for (const expiring of [0, 1, 3, 9]) {
      expect(invitationFootnote(4, expiring)).not.toContain('Two expire');
    }
  });
});

describe('funnelBars', () => {
  const stages = [
    { key: 'registered', value: 54 },
    { key: 'confirmed', value: 48 },
    { key: 'joined', value: 26 },
    { key: 'wrote', value: 7 },
  ];

  it('labels the stages it knows and keeps their values', () => {
    const bars = funnelBars(stages);
    expect(bars.map((b) => b.label)).toEqual([
      'Registered',
      'Confirmed their address',
      'In a conversation',
      'Sent a message',
    ]);
    expect(bars.map((b) => b.value)).toEqual([54, 48, 26, 7]);
  });

  it('preserves server order rather than sorting', () => {
    // The funnel's meaning is the order the server sends: each stage is a subset of the one
    // above. Sorting by value would usually look identical and be wrong the moment it did not.
    const reversed = funnelBars([...stages].reverse());
    expect(reversed.map((b) => b.key)).toEqual(['wrote', 'joined', 'confirmed', 'registered']);
  });

  it('renders an unknown stage with its raw key instead of dropping it', () => {
    const bars = funnelBars([...stages, { key: 'invited_a_friend', value: 2 }]);
    expect(bars).toHaveLength(5);
    expect(bars[4].label).toBe('invited_a_friend');
    expect(bars[4].value).toBe(2);
  });
});

describe('weekdayLetter', () => {
  it('returns a single letter for a valid instant', () => {
    expect(weekdayLetter('2026-08-13T00:00:00Z')).toMatch(/^[A-Z]$/);
  });

  it('returns nothing rather than "Invalid Date" for junk', () => {
    expect(weekdayLetter('not a date')).toBe('');
    expect(weekdayLetter('')).toBe('');
  });
});
