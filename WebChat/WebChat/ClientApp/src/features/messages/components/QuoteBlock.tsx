import { Stack, Typography } from '@mui/material';
import type { Quote } from '@/types/models';

/** Quoted message above a reply. Radius 0 6 6 0 against the 3px primary rule, per the handoff. */
export default function QuoteBlock({ quote }: { quote: Quote }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: 'center',
        my: 0.5, px: 1.25, py: 0.5,
        borderLeft: 3, borderColor: 'primary.main',
        bgcolor: 'background.quote',
        borderRadius: '0 6px 6px 0',
        maxWidth: 520,
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'primary.main', whiteSpace: 'nowrap' }}>
        {quote.author}
      </Typography>
      <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>{quote.text}</Typography>
    </Stack>
  );
}
