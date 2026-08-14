// Maps WebChat API DTOs onto the shape the MUI redesign components consume.
//
// Everything produced here from real data is typed against @/types/models; fields the
// backend cannot supply come from ./mocks and are marked MOCK there, never here.
//
// Keeping the mapping in one place means a backend change is a change to this file plus
// the removal of one mock, rather than a hunt through components.

import { avatarColor } from '@/theme/tokens';
import { autoGroupName } from '@/features/threads/groupName';
import { systemMessageText } from '@/features/messages/systemMessage';
import { getDateInfoForThread, getDateInfoForMessage } from '@/lib/date-time-format';
import type {
  GroupDto,
  MessageDto,
  MessagesByDayDto,
  ProfileDto,
  ThreadDto,
  UserDto,
} from '@/types/dto';
import type { DirectoryEntry, Group, GroupMember, Message, Profile, Thread } from '@/types/models';
import {
  mockThreadUnread,
  mockMessageReactions,
  mockMessageQuote,
  mockMessageAttachment,
} from './mocks';

/** The signed-in user id, as issued by AuthService and stored by the login flow. */
export const currentUserId = (): string | null => {
  try {
    return JSON.parse(localStorage.getItem('user-data') ?? 'null')?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * ThreadViewModel -> thread row.
 *
 * REAL: id, name, avatarFileName, presence (binary), preview, time, opponentId, group, members
 * MOCK: unread
 */
export const toThread = (vm: ThreadDto, meId: string | null = currentUserId()): Thread => {
  const opponent = vm.oponentVM ?? null;
  const last = vm.lastMessage ?? null;
  const hasMessages = !!last?.text && last.text !== 'No messages';

  // A system message is the newest row as often as any other, and its `text` is null - so
  // without this a group whose last event was a rename reads "No messages yet" while its
  // history is full of messages. The sentence is built here for the same reason it is built
  // in the message list: the server stores facts, not prose.
  const members = (vm.members ?? []).filter(Boolean);
  const systemPreview =
    last?.type === 'system'
      ? systemMessageText(
          {
            authorId: last.senderId ?? '',
            // The sender's own name first: on "left the group" the actor is by definition
            // no longer in `members`, so looking them up there always failed and every such
            // preview read "Someone left the group".
            author:
              last.username ?? members.find((m) => m.id === last.senderId)?.username ?? 'Someone',
            systemKind: last.systemKind ?? null,
            systemData: last.systemData ?? null,
            systemNames: last.systemNames ?? null,
          } as Message,
          meId,
          (id) => members.find((m) => m.id === id)?.username ?? undefined,
        )
      : '';

  return {
    id: vm.id,
    opponentId: opponent?.id,
    // A group nobody named has no stored name, so its title is derived here from current
    // membership - which is why removing a member retitles the thread with nothing to
    // invalidate. `members` excludes the caller already, which is what the derivation wants.
    name: vm.isGroup
      ? (vm.name ?? autoGroupName((vm.members ?? []).map((m) => m?.username ?? undefined)))
      : (opponent?.username ?? 'Unknown'),
    avatarFileName: vm.isGroup ? null : (opponent?.avatarFileName ?? null),
    color: avatarColor(vm.isGroup ? vm.id : (opponent?.id ?? vm.id)),

    // The API exposes online/offline only. The design also has an 'away' state, which
    // nothing on the server can currently produce.
    presence: opponent?.isOnline ? 'online' : 'offline',
    isTyping: !!opponent?.isTyping,

    // A system message has no author to prefix - "Maya: You renamed the group" would be
    // wrong twice over. The spec calls this out directly, and the preview is where it shows.
    preview: systemPreview || (hasMessages ? (last?.text ?? '') : 'No messages yet'),
    // System messages do update the sort order, which is the half of the rule that is not
    // about display: they are excluded from unread, not from recency.
    time: (systemPreview || hasMessages) && last?.time ? getDateInfoForThread(last.time) : '',
    lastMessageAt: systemPreview || hasMessages ? (last?.time ?? null) : null,

    group: !!vm.isGroup,
    unread: mockThreadUnread(vm.id),

    // Real members now. The server sends everyone but the caller, so a direct thread has one
    // and a group has the rest. `role` stays empty here even though the server does have
    // roles since #63: getthreads does not carry them, and the one place roles are rendered
    // - the info drawer - reads `Group.members`, which does. Filling this in from a second
    // request per row would buy nothing.
    members: (vm.members ?? []).filter(Boolean).map((m) => ({
      id: m.id,
      name: m.username ?? 'Unknown',
      role: '',
      presence: m.isOnline ? ('online' as const) : ('offline' as const),
      // Null, not undefined: PresenceAvatar reads null as "draw initials" and ThreadMember
      // declares `string | null`. The server has always sent this; dropping it here is why
      // every face in a group stack was initials until #47.
      avatarFileName: m.avatarFileName ?? null,
    })),
  };
};

export const toThreads = (
  vms: ThreadDto[] | null | undefined,
  meId: string | null = currentUserId(),
): Thread[] =>
  // Not `vms.map(toThread)`: map passes the index as the second argument, which would land
  // in `meId` and make every preview read as someone else's.
  Array.isArray(vms) ? vms.map((vm) => toThread(vm, meId)) : [];

/**
 * Group -> the info drawer's model.
 *
 * `title` is derived here from the same rule the thread list uses, so a group that nobody
 * named reads identically in both places. `myRole` is lifted out of `members` because every
 * capability check needs it and none of them should be re-scanning the list.
 */
export const toGroup = (vm: GroupDto, meId: string | null = currentUserId()): Group => {
  const members: GroupMember[] = (vm.members ?? []).filter(Boolean).map((m) => ({
    id: m.userId,
    name: m.displayName ?? 'Unknown',
    gRole: m.gRole,
    joinedAt: m.joinedAt ?? null,
    avatarFileName: m.avatarFileName ?? null,
    presence: m.isOnline ? ('online' as const) : ('offline' as const),
    color: avatarColor(m.userId ?? ''),
  }));

  return {
    id: vm.id,
    name: vm.name ?? null,
    named: !!vm.named,
    // Unlike getthreads, this list includes the viewer - and a title made of everyone
    // including yourself reads wrong, so drop yourself before deriving it.
    title: vm.name ?? autoGroupName(members.filter((m) => m.id !== meId).map((m) => m.name)),
    version: vm.version ?? 0,
    perms: vm.perms ?? { rename: 'admins', invite: 'admins', remove: 'admins' },
    members,
    myRole: members.find((m) => m.id === meId)?.gRole ?? null,
  };
};

/**
 * MessageViewModel -> message row.
 *
 * REAL: id, author, text, time, own
 * MOCK: reactions, quote, attachment
 */
export const toMessage = (vm: MessageDto, meId: string | null = currentUserId()): Message => ({
  id: vm.id,
  threadId: vm.threadId,
  authorId: vm.senderId,
  author: vm.username ?? 'Unknown',
  // Null, not undefined: PresenceAvatar reads it as "draw initials", and Message declares
  // `string | null`. Absent here entirely until #45 - which is why every message row showed
  // initials while the same person's avatar rendered fine in the thread list.
  avatarFileName: vm.avatarFileName ?? null,
  color: avatarColor(vm.senderId ?? ''),
  own: vm.senderId === meId,
  text: vm.text ?? '',
  time: vm.time ? getDateInfoForMessage(vm.time) : '',
  sentAt: vm.time ?? null,

  // Absent on older payloads, which are all ordinary messages.
  system: vm.type === 'system',
  systemKind: vm.systemKind ?? null,
  systemData: vm.systemData ?? null,
  systemNames: vm.systemNames ?? null,

  reactions: mockMessageReactions(vm.id),
  quote: mockMessageQuote(vm.id),
  attachment: mockMessageAttachment(vm.id),
});

/**
 * getmessages and thread/search both return Dictionary<DateTime, MessageViewModel[]>,
 * which Newtonsoft serialises with ISO date-string keys. Flatten to a single ordered
 * list, tagging the first message of each day so the UI can render a day separator.
 *
 * Object key order is not guaranteed for arbitrary strings, so sort explicitly.
 */
export const toMessageList = (
  dict: MessagesByDayDto | null | undefined,
  meId: string | null = currentUserId(),
): Message[] => {
  if (!dict || typeof dict !== 'object') return [];

  return Object.keys(dict)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .flatMap((dayKey) => {
      const forDay = (dict[dayKey] ?? [])
        .map((vm) => toMessage(vm, meId))
        .sort((a, b) => Date.parse(a.sentAt ?? '') - Date.parse(b.sentAt ?? ''));

      return forDay.map((m, i) => ({ ...m, dayKey, startsDay: i === 0 }));
    });
};

/** UserViewModel -> directory entry for the new-conversation dialog. */
export const toDirectoryEntry = (vm: UserDto): DirectoryEntry => ({
  id: vm.id,
  name: vm.username ?? 'Unknown',
  avatarFileName: vm.avatarFileName ?? null,
  color: avatarColor(vm.id ?? ''),
  presence: vm.isOnline ? 'online' : 'offline',
  role: vm.isOnline ? 'Online' : 'Offline',
});

export const toDirectory = (vms: UserDto[] | null | undefined): DirectoryEntry[] =>
  Array.isArray(vms) ? vms.map(toDirectoryEntry) : [];

/** ProfileViewModel -> the profile block in the settings drawer. */
export const toProfile = (vm: ProfileDto): Profile => ({
  id: vm.id,
  name: vm.username ?? '',
  email: vm.email ?? '',
  avatarFileName: vm.avatarFileName ?? null,
  color: avatarColor(vm.id ?? ''),
  // Load-bearing, and it was missing for five slices: the admin link and the /admin route
  // guard both read it, so dropping it here made the console unreachable from a browser
  // while its API answered perfectly. Read fresh from the database on every getprofile, so
  // a promotion takes effect on reload rather than at the next sign-in.
  role: vm.role ?? null,
});

/**
 * A message arriving over SignalR ("ReciveMessage") uses the same MessageViewModel shape
 * as the REST response, so it maps identically - but it never carries day grouping.
 */
export const toLiveMessage = (
  payload: MessageDto,
  meId: string | null = currentUserId(),
): Message => ({
  ...toMessage(payload, meId),
  dayKey: payload.date ?? null,
  startsDay: false,
});
