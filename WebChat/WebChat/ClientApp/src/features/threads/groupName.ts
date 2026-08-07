/** Longest name the API accepts - CreateGroupViewModel.Name is StringLength(60). */
const MAX_LENGTH = 60;

/**
 * Builds a group's name from its members, the way the design handoff does: the first names
 * of the first two, then a count of everyone else. "Maya, Tomás +2".
 *
 * The handoff draws no group-name field, so this is what the name is. It is derived once, at
 * creation, and stored - so adding a member later leaves the "+2" behind. That is a known
 * cost of matching the handoff rather than an oversight; making the name follow membership
 * means deriving it on read instead, which is a server change.
 *
 * The creator is not counted. They are added server-side and are not in the picked list.
 */
export function deriveGroupName(members: { name?: string }[]): string {
  const firstNames = members
    .map((m) => (m.name ?? '').trim().split(/\s+/)[0])
    .filter((n) => n.length > 0);

  // Only reachable if every member has a blank name, which the directory should never
  // return - but the API rejects an empty name with a 400, and "Group" beats that.
  if (firstNames.length === 0) return 'Group';

  const shown = firstNames.slice(0, 2).join(', ');
  const rest = firstNames.length > 2 ? ` +${firstNames.length - 2}` : '';

  if (shown.length + rest.length <= MAX_LENGTH) return shown + rest;

  // Two unusually long names would otherwise produce a 400 that surfaces to the user as
  // "Could not create that group", which says nothing about what went wrong.
  const room = MAX_LENGTH - rest.length;
  return shown.slice(0, room - 1).trimEnd() + '…' + rest;
}
