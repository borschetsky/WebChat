import { memo } from 'react';
import { Box, IconButton, Stack, Typography } from '@mui/material';
import ReplyIcon from '@mui/icons-material/Reply';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import PresenceAvatar from '@/components/PresenceAvatar';
import { densityTokens } from '@/theme/tokens';
import type { Density, Message } from '@/types/models';
import MessageBody from './components/MessageBody';
import QuoteBlock from './components/QuoteBlock';
import AttachmentCard from './components/AttachmentCard';
import ReactionBar from './components/ReactionBar';
import ReadReceipt from './components/ReadReceipt';
import MessageStatus from './components/MessageStatus';

export interface MessageRowProps {
  message: Message;
  density: Density;
  /** Same author as the previous row: hide the header, show a monospace time in the gutter. */
  grouped: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  /** Re-sends a message whose optimistic send failed. */
  onRetry?: (message: Message) => void;
  receiptLabel?: string;
  showReceipt?: boolean;
  /** Active in-thread search term, forwarded to MessageBody for highlighting. */
  highlight?: string;
}

/**
 * One message. Composition only - each part is its own component so the pieces can be
 * tested and reused independently, and so memoization has something stable to compare.
 */
function MessageRow({
  message: m,
  grouped,
  density,
  onReact,
  onReply,
  onRetry,
  receiptLabel,
  showReceipt,
  highlight,
}: MessageRowProps) {
  const d = densityTokens(density);
  const pending = m.status === 'sending';

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        px: 3,
        py: grouped ? d.groupPadY : d.msgPadY,
        position: 'relative',
        // In-flight messages read as provisional until the server confirms them.
        opacity: pending ? 0.6 : 1,
        transition: 'opacity .15s',
        '&:hover': { bgcolor: 'action.hover' },
        '&:hover .row-actions': { opacity: 1 },
        '&:focus-within .row-actions': { opacity: 1 },
      }}
    >
      {/* Avatar gutter: avatar on the first row of a group, timestamp on the rest. */}
      <Box
        sx={{ width: d.avatar, flex: 'none', display: 'flex', justifyContent: 'center', pt: '2px' }}
      >
        {grouped ? (
          <Typography
            sx={{ fontSize: 11, color: 'text.disabled', fontFamily: '"Roboto Mono", monospace' }}
          >
            {(m.time || '').replace(/\s?(AM|PM)/, '')}
          </Typography>
        ) : (
          <PresenceAvatar
            name={m.author}
            color={m.color}
            avatarFileName={m.avatarFileName}
            size={d.avatar}
            showPresence={false}
          />
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {!grouped && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mb: 0.25 }}>
            <Typography
              sx={{ fontSize: 14, fontWeight: 500, color: m.own ? 'primary.main' : 'text.primary' }}
            >
              {m.author}
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{m.time}</Typography>
          </Stack>
        )}

        {m.quote && <QuoteBlock quote={m.quote} />}

        <MessageBody text={m.text} fontSize={d.msgSize} highlight={highlight} />

        {m.attachment && <AttachmentCard attachment={m.attachment} />}

        <ReactionBar reactions={m.reactions ?? []} onToggle={(emoji) => onReact(m.id, emoji)} />

        <MessageStatus status={m.status} onRetry={() => onRetry?.(m)} />

        {/* A failed message has not been delivered, so a read receipt would be a lie. */}
        {showReceipt && receiptLabel && !m.status && <ReadReceipt label={receiptLabel} />}
      </Box>

      <Stack
        className="row-actions"
        direction="row"
        sx={{ opacity: 0, transition: 'opacity .15s', flex: 'none' }}
      >
        <IconButton
          size="small"
          aria-label={`React to message from ${m.author}`}
          onClick={() => onReact(m.id, '👍')}
        >
          <AddReactionIcon fontSize="inherit" />
        </IconButton>
        <IconButton size="small" aria-label={`Reply to ${m.author}`} onClick={() => onReply(m)}>
          <ReplyIcon fontSize="inherit" />
        </IconButton>
      </Stack>
    </Stack>
  );
}

/**
 * Memoized because the message list re-renders on every composer keystroke today. That is
 * only fully fixed once the draft moves into the store (Phase 2), but memoizing here is a
 * prerequisite and harmless before then.
 */
export default memo(MessageRow);
