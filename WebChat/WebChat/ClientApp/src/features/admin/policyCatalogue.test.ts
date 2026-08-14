import { describe, expect, it } from 'vitest';
import { POLICY_GROUPS, policyState, policyValue, unknownPolicies } from './policyCatalogue';
import type { AdminPolicies } from '@/types/admin';

/**
 * The rule these protect is the issue's definition of done: every switch either changes
 * behaviour somewhere or visibly says it does not yet.
 *
 * That rule lives in one place - `policyState` - and it can only fail in one direction that
 * matters. Claiming a policy is enforced when it is not is the defect; claiming it is *not*
 * enforced when it is only costs a control. So the interesting cases are all about what
 * happens when the server says less than the client expected.
 */

const server = (over: Partial<AdminPolicies> = {}): AdminPolicies => ({
  policies: { members_can_create_groups: true },
  alwaysOn: ['sessions_end_on_password_change'],
  ...over,
});

describe('policyState', () => {
  it('calls a policy enforced only when the server sent it', () => {
    expect(policyState('members_can_create_groups', server())).toBe('enforced');
  });

  it('calls everything the server did not mention not-enforced', () => {
    expect(policyState('require_two_factor', server())).toBe('not-enforced');
    expect(policyState('allow_guest_accounts', server())).toBe('not-enforced');
  });

  it('treats an always-on policy as its own thing, not as a switch', () => {
    expect(policyState('sessions_end_on_password_change', server())).toBe('always-on');
  });

  /**
   * The failure that matters. If the request fails, or the server is older than this build,
   * nothing may render as a working control - a screen full of switches over no backend is
   * exactly what #75 removed.
   */
  it('claims nothing at all when there is no data', () => {
    for (const row of POLICY_GROUPS.flatMap((g) => g.rows)) {
      expect(policyState(row.key, undefined)).toBe('not-enforced');
    }
  });

  it('claims nothing when the server sends an empty envelope', () => {
    const empty = { policies: {}, alwaysOn: [] };
    for (const row of POLICY_GROUPS.flatMap((g) => g.rows)) {
      expect(policyState(row.key, empty)).toBe('not-enforced');
    }
  });

  /**
   * `false` is a real, enforced value - the policy exists and is turned off. Testing presence
   * with a truthiness check would classify it as not-enforced and silently make the switch
   * inert exactly when somebody had used it.
   */
  it('treats an enforced policy that is off as enforced, not as missing', () => {
    const off = server({ policies: { members_can_create_groups: false } });

    expect(policyState('members_can_create_groups', off)).toBe('enforced');
    expect(policyValue('members_can_create_groups', off)).toBe(false);
  });
});

describe('policyValue', () => {
  it('reads the value the server sent', () => {
    expect(policyValue('members_can_create_groups', server())).toBe(true);
  });

  it('shows an always-on policy as on', () => {
    expect(policyValue('sessions_end_on_password_change', server())).toBe(true);
  });

  it('shows an unenforced row as off rather than inventing a position', () => {
    expect(policyValue('require_two_factor', server())).toBe(false);
    expect(policyValue('anything', undefined)).toBe(false);
  });
});

describe('unknownPolicies', () => {
  it('finds nothing when the server and the catalogue agree', () => {
    expect(unknownPolicies(server())).toEqual([]);
  });

  /**
   * A client one deploy behind should show something odd rather than silently omit a control
   * that governs the workspace - the same rule the activation funnel follows for a stage it
   * does not know.
   */
  it('surfaces a policy the server enforces that this build has no row for', () => {
    const ahead = server({
      policies: { members_can_create_groups: true, members_can_pin_messages: false },
    });

    expect(unknownPolicies(ahead)).toEqual(['members_can_pin_messages']);
  });

  it('does not treat an always-on key as unknown', () => {
    expect(unknownPolicies(server())).not.toContain('sessions_end_on_password_change');
  });
});

describe('the catalogue itself', () => {
  it('has no duplicate keys across groups', () => {
    const keys = POLICY_GROUPS.flatMap((g) => g.rows.map((r) => r.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('still draws all nine rows the design specifies', () => {
    // The unenforced ones are rendered rather than hidden on purpose: the grouping and the
    // copy are what an administrator reads to understand what the workspace could enforce.
    expect(POLICY_GROUPS.flatMap((g) => g.rows)).toHaveLength(9);
  });

  it('gives every row a label and a hint', () => {
    for (const row of POLICY_GROUPS.flatMap((g) => g.rows)) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.hint.length).toBeGreaterThan(0);
    }
  });
});
