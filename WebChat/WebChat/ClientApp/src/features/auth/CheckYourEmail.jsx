import React, { useState } from 'react';
import { Box, Button, Paper, Typography, Alert } from '@mui/material';
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread';

/**
 * Shown after registering. Registration no longer signs anyone in - the address has to be
 * proven reachable first - so this is the whole of what a new account sees until they open
 * the link.
 *
 * `emailSent` is false when the provider was unreachable. The account still exists in that
 * case, which is why the resend button matters rather than being a courtesy: it is the only
 * way out of that state.
 */
export default function CheckYourEmail({ email, emailSent = true, onResend, onBackToLogin }) {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [failed, setFailed] = useState(false);

  const resend = async () => {
    setResending(true);
    setFailed(false);
    try {
      await onResend(email);
      setResent(true);
    } catch {
      setFailed(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2,
    }}
    >
      <Paper elevation={0} sx={{ p: 4, maxWidth: 460, width: '100%', borderRadius: 4 }}>
        <MarkEmailUnreadIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1.5 }} />

        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
          {emailSent ? 'Check your email' : 'Almost there'}
        </Typography>

        {emailSent ? (
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>
            We sent an activation link to <strong>{email}</strong>. Open it to finish setting up
            your account. The link works for 24 hours.
          </Typography>
        ) : (
          <Alert severity="warning" sx={{ mb: 3 }}>
            Your account was created, but we could not send the activation email just now. Try
            again below.
          </Alert>
        )}

        {resent && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Sent. If that address needs confirming, a new link is on its way.
          </Alert>
        )}
        {failed && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Could not reach the server. Check your connection and try again.
          </Alert>
        )}

        <Button fullWidth variant="contained" onClick={resend} disabled={resending} sx={{ mb: 1.5 }}>
          {resending ? 'Sending…' : 'Resend the link'}
        </Button>

        <Button fullWidth onClick={onBackToLogin}>Back to sign in</Button>

        {/* Said plainly because the alternative is a support question: the mail is far more
            likely to be filtered than lost, and there is nothing the app can do about it. */}
        <Typography sx={{ mt: 3, fontSize: 13, color: 'text.secondary' }}>
          Nothing arrived? Check your spam folder — activation mail often lands there.
        </Typography>
      </Paper>
    </Box>
  );
}
