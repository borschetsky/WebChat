import React, { useState } from 'react';
import {
  Box, Button, Paper, Typography, TextField, Alert, Stack,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';

/**
 * Asks for the address and then says the same thing regardless.
 *
 * The confirmation deliberately does not reveal whether an account exists - the endpoint is
 * answerable by anyone about anyone, so a "no such user" here would enumerate the user base.
 * The wording is chosen to make that non-answer feel deliberate rather than broken.
 */
export default function ForgotPassword({ onRequest, onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setFailed(false);
    try {
      await onRequest(email);
      setSent(true);
    } catch {
      // Only a transport failure reaches here; the endpoint answers 200 for everything else.
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2,
    }}
    >
      <Paper elevation={0} component="form" onSubmit={submit} sx={{ p: 4, maxWidth: 440, width: '100%', borderRadius: 4 }}>
        <LockResetIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1.5 }} />

        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>Reset your password</Typography>

        {sent ? (
          <>
            <Alert severity="success" sx={{ mb: 3 }}>
              If that address has an account, a reset link is on its way. It works for one hour.
            </Alert>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 3 }}>
              Nothing arrived? Check your spam folder, and confirm you typed the address you
              signed up with.
            </Typography>
            <Button fullWidth onClick={onBackToLogin}>Back to sign in</Button>
          </>
        ) : (
          <>
            <Typography sx={{ color: 'text.secondary', mb: 3 }}>
              Enter the email address you signed up with and we&apos;ll send you a link to
              choose a new password.
            </Typography>

            <Stack spacing={2}>
              {failed && <Alert severity="error">Could not reach the server. Try again.</Alert>}

              {/* Address only, not a username: the endpoint accepts only an address, because
                  the link has to reach a mailbox. */}
              <TextField
                label="Email" type="email" fullWidth required autoFocus autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />

              <Button type="submit" variant="contained" size="large" disabled={sending || !email}>
                {sending ? 'Sending…' : 'Send the reset link'}
              </Button>

              <Button onClick={onBackToLogin}>Back to sign in</Button>
            </Stack>
          </>
        )}
      </Paper>
    </Box>
  );
}
