import { describe, it, expect } from 'vitest';
import { autoGroupName, autoGroupNameOf } from '@/features/threads/groupName';
import { toThread } from '@/services/adapters';
import type { ThreadDto } from '@/types/dto';

/**
 * `SPEC-groups-and-admin.md` §1: an unnamed group's title is **derived from current
 * membership on every read**, never snapshotted. The spec is explicit about why - a stored
 * string "goes stale silently and users report it as a bug" - and an earlier version of this
 * app did exactly that, storing the derived name at creation.
 *
 * The format numbers are the design: three first names, then a count.
 */
describe('autoGroupName', () => {
  it('joins up to three first names', () => {
    expect(autoGroupName(['Maya Rodriguez', 'Tomás Lind'])).toBe('Maya, Tomás');
    expect(autoGroupName(['Maya Rodriguez', 'Tomás Lind', 'Priya Nair'])).toBe(
      'Maya, Tomás, Priya',
    );
  });

  it('counts everyone past the third', () => {
    // The previous implementation showed two names and "+N" from the third onward, so a
    // three-member group read "Maya, Tomás +1". The spec shows all three.
    expect(
      autoGroupName(['Maya Rodriguez', 'Tomás Lind', 'Priya Nair', 'Sam Okafor', 'Ada Vine']),
    ).toBe('Maya, Tomás, Priya +2');
  });

  it('uses a single-word name whole', () => {
    expect(autoGroupName(['test2', 'admin'])).toBe('test2, admin');
  });

  it('falls back rather than producing an empty title', () => {
    expect(autoGroupName([])).toBe('Group');
    expect(autoGroupName(['   ', undefined])).toBe('Group');
  });
});

const member = (id: string, username: string) => ({
  id,
  username,
  email: null,
  isOnline: false,
  isTyping: false,
  avatarFileName: null,
});

const groupDto = (over: Partial<ThreadDto> = {}): ThreadDto =>
  ({
    id: 't1',
    owner: 'me',
    lastMessage: { text: 'No messages', time: null, senderId: null },
    oponentVM: null,
    isGroup: true,
    name: null,
    members: [member('u1', 'Maya Rodriguez'), member('u2', 'Tomás Lind')],
    ...over,
  }) as ThreadDto;

describe('group titles come from the server or from membership', () => {
  it('derives the title when the server sends no name', () => {
    expect(toThread(groupDto()).name).toBe('Maya, Tomás');
  });

  /**
   * The whole point of deriving: this is the case a stored name got wrong. Same thread, one
   * member fewer, and the title follows with nothing to invalidate.
   */
  it('drops a removed member from the title with no rename', () => {
    const before = toThread(groupDto());
    const after = toThread(groupDto({ members: [member('u1', 'Maya Rodriguez')] }));

    expect(before.name).toBe('Maya, Tomás');
    expect(after.name).toBe('Maya');
  });

  it('keeps a name the server did send, whatever the membership', () => {
    // Once someone names a group it is stored and `Named` is set, so it never re-derives -
    // even if everyone in the title leaves.
    const t = toThread(groupDto({ name: 'Design Guild' }));
    expect(t.name).toBe('Design Guild');
  });

  it('still names a direct thread after the other person', () => {
    const dm = toThread({
      ...groupDto(),
      isGroup: false,
      members: [],
      oponentVM: member('u2', 'Maya'),
    } as ThreadDto);

    expect(dm.name).toBe('Maya');
  });
});

describe('autoGroupNameOf', () => {
  it('reads the member shape the adapter produces', () => {
    expect(autoGroupNameOf([{ name: 'Maya Rodriguez' }, { name: 'Tomás Lind' }])).toBe(
      'Maya, Tomás',
    );
  });
});
