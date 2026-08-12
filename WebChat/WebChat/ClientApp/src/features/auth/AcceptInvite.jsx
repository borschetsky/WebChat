import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { ROLE_LABEL } from '@/types/admin';
import { inspectInvite, redeemInvite } from '@/services/admin-service';

/**
 * The invitation landing page: `/invite?token=…`.
 *
 * **It looks the invitation up before asking anybody to sign in.** A stranger clicking a
 * link from their inbox needs to see which workspace is asking and at what address, before
 * deciding whether to register at all — a bare sign-in form would be indistinguishable from
 * a phishing page. The lookup is anonymous and returns the invited address, the role, and
 * nothing else; holding the token is what entitles the caller to that much.
 *
 * **Redeeming needs a session, so the flow is: inspect → register or sign in → redeem.**
 * Creating the account here instead would mean a second registration path with its own
 * validation, uniqueness and password rules to keep in step with the real one. Coming back
 * after signing in costs one redirect and no duplicated logic.
 *
 * The link is bearer, so whoever is signed in when it is opened becomes the member. That is
 * deliberate — invitations get forwarded — and it is why the invited address is shown
 * plainly here rather than assumed.
 */
export default function AcceptInvite({ token, user, onSignIn, onDone }) {
  // A missing token is decided at mount rather than inside the effect: setting state
  // synchronously in an effect body causes a cascading render, and the React Compiler rules
  // reject it. The token comes from the URL and cannot change without remounting, so the
  // initial value is the whole answer for that case.
  const [state, setState] = useState(() => ({ status: token ? 'loading' : 'invalid' }));

  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;

    inspectInvite(token)
      .then((details) => {
        if (!cancelled) setState({ status: 'ready', details });
      })
      .catch(() => {
        // Any failure is the same story to the person holding the link: it does not work
        // any more. Distinguishing "never existed" from "already used" here would tell a
        // guesser which tokens are real.
        if (!cancelled) setState({ status: 'invalid' });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = useCallback(async () => {
    setState((s) => ({ ...s, status: 'redeeming' }));

    try {
      await redeemInvite(token, user.token);
      onDone?.();
    } catch {
      // Losing the race is the ordinary case here - a double-clicked link, or an
      // administrator revoking while the page was open.
      setState({ status: 'invalid' });
    }
  }, [token, user, onDone]);

  if (state.status === 'loading') {
    return (
      <Centered>
        <CircularProgress size={28} />
      </Centered>
    );
  }

  if (state.status === 'invalid') {
    return (
      <Centered>
        <Typography sx={{ fontSize: 20, fontWeight: 500 }}>This invitation has expired</Typography>
        <Typography sx={{ color: 'text.secondary', textAlign: 'center' }}>
          The link is no longer valid — it may have been used, revoked, or replaced by a newer one.
          Ask whoever invited you to send another.
        </Typography>
        <Button variant="contained" onClick={onSignIn} sx={{ borderRadius: 20, px: 3 }}>
          Go to sign in
        </Button>
      </Centered>
    );
  }

  const { email, role } = state.details ?? {};

  return (
    <Centered>
      <Typography sx={{ fontSize: 22, fontWeight: 500 }}>You have been invited</Typography>
      <Typography sx={{ color: 'text.secondary', textAlign: 'center' }}>
        This invitation was sent to <strong>{email}</strong>
        {role ? ` for the ${ROLE_LABEL[role] ?? role} role` : ''}.
      </Typography>

      {user ? (
        <>
          <Button
            variant="contained"
            onClick={accept}
            disabled={state.status === 'redeeming'}
            sx={{ borderRadius: 20, px: 3 }}
          >
            {state.status === 'redeeming' ? 'Joining…' : 'Accept invitation'}
          </Button>

          {/* Stated because the link is bearer and this is where it matters: whoever is
              signed in right now is the account that joins, which may not be the invited
              address at all. */}
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
            You will join as {user.name ?? user.username ?? 'your current account'}.
          </Typography>
        </>
      ) : (
        <>
          <Button variant="contained" onClick={onSignIn} sx={{ borderRadius: 20, px: 3 }}>
            Sign in or create an account
          </Button>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', textAlign: 'center' }}>
            Come back to this link afterwards to finish joining.
          </Typography>
        </>
      )}
    </Centered>
  );
}

function Centered({ children }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
      }}
    >
      <Stack spacing={2} sx={{ alignItems: 'center', maxWidth: 420 }}>
        {children}
      </Stack>
    </Box>
  );
}
