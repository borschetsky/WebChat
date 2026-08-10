import type { Message } from '@/types/models';

/** Who did it, from the reader's point of view. */
const actor = (m: Message, meId: string | null) => (m.authorId === meId ? 'You' : m.author);

/** First name only, matching how the rest of the app refers to people in passing. */
const first = (name: string | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'someone';

/**
 * Turns a stored system message into a sentence.
 *
 * The server stores **facts, not prose** — `systemData` carries ids and values and `body` is
 * null — so the wording lives here. Two reasons, both from the spec: the sentence is not
 * frozen in whatever language the actor happened to be using, and a display name that changes
 * later does not leave the history quoting a name nobody recognises.
 *
 * `names` resolves a user id to a display name, usually from the thread's members. When it
 * cannot, the sentence degrades to "someone" rather than printing a raw GUID at a reader.
 */
export function systemMessageText(
  m: Message,
  meId: string | null,
  names: (userId: string) => string | undefined,
): string {
  const who = actor(m, meId);
  const data = (m.systemData ?? {}) as Record<string, unknown>;

  // The server's map first. `names` resolves against the thread's *current* members, which
  // cannot name the one person a removal or a departure is about - they are no longer in it,
  // so "You removed Maya" read "You removed someone" the instant it became true, and every
  // older message naming them degraded the same way.
  const nameOf = (id: string) => m.systemNames?.[id] ?? names(id);

  switch (m.systemKind) {
    case 'rename': {
      const to = data.to as string | null;
      // A null `to` is a revert to auto-naming, which is a different sentence - "renamed the
      // group to nothing" would be nonsense.
      return to ? `${who} renamed the group to “${to}”` : `${who} removed the group name`;
    }

    case 'members_added': {
      const ids = (data.userIds as string[]) ?? [];
      const added = ids.map((id) => first(nameOf(id)));
      if (added.length === 0) return `${who} added someone`;
      if (added.length === 1) return `${who} added ${added[0]}`;
      if (added.length === 2) return `${who} added ${added[0]} and ${added[1]}`;
      // One message per batch, so this is the eight-people case: name two, count the rest.
      return `${who} added ${added[0]}, ${added[1]} and ${added.length - 2} others`;
    }

    case 'member_removed':
      return `${who} removed ${first(nameOf(data.userId as string))}`;

    case 'member_left':
      return `${who} left the group`;

    case 'role_changed': {
      const target = first(nameOf(data.userId as string));
      return data.to === 'admin'
        ? `${who} made ${target} an admin`
        : `${who} removed admin from ${target}`;
    }

    case 'owner_transferred':
      return `${who} made ${first(nameOf(data.toUserId as string))} the owner`;

    case 'group_created':
      return `${who} created the group`;

    default:
      // An unknown kind from a newer server renders as nothing rather than as a broken row.
      return '';
  }
}
