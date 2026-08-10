import { describe, it, expect } from 'vitest';
import { systemMessageText } from '@/features/messages/systemMessage';
import { toMessage, toThread } from '@/services/adapters';
import type { Message } from '@/types/models';
import type { MessageDto, ThreadDto } from '@/types/dto';

/**
 * The server stores facts and no prose — `systemData` carries ids, `body` is null — so the
 * sentence is built here. Two reasons from the spec: the wording is not frozen in whatever
 * language the actor was using, and a display name that changes later does not leave the
 * history quoting a name nobody recognises.
 */

const NAMES: Record<string, string> = {
  me: 'Wod Moshkin',
  u1: 'Maya Rodriguez',
  u2: 'Tomás Lind',
  u3: 'Priya Nair',
};
const nameOf = (id: string) => NAMES[id];

const sys = (kind: string, data: unknown, authorId = 'u1'): Message =>
  ({
    id: 'm1',
    threadId: 't1',
    authorId,
    author: NAMES[authorId] ?? 'Unknown',
    system: true,
    systemKind: kind,
    systemData: data,
    text: '',
  }) as Message;

describe('systemMessageText', () => {
  it('says "You" for your own action and the name for someone else', () => {
    expect(systemMessageText(sys('rename', { to: 'Design Guild' }, 'me'), 'me', nameOf)).toBe(
      'You renamed the group to “Design Guild”',
    );
    expect(systemMessageText(sys('rename', { to: 'Design Guild' }, 'u1'), 'me', nameOf)).toBe(
      'Maya Rodriguez renamed the group to “Design Guild”',
    );
  });

  it('has a different sentence for reverting to auto-naming', () => {
    // A null `to` means the name was removed. "renamed the group to nothing" is nonsense.
    expect(systemMessageText(sys('rename', { to: null }, 'me'), 'me', nameOf)).toBe(
      'You removed the group name',
    );
  });

  it('names up to two people added and counts the rest', () => {
    // One message per batch, so this is the many-people case.
    expect(systemMessageText(sys('members_added', { userIds: ['u1'] }, 'me'), 'me', nameOf)).toBe(
      'You added Maya',
    );
    expect(
      systemMessageText(sys('members_added', { userIds: ['u1', 'u2'] }, 'me'), 'me', nameOf),
    ).toBe('You added Maya and Tomás');
    expect(
      systemMessageText(sys('members_added', { userIds: ['u1', 'u2', 'u3'] }, 'me'), 'me', nameOf),
    ).toBe('You added Maya, Tomás and 1 others');
  });

  it('distinguishes being removed from leaving', () => {
    expect(systemMessageText(sys('member_removed', { userId: 'u2' }, 'me'), 'me', nameOf)).toBe(
      'You removed Tomás',
    );
    expect(systemMessageText(sys('member_left', {}, 'u2'), 'me', nameOf)).toBe(
      'Tomás Lind left the group',
    );
  });

  it('reads a promotion and a demotion differently', () => {
    expect(
      systemMessageText(sys('role_changed', { userId: 'u3', to: 'admin' }, 'me'), 'me', nameOf),
    ).toBe('You made Priya an admin');
    expect(
      systemMessageText(sys('role_changed', { userId: 'u3', to: 'member' }, 'me'), 'me', nameOf),
    ).toBe('You removed admin from Priya');
  });

  it('renders an ownership transfer', () => {
    expect(
      systemMessageText(sys('owner_transferred', { toUserId: 'u2' }, 'me'), 'me', nameOf),
    ).toBe('You made Tomás the owner');
  });

  it('names someone who has already left, from the server map', () => {
    // The whole point of `systemNames`. The member list cannot name the one person a removal
    // is about - they are no longer in it - so this read "You removed someone" the instant it
    // became true, and every older message naming them degraded the same way.
    const m = {
      ...sys('member_removed', { userId: 'gone' }, 'me'),
      systemNames: { gone: 'Tomás Lind' },
    };

    expect(systemMessageText(m, 'me', nameOf)).toBe('You removed Tomás');
  });

  it('degrades to "someone" rather than printing a raw id', () => {
    // Somebody who has left is not in the member list any more.
    expect(systemMessageText(sys('member_removed', { userId: 'gone' }, 'me'), 'me', nameOf)).toBe(
      'You removed someone',
    );
  });

  it('renders nothing for a kind it does not know', () => {
    // A newer server should produce no row rather than a broken one.
    expect(systemMessageText(sys('teleported', {}, 'me'), 'me', nameOf)).toBe('');
  });
});

const messageDto = (over: Partial<MessageDto> = {}): MessageDto => ({
  id: 'm1',
  senderId: 'u1',
  text: 'hi',
  threadId: 't1',
  username: 'Maya',
  time: '2026-08-10T10:00:00',
  ...over,
});

describe('the adapter carries the system fields', () => {
  it('marks a system message and keeps its structured data', () => {
    const m = toMessage(
      messageDto({ type: 'system', systemKind: 'rename', systemData: { to: 'X' }, text: null }),
      'me',
    );

    expect(m.system).toBe(true);
    expect(m.systemKind).toBe('rename');
    expect(m.systemData).toEqual({ to: 'X' });
  });

  it('treats a payload with no type as an ordinary message', () => {
    // Everything sent before the server knew about system messages.
    const m = toMessage(messageDto(), 'me');

    expect(m.system).toBe(false);
    expect(m.systemKind).toBeNull();
  });
});

describe('thread previews', () => {
  it('shows the last message text without inventing an author prefix', () => {
    // The spec requires system messages to be excluded from the author prefix. The preview
    // is built from lastMessage.text, which is null for a system row - so a group whose last
    // event was a rename must not read as an authored message.
    const t = toThread({
      id: 't1',
      owner: 'me',
      isGroup: true,
      name: 'Design Guild',
      lastMessage: { text: 'No messages', time: null, senderId: null },
      oponentVM: null,
      members: [],
    } as ThreadDto);

    expect(t.preview).toBe('No messages yet');
  });

  it('renders the sentence when the newest row is a system message', () => {
    // The spec keeps system messages out of the unread count but explicitly in the preview.
    // Their `text` is null, so without this a group whose last event was a rename reads
    // "No messages yet" while its history is full of messages.
    const t = toThread(
      {
        id: 't1',
        owner: 'me',
        isGroup: true,
        name: null,
        lastMessage: {
          text: null,
          time: '2026-08-10T10:00:00Z',
          senderId: 'u1',
          type: 'system',
          systemKind: 'rename',
          systemData: { from: null, to: 'Design Guild' },
        },
        oponentVM: null,
        members: [{ id: 'u1', username: 'Maya Rodriguez' }],
      } as ThreadDto,
      'me',
    );

    expect(t.preview).toBe('Maya Rodriguez renamed the group to “Design Guild”');
    // Excluded from unread, not from recency - the row still sorts by when it happened.
    expect(t.lastMessageAt).toBe('2026-08-10T10:00:00Z');
  });

  it('says "You" in the preview when the actor is the reader', () => {
    const t = toThread(
      {
        id: 't1',
        owner: 'me',
        isGroup: true,
        name: 'Design Guild',
        lastMessage: {
          text: null,
          time: '2026-08-10T10:00:00Z',
          senderId: 'me',
          type: 'system',
          systemKind: 'member_left',
          systemData: {},
        },
        oponentVM: null,
        members: [],
      } as ThreadDto,
      'me',
    );

    expect(t.preview).toBe('You left the group');
  });
});
