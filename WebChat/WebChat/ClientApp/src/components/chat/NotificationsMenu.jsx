import React from 'react';
import { Box, Button, Divider, List, ListItemButton, Popover, Stack, Typography } from '@mui/material';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import PresenceAvatar from './PresenceAvatar';

/**
 * The bell's popover.
 *
 * MOCK: there is no notification feed on the server, so this is derived from unread
 * counts - which are themselves session-scoped (see mocks.js). It is real in the sense
 * that the underlying messages arrived over SignalR during this session; it is fake in
 * that nothing survives a reload and nothing is missed while you are away.
 */
export default function NotificationsMenu({ anchorEl, onClose, threads, onSelect, onMarkAllRead }) {
  const unread = threads.filter((t) => t.unread > 0);

  return (
    <Popover
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { sx: { width: 320, borderRadius: 3 } } }}
    >
      <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1.5 }}>
        <Typography sx={{ flex: 1, fontSize: 15, fontWeight: 500 }}>Notifications</Typography>
        {unread.length > 0 && (
          <Button size="small" startIcon={<DoneAllIcon />} onClick={() => { onMarkAllRead(); onClose(); }}>
            Mark all read
          </Button>
        )}
      </Stack>
      <Divider />

      {unread.length === 0 ? (
        <Stack alignItems="center" spacing={1} sx={{ px: 3, py: 4, textAlign: 'center' }}>
          <NotificationsOffIcon sx={{ fontSize: 34, color: 'text.disabled' }} />
          <Typography sx={{ fontSize: 14 }}>You are all caught up</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            New messages that arrive while you are in another conversation show up here.
          </Typography>
        </Stack>
      ) : (
        <List disablePadding sx={{ py: 0.5, maxHeight: 340, overflowY: 'auto' }}>
          {unread.map((t) => (
            <ListItemButton key={t.id} onClick={() => { onSelect(t.id); onClose(); }} sx={{ gap: 1.5, px: 2, py: 1.25 }}>
              <PresenceAvatar name={t.name} color={t.color} avatarFileName={t.avatarFileName} size={34} presence={t.presence} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 14, fontWeight: 500 }}>{t.name}</Typography>
                <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>{t.preview}</Typography>
              </Box>
              <Typography sx={{ fontSize: 12, color: 'primary.main', fontWeight: 600 }}>{t.unread}</Typography>
            </ListItemButton>
          ))}
        </List>
      )}
    </Popover>
  );
}
