import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Paper, Typography, CircularProgress, Alert } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
// ErrorOutlineOutlined, not ErrorOutline: this icons build ships only the suffixed variants
// of this one, and the bare name fails to resolve at import time rather than at type-check.
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';

/**
 * Lands here from the activation link, exchanges the token for a session, and continues into
 * the app.
 *
 * The confirm call is fired from an effect that depends on the token alone. onConfirm is held
 * in a ref for the reason recorded in docs/ctx/2026-08-04-compose-search-render-loop.md:
 * listing a callback prop in the dependencies makes this component only as stable as its
 * caller, and an inline arrow there would re-run the effect on every render. Here that would
 * mean repeatedly POSTing a single-use token - the first call would succeed and every
 * subsequent one would fail, so the user would watch a successful activation turn into an
 * error.
 */
export default function ConfirmEmail({ token, onConfirm, onDone, onBackToLogin }) {
  const [state, setState] = useState('working');

  const confirm = useRef(onConfirm);
  useEffect(() => { confirm.current = onConfirm; }, [onConfirm]);

  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);

  useEffect(() => {
    if (!token) { setState('invalid'); return undefined; }

    let cancelled = false;
    (async () => {
      try {
        const auth = await confirm.current(token);
        if (cancelled) return;
        setState('done');
        done.current(auth);
      } catch {
        if (!cancelled) setState('invalid');
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  return (
    <Box sx={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2,
    }}
    >
      <Paper elevation={0} sx={{ p: 4, maxWidth: 460, width: '100%', borderRadius: 4, textAlign: 'center' }}>
        {state === 'working' && (
          <>
            <CircularProgress size={32} sx={{ mb: 2 }} />
            <Typography>Activating your account…</Typography>
          </>
        )}

        {state === 'done' && (
          <>
            <CheckCircleIcon sx={{ fontSize: 44, color: 'success.main', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>You&apos;re in</Typography>
            <Typography sx={{ color: 'text.secondary', mt: 1 }}>Taking you to your messages…</Typography>
          </>
        )}

        {state === 'invalid' && (
          <>
            <ErrorOutlineIcon sx={{ fontSize: 44, color: 'error.main', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>This link no longer works</Typography>
            {/* One message for expired, already-used and malformed. The endpoint does not
                distinguish them either, and the action is the same in every case. */}
            <Alert severity="info" sx={{ textAlign: 'left', mb: 3 }}>
              Activation links last 24 hours and can be used once. If you have already
              activated, just sign in.
            </Alert>
            <Button fullWidth variant="contained" onClick={onBackToLogin}>Go to sign in</Button>
          </>
        )}
      </Paper>
    </Box>
  );
}
