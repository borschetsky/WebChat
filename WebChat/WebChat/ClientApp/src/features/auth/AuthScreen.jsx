import React, { useState } from 'react';
import {
  Alert, Avatar, Box, Button, Divider, Link, Paper, Stack, TextField, Typography,
} from '@mui/material';
import ForumIcon from '@mui/icons-material/Forum';

/**
 * Server validation messages, rewritten for the person reading them.
 *
 * ASP.NET phrases its messages after the C# property, so a missing sign-in field reads
 * "The Identifier field is required." - which names an internal detail at someone who is
 * only trying to sign in. `default` covers every message for that field; a specific key
 * overrides it. Unrecognised messages pass through unchanged rather than being swallowed.
 */
const FRIENDLY = [
  { field: 'identifier', match: /required/i, text: 'Enter your email address or username.' },
  { field: 'email', match: /required/i, text: 'Enter your email address.' },
  { field: 'email', match: /valid e-?mail/i, text: 'That does not look like an email address.' },
  { field: 'username', match: /required/i, text: 'Choose a username.' },
  { field: 'username', match: /minimum length|string or array/i, text: 'Usernames are 3 to 60 characters.' },
  { field: 'password', match: /required/i, text: 'Enter your password.' },
  { field: 'password', match: /minimum length|string or array/i, text: 'Passwords are at least 6 characters.' },
];

const friendly = (field, raw) =>
  FRIENDLY.find((rule) => rule.field === field && rule.match.test(raw))?.text ?? raw;

/**
 * Shared sign-in / sign-up card, matching the handoff's login screen: centred 420px Paper,
 * radius 16, outlined fields, contained submit.
 *
 * The handoff also drew a "Continue with SSO" button. There is no SSO on the server, so it
 * is left out rather than rendered as a button that cannot work.
 */
export default function AuthScreen({ mode, onSubmit, onSwitch, busy, onNeedsConfirmation, onForgotPassword }) {
  const isRegister = mode === 'register';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    try {
      // Sign-in sends `identifier`, which the API resolves as either an address or a
      // username. Register still sends `email`, because there it really must be one.
      await onSubmit(isRegister ? { username, email, password } : { identifier: email, password });
    } catch (err) {
      // The API answers 400 with either field errors ({email: "..."}) or an ASP.NET
      // ProblemDetails validation payload ({errors: {Email: [...]}}). A network failure
      // has no response at all.
      const data = err?.response?.data;
      if (!data) { setErrors({ form: 'Cannot reach the server. Is the API running?' }); return; }

      // 403 email_not_confirmed is not a form error - the credentials were right and there
      // is nothing on this screen to correct. Hand it to the caller, which shows the
      // check-your-email screen and the resend button that actually resolves it.
      if (data.error === 'email_not_confirmed' && onNeedsConfirmation) {
        // data.email, not the typed value: sign-in accepts a username, and the resend
        // endpoint needs the actual address.
        onNeedsConfirmation(data.email || email);
        return;
      }

      if (data.errors) {
        const flat = {};
        Object.entries(data.errors).forEach(([k, v]) => {
          const field = k.toLowerCase();
          const raw = Array.isArray(v) ? v[0] : v;
          // ASP.NET phrases these after the C# property - "The Identifier field is
          // required." - which names an internal detail at someone who is just trying to
          // sign in. Replace the ones we know; pass anything else through rather than
          // swallowing a message we have not seen.
          flat[field] = friendly(field, raw);
        });
        setErrors(flat);
        return;
      }
      setErrors(typeof data === 'object' ? data : { form: String(data) });
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 3 }}>
      <Paper elevation={0} component="form" onSubmit={submit} sx={{ width: 420, maxWidth: '100%', p: 4.5, borderRadius: 4, border: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 3.5 }}>
          <Avatar variant="rounded" sx={{ width: 44, height: 44, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 3 }}>
            <ForumIcon />
          </Avatar>
          <Box>
            <Typography sx={{ fontSize: 20, fontWeight: 500 }}>{isRegister ? 'Create your account' : 'Welcome back'}</Typography>
            <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
              {isRegister ? 'Join the conversation on WebChat' : 'Sign in to continue to WebChat'}
            </Typography>
          </Box>
        </Stack>

        <Stack spacing={2.25}>
          {errors.form && <Alert severity="error" sx={{ fontSize: 13 }}>{errors.form}</Alert>}

          {isRegister && (
            <TextField
              label="Username" fullWidth required autoComplete="username"
              value={username} onChange={(e) => setUsername(e.target.value)}
              error={!!errors.username} helperText={errors.username}
            />
          )}

          {/* type="email" only on the register form. On sign-in the field also accepts a
              username, and the browser's own validation would reject one before submit. */}
          <TextField
            label={isRegister ? 'Email' : 'Email or username'}
            type={isRegister ? 'email' : 'text'}
            fullWidth
            required
            autoComplete={isRegister ? 'email' : 'username'}
            value={email} onChange={(e) => setEmail(e.target.value)}
            error={!!(errors.email || errors.identifier)}
            helperText={errors.email || errors.identifier}
          />

          <TextField
            label="Password" type="password" fullWidth required
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            error={!!errors.password} helperText={errors.password}
          />

          <Button type="submit" variant="contained" size="large" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </Button>

          {/* Sign-in only. On the register form there is no account to recover yet, and the
              link would read as an invitation to go and fail at it. */}
          {!isRegister && onForgotPassword && (
            <Link
              component="button" type="button" underline="hover"
              onClick={onForgotPassword}
              sx={{ fontSize: 14, alignSelf: 'center' }}
            >
              Forgot your password?
            </Link>
          )}

          <Divider sx={{ fontSize: 13, color: 'text.secondary' }}>OR</Divider>

          <Typography sx={{ fontSize: 14, textAlign: 'center', color: 'text.secondary' }}>
            {isRegister ? 'Already have an account? ' : 'New here? '}
            <Link component="button" type="button" underline="hover" onClick={onSwitch} sx={{ fontSize: 14 }}>
              {isRegister ? 'Sign in' : 'Create an account'}
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
