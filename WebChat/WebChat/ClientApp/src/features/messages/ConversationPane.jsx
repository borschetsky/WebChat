import React, { useEffect, useRef } from 'react';
import { Box, Button, IconButton, Skeleton, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import InfoIcon from '@mui/icons-material/Info';
import CloseIcon from '@mui/icons-material/Close';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import ForumIcon from '@mui/icons-material/Forum';
import AddIcon from '@mui/icons-material/Add';
import PresenceAvatar from '@/components/PresenceAvatar';
import MessageRow from '@/features/messages/MessageRow';
import Composer from '@/features/composer/Composer';
import { PRESENCE, densityTokens } from '@/theme/tokens';
import EmptyState from '@/components/EmptyState';
import SearchField from '@/components/SearchField';
import DaySeparator from './components/DaySeparator';

const presenceLine = (thread) => {
  if (!thread) return '';
  if (thread.isTyping) return 'typing…';
  return thread.presence === 'online' ? 'Active now' : 'Offline';
};

export default function ConversationPane({
  thread, messages, loading, density, isMobile,
  searchOpen, searchQuery, searchCount, totalCount,
  typing, receipt,
  onBack, onToggleSearch, onSearchQuery, onOpenSettings,
  onSend, onTyping, onReact, onReply,
  onCompose,
}) {
  const d = densityTokens(density);
  const endRef = useRef(null);

  // Follow the conversation as it grows, and on thread switch.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, thread?.id, typing]);

  if (!thread) {
    return (
      <Stack sx={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon={<ForumIcon sx={{ fontSize: 32 }} />}
          title="No conversation selected"
          body="Pick a thread on the left, or start a new one."
          width={320}
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={onCompose} sx={{ mt: 1, borderRadius: 20 }}>
              New conversation
            </Button>
          }
        />
      </Stack>
    );
  }

  return (
    <>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 1.25, px: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        {isMobile && (
          <IconButton onClick={onBack} aria-label="Back to conversations">
            <ArrowBackIcon />
          </IconButton>
        )}
        <PresenceAvatar name={thread.name} color={thread.color} avatarFileName={thread.avatarFileName} size={38} showPresence={false} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 16, fontWeight: 500 }}>{thread.name}</Typography>
          <Typography noWrap sx={{ fontSize: 12, color: thread.presence === 'online' ? PRESENCE.online : 'text.secondary' }}>
            {presenceLine(thread)}
          </Typography>
        </Box>
        <IconButton
          color={searchOpen ? 'primary' : 'default'}
          onClick={onToggleSearch}
          aria-label="Find in conversation"
          aria-expanded={searchOpen}
          title="Find in conversation"
        >
          <SearchIcon />
        </IconButton>
        <IconButton onClick={onOpenSettings} aria-label="Conversation details" title="Details">
          <InfoIcon />
        </IconButton>
      </Stack>

      {searchOpen && (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', p: 1.25, px: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <SearchField
            value={searchQuery}
            onChange={onSearchQuery}
            placeholder="Find in this conversation"
            label="Find in this conversation"
            icon={<ManageSearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
            height={40}
            autoFocus
          />
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }} aria-live="polite">
            {searchQuery.trim() ? `${searchCount} of ${totalCount}` : `${totalCount} messages`}
          </Typography>
          <IconButton size="small" aria-label="Close search" onClick={onToggleSearch}>
            <CloseIcon fontSize="inherit" />
          </IconButton>
        </Stack>
      )}

      {/* role=log + polite live region: new messages are announced without stealing focus. */}
      <Box
        sx={{ flex: 1, overflowY: 'auto', py: 2 }}
        role="log"
        aria-label={`Conversation with ${thread.name}`}
        aria-live="polite"
        aria-busy={loading}
      >
        {loading ? (
          [...Array(5)].map((_, i) => (
            <Stack key={i} direction="row" spacing={1.5} sx={{ px: 3, py: 1.5 }}>
              <Skeleton variant="circular" width={36} height={36} />
              <Box sx={{ flex: 1 }}><Skeleton width={120} /><Skeleton width="60%" /></Box>
            </Stack>
          ))
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const grouped = !!prev && prev.authorId === m.authorId && !m.quote && !m.startsDay && !searchQuery.trim();
            return (
              <React.Fragment key={m.id}>
                {m.startsDay && m.dayKey && <DaySeparator dayKey={m.dayKey} />}
                <MessageRow
                  message={m}
                  density={density}
                  grouped={grouped}
                  onReact={onReact}
                  onReply={onReply}
                  showReceipt={!!receipt && m.id === receipt.messageId}
                  receiptLabel={receipt?.label}
                  highlight={searchQuery}
                />
              </React.Fragment>
            );
          })
        )}

        {typing && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 3, py: 1 }}>
            <PresenceAvatar name={thread.name} color={thread.color} avatarFileName={thread.avatarFileName} size={d.avatar} showPresence={false} />
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{thread.name.split(' ')[0]} is typing…</Typography>
          </Stack>
        )}

        {!loading && searchQuery.trim() && messages.length === 0 && (
          <Typography sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>No messages match “{searchQuery}”.</Typography>
        )}
        {!loading && !searchQuery.trim() && messages.length === 0 && (
          <Typography sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>No messages yet. Say hello.</Typography>
        )}

        <div ref={endRef} />
      </Box>

      <Composer
        onSend={onSend}
        onTyping={onTyping}
        placeholder={`Message ${thread.name.split(' ')[0]}`}
      />
    </>
  );
}
