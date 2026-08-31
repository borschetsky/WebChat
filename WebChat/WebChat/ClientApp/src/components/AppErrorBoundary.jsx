import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { reportError } from '@/lib/error-reporter';

/**
 * Catches a render error, shows something rather than a blank page, and reports it.
 *
 * **The `name` prop must be a string literal**, and that is the whole reason this component
 * takes one at all. React's `componentStack` would name the component that threw - except
 * that `vite build` minifies, ships no sourcemap, and renames `AdminOverviewCard` to `t`. The
 * server fingerprints on component plus function plus error name, so a minified name would
 * change on every deploy and re-open every issue with it. `mangle.keepNames` would fix it for
 * +5.9 kB gzip globally and still leave the line numbers meaningless.
 *
 * So: `<AppErrorBoundary name="AdminOverview">`, written out, in the source.
 *
 * A class, because there is still no hook equivalent - `getDerivedStateFromError` and
 * `componentDidCatch` exist only on classes. This is the first error boundary in this client;
 * before #74 there were none at all, and a render error blanked the whole document.
 */
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // `fatal`, not `error`: this is not something that merely reached a global handler, it is
    // a screen that stopped rendering and a user looking at a fallback instead of the app.
    //
    // Deliberately not awaited and deliberately not guarded - `reportError` never throws and
    // never blocks, which is the contract that lets it be called from here at all.
    reportError(error, {
      component: this.props.name,
      function: 'render',
      level: 'fatal',
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    // Deliberately plain. This renders when something is already broken, so it uses only what
    // the initial bundle already carries and asks nothing of the store, the router or the
    // network - a fallback that can itself fail is not a fallback.
    return (
      <Stack
        spacing={2}
        sx={{
          alignItems: 'center',
          justifyContent: 'center',
          p: 4,
          minHeight: 200,
          textAlign: 'center',
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 500 }}>Something went wrong here</Typography>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mt: 0.5 }}>
            The problem has been reported. Reloading usually clears it.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </Stack>
    );
  }
}
