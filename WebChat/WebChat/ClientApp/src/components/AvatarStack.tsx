/* oxlint-disable jsx-a11y/prefer-tag-over-role --
   The rule wants an <img> tag wherever it sees role="img". There is no image here to point
   one at - the stack is built from initials in coloured circles - and dropping the role
   would leave an aria-label on a bare div, which screen readers ignore. Disabled for the
   file rather than the line because Prettier reflows JSX attributes and has already
   detached a line-addressed suppression once; see the client lint ctx note. */
import { AvatarGroup } from '@mui/material';
import PresenceAvatar from '@/components/PresenceAvatar';
import { avatarColor } from '@/theme/tokens';

export interface AvatarStackMember {
  id?: string;
  name: string;
  /** Uploaded avatar filename; initials when absent. */
  avatarFileName?: string | null;
}

export interface AvatarStackProps {
  members?: AvatarStackMember[];
  /** Overall footprint. Faces and overlap are derived from this, never set separately. */
  size?: number;
  /** Faces before the surplus tile. MUI shows `max - 1` of them plus a "+N". */
  max?: number;
  /** `tight` for the thread list and header; `row` where there is more space. */
  variant?: 'tight' | 'row';
  /** Used when there are fewer than two members and a single avatar is drawn instead. */
  fallbackName?: string;
  fallbackColor?: string;
  /** The surface the stack sits on, so the rings read as cut out of it. */
  borderColor?: string;
}

/**
 * Group avatars, built on MUI's `AvatarGroup`.
 *
 * `AvatarGroup` owns the max/total surplus logic - the "+N" tile and its count - so this
 * wrapper overrides geometry only: smaller faces at a tighter overlap, so a group occupies
 * the same box in the thread-list gutter that a single avatar does and the list keeps a
 * straight left edge.
 */
export default function AvatarStack({
  members = [],
  size = 40,
  max = 3,
  variant = 'tight',
  fallbackName,
  fallbackColor,
  borderColor = 'background.paper',
}: AvatarStackProps) {
  const people = members.filter((m) => m?.name);

  // One member is not a stack. A group whose members have not loaded yet lands here too,
  // and should look like an ordinary avatar rather than a stack of one.
  if (people.length < 2) {
    return (
      <PresenceAvatar
        name={fallbackName || people[0]?.name || ''}
        color={fallbackColor}
        size={size}
        showPresence={false}
      />
    );
  }

  const cell = variant === 'tight' ? Math.round(size * 0.62) : Math.round(size * 0.78);
  const overlap = variant === 'tight' ? -Math.round(cell * 0.55) : -Math.round(cell * 0.3);

  // Mirror what AvatarGroup actually draws: it shows every face while the total fits within
  // `max`, but once it overflows it gives up one slot to the surplus tile and shows max - 1.
  // Computing this as `slice(0, max)` made the label claim one more visible face than there
  // was, and disagree with the "+N" next to it.
  const shown = people.length > max ? max - 1 : people.length;
  const named = people.slice(0, shown).map((m) => m.name);
  const extra = people.length - shown;

  return (
    <AvatarGroup
      max={max}
      total={people.length}
      // Without this the row announces a pile of loose initials. The thread name is already
      // read out by the row, so this says who is in it.
      role="img"
      aria-label={extra > 0 ? `${named.join(', ')} and ${extra} more` : named.join(', ')}
      // The handoff also passes `additionalAvatar` here, which MUI v9 has removed - it is a
      // type error, not a harmless extra. `surplus` is the surviving slot. Second time the
      // handoff has been a major behind on slot names; see the `inputProps` note in CLAUDE.md.
      slotProps={{
        surplus: { sx: { bgcolor: 'background.field', color: 'text.secondary' } },
      }}
      sx={{
        flex: 'none',
        '& .MuiAvatar-root': {
          width: cell,
          height: cell,
          fontSize: Math.max(9, Math.round(cell * 0.36)),
          fontWeight: 500,
          border: '2px solid',
          borderColor,
          marginLeft: `${overlap}px`,
          '&:first-of-type': { marginLeft: 0 },
        },
      }}
    >
      {people.map((m) => (
        // PresenceAvatar rather than a bare Avatar: it already resolves a filename to a URL
        // and falls back to initials both when there is no file and when the file 404s -
        // an avatar row can outlive its object in R2. With showPresence={false} it renders
        // a bare Avatar, so it is still a direct AvatarGroup child and the surplus maths and
        // the `& .MuiAvatar-root` geometry overrides above still apply. AvatarGroup clones
        // each child with its own className, which PresenceAvatar does not forward; nothing
        // styles `.MuiAvatarGroup-avatar` here, since the overrides target the Avatar itself.
        //
        // Colour comes from the member id, as it does everywhere else in the app, so one
        // person is the same colour here as on their own avatar. The handoff keys it off
        // name length, which its fixtures used consistently and this app does not.
        <PresenceAvatar
          key={m.id ?? m.name}
          name={m.name}
          color={avatarColor(m.id ?? m.name)}
          avatarFileName={m.avatarFileName}
          size={cell}
          showPresence={false}
        />
      ))}
    </AvatarGroup>
  );
}
