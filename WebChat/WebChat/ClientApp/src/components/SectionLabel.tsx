import { Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

/** Uppercase group heading used throughout the settings drawer. */
export default function SectionLabel({
  children,
  sx,
}: {
  children: string;
  /** Merged over the defaults, for callers that need different spacing around the label. */
  sx?: SxProps<Theme>;
}) {
  return (
    <Typography
      sx={[
        {
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          mt: 2.5,
          mb: 0.5,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}
