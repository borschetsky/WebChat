import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LogoutIcon from '@mui/icons-material/Logout';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CropIcon from '@mui/icons-material/Crop';
import DeleteIcon from '@mui/icons-material/Delete';
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
  onLoadOriginal,
  onRemoveAvatar,
  onLogout,
  onOpenAdmin,
  fullWidth,
  // Lets focus leave the drawer while a snackbar with an action is up; without it the trap
  // pulls focus back off the action and the Undo is keyboard-unreachable. See `AppSnackbar`
  // and issue #96.
  disableEnforceFocus = false,
}) {
  // The two text fields stay local on purpose - they are controlled inputs, and a keystroke
  // that reached the store would re-render everything subscribed to it. `saving` and `error`
  // used to live here too, as a second copy of state the mutation already tracks.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // The photo being cropped, held here rather than uploaded on the spot. This is the whole of
  // #84 at this level: before, choosing a file *was* the upload and there was no moment at
  // which anyone could decline. `null` means no crop in progress.
  //
  // Since #88 it can also be the photo fetched back from the server, so it carries where it
  // came from and which rectangle to open on. The three move together, which is why they are
  // one piece of state rather than three: a stale `source` next to a fresh file would re-upload
  // an original that is already stored, or fail to upload one that is not.
  const [pickedPhoto, setPickedPhoto] = useState(null);

  // Which of the avatar menu's actions is in flight, so the menu can say so rather than
  // appearing to do nothing while an image is fetched.
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const [photoMenuAnchor, setPhotoMenuAnchor] = useState(null);

  // The file input is no longer inside a `component="label"` button, because that button now
  // has a second job - opening the menu - and a label fires the picker on every click. So the
  // picker is opened programmatically instead.
  const fileInput = useRef(null);

  /**
   * Whether there is a photo at all, which since #89 is what decides whether there is a menu.
   *
   * The handoff opens a menu when a photo is present, with three items: Upload a new photo,
   * Adjust crop, and Remove photo. #88 shipped two of them and drew the menu only when
   * **Adjust** could work, because Remove had no endpoint and a one-item menu in front of the
   * file picker is friction bought with nothing.
   *
   * Now there are two things anyone with a photo can do, so the menu is drawn for all of them
   * and Adjust is the item that comes and goes. That direction matters: gating the whole menu
   * on `hasOriginalPhoto` would make Remove unreachable for exactly the accounts that uploaded
   * before #88 - a control that exists, works over the API, and cannot be found from a browser,
   * which is #82 all over again.
   */
  const hasPhoto = Boolean(profile?.avatarFileName);

  /** Adjust needs the stored original, and nothing backfills one. See #88, decision 4. */
  const canAdjustCrop = hasPhoto && Boolean(profile?.hasOriginalPhoto);

  const openPicker = () => {
    setPhotoMenuAnchor(null);
    fileInput.current?.click();
  };

  /**
   * Remove, from either of the two places the handoff draws it.
   *
   * No confirmation - that is the handoff's explicit call, and the snackbar's Undo is what
   * pays for it. Closing the cropper is not incidental: if this was pressed from the dialog,
   * the photo it is showing has just stopped being the user's avatar.
   *
   * **The drawer stays open**, which it did not between #89 and #96. #89 closed it because the
   * app's one `Snackbar` rendered inline, inside the subtree this modal marks `aria-hidden`, so
   * the only way to make the Undo real was to remove the modal. #96 fixed that at the source -
   * the snackbar portals out and its action is handed focus while a modal has it trapped - and
   * with the reason gone, closing is the wrong behaviour: Undo means "put me back where I was",
   * and it cannot if pressing Remove has already thrown the user out of settings. Closing also
   * discarded an unsaved display name or email, because the drawer resets its fields on `open`.
   */
  const removePhoto = () => {
    setPhotoMenuAnchor(null);
    setPickedPhoto(null);
    onRemoveAvatar?.();
  };

  const adjustCrop = async () => {
    setPhotoMenuAnchor(null);
    setLoadingOriginal(true);
    try {
      const original = await onLoadOriginal?.();
      // Null means the fetch failed and has already been reported. Opening the cropper on
      // nothing would be worse than not opening it.
      if (original) {
        setPickedPhoto({ file: original, source: 'stored', crop: profile?.avatarCrop ?? null });
      }
    } finally {
      setLoadingOriginal(false);
    }
  };

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
      disableEnforceFocus={disableEnforceFocus}
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
              size="small"
              // Two different names for two different controls, because both are in the
              // accessibility tree and a shared name would make each ambiguous. The input is
              // still "Change profile photo" - it is the control that changes it - so this one
              // says what *it* does, which depends on whether there is a menu behind it.
              aria-label={hasPhoto ? 'Profile photo options' : 'Add a profile photo'}
              aria-haspopup={hasPhoto ? 'menu' : undefined}
              disabled={loadingOriginal}
              onClick={(e) => (hasPhoto ? setPhotoMenuAnchor(e.currentTarget) : openPicker())}
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
            </IconButton>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept="image/*"
              // The accessible name stays on the input rather than moving to the button above.
              // It is the control that actually changes the photo, and anything driving the
              // real control - a screen reader, a test - addresses the input.
              aria-label="Change profile photo"
              onChange={(e) => {
                const f = e.target.files?.[0];
                // A freshly picked photo has no stored original and no saved rectangle: the
                // cropper opens on the whole thing, and the original goes up with the crop.
                if (f) setPickedPhoto({ file: f, source: 'picked', crop: null });
                // Cleared so that picking the *same* file again still fires a change event.
                // Without it, cancelling and re-choosing the photo you just cancelled does
                // nothing at all, which reads as the button being broken.
                e.target.value = '';
              }}
            />
          </Box>
        </Stack>

        {/* The handoff's avatar menu, complete since #89: upload, adjust, remove - the last
            one red, last and separated, exactly as drawn. Adjust is the item that can be
            missing, because nothing backfills an original for a pre-#88 account. */}
        <Menu
          anchorEl={photoMenuAnchor}
          open={Boolean(photoMenuAnchor)}
          onClose={() => setPhotoMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={openPicker}>
            <ListItemIcon>
              <AddPhotoAlternateIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Upload a new photo</ListItemText>
          </MenuItem>
          {canAdjustCrop && (
            <MenuItem onClick={adjustCrop}>
              <ListItemIcon>
                <CropIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Adjust crop</ListItemText>
            </MenuItem>
          )}
          <Divider />
          {/* Red because it is destructive, and last and separated so it cannot be hit by
              muscle memory aimed at the item above it. `color: inherit` on the icon so it
              takes the row's error colour rather than staying grey next to red text. */}
          <MenuItem onClick={removePhoto} sx={{ color: 'error.main' }}>
            <ListItemIcon sx={{ color: 'inherit' }}>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Remove photo</ListItemText>
          </MenuItem>
        </Menu>

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
            key={`${pickedPhoto.source}:${pickedPhoto.file.name}:${pickedPhoto.file.size}:${pickedPhoto.file.lastModified}`}
            file={pickedPhoto.file}
            source={pickedPhoto.source}
            initialCrop={pickedPhoto.crop}
            // Only when there is an existing photo to remove. Someone cropping their first
            // one has nothing to take away, and a Remove button there would be a control
            // whose only possible outcome is "nothing happened".
            onRemove={hasPhoto ? removePhoto : undefined}
            onCancel={() => setPickedPhoto(null)}
            onConfirm={(result) => {
              // The cropped square, the rectangle that produced it, and - for a freshly picked
              // photo only - the whole image to keep. `file` must stay a File: ChatApp does
              // FormData.append('file', it) and the server reads the part by name, so a bare
              // Blob would arrive nameless.
              onUploadAvatar(result);
              setPickedPhoto(null);
            }}
          />
        </Suspense>
      )}
    </Drawer>
  );
}
