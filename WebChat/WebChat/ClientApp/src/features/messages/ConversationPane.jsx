import React, { useEffect, useRef } from 'react';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import InfoIcon from '@mui/icons-material/Info';
import CloseIcon from '@mui/icons-material/Close';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import ForumIcon from '@mui/icons-material/Forum';
import AddIcon from '@mui/icons-material/Add';
import PresenceAvatar from '@/components/PresenceAvatar';
import MessageList from './MessageList';
import Composer from '@/features/composer/Composer';
import { PRESENCE, densityTokens } from '@/theme/tokens';
import EmptyState from '@/components/EmptyState';
import SearchField from '@/components/SearchField';
import { typingLabel } from '@/features/realtime/realtimeSlice';

const presenceLine = (thread, typingUsers) => {
  if (!thread) return '';
  const typing = typingLabel(typingUsers, !!thread.group);
  if (typing) return typing;
  if (thread.group) return `${thread.members?.length ?? 0} members`;
  return thread.presence === 'online' ? 'Active now' : 'Offline';
};

export default function ConversationPane({
  thread,
  messages,
  loading,
  density,
  isMobile,
  searchOpen,
  searchQuery,
  searchCount,
  totalCount,
  typingUsers = [],
  receipt,
  onBack,
  onToggleSearch,
  onSearchQuery,
  onOpenSettings,
  onSend,
  onTyping,
  onReact,
  onReply,
  onRetry,
  onCompose,
}) {
  const d = densityTokens(density);
  const endRef = useRef(null);

  // Follow the conversation as it grows, and on thread switch.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, thread?.id, typingUsers.length]);

  if (!thread) {
    return (
      <Stack sx={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon={<ForumIcon sx={{ fontSize: 32 }} />}
          title="No conversation selected"
          body="Pick a thread on the left, or start a new one."
          width={320}
          action={
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onCompose}
              sx={{ mt: 1, borderRadius: 20 }}
            >
              New conversation
            </Button>
          }
        />
      </Stack>
    );
  }

  return (
    <>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: 'center',
          p: 1.25,
          px: 2,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {isMobile && (
          <IconButton onClick={onBack} aria-label="Back to conversations">
            <ArrowBackIcon />
          </IconButton>
        )}
        <PresenceAvatar
          name={thread.name}
          color={thread.color}
          avatarFileName={thread.avatarFileName}
          size={38}
          showPresence={false}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 16, fontWeight: 500 }}>
            {thread.name}
          </Typography>
          <Typography
            noWrap
            sx={{
              fontSize: 12,
              color: thread.presence === 'online' ? PRESENCE.online : 'text.secondary',
            }}
          >
            {presenceLine(thread, typingUsers)}
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
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            alignItems: 'center',
            p: 1.25,
            px: 2,
            bgcolor: 'background.paper',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
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
        <MessageList
          messages={messages}
          density={density}
          loading={loading}
          searchQuery={searchQuery}
          receipt={receipt}
          onReact={onReact}
          onReply={onReply}
          onRetry={onRetry}
          threadId={thread.id}
        />

        {typingUsers.length > 0 && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 3, py: 1 }}>
            {/* The typist's avatar and name, not the thread's. On a group those are not the
                same thing, and using the thread's meant a group called "Design Guild"
                announced that "Design is typing…". */}
            <PresenceAvatar
              name={typingUsers[0].name}
              color={thread.group ? undefined : thread.color}
              avatarFileName={thread.group ? null : thread.avatarFileName}
              size={d.avatar}
              showPresence={false}
            />
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {typingLabel(typingUsers, !!thread.group) ?? ''}
            </Typography>
          </Stack>
        )}

        {!loading && searchQuery.trim() && messages.length === 0 && (
          <Typography sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
            No messages match “{searchQuery}”.
          </Typography>
        )}
        {!loading && !searchQuery.trim() && messages.length === 0 && (
          <Typography sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
            No messages yet. Say hello.
          </Typography>
        )}

        <div ref={endRef} />
      </Box>

      <Composer
        onSend={onSend}
        onTyping={onTyping}
        // A group's name is not a person's name - splitting it turned "Design Guild" into
        // "Message Design".
        placeholder={`Message ${thread.group ? thread.name : thread.name.split(' ')[0]}`}
      />
    </>
  );
}
