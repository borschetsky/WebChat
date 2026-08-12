import { describe, expect, it } from 'vitest';
import { auditMeta, auditSentence } from './auditSentence';
import type { AdminAudit } from '@/types/admin';

const entry = (over: Partial<AdminAudit>): AdminAudit => ({
  id: 'a1',
  kind: 'block',
  actorId: 'me',
  targetType: 'user',
  targetId: 'them',
  data: null,
  names: { me: 'Maya', them: 'Ben' },
  occurredAtUtc: '2026-08-11T12:00:00Z',
  ...over,
});

describe('auditSentence', () => {
  it('names both sides of a destructive action', () => {
    expect(auditSentence(entry({ kind: 'block' }))).toBe('Maya blocked Ben');
    expect(auditSentence(entry({ kind: 'deactivate' }))).toBe('Maya deactivated Ben');
  });

  /**
   * The reason names are resolved server-side at read time. A deactivated account is gone
   * from every member list the client holds, so the client cannot look it up - and the
   * entry about the deactivation is precisely the one that needs the name.
   */
  it('falls back to "someone" for an id with no name, rather than rendering the id', () => {
    const orphan = entry({ names: { me: 'Maya' } });

    expect(auditSentence(orphan)).toBe('Maya blocked someone');
    expect(auditSentence(orphan)).not.toContain('them');
  });

  it('reads as self-activation when the actor is the target', () => {
    expect(auditSentence(entry({ kind: 'activate', actorId: 'them' }))).toBe(
      'Ben activated their account',
    );
  });

  it('picks the article from the role name', () => {
    expect(auditSentence(entry({ kind: 'role', data: { to: 'admin' } }))).toBe(
      'Maya made Ben an admin',
    );
    expect(auditSentence(entry({ kind: 'role', data: { to: 'member' } }))).toBe(
      'Maya made Ben a member',
    );
  });

  it('distinguishes the three invitation events', () => {
    const invite = (event?: string) =>
      auditSentence(entry({ kind: 'invite', data: { email: 'dev@acme.com', event } }));

    expect(invite()).toBe('Maya invited dev@acme.com');
    expect(invite('resent')).toBe('Maya resent the invitation to dev@acme.com');
    expect(invite('revoked')).toBe('Maya revoked the invitation for dev@acme.com');
  });

  it('says on or off for a policy, from the value rather than the wording', () => {
    const policy = (value: boolean) =>
      auditSentence(entry({ kind: 'policy', data: { policy: 'Require approval', value } }));

    expect(policy(true)).toBe('Maya turned on Require approval');
    expect(policy(false)).toBe('Maya turned off Require approval');
  });

  /**
   * A client one deploy behind the server will meet kinds it has no case for. An empty
   * string renders as a gap; anything else renders as a lie about what happened.
   */
  it('renders nothing at all for an unknown kind', () => {
    expect(auditSentence(entry({ kind: 'teleport' as AdminAudit['kind'] }))).toBe('');
  });

  it('degrades to a vaguer sentence when the detail is missing', () => {
    expect(auditSentence(entry({ kind: 'role', data: null }))).toBe("Maya changed Ben's role");
    expect(auditSentence(entry({ kind: 'policy', data: null }))).toBe(
      'Maya changed a workspace policy',
    );
  });
});

describe('auditMeta', () => {
  it('counts connections and groups, singular and plural', () => {
    expect(auditMeta(entry({ kind: 'block', data: { connectionsClosed: 4 } }))).toBe(
      '4 connections closed',
    );
    expect(auditMeta(entry({ kind: 'block', data: { connectionsClosed: 1 } }))).toBe(
      '1 connection closed',
    );
    expect(auditMeta(entry({ kind: 'deactivate', data: { groupsRemoved: 1 } }))).toBe(
      'removed from 1 group',
    );
  });

  /**
   * Zero is the ordinary case — most people are not connected when they are blocked — and
   * it is worth saying, because "blocked" with nothing after it invites the question this
   * line exists to answer.
   */
  it('says so when there was nothing live to close', () => {
    expect(auditMeta(entry({ kind: 'block', data: { connectionsClosed: 0 } }))).toBe(
      'no live connections',
    );
  });

  it('shows a role change as a transition', () => {
    expect(auditMeta(entry({ kind: 'role', data: { from: 'member', to: 'admin' } }))).toBe(
      'member → admin',
    );
  });

  it('joins the email with the rest when there is one', () => {
    expect(
      auditMeta(entry({ kind: 'block', data: { email: 'ben@acme.com', connectionsClosed: 2 } })),
    ).toBe('ben@acme.com · 2 connections closed');
  });

  /** The row hides the second line rather than reserving empty space for it. */
  it('is empty when there is nothing worth saying', () => {
    expect(auditMeta(entry({ kind: 'block', data: null }))).toBe('');
  });
});
