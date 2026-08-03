import { Stack, Typography } from '@mui/material';
import DoneAllIcon from '@mui/icons-material/DoneAll';

/**
 * "Read by …" under the last own message.
 *
 * MOCK: nothing on the server tracks reads - see services/mocks. It is suppressed when
 * the other person is offline, so it never contradicts the presence dot in the header.
 */
export default function ReadReceipt({ label }: { label: string }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.75 }}>
      <DoneAllIcon sx={{ fontSize: 15, color: 'primary.main' }} />
      <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{label}</Typography>
    </Stack>
  );
}
