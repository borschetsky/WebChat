import { Typography } from '@mui/material';

/** Uppercase group heading used throughout the settings drawer. */
export default function SectionLabel({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: 'text.secondary',
        mt: 2.5,
        mb: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}
