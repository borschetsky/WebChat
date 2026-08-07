// Maps WebChat API DTOs onto the shape the MUI redesign components consume.
//
// Everything produced here from real data is typed against @/types/models; fields the
// backend cannot supply come from ./mocks and are marked MOCK there, never here.
//
// Keeping the mapping in one place means a backend change is a change to this file plus
// the removal of one mock, rather than a hunt through components.

import { avatarColor } from '@/theme/tokens';
import { getDateInfoForThread, getDateInfoForMessage } from '@/lib/date-time-format';
import type { MessageDto, MessagesByDayDto, ProfileDto, ThreadDto, UserDto } from '@/types/dto';
import type { DirectoryEntry, Message, Profile, Thread } from '@/types/models';
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
export const toThread = (vm: ThreadDto): Thread => {
  const opponent = vm.oponentVM ?? null;
  const last = vm.lastMessage ?? null;
  const hasMessages = !!last?.text && last.text !== 'No messages';

  return {
    id: vm.id,
    opponentId: opponent?.id,
    name: vm.isGroup ? (vm.name ?? 'Group') : (opponent?.username ?? 'Unknown'),
    avatarFileName: vm.isGroup ? null : (opponent?.avatarFileName ?? null),
    color: avatarColor(vm.isGroup ? vm.id : (opponent?.id ?? vm.id)),

    // The API exposes online/offline only. The design also has an 'away' state, which
    // nothing on the server can currently produce.
    presence: opponent?.isOnline ? 'online' : 'offline',
    isTyping: !!opponent?.isTyping,

    preview: hasMessages ? (last?.text ?? '') : 'No messages yet',
    time: hasMessages && last?.time ? getDateInfoForThread(last.time) : '',
    lastMessageAt: hasMessages ? (last?.time ?? null) : null,

    group: !!vm.isGroup,
    unread: mockThreadUnread(vm.id),

    // Real members now. The server sends everyone but the caller, so a direct thread has
    // one and a group has the rest - and `role` stays empty because nothing on the server
    // has a concept of one yet. Inventing "Member" here would look like data.
    members: (vm.members ?? []).filter(Boolean).map((m) => ({
      id: m.id,
      name: m.username ?? 'Unknown',
      role: '',
      presence: m.isOnline ? ('online' as const) : ('offline' as const),
    })),
  };
};

export const toThreads = (vms: ThreadDto[] | null | undefined): Thread[] =>
  Array.isArray(vms) ? vms.map(toThread) : [];

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
