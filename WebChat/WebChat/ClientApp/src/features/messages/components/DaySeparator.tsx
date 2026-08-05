import { Stack, Typography } from '@mui/material';
import { getDateInfoForSeparator } from '@/lib/date-time-format';

/** "Today" / "Yesterday" / "3 days ago" pill above the first message of each day. */
export default function DaySeparator({ dayKey }: { dayKey: string }) {
  const label = getDateInfoForSeparator(dayKey);
  if (!label) return null;

  return (
    <Stack sx={{ alignItems: 'center', py: 1.5 }}>
      <Typography
        component="div"
        // An <hr> cannot carry the pill styling, and the label has to stay readable text.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="separator"
        aria-label={label}
        sx={{
          fontSize: 11,
          px: 1.5,
          py: 0.4,
          borderRadius: 10,
          bgcolor: 'background.field',
          color: 'text.secondary',
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
}
