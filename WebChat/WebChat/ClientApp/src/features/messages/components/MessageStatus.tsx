import { Button, Stack, Typography } from '@mui/material';
// v9 ships this as ErrorOutlineOutlined; plain ErrorOutline no longer exists.
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import type { Message } from '@/types/models';

interface MessageStatusProps {
  status: Message['status'];
  onRetry: () => void;
}

/**
 * Delivery state for an optimistically-sent message.
 *
 * The handoff's definition of done asks for a retry affordance on send failure; the
 * reference app had no failure state, so a dropped message simply vanished. A failed row
 * stays in the list with its text intact and this offers to send it again.
 */
export default function MessageStatus({ status, onRetry }: MessageStatusProps) {
  if (status === 'sending') {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.5 }}>
        <ScheduleIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>Sending…</Typography>
      </Stack>
    );
  }

  if (status === 'failed') {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
        <ErrorOutlineIcon sx={{ fontSize: 15, color: 'error.main' }} />
        <Typography sx={{ fontSize: 11, color: 'error.main' }}>Not sent</Typography>
        <Button
          size="small"
          startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
          onClick={onRetry}
          sx={{ minHeight: 0, py: 0, px: 0.75, fontSize: 11 }}
        >
          Retry
        </Button>
      </Stack>
    );
  }

  return null;
}
