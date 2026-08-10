import { describe, it, expect } from 'vitest';
import {
  can,
  canManageRoles,
  isLastAdmin,
  memberActions,
  ownsGroup,
  renameLockText,
  ruleLabel,
} from '@/features/threads/groupPermissions';
import { applyGroupEvent } from '@/features/realtime/groupEvents';
import type { Group, GroupMember, GroupRole, PermRule } from '@/types/models';

const member = (id: string, gRole: GroupRole, name = id): GroupMember => ({
  id,
  name,
  gRole,
  joinedAt: null,
  avatarFileName: null,
  presence: 'offline',
  color: '#000',
});

const group = (over: Partial<Group> = {}): Group => ({
  id: 'g1',
  name: 'Design Guild',
  named: true,
  title: 'Design Guild',
  version: 3,
  perms: { rename: 'admins', invite: 'admins', remove: 'admins' },
  members: [member('me', 'member'), member('own', 'owner'), member('adm', 'admin')],
  myRole: 'member',
  ...over,
});

describe('what the viewer may do', () => {
  it('reads the permission map rather than assuming admins', () => {
    expect(can(group({ myRole: 'member' }), 'rename')).toBe(false);
    expect(can(group({ myRole: 'admin' }), 'rename')).toBe(true);
    expect(can(group({ myRole: 'owner' }), 'rename')).toBe(true);

    const everyone = { rename: 'everyone' as PermRule, invite: 'admins', remove: 'admins' };
    expect(can(group({ myRole: 'member', perms: everyone as Group['perms'] }), 'rename')).toBe(
      true,
    );

    const ownerOnly = { rename: 'owner' as PermRule, invite: 'admins', remove: 'admins' };
    expect(can(group({ myRole: 'admin', perms: ownerOnly as Group['perms'] }), 'rename')).toBe(
      false,
    );
  });

  it('denies a level it does not recognise', () => {
    // A typo in the database should close a door, not open one - same rule as the server.
    const odd = { rename: 'everybody' as PermRule, invite: 'admins', remove: 'admins' };
    expect(can(group({ myRole: 'owner', perms: odd as Group['perms'] }), 'rename')).toBe(false);
  });

  it('denies everything to someone with no role at all', () => {
    // 'everyone' means every member. A caller with no membership row is still refused.
    const everyone = { rename: 'everyone' as PermRule, invite: 'everyone', remove: 'everyone' };
    expect(can(group({ myRole: null, perms: everyone as Group['perms'] }), 'rename')).toBe(false);
  });

  it('keeps the map and role management separate', () => {
    // perms has no entry for promotion; it is an admin capability, not a configurable one.
    expect(canManageRoles(group({ myRole: 'admin' }))).toBe(true);
    expect(canManageRoles(group({ myRole: 'member' }))).toBe(false);
    expect(ownsGroup(group({ myRole: 'admin' }))).toBe(false);
  });
});

describe('the member overflow menu', () => {
  it('is empty for a member, so the button is never drawn', () => {
    const actions = memberActions(group({ myRole: 'member' }), member('adm', 'admin'), 'me');
    expect(actions).toEqual([]);
  });

  it('never targets the owner', () => {
    // The owner cannot be removed or demoted; ownership only moves by transfer.
    const actions = memberActions(group({ myRole: 'owner' }), member('own', 'owner'), 'me');
    expect(actions.map((a) => a.key)).toEqual([]);
  });

  it('offers no actions against yourself', () => {
    const actions = memberActions(group({ myRole: 'owner' }), member('me', 'admin'), 'me');
    expect(actions).toEqual([]);
  });

  it('lets an owner transfer, promote and remove', () => {
    const actions = memberActions(group({ myRole: 'owner' }), member('u2', 'member'), 'me');
    expect(actions.map((a) => a.key)).toEqual(['make-owner', 'make-admin', 'remove']);
  });

  it('lets an admin promote but not hand over ownership', () => {
    const actions = memberActions(group({ myRole: 'admin' }), member('u2', 'member'), 'me');
    expect(actions.map((a) => a.key)).toEqual(['make-admin', 'remove']);
  });

  it('drops Remove when the permission map does not allow it', () => {
    const ownerOnly = { rename: 'admins', invite: 'admins', remove: 'owner' as PermRule };
    const actions = memberActions(
      group({ myRole: 'admin', perms: ownerOnly as Group['perms'] }),
      member('u2', 'member'),
      'me',
    );
    expect(actions.map((a) => a.key)).toEqual(['make-admin']);
  });

  it('flags the last admin without blocking the demotion', () => {
    // Warn, do not prevent: an empty admin tier is a legal configuration.
    expect(isLastAdmin(group(), member('adm', 'admin'))).toBe(true);
    const two = group({
      members: [member('adm', 'admin'), member('adm2', 'admin'), member('own', 'owner')],
    });
    expect(isLastAdmin(two, member('adm', 'admin'))).toBe(false);
  });
});

describe('permission copy', () => {
  it('names who can rename, from the rule rather than a fixed string', () => {
    expect(renameLockText('owner')).toBe('Only the owner can rename this group');
    expect(renameLockText('admins')).toBe('Only group admins can rename this group');
  });

  it('labels a rule for a read-only value row', () => {
    expect(ruleLabel('owner')).toBe('Owner only');
    expect(ruleLabel('admins')).toBe('Admins');
    expect(ruleLabel('everyone')).toBe('Everyone');
  });
});

describe('applying a realtime group event', () => {
  it('takes the version from every event, including one it does not understand', () => {
    // Otherwise the next event it does understand would look like a gap.
    const g = group();
    applyGroupEvent(g, { type: 'group.teleported', groupId: 'g1', version: 9 });
    expect(g.version).toBe(9);
  });

  it('moves both sides of an ownership transfer together', () => {
    // A group observable with zero or two owners is the state this ordering prevents.
    const g = group({ myRole: 'owner' });
    applyGroupEvent(
      g,
      {
        type: 'group.owner_transferred',
        groupId: 'g1',
        version: 4,
        fromUserId: 'own',
        toUserId: 'adm',
      },
      'own',
    );

    expect(g.members.filter((m) => m.gRole === 'owner').map((m) => m.id)).toEqual(['adm']);
    expect(g.members.find((m) => m.id === 'own')?.gRole).toBe('admin');
    // The viewer was the owner and is now an admin, so the drawer must re-render as one.
    expect(g.myRole).toBe('admin');
  });

  it('retitles an auto-named group when someone leaves', () => {
    const g = group({
      name: null,
      named: false,
      title: 'own, adm',
      members: [member('me', 'owner'), member('own', 'member'), member('adm', 'member')],
      myRole: 'owner',
    });

    applyGroupEvent(
      g,
      { type: 'group.member_left', groupId: 'g1', version: 4, userId: 'adm' },
      'me',
    );

    expect(g.members.map((m) => m.id)).toEqual(['me', 'own']);
    // Derived from current membership, excluding the viewer - not a snapshot.
    expect(g.title).toBe('own');
  });

  it('leaves the title of a named group alone when membership changes', () => {
    const g = group();
    applyGroupEvent(
      g,
      { type: 'group.member_left', groupId: 'g1', version: 4, userId: 'adm' },
      'me',
    );
    expect(g.title).toBe('Design Guild');
  });

  it('does not claim the viewer has no role when it does not know who they are', () => {
    const g = group({ myRole: 'admin' });
    applyGroupEvent(g, { type: 'group.perms_changed', groupId: 'g1', version: 4 });
    expect(g.myRole).toBe('admin');
  });

  it('adds ids it was given without inventing names for them', () => {
    const g = group();
    applyGroupEvent(
      g,
      { type: 'group.members_added', groupId: 'g1', version: 4, added: ['new1', 'own'] },
      'me',
    );

    // 'own' was already a member; the event is idempotent per user.
    expect(g.members.filter((m) => m.id === 'own')).toHaveLength(1);
    expect(g.members.find((m) => m.id === 'new1')?.name).toBe('Unknown');
  });
});
