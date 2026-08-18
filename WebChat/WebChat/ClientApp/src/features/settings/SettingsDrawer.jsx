import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LogoutIcon from '@mui/icons-material/Logout';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PresenceAvatar from '@/components/PresenceAvatar';
import AppearanceControls from '@/features/settings/AppearanceControls';
import MockDisclosure from '@/features/settings/MockDisclosure';
import SectionLabel from '@/components/SectionLabel';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

/**
 * Lazy, and it has to be: react-easy-crop plus the MUI Dialog, Slider and icons it pulls in
 * are ~15 kB gzipped, and `vite.config.ts` groups vendors with `tags: ['$initial']`, so a
 * module reachable only from here cannot be hoisted into vendor-mui - it lands whole in
 * whatever chunk imports it. Behind `lazy` it is fetched when someone picks a photo and never
 * before, which keeps it out of the render-blocking payload entirely.
 */
const AvatarCropDialog = lazy(() => import('@/features/settings/AvatarCropDialog'));
import { isAdminRole } from '@/features/admin/adminAccess';

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
  open,
  onClose,
  profile,
  members,
  threadName,
  onSaveProfile,
  saving = false,
  saveError = null,
  onUploadAvatar,
  onLogout,
  onOpenAdmin,
  fullWidth,
}) {
  // The two text fields stay local on purpose - they are controlled inputs, and a keystroke
  // that reached the store would re-render everything subscribed to it. `saving` and `error`
  // used to live here too, as a second copy of state the mutation already tracks.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // The picked photo, held here rather than uploaded on the spot. This is the whole of #84 at
  // this level: before, choosing a file *was* the upload and there was no moment at which
  // anyone could decline. `null` means no crop in progress.
  const [pickedPhoto, setPickedPhoto] = useState(null);

  useEffect(() => {
    // Same "reset the form when the prop changes" shape as ComposeDialog: the idiomatic fix
    // is a key at the call site, deferred for the same reason.
    // oxlint-disable-next-line rh/set-state-in-effect
    setName(profile?.name ?? '');
    setEmail(profile?.email ?? '');
  }, [profile, open]);

  const dirty = profile && (name !== profile.name || email !== profile.email);

  // The API's problem-details body, or a fallback. Derived rather than stored: there is only
  // one failure to describe and the mutation is already holding it.
  const error = saveError ? (saveError.data?.title ?? 'Could not save your profile.') : '';

  const save = () => onSaveProfile({ ...profile, name, email });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: fullWidth ? '100%' : 360 } } }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'center', p: 1.75, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography sx={{ flex: 1, fontSize: 16, fontWeight: 500 }}>
          Profile &amp; settings
        </Typography>
        <IconButton onClick={onClose} aria-label="Close settings">
          <CloseIcon />
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2.5 }}>
        <Stack spacing={1} sx={{ alignItems: 'center', pb: 2.5 }}>
          <Box sx={{ position: 'relative' }}>
            <PresenceAvatar
              name={profile?.name ?? ''}
              color={profile?.color}
              avatarFileName={profile?.avatarFileName}
              size={76}
              showPresence={false}
            />
            <IconButton
              component="label"
              size="small"
              sx={{
                position: 'absolute',
                right: -4,
                bottom: -4,
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                '&:hover': { bgcolor: 'background.field' },
              }}
            >
              <PhotoCameraIcon fontSize="inherit" />
              <input
                hidden
                type="file"
                accept="image/*"
                // The accessible name lives on the input, not on the IconButton wrapping it.
                // The button is a `component="label"`, so a name there labels the label and
                // leaves the control itself unnamed - and anything driving the real control,
                // a screen reader or a test, addresses the input.
                aria-label="Change profile photo"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPickedPhoto(f);
                  // Cleared so that picking the *same* file again still fires a change event.
                  // Without it, cancelling and re-choosing the photo you just cancelled does
                  // nothing at all, which reads as the button being broken.
                  e.target.value = '';
                }}
              />
            </IconButton>
          </Box>
        </Stack>

        <Stack spacing={1.75}>
          <TextField
            label="Display name"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <TextField
            label="Email"
            size="small"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
          />
          {error && (
            <Alert severity="error" sx={{ fontSize: 13 }}>
              {error}
            </Alert>
          )}
          <Button variant="contained" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </Stack>

        <Divider sx={{ mt: 2.5 }} />

        <AppearanceControls />

        {members?.length > 0 && (
          <>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                mt: 2.5,
                mb: 0.5,
              }}
            >
              {threadName ? `Members in ${threadName}` : 'Members'}
            </Typography>
            {members.map((p) => (
              <Stack
                key={p.id ?? p.name}
                direction="row"
                spacing={1.5}
                sx={{ alignItems: 'center', px: 1, py: 1.1 }}
              >
                <PresenceAvatar
                  name={p.name}
                  color={p.color}
                  avatarFileName={p.avatarFileName}
                  size={34}
                  presence={p.presence}
                />
                <Box>
                  <Typography sx={{ fontSize: 14 }}>{p.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{p.role}</Typography>
                </Box>
              </Stack>
            ))}
          </>
        )}

        {/* Absent for non-admins rather than disabled. A greyed row tells a member that a
            private console exists, which is a small information leak in itself - and this
            is presentation only, since /admin and everything behind it re-check the role. */}
        {isAdminRole(profile?.role) && (
          <>
            <SectionLabel>Workspace</SectionLabel>
            <Stack
              component="button"
              type="button"
              direction="row"
              spacing={1.75}
              onClick={onOpenAdmin}
              sx={{
                alignItems: 'center',
                width: '100%',
                p: '13px 14px',
                borderRadius: '12px',
                border: 1,
                borderColor: 'divider',
                bgcolor: 'background.quote',
                color: 'text.primary',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  flex: 'none',
                  borderRadius: '10px',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AdminPanelSettingsIcon sx={{ fontSize: 21 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Admin console</Typography>
                <Typography
                  sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25, lineHeight: 1.4 }}
                >
                  Members, invitations, policies, UI errors
                </Typography>
              </Box>
            </Stack>
            <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 1, lineHeight: 1.5 }}>
              You see this because you are a workspace {profile?.role}.
            </Typography>
          </>
        )}

        <MockDisclosure />

        <Button
          fullWidth
          variant="outlined"
          color="error"
          startIcon={<LogoutIcon />}
          onClick={onLogout}
          sx={{ mt: 3 }}
        >
          Log out
        </Button>
      </Box>

      {/* Mounted only while a photo is waiting, and keyed on it: a different photo is a
          different instance, so zoom and position reset without an effect having to clear
          five pieces of state. Unmounting is also what revokes the object URL.
          `fallback={null}` because the chunk arrives in milliseconds from cache and a
          spinner flashing behind the scrim is worse than nothing. */}
      {pickedPhoto && (
        <Suspense fallback={null}>
          <AvatarCropDialog
            key={`${pickedPhoto.name}:${pickedPhoto.size}:${pickedPhoto.lastModified}`}
            file={pickedPhoto}
            onCancel={() => setPickedPhoto(null)}
            onConfirm={(cropped) => {
              // The same `onUploadAvatar` that existed before, receiving a cropped `File`
              // rather than the original - which is what makes this a zero-server-change
              // feature. It must stay a File: ChatApp does FormData.append('file', it) and
              // the server reads form.Files[0], so a bare Blob would arrive nameless.
              onUploadAvatar(cropped);
              setPickedPhoto(null);
            }}
          />
        </Suspense>
      )}
    </Drawer>
  );
}
