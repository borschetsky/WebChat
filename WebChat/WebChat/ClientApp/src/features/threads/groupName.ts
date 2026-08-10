/**
 * The title of a group nobody has named, derived from its current membership.
 *
 * Three first names, then a count: "Maya, Tomás, Priya" or "Maya, Tomás, Priya +2".
 * Verbatim from the handoff's `autoGroupName`; the numbers are the design.
 *
 * **Derived, never stored.** The server keeps `name: null` for an unnamed group, so removing
 * a member drops them from the title on the next read with nothing to invalidate. An earlier
 * version snapshotted this string at creation, which the spec calls out directly: it goes
 * stale silently, and users report it as a bug rather than as a stale cache.
 *
 * Once somebody renames the group the server stores the name and sets `named`, and this stops
 * being consulted for that thread - permanently, even if membership changes again.
 */
export function autoGroupName(names: (string | undefined)[]): string {
  const firstNames = names.map((n) => (n ?? '').trim().split(/\s+/)[0]).filter((n) => n.length > 0);

  if (firstNames.length === 0) return 'Group';
  if (firstNames.length <= 3) return firstNames.join(', ');

  return `${firstNames.slice(0, 3).join(', ')} +${firstNames.length - 3}`;
}

/** Convenience over the member shape the adapter produces. */
export const autoGroupNameOf = (members: { name?: string }[]): string =>
  autoGroupName(members.map((m) => m.name));
