import { describe, it, expect } from 'vitest';
import { deriveGroupName } from '@/features/threads/groupName';

/**
 * The handoff draws no group-name field, so the name is derived from the members. The API
 * still requires one - CreateGroupViewModel.Name is [Required], StringLength(60) - which is
 * what the length cases below are about: a rejected name surfaces to the user only as
 * "Could not create that group", saying nothing about the cause.
 */
describe('deriveGroupName', () => {
  it('joins two first names', () => {
    expect(deriveGroupName([{ name: 'Maya Rodriguez' }, { name: 'Tomás Lind' }])).toBe(
      'Maya, Tomás',
    );
  });

  it('counts everyone past the second', () => {
    expect(
      deriveGroupName([
        { name: 'Maya Rodriguez' },
        { name: 'Tomás Lind' },
        { name: 'Priya Nair' },
        { name: 'Sam Okafor' },
      ]),
    ).toBe('Maya, Tomás +2');
  });

  it('uses a single-word name whole', () => {
    expect(deriveGroupName([{ name: 'test2' }, { name: 'admin' }])).toBe('test2, admin');
  });

  it('stays within the 60 characters the API accepts', () => {
    const long = { name: `${'x'.repeat(40)} Surname` };
    const name = deriveGroupName([long, long, long, long]);

    expect(name.length).toBeLessThanOrEqual(60);
    expect(name).toMatch(/ \+2$/); // the count survives the truncation
  });

  it('falls back rather than sending an empty name', () => {
    expect(deriveGroupName([{ name: '   ' }, { name: undefined }])).toBe('Group');
  });
});
