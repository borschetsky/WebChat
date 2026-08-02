import React from 'react';
import { Avatar, Badge } from '@mui/material';
import { PRESENCE, initials } from '../../theme';
import { getUserAvatar } from '../../services';

// Ported from the handoff. One extension: the prototype only ever rendered initials
// because its fixtures had no images, but real users can have an uploaded avatar - so
// this takes avatarFileName and falls back to initials when there is none, or when the
// image 404s (an avatar row can outlive its file).

export default function PresenceAvatar({
  name = '',
  color,
  avatarFileName = null,
  size = 40,
  presence,
  showPresence = true,
  onClick,
}) {
  const [broken, setBroken] = React.useState(false);
  const src = avatarFileName && !broken ? getUserAvatar(avatarFileName) : undefined;

  const avatar = (
    <Avatar
      src={src}
      alt={name}
      onClick={onClick}
      slotProps={{ img: { onError: () => setBroken(true) } }}
      sx={{
        width: size,
        height: size,
        bgcolor: color,
        color: '#fff',
        fontSize: size * 0.34,
        fontWeight: 500,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {initials(name)}
    </Avatar>
  );

  if (!showPresence || !presence || presence === 'group') return avatar;

  // The v9 slot API, matching the updated handoff: the dot is the Badge's own badge slot
  // rather than a child element, so Badge handles positioning and overlap itself.
  return (
    <Badge
      overlap="circular"
      variant="dot"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      slotProps={{
        badge: {
          sx: {
            width: 12,
            height: 12,
            minWidth: 12,
            p: 0,
            borderRadius: '50%',
            bgcolor: PRESENCE[presence] ?? PRESENCE.offline,
            // Ring in the surface colour so the dot reads as cut out of the avatar.
            boxShadow: (t) => `0 0 0 2px ${t.palette.background.paper}`,
          },
        },
      }}
    >
      {avatar}
    </Badge>
  );
}
