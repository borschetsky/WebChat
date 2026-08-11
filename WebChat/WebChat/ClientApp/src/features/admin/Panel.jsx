import { Box } from '@mui/material';

/** The console's card: surface, hairline border, 14px radius. Used by every section. */
export default function Panel({ children, sx }) {
  return (
    <Box
      sx={[
        {
          borderRadius: '14px',
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
