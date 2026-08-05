import { describe, it, expect, beforeEach } from 'vitest';
import { toThread, toThreads, toMessage, toMessageList, toDirectory, toProfile, toLiveMessage } from './adapters';
import type { MessageDto, MessagesByDayDto, ThreadDto } from '@/types/dto';

/**
 * The DTO -> view-model seam. This is where shape bugs live, which is why it was the first
 * thing converted to TypeScript - and it is worth testing against realistic payloads,
 * including the backend's misspelled `oponentVM` and its habit of returning
 * "No messages" as a sentinel rather than an empty list.
 */

const threadDto = (over: Partial<ThreadDto> = {}): ThreadDto => ({
  id: 't1',
  owner: 'me',
  lastMessage: { text: 'hello there', time: '2026-08-03T10:00:00', senderId: 'u2' },
  oponentVM: {
    id: 'u2', username: 'Maya', email: 'm@e.com',
    avatarFileName: 'a.png', isOnline: true, isTyping: false,
  },
  ...over,
});

const messageDto = (over: Partial<MessageDto> = {}): MessageDto => ({
  id: 'm1', senderId: 'u2', text: 'hi', threadId: 't1',
  username: 'Maya', time: '2026-08-03T10:00:00',
  ...over,
});

describe('toThread', () => {
  it('maps the opponent onto the row', () => {
    const t = toThread(threadDto());
    expect(t.name).toBe('Maya');
    expect(t.opponentId).toBe('u2');
    expect(t.avatarFileName).toBe('a.png');
    expect(t.preview).toBe('hello there');
  });

  it('maps isOnline to the presence union', () => {
    expect(toThread(threadDto()).presence).toBe('online');
    expect(toThread(threadDto({ oponentVM: { ...threadDto().oponentVM!, isOnline: false } })).presence).toBe('offline');
  });

  it('treats the "No messages" sentinel as having no messages', () => {
    const t = toThread(threadDto({ lastMessage: { text: 'No messages', time: null, senderId: null } }));
    expect(t.preview).toBe('No messages yet');
    expect(t.time).toBe('');
    expect(t.lastMessageAt).toBeNull();
  });

  it('survives a thread with no opponent or last message', () => {
    const t = toThread(threadDto({ oponentVM: null, lastMessage: null }));
    expect(t.name).toBe('Unknown');
    expect(t.presence).toBe('offline');
    expect(t.preview).toBe('No messages yet');
  });

  it('assigns a colour that is stable for the same opponent', () => {
    expect(toThread(threadDto()).color).toBe(toThread(threadDto()).color);
    expect(toThread(threadDto()).color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('treats a thread with no isGroup as direct, and takes members from the payload', () => {
    // group and members used to come from the mock layer, which always answered false and
    // a fabricated pair. They are real now: absent isGroup means direct, and members is
    // whatever the server sent - an older payload with neither yields an empty list rather
    // than invented people.
    const t = toThread(threadDto());
    expect(t.group).toBe(false);
    expect(t.unread).toBe(0);
    expect(t.members).toEqual([]);
  });

  it('names a group after the thread, not after a person', () => {
    const t = toThread({
      ...threadDto(),
      isGroup: true,
      name: 'Team standup',
      members: [
        { id: 'u1', username: 'sam', email: null, isOnline: true, isTyping: false, avatarFileName: null },
        { id: 'u2', username: 'jo', email: null, isOnline: false, isTyping: false, avatarFileName: null },
      ],
    });

    expect(t.group).toBe(true);
    expect(t.name).toBe('Team standup');
    expect(t.members.map((m) => m.name)).toEqual(['sam', 'jo']);
    expect(t.members[0].presence).toBe('online');
    // A group has no single avatar to show - one member's picture would misrepresent it.
    expect(t.avatarFileName).toBeNull();
  });

  it('returns an empty array for a 204 or a non-array', () => {
    expect(toThreads(null)).toEqual([]);
    expect(toThreads(undefined)).toEqual([]);
  });
});

describe('toMessage', () => {
  it('marks a message as own only for the signed-in user', () => {
    expect(toMessage(messageDto({ senderId: 'me' }), 'me').own).toBe(true);
    expect(toMessage(messageDto({ senderId: 'u2' }), 'me').own).toBe(false);
  });

  it('keeps the raw timestamp alongside the formatted one', () => {
    const m = toMessage(messageDto(), 'me');
    expect(m.sentAt).toBe('2026-08-03T10:00:00');
    expect(m.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('defaults the mocked fields', () => {
    const m = toMessage(messageDto(), 'me');
    expect(m.reactions).toEqual([]);
    expect(m.quote).toBeNull();
    expect(m.attachment).toBeNull();
  });
});

describe('toMessageList', () => {
  const dict: MessagesByDayDto = {
    // Deliberately out of order: object key order is not guaranteed for arbitrary strings,
    // so the adapter must sort rather than trust insertion order.
    '2026-08-03T00:00:00': [
      messageDto({ id: 'c', time: '2026-08-03T09:00:00' }),
      messageDto({ id: 'b', time: '2026-08-03T08:00:00' }),
    ],
    '2026-08-01T00:00:00': [messageDto({ id: 'a', time: '2026-08-01T10:00:00' })],
  };

  it('flattens days in chronological order', () => {
    expect(toMessageList(dict, 'me').map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts within a day too', () => {
    const ids = toMessageList(dict, 'me').filter((m) => m.dayKey === '2026-08-03T00:00:00').map((m) => m.id);
    expect(ids).toEqual(['b', 'c']);
  });

  it('tags only the first message of each day', () => {
    const list = toMessageList(dict, 'me');
    expect(list.filter((m) => m.startsDay).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('returns empty for a missing or malformed payload', () => {
    expect(toMessageList(null)).toEqual([]);
    expect(toMessageList(undefined)).toEqual([]);
  });
});

describe('toLiveMessage', () => {
  it('never tags a socket message as starting a day', () => {
    // A hub message has no day context; grouping is the list's job.
    expect(toLiveMessage(messageDto({ date: '2026-08-03T00:00:00' }), 'me').startsDay).toBe(false);
  });
});

describe('toDirectory and toProfile', () => {
  it('maps a directory entry with a presence-derived role', () => {
    const [entry] = toDirectory([{ id: 'u3', username: 'Ben', isOnline: true, avatarFileName: null }]);
    expect(entry.name).toBe('Ben');
    expect(entry.role).toBe('Online');
  });

  it('falls back to empty strings on a sparse profile', () => {
    const p = toProfile({ id: 'me', username: null, email: null, avatarFileName: null });
    expect(p.name).toBe('');
    expect(p.email).toBe('');
  });
});

describe('currentUserId', () => {
  beforeEach(() => localStorage.clear());

  it('degrades to null rather than throwing on malformed storage', async () => {
    const { currentUserId } = await import('./adapters');
    localStorage.setItem('user-data', 'not json');
    expect(currentUserId()).toBeNull();
  });
});
