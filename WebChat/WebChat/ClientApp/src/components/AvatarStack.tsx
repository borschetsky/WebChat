/* oxlint-disable jsx-a11y/prefer-tag-over-role --
   The rule wants an <img> tag wherever it sees role="img". Some tiles here are initials in a
   coloured circle with no image to point one at, and dropping the role would leave an
   aria-label on a bare div, which screen readers ignore. Disabled for the file rather than
   the line because Prettier reflows JSX attributes and has already detached a line-addressed
   suppression once; see the client lint ctx note. */
import { Box } from '@mui/material';
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
  /** Overall footprint. Tile size and offsets are derived from this, never set separately. */
  size?: number;
  /** Faces before the "+N" tile. */
  max?: number;
  /** Used when there are fewer than two members and a single avatar is drawn instead. */
  fallbackName?: string;
  fallbackColor?: string;
  /** The surface the stack sits on, so the rings read as cut out of it. */
  borderColor?: string;
}

/**
 * The group avatar from the design handoff: up to three faces scattered inside one avatar's
 * footprint, alternating top and bottom, plus a "+N" tile for the rest.
 *
 * Deliberately **not** MUI's `AvatarGroup`. That lays its children out in a straight
 * overlapping row, and a row is not what the design shows - the alternation is what makes a
 * group read as a group at a glance rather than as a slightly wider single avatar. An earlier
 * revision of the handoff did rebuild this on `AvatarGroup`; it was implemented, shipped, and
 * reverted here once the rendered result was compared against the design. See the ctx note.
 *
 * The cost of not using `AvatarGroup` is that the surplus tile is hand-rolled rather than
 * free, which is the trade the original made too.
 */
export default function AvatarStack({
  members = [],
  size = 40,
  max = 3,
  fallbackName,
  fallbackColor,
  borderColor = 'background.paper',
}: AvatarStackProps) {
  const people = members.filter((m) => m?.name);

  // One member is not a stack. A group whose members have not loaded yet lands here too, and
  // should look like an ordinary avatar rather than a stack of one.
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

  const cell = Math.round(size * 0.62);
  const step = Math.round(cell * 0.45);
  const faces = people.slice(0, max);
  const extra = people.length - faces.length;

  /** Absolute placement is the whole visual idea; a row would be AvatarGroup. */
  const seat = (i: number) => ({
    position: 'absolute' as const,
    left: i * step,
    // Even indices sit on the top edge, odd ones drop to the bottom - so three faces read as
    // two-up-one-down rather than as a line.
    top: i % 2 === 0 ? 0 : size - cell,
    zIndex: faces.length - i,
    width: cell,
    height: cell,
  });

  const named = faces.map((m) => m.name).join(', ');

  return (
    <Box
      // Without this the row announces a pile of loose initials. The thread name is already
      // read out by the row, so this says who is in it.
      role="img"
      aria-label={extra > 0 ? `${named} and ${extra} more` : named}
      sx={{ position: 'relative', width: size, height: size, flex: 'none' }}
    >
      {faces.map((m, i) => (
        <Box
          key={m.id ?? m.name}
          sx={{
            ...seat(i),
            borderRadius: '50%',
            border: '2px solid',
            borderColor,
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {/* PresenceAvatar resolves the filename to a URL and falls back to initials both
              when there is no file and when the file 404s - an avatar row can outlive its
              object in R2. Colour comes from the member id, as everywhere else in the app, so
              one person is the same colour here as on their own avatar. */}
          <PresenceAvatar
            name={m.name}
            color={avatarColor(m.id ?? m.name)}
            avatarFileName={m.avatarFileName}
            size={cell - 4}
            showPresence={false}
          />
        </Box>
      ))}

      {extra > 0 && (
        <Box
          sx={{
            ...seat(faces.length),
            borderRadius: '50%',
            border: '2px solid',
            borderColor,
            boxSizing: 'border-box',
            bgcolor: 'background.field',
            color: 'text.secondary',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(9, Math.round(cell * 0.36)),
            fontWeight: 500,
          }}
        >
          +{extra}
        </Box>
      )}
    </Box>
  );
}
