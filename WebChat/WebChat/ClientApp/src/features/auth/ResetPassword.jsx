import React, { useState } from 'react';
import { Box, Button, Paper, Typography, TextField, Alert, Stack } from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';

/**
 * Sets the new password from a reset link.
 *
 * Unlike ConfirmEmail this does no work on mount, which is deliberate: the token is
 * single-use, and spending it before the user has typed anything would burn the link if they
 * closed the tab. Nothing is submitted until the form is.
 */
export default function ResetPassword({ token, onReset, onDone, onBackToLogin }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 6;

  const submit = async (e) => {
    e.preventDefault();
    if (mismatch || tooShort) return;

    setBusy(true);
    setError(null);
    try {
      const auth = await onReset(token, password);
      onDone(auth);
    } catch (err) {
      const data = err?.response?.data;
      setError(
        data?.message ??
          (data
            ? 'That did not work. Request a new link and try again.'
            : 'Could not reach the server. Try again.'),
      );
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <Shell>
        <Alert severity="error" sx={{ mb: 3 }}>
          This link is missing its token. Request a new one.
        </Alert>
        <Button fullWidth variant="contained" onClick={onBackToLogin}>
          Back to sign in
        </Button>
      </Shell>
    );
  }

  return (
    <Shell onSubmit={submit}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
        Choose a new password
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3 }}>
        You&apos;ll be signed in once it&apos;s set.
      </Typography>

      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="New password"
          type="password"
          fullWidth
          required
          autoFocus
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={tooShort}
          helperText={tooShort ? 'At least 6 characters.' : ' '}
        />

        {/* Confirmation field because there is no way back: a typo here locks the account
            out until another reset, and the user never sees what they typed. */}
        <TextField
          label="Confirm new password"
          type="password"
          fullWidth
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch}
          helperText={mismatch ? 'These do not match.' : ' '}
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={busy || !password || !confirm || mismatch || tooShort}
        >
          {busy ? 'Setting…' : 'Set password and sign in'}
        </Button>

        <Button onClick={onBackToLogin}>Back to sign in</Button>
      </Stack>
    </Shell>
  );
}

function Shell({ children, onSubmit }) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        component={onSubmit ? 'form' : 'div'}
        onSubmit={onSubmit}
        sx={{ p: 4, maxWidth: 440, width: '100%', borderRadius: 4 }}
      >
        <LockResetIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1.5 }} />
        {children}
      </Paper>
    </Box>
  );
}
