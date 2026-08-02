import React from 'react';
import { Box, Paper, Stack, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/**
 * True below the md breakpoint, where the design collapses to a single pane.
 * Exported so screens can decide what to render rather than re-deriving it.
 */
export const useIsMobile = () => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
};

/**
 * The chat frame from the handoff: rounded, bordered card holding a fixed 340px
 * sidebar and a flexible conversation pane. On mobile it becomes one pane at a
 * time, driven by `pane`.
 *
 * The reset is the global CssBaseline mounted in index.jsx - safe now that every routed
 * screen is a redesigned one.
 */
export default function AppShell({ sidebar, children, pane = 'list' }) {
  const isMobile = useIsMobile();
  const showSidebar = !isMobile || pane === 'list';
  const showMain = !isMobile || pane === 'chat';

  return (
    <Box
      sx={{
        height: '100vh',
        bgcolor: 'background.default',
        p: { xs: 0, md: 2.5 },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          height: '100%',
          display: 'flex',
          overflow: 'hidden',
          borderRadius: { xs: 0, md: 3.5 },
          border: 1,
          borderColor: 'divider',
        }}
      >
        {showSidebar && (
          <Box
            sx={{
              width: { xs: '100%', md: 340 },
              flex: { xs: 1, md: 'none' },
              minWidth: 0,
              borderRight: { xs: 0, md: 1 },
              borderColor: 'divider',
            }}
          >
            {sidebar}
          </Box>
        )}

        {showMain && (
          <Stack sx={{ flex: 1, minWidth: 0, bgcolor: 'background.chat' }}>{children}</Stack>
        )}
      </Paper>
    </Box>
  );
}
