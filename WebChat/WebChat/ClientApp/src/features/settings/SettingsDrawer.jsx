import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Divider, Drawer, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LogoutIcon from '@mui/icons-material/Logout';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PresenceAvatar from '@/components/PresenceAvatar';
import AppearanceControls from '@/features/settings/AppearanceControls';
import MockDisclosure from '@/features/settings/MockDisclosure';

/**
 * Profile and settings drawer.
 *
 * The handoff listed five appearance toggles; only two of them (dark theme, compact
 * density) do anything, so the other three - desktop notifications, read receipts and
 * quiet hours - are omitted rather than rendered as switches that silently do nothing.
 * They need server support first. See mocks.js.
 *
 * In exchange the profile block is editable, which the handoff's static block was not,
 * because /api/users/update and /api/avatars/upload both exist.
 */
export default function SettingsDrawer({
  open, onClose, profile, members, threadName, onSaveProfile, onUploadAvatar, onLogout, fullWidth,
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Same "reset the form when the prop changes" shape as ComposeDialog: the idiomatic fix
    // is a key at the call site, deferred for the same reason.
    // oxlint-disable-next-line rh/set-state-in-effect
    setName(profile?.name ?? '');
    setEmail(profile?.email ?? '');
    setError('');
  }, [profile, open]);

  const dirty = profile && (name !== profile.name || email !== profile.email);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSaveProfile({ ...profile, name, email });
    } catch (err) {
      setError(err?.response?.data?.title ?? 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: fullWidth ? '100%' : 360 } } }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 1.75, borderBottom: 1, borderColor: 'divider' }}>
        <Typography sx={{ flex: 1, fontSize: 16, fontWeight: 500 }}>Profile &amp; settings</Typography>
        <IconButton onClick={onClose} aria-label="Close settings"><CloseIcon /></IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2.5 }}>
        <Stack spacing={1} sx={{ alignItems: 'center', pb: 2.5 }}>
          <Box sx={{ position: 'relative' }}>
            <PresenceAvatar name={profile?.name ?? ''} color={profile?.color} avatarFileName={profile?.avatarFileName} size={76} showPresence={false} />
            <IconButton
              component="label"
              size="small"
              aria-label="Change profile photo"
              sx={{ position: 'absolute', right: -4, bottom: -4, bgcolor: 'background.paper', border: 1, borderColor: 'divider', '&:hover': { bgcolor: 'background.field' } }}
            >
              <PhotoCameraIcon fontSize="inherit" />
              <input hidden type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadAvatar(f); e.target.value = ''; }} />
            </IconButton>
          </Box>
        </Stack>

        <Stack spacing={1.75}>
          <TextField label="Display name" size="small" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField label="Email" size="small" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
          {error && <Alert severity="error" sx={{ fontSize: 13 }}>{error}</Alert>}
          <Button variant="contained" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </Stack>

        <Divider sx={{ mt: 2.5 }} />

        <AppearanceControls />

        {members?.length > 0 && (
          <>
            <Typography sx={{ fontSize: 12, fontWeight: 500, letterSpacing: '.06em', textTransform: 'uppercase', color: 'text.secondary', mt: 2.5, mb: 0.5 }}>
              {threadName ? `Members in ${threadName}` : 'Members'}
            </Typography>
            {members.map((p) => (
              <Stack key={p.id ?? p.name} direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 1, py: 1.1 }}>
                <PresenceAvatar name={p.name} color={p.color} avatarFileName={p.avatarFileName} size={34} presence={p.presence} />
                <Box>
                  <Typography sx={{ fontSize: 14 }}>{p.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{p.role}</Typography>
                </Box>
              </Stack>
            ))}
          </>
        )}

        <MockDisclosure />

        <Button fullWidth variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={onLogout} sx={{ mt: 3 }}>
          Log out
        </Button>
      </Box>
    </Drawer>
  );
}
