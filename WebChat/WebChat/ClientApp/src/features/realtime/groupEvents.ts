import { autoGroupName } from '@/features/threads/groupName';
import { avatarColor } from '@/theme/tokens';
import type { GroupEventDto } from '@/types/dto';
import type { Group } from '@/types/models';

/**
 * Applies one `ReciveGroupEvent` to a cached group, in place.
 *
 * Written against an Immer draft, so mutation is the interface. Pure and socket-free on
 * purpose: the ordering and version rules are the part worth testing, and none of that
 * should need a hub connection to exercise.
 *
 * The caller is responsible for the version-gap check - this function assumes the event is
 * the next one and applies it blindly, which is exactly why a gap must be refetched instead.
 */
export function applyGroupEvent(group: Group, e: GroupEventDto, meId: string | null = null): void {
  if (e.version != null) group.version = e.version;

  switch (e.type) {
    case 'group.renamed':
      group.name = e.name ?? null;
      group.named = !!e.named;
      break;

    case 'group.members_added':
      // The event carries ids only. A row with a placeholder name would be worse than an
      // absent one, so the ids are added and the display names arrive with the refetch the
      // middleware triggers - the member list is small and the round trip is cheap.
      for (const id of e.added ?? []) {
        if (group.members.some((m) => m.id === id)) continue;
        group.members.push({
          id,
          name: 'Unknown',
          gRole: 'member',
          joinedAt: null,
          avatarFileName: null,
          presence: 'offline',
          color: avatarColor(id),
        });
      }
      break;

    case 'group.member_removed':
    case 'group.member_left':
      group.members = group.members.filter((m) => m.id !== e.userId);
      break;

    case 'group.role_changed': {
      const target = group.members.find((m) => m.id === e.userId);
      if (target && e.gRole) target.gRole = e.gRole;
      break;
    }

    case 'group.owner_transferred': {
      // Both sides move together. The server does this in one transaction precisely so a
      // group is never observable with zero or two owners; doing only half here would
      // reintroduce that state on the client.
      const from = group.members.find((m) => m.id === e.fromUserId);
      const to = group.members.find((m) => m.id === e.toUserId);
      if (from) from.gRole = 'admin';
      if (to) to.gRole = 'owner';
      break;
    }

    case 'group.perms_changed':
      if (e.perms) group.perms = e.perms;
      break;

    default:
      // An event kind from a newer server. The version has already been taken, so the next
      // one that does mean something will not look like a gap.
      break;
  }

  // Membership and the name both feed the title, and an auto-named group's title changes
  // when anyone joins or leaves - so recompute rather than leaving a stale string.
  group.title =
    group.name ?? autoGroupName(group.members.filter((m) => m.id !== meId).map((m) => m.name));

  // Only when we know who "me" is. Recomputing from a null id would find nobody and read
  // as "you have no role here", which is a different claim from "we do not know yours".
  if (meId) group.myRole = group.members.find((m) => m.id === meId)?.gRole ?? null;
}
