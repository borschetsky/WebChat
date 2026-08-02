import React, { useEffect, useRef } from 'react';
import { Box, Button, IconButton, InputBase, Skeleton, Stack, Typography } from '@mui/material';
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
import { getDateInfoForSeparator } from '@/lib/date-time-format';

const presenceLine = (thread) => {
  if (!thread) return '';
  if (thread.isTyping) return 'typing…';
  return thread.presence === 'online' ? 'Active now' : 'Offline';
};

export default function ConversationPane({
  thread, messages, loading, density, isMobile,
  searchOpen, searchQuery, searchCount, totalCount,
  draft, setDraft, replyTo, attachment, typing, receipt,
  onBack, onToggleSearch, onSearchQuery, onOpenSettings,
  onSend, onTyping, onReact, onReply, onCancelReply, onAttach, onRemoveAttach,
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
      <Stack spacing={1.75} sx={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', flex: 1, p: 5 }}>
        <ForumIcon sx={{ fontSize: 56, color: 'text.secondary' }} />
        <Typography sx={{ fontSize: 20, fontWeight: 500 }}>No conversation selected</Typography>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 320 }}>Pick a thread on the left, or start a new one.</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={onCompose} sx={{ borderRadius: 20 }}>New conversation</Button>
      </Stack>
    );
  }

  return (
    <>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 1.25, px: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        {isMobile && <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>}
        <PresenceAvatar name={thread.name} color={thread.color} avatarFileName={thread.avatarFileName} size={38} showPresence={false} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 16, fontWeight: 500 }}>{thread.name}</Typography>
          <Typography noWrap sx={{ fontSize: 12, color: thread.presence === 'online' ? PRESENCE.online : 'text.secondary' }}>
            {presenceLine(thread)}
          </Typography>
        </Box>
        <IconButton color={searchOpen ? 'primary' : 'default'} onClick={onToggleSearch} title="Find in conversation"><SearchIcon /></IconButton>
        <IconButton onClick={onOpenSettings} title="Details"><InfoIcon /></IconButton>
      </Stack>

      {searchOpen && (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', p: 1.25, px: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flex: 1, height: 40, px: 1.75, borderRadius: 20, bgcolor: 'background.field' }}>
            <ManageSearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <InputBase autoFocus value={searchQuery} onChange={(e) => onSearchQuery(e.target.value)} placeholder="Find in this conversation" sx={{ flex: 1, fontSize: 14 }} />
          </Stack>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            {searchQuery.trim() ? `${searchCount} of ${totalCount}` : `${totalCount} messages`}
          </Typography>
          <IconButton size="small" onClick={onToggleSearch}><CloseIcon fontSize="inherit" /></IconButton>
        </Stack>
      )}

      <Box sx={{ flex: 1, overflowY: 'auto', py: 2 }}>
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
                {m.startsDay && m.dayKey && (
                  <Stack sx={{ alignItems: 'center', py: 1.5 }}>
                    <Typography sx={{ fontSize: 11, px: 1.5, py: 0.4, borderRadius: 10, bgcolor: 'background.field', color: 'text.secondary' }}>
                      {getDateInfoForSeparator(m.dayKey)}
                    </Typography>
                  </Stack>
                )}
                <MessageRow
                  message={m}
                  density={density}
                  grouped={grouped}
                  onReact={onReact}
                  onReply={onReply}
                  showReceipt={!!receipt && m.id === receipt.messageId}
                  receiptLabel={receipt?.label}
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
        draft={draft}
        setDraft={setDraft}
        onSend={onSend}
        onTyping={onTyping}
        replyTo={replyTo}
        onCancelReply={onCancelReply}
        attachment={attachment}
        onAttach={onAttach}
        onRemoveAttach={onRemoveAttach}
        placeholder={`Message ${thread.name.split(' ')[0]}`}
      />
    </>
  );
}
