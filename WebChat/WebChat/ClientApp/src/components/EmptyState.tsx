import type { ReactNode } from 'react';
import { Avatar, Stack, Typography } from '@mui/material';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body?: string;
  /** Rendered under the copy - typically a Button. */
  action?: ReactNode;
  /** Narrower copy column for the sidebar, wider for the conversation pane. */
  width?: number;
  dense?: boolean;
}

/**
 * The empty / no-results block. Four screens rendered near-identical copies of this
 * before it was extracted: no threads, no search results, no conversation selected, and
 * no messages in a thread.
 */
export default function EmptyState({ icon, title, body, action, width = 240, dense = false }: EmptyStateProps) {
  return (
    <Stack
      sx={{
        alignItems: 'center',
        textAlign: 'center',
        px: 4,
        py: dense ? 7 : 5,
        gap: 1.25,
      }}
    >
      <Avatar sx={{ width: 64, height: 64, bgcolor: 'background.field', color: 'text.secondary' }}>{icon}</Avatar>
      <Typography sx={{ fontSize: 16, fontWeight: 500 }}>{title}</Typography>
      {body && (
        <Typography sx={{ fontSize: 13, color: 'text.secondary', maxWidth: width }}>{body}</Typography>
      )}
      {action}
    </Stack>
  );
}
