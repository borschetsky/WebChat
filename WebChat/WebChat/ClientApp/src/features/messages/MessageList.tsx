import { Fragment, useRef } from 'react';
import { Box, Skeleton, Stack } from '@mui/material';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { Density, Message } from '@/types/models';
import MessageRow from './MessageRow';
import DaySeparator from './components/DaySeparator';

/**
 * Above this many messages the list is virtualized. The handoff brief asks for
 * virtualization "if threads can exceed ~200 messages"; below the threshold plain
 * rendering avoids Virtuoso's measurement pass and the scroll-anchoring quirks that come
 * with variable-height rows, for no benefit.
 */
const VIRTUALIZE_ABOVE = 200;

export interface MessageListProps {
  messages: Message[];
  density: Density;
  loading: boolean;
  /** Active in-thread search term; disables grouping and drives highlighting. */
  searchQuery: string;
  receipt: { messageId: string; label: string } | null;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onRetry: (message: Message) => void;
  /** Changes when the thread does, so the virtualizer resets its scroll position. */
  threadId?: string;
}

/** Same author, no quote, not the first of a day, and not filtering: collapse the header. */
const isGrouped = (messages: Message[], i: number, searching: boolean) => {
  const prev = messages[i - 1];
  const m = messages[i];
  return !!prev && prev.authorId === m.authorId && !m.quote && !m.startsDay && !searching;
};

export default function MessageList({
  messages,
  density,
  loading,
  searchQuery,
  receipt,
  onReact,
  onReply,
  onRetry,
  threadId,
}: MessageListProps) {
  const virtuoso = useRef<VirtuosoHandle>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const searching = searchQuery.trim().length > 0;

  if (loading) {
    return (
      <>
        {[...Array(5)].map((_, i) => (
          <Stack key={i} direction="row" spacing={1.5} sx={{ px: 3, py: 1.5 }}>
            <Skeleton variant="circular" width={36} height={36} />
            <Box sx={{ flex: 1 }}>
              <Skeleton width={120} />
              <Skeleton width="60%" />
            </Box>
          </Stack>
        ))}
      </>
    );
  }

  const row = (i: number, m: Message) => (
    <>
      {m.startsDay && m.dayKey && <DaySeparator dayKey={m.dayKey} />}
      <MessageRow
        message={m}
        density={density}
        grouped={isGrouped(messages, i, searching)}
        onReact={onReact}
        onReply={onReply}
        onRetry={onRetry}
        showReceipt={!!receipt && m.id === receipt.messageId}
        receiptLabel={receipt?.label}
        highlight={searchQuery}
      />
    </>
  );

  if (messages.length > VIRTUALIZE_ABOVE) {
    return (
      <Virtuoso
        ref={virtuoso}
        // Remount per thread so scroll position and measurement caches do not leak across.
        key={threadId}
        data={messages}
        // Start pinned to the newest message, and stay there while the user is at the
        // bottom - matching the non-virtualized path's scroll behaviour.
        initialTopMostItemIndex={messages.length - 1}
        followOutput="smooth"
        computeItemKey={(_i, m) => m.id}
        itemContent={row}
        style={{ height: '100%' }}
      />
    );
  }

  return (
    <>
      {messages.map((m, i) => (
        <Fragment key={m.id}>{row(i, m)}</Fragment>
      ))}
      <div ref={endRef} />
    </>
  );
}
