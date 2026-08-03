import React from 'react';
import {
  Badge, Box, Button, Chip, Divider, IconButton,
  List, ListItemButton, Skeleton, Stack, Typography,
} from '@mui/material';
import EditSquareIcon from '@mui/icons-material/EditSquare';
import NotificationsIcon from '@mui/icons-material/Notifications';
import SettingsIcon from '@mui/icons-material/Settings';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import ForumIcon from '@mui/icons-material/Forum';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import PresenceAvatar from '@/components/PresenceAvatar';
import EmptyState from '@/components/EmptyState';
import SearchField from '@/components/SearchField';
import NotificationsMenu from '@/features/notifications/NotificationsMenu';
import { densityTokens } from '@/theme/tokens';

const TABS = [['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups']];

// Empty-state copy per filter. "Groups" is not a missing-results case - the server has no
// concept of a group thread at all - so it says so rather than implying none matched.
const EMPTY = {
  groups: {
    title: 'Group conversations are not available yet',
    body: 'A thread currently has exactly one other participant. Groups need server support before they can appear here.',
    action: false,
  },
  unread: {
    title: 'Nothing unread',
    body: 'Messages that arrive while you are in another conversation will be counted here.',
    action: false,
  },
};

export default function ThreadList({
  threads, allThreads, activeId, query, tab, density, loading, unreadTotal, profile,
  onQuery, onTab, onSelect, onCompose, onSettings, onMarkAllRead,
}) {
  const d = densityTokens(density);
  const [bell, setBell] = React.useState(null);

  return (
    <Stack sx={{ height: '100%', minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1.5, pl: 2, borderBottom: 1, borderColor: 'divider' }}>
        <PresenceAvatar
          name={profile?.name ?? ''}
          color={profile?.color}
          avatarFileName={profile?.avatarFileName}
          size={38}
          presence="online"
          showPresence={false}
          onClick={onSettings}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 15, fontWeight: 500, lineHeight: 1.2 }}>{profile?.name ?? ' '}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>● Active</Typography>
        </Box>
        <IconButton onClick={onCompose} aria-label="New conversation" title="New conversation">
          <EditSquareIcon fontSize="small" />
        </IconButton>
        <IconButton
          onClick={(e) => setBell(e.currentTarget)}
          aria-label={unreadTotal > 0 ? `Notifications, ${unreadTotal} unread` : 'Notifications'}
          aria-haspopup="true"
          title="Notifications"
        >
          <Badge color="error" badgeContent={unreadTotal}><NotificationsIcon fontSize="small" /></Badge>
        </IconButton>
        <IconButton onClick={onSettings} aria-label="Profile and settings" title="Settings">
          <SettingsIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box sx={{ px: 1.5, pt: 1.25, pb: 0.75 }}>
        <SearchField
          value={query}
          onChange={onQuery}
          placeholder="Search people and messages"
          label="Search people and messages"
          icon={<SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
        />
      </Box>

      {/* Mutually exclusive filters, so they are a radiogroup rather than loose buttons. */}
      <Stack direction="row" spacing={1} sx={{ px: 1.5, pb: 1.25 }} role="radiogroup" aria-label="Filter conversations">
        {TABS.map(([k, label]) => (
          <Chip
            key={k}
            label={label}
            size="small"
            onClick={() => onTab(k)}
            role="radio"
            aria-checked={tab === k}
            variant={tab === k ? 'filled' : 'outlined'}
            sx={tab === k ? { bgcolor: 'background.selected', color: 'primary.main', borderColor: 'primary.main', border: 1 } : undefined}
          />
        ))}
      </Stack>

      <Box sx={{ flex: 1, overflowY: 'auto', pb: 1.5 }} aria-busy={loading}>
        {loading && (
          <Stack spacing={2.25} sx={{ px: 2, py: 1 }} aria-label="Loading conversations">
            {[...Array(5)].map((_, i) => (
              <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Skeleton variant="circular" width={40} height={40} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="45%" height={12} />
                  <Skeleton width="75%" height={12} />
                </Box>
              </Stack>
            ))}
          </Stack>
        )}

        {!loading && threads.length > 0 && (
          <List disablePadding sx={{ px: 1 }}>
            {threads.map((t) => (
              <ListItemButton
                key={t.id}
                selected={t.id === activeId}
                onClick={() => onSelect(t.id)}
                sx={{ gap: 1.5, py: d.rowPadY, px: 2, mb: 0.25, '&.Mui-selected': { bgcolor: 'background.selected' } }}
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
                    <Typography noWrap sx={{ flex: 1, fontSize: d.nameSize, fontWeight: t.unread ? 600 : 400 }}>{t.name}</Typography>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{t.time}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography noWrap sx={{ flex: 1, fontSize: 13, color: t.unread ? 'text.primary' : 'text.secondary', fontStyle: t.isTyping ? 'italic' : 'normal' }}>
                      {t.isTyping ? 'typing…' : t.preview}
                    </Typography>
                    {t.unread > 0 && <Badge color="primary" badgeContent={t.unread} sx={{ mr: 1.5 }} />}
                  </Stack>
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}

        {!loading && threads.length === 0 && (() => {
          const filterEmpty = !query && EMPTY[tab];
          const title = query ? 'No results' : filterEmpty ? filterEmpty.title : 'No conversations yet';
          const body = query
            ? `Nothing matches “${query}”. Try a name or a phrase from a message.`
            : filterEmpty
              ? filterEmpty.body
              : 'Start a thread with a teammate and it will show up here.';
          const showAction = !query && !filterEmpty;

          return (
            <EmptyState
              dense
              icon={query ? <SearchOffIcon /> : <ForumIcon />}
              title={title}
              body={body}
              action={showAction && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={onCompose} sx={{ mt: 1, borderRadius: 20 }}>
                  Start a conversation
                </Button>
              )}
            />
          );
        })()}
      </Box>
      <Divider />

      <NotificationsMenu
        anchorEl={bell}
        onClose={() => setBell(null)}
        threads={allThreads ?? threads}
        onSelect={onSelect}
        onMarkAllRead={onMarkAllRead}
      />
    </Stack>
  );
}
