import { useState } from 'react';
import { Avatar, Badge } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { PRESENCE, initials } from '@/theme/tokens';
import { getUserAvatar } from '@/services';
import type { Presence } from '@/types/models';

export interface PresenceAvatarProps {
  name?: string;
  color?: string;
  /** Uploaded avatar filename; falls back to initials when absent or the image 404s. */
  avatarFileName?: string | null;
  size?: number;
  /** 'group' is accepted so group rows can opt out of the dot without a second prop. */
  presence?: Presence | 'group';
  showPresence?: boolean;
  onClick?: () => void;
}

/**
 * Avatar with an optional presence dot.
 *
 * Extends the handoff version, whose fixtures had no images so it only ever rendered
 * initials. Real users can have an uploaded avatar, and an avatar row can outlive its
 * file - hence the onError fallback.
 */
export default function PresenceAvatar({
  name = '',
  color,
  avatarFileName = null,
  size = 40,
  presence,
  showPresence = true,
  onClick,
}: PresenceAvatarProps) {
  const [broken, setBroken] = useState(false);
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
            boxShadow: (t: Theme) => `0 0 0 2px ${t.palette.background.paper}`,
          },
        },
      }}
    >
      {avatar}
    </Badge>
  );
}
