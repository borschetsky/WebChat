import React from 'react';
import { Avatar, Badge, Box } from '@mui/material';
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
      imgProps={{ onError: () => setBroken(true) }}
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

  return (
    <Badge
      overlap="circular"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      badgeContent={
        <Box
          component="span"
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: PRESENCE[presence] ?? PRESENCE.offline,
            // Ring in the surface colour so the dot reads as cut out of the avatar.
            border: '2px solid',
            borderColor: 'background.paper',
          }}
        />
      }
    >
      {avatar}
    </Badge>
  );
}
