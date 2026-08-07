import { describe, it, expect } from 'vitest';
import { typingLabel, selectTypingUsersIn } from '@/features/realtime/realtimeSlice';

const maya = { id: 'u1', name: 'Maya Rodriguez' };
const tomas = { id: 'u2', name: 'Tomás Lind' };
const priya = { id: 'u3', name: 'Priya Nair' };

/**
 * A direct thread can say "typing…" because there is only one person it could be. A group
 * cannot - which is why the server now puts the username on the wire. Before this, a group
 * called "Design Guild" announced that "Design is typing…", because the line was built from
 * the thread's name rather than the typist's.
 */
describe('typingLabel', () => {
  it('says nothing when nobody is typing', () => {
    expect(typingLabel([], false)).toBeNull();
    expect(typingLabel([], true)).toBeNull();
  });

  it('does not name the person in a direct thread', () => {
    expect(typingLabel([maya], false)).toBe('typing…');
  });

  it('names them in a group', () => {
    expect(typingLabel([maya], true)).toBe('Maya Rodriguez is typing…');
  });

  it('names both when two are typing', () => {
    expect(typingLabel([maya, tomas], true)).toBe('Maya Rodriguez and Tomás Lind are typing…');
  });

  it('counts the rest past two', () => {
    expect(typingLabel([maya, tomas, priya], true)).toBe('Maya Rodriguez and 2 others are typing…');
  });
});

describe('selectTypingUsersIn', () => {
  it('returns an empty array rather than undefined for an unknown or absent thread', () => {
    expect(selectTypingUsersIn({}, 't1')).toEqual([]);
    expect(selectTypingUsersIn({ t1: [maya] }, null)).toEqual([]);
    expect(selectTypingUsersIn({ t1: [maya] }, undefined)).toEqual([]);
  });

  it('returns the typists for the thread asked for', () => {
    expect(selectTypingUsersIn({ t1: [maya], t2: [tomas] }, 't1')).toEqual([maya]);
  });
});
