import { memo, useCallback } from 'react';
import { Badge, Box, ListItemButton, Stack, Typography } from '@mui/material';
import PresenceAvatar from '@/components/PresenceAvatar';
import { densityTokens } from '@/theme/tokens';
import type { Density, Thread } from '@/types/models';

export interface ThreadListItemProps {
  thread: Thread;
  selected: boolean;
  density: Density;
  onSelect: (threadId: string) => void;
}

/**
 * One row of the thread list.
 *
 * Extracted so it can be memoized: a hub event patching one thread's presence used to
 * re-render every row in the list. The click handler is bound here with useCallback so the
 * parent can pass one stable onSelect for all rows rather than an arrow per row, which
 * would defeat the memo.
 */
function ThreadListItem({ thread: t, selected, density, onSelect }: ThreadListItemProps) {
  const d = densityTokens(density);
  const select = useCallback(() => onSelect(t.id), [onSelect, t.id]);

  return (
    <ListItemButton
      selected={selected}
      onClick={select}
      sx={{
        gap: 1.5,
        py: d.rowPadY,
        px: 2,
        mb: 0.25,
        '&.Mui-selected': { bgcolor: 'background.selected' },
      }}
    >
      <PresenceAvatar
        name={t.name}
        color={t.color}
        avatarFileName={t.avatarFileName}
        size={d.avatar}
        presence={t.presence}
        showPresence={!t.group}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
          <Typography
            noWrap
            sx={{ flex: 1, fontSize: d.nameSize, fontWeight: t.unread ? 600 : 400 }}
          >
            {t.name}
          </Typography>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{t.time}</Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography
            noWrap
            sx={{
              flex: 1,
              fontSize: 13,
              color: t.unread ? 'text.primary' : 'text.secondary',
              fontStyle: t.isTyping ? 'italic' : 'normal',
            }}
          >
            {t.isTyping ? 'typing…' : t.preview}
          </Typography>
          {t.unread > 0 && <Badge color="primary" badgeContent={t.unread} sx={{ mr: 1.5 }} />}
        </Stack>
      </Box>
    </ListItemButton>
  );
}

export default memo(ThreadListItem);
