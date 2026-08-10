import type { Group, GroupMember, GroupRole, PermRule } from '@/types/models';

/**
 * What the viewer may do in a group, mirroring `WebChat.Services/GroupPermissions.cs`.
 *
 * This decides what to *draw*, never what is *allowed* - the server re-checks every request
 * and is the only authority. The duplication is deliberate: the alternative is rendering
 * every action for everyone and letting the failures explain the rules, which is exactly
 * the "disabled control that invites a click that can only fail" the spec rejects.
 *
 * Kept in step with the server by construction: an unrecognised level denies here too, so
 * a value this client has not heard of closes the door rather than opening it.
 */

export type GroupAction = 'rename' | 'invite' | 'remove';

const satisfies = (rule: PermRule | undefined, role: GroupRole | null): boolean => {
  if (!role) return false;
  switch (rule) {
    case 'everyone':
      return true;
    case 'admins':
      return role === 'owner' || role === 'admin';
    case 'owner':
      return role === 'owner';
    default:
      return false;
  }
};

export const can = (group: Group | undefined, action: GroupAction): boolean =>
  !!group && satisfies(group.perms?.[action], group.myRole);

/** Only the owner edits the permission map or transfers ownership. */
export const ownsGroup = (group: Group | undefined): boolean => group?.myRole === 'owner';

/**
 * Whether the viewer can change roles at all. Not configurable - promotion and demotion
 * are an admin capability, and the permission map has no entry for them.
 */
export const canManageRoles = (group: Group | undefined): boolean =>
  group?.myRole === 'owner' || group?.myRole === 'admin';

export interface MemberAction {
  key: 'make-owner' | 'make-admin' | 'remove-admin' | 'remove';
  label: string;
  destructive?: boolean;
}

/**
 * The actions available against one member, in menu order.
 *
 * Returned as a list so the caller can gate the overflow button on its length: the spec is
 * explicit that the button is *absent* rather than disabled when there is nothing to do,
 * because "a menu that opens empty is worse than no menu".
 *
 * The owner never appears as a target - they cannot be removed or demoted, and the one path
 * that changes their role is a transfer, which is initiated against the *other* person.
 */
export const memberActions = (
  group: Group | undefined,
  target: GroupMember,
  meId: string | null,
): MemberAction[] => {
  if (!group || target.id === meId) return [];

  const actions: MemberAction[] = [];

  if (target.gRole !== 'owner' && ownsGroup(group)) {
    actions.push({ key: 'make-owner', label: 'Make owner' });
  }
  if (target.gRole === 'member' && canManageRoles(group)) {
    actions.push({ key: 'make-admin', label: 'Make admin' });
  }
  if (target.gRole === 'admin' && canManageRoles(group)) {
    actions.push({ key: 'remove-admin', label: 'Remove admin' });
  }
  if (target.gRole !== 'owner' && can(group, 'remove')) {
    actions.push({ key: 'remove', label: 'Remove from group', destructive: true });
  }

  return actions;
};

/**
 * True when demoting or removing this member would empty the admin tier.
 *
 * The spec asks for a warning, not a refusal: permissions reference roles rather than
 * people, an empty tier is a legal configuration, and the owner can always undo it.
 */
export const isLastAdmin = (group: Group | undefined, target: GroupMember): boolean =>
  target.gRole === 'admin' &&
  (group?.members ?? []).filter((m) => m.gRole === 'admin').length === 1;

const RULE_LABEL: Record<PermRule, string> = {
  owner: 'Owner only',
  admins: 'Admins',
  everyone: 'Everyone',
};

export const ruleLabel = (rule: PermRule | undefined): string =>
  RULE_LABEL[rule ?? 'admins'] ?? 'Admins';

/** Who may rename, for the lock line under a name the viewer cannot edit. */
export const renameLockText = (rule: PermRule | undefined): string =>
  rule === 'owner'
    ? 'Only the owner can rename this group'
    : 'Only group admins can rename this group';
