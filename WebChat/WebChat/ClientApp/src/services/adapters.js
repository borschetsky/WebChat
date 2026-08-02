// Maps WebChat API DTOs onto the shape the MUI redesign components consume.
//
// The design handoff was built against fixture data with a richer shape than our API
// returns. Everything this module produces from real data is marked REAL; fields the
// backend cannot supply are filled from ./mocks and marked MOCK there, never here.
//
// Keeping the mapping in one place means a backend change is a change to this file plus
// the removal of one mock, rather than a hunt through components.

import { avatarColor } from '@/theme/tokens';
import { getDateInfoForThread, getDateInfoForMessage } from '@/lib/date-time-format';
import {
  mockThreadUnread,
  mockThreadIsGroup,
  mockThreadMembers,
  mockMessageReactions,
  mockMessageQuote,
  mockMessageAttachment,
} from './mocks';

/** The signed-in user id, as issued by AuthService and stored by the login flow. */
export const currentUserId = () => {
  try {
    return JSON.parse(localStorage.getItem('user-data'))?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * ThreadViewModel -> thread row.
 *
 * REAL: id, name, avatarFileName, presence (binary), preview, time, opponentId
 * MOCK: group, unread, members
 */
export const toThread = (vm) => {
  const opponent = vm.oponentVM ?? {};
  const last = vm.lastMessage ?? {};
  const hasMessages = !!last.text && last.text !== 'No messages';

  return {
    id: vm.id,
    opponentId: opponent.id,
    name: opponent.username ?? 'Unknown',
    avatarFileName: opponent.avatarFileName ?? null,
    color: avatarColor(opponent.id ?? vm.id),

    // The API exposes online/offline only. The design also has an 'away' state, which
    // nothing on the server can currently produce.
    presence: opponent.isOnline ? 'online' : 'offline',
    isTyping: !!opponent.isTyping,

    preview: hasMessages ? last.text : 'No messages yet',
    time: hasMessages && last.time ? getDateInfoForThread(last.time) : '',
    lastMessageAt: hasMessages ? last.time : null,

    group: mockThreadIsGroup(vm.id),
    unread: mockThreadUnread(vm.id),
    members: mockThreadMembers(vm.id, opponent),
  };
};

export const toThreads = (vms) => (Array.isArray(vms) ? vms.map(toThread) : []);

/**
 * MessageViewModel -> message row.
 *
 * REAL: id, author, text, time, own
 * MOCK: reactions, quote, attachment
 */
export const toMessage = (vm, meId = currentUserId()) => ({
  id: vm.id,
  threadId: vm.threadId,
  authorId: vm.senderId,
  author: vm.username ?? 'Unknown',
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
export const toMessageList = (dict, meId = currentUserId()) => {
  if (!dict || typeof dict !== 'object') return [];

  return Object.keys(dict)
    .sort((a, b) => new Date(a) - new Date(b))
    .flatMap((dayKey) => {
      const forDay = (dict[dayKey] ?? [])
        .map((vm) => toMessage(vm, meId))
        .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));

      return forDay.map((m, i) => ({ ...m, dayKey, startsDay: i === 0 }));
    });
};

/** UserViewModel -> directory entry for the new-conversation dialog. */
export const toDirectoryEntry = (vm) => ({
  id: vm.id,
  name: vm.username ?? 'Unknown',
  avatarFileName: vm.avatarFileName ?? null,
  color: avatarColor(vm.id ?? ''),
  presence: vm.isOnline ? 'online' : 'offline',
  role: vm.isOnline ? 'Online' : 'Offline',
});

export const toDirectory = (vms) => (Array.isArray(vms) ? vms.map(toDirectoryEntry) : []);

/** ProfileViewModel -> the profile block in the settings drawer. */
export const toProfile = (vm) => ({
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
export const toLiveMessage = (payload, meId = currentUserId()) => ({
  ...toMessage(payload, meId),
  dayKey: payload.date ?? null,
  startsDay: false,
});
