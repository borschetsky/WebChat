import React, { useState } from 'react';
import {
  Alert, Avatar, Box, Button, Divider, Link, Paper, Stack, TextField, Typography,
} from '@mui/material';
import ForumIcon from '@mui/icons-material/Forum';

/**
 * Shared sign-in / sign-up card, matching the handoff's login screen: centred 420px Paper,
 * radius 16, outlined fields, contained submit.
 *
 * The handoff also drew a "Continue with SSO" button. There is no SSO on the server, so it
 * is left out rather than rendered as a button that cannot work.
 */
export default function AuthScreen({ mode, onSubmit, onSwitch, busy }) {
  const isRegister = mode === 'register';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    try {
      await onSubmit(isRegister ? { username, email, password } : { email, password });
    } catch (err) {
      // The API answers 400 with either field errors ({email: "..."}) or an ASP.NET
      // ProblemDetails validation payload ({errors: {Email: [...]}}). A network failure
      // has no response at all.
      const data = err?.response?.data;
      if (!data) { setErrors({ form: 'Cannot reach the server. Is the API running?' }); return; }
      if (data.errors) {
        const flat = {};
        Object.entries(data.errors).forEach(([k, v]) => { flat[k.toLowerCase()] = Array.isArray(v) ? v[0] : v; });
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
              label="Username" fullWidth autoComplete="username"
              value={username} onChange={(e) => setUsername(e.target.value)}
              error={!!errors.username} helperText={errors.username}
            />
          )}

          <TextField
            label="Email" type="email" fullWidth autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            error={!!errors.email} helperText={errors.email}
          />

          <TextField
            label="Password" type="password" fullWidth
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            error={!!errors.password} helperText={errors.password}
          />

          <Button type="submit" variant="contained" size="large" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </Button>

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
