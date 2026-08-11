import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSendInvitesMutation } from '@/app/api/adminApi';

const ROLES = ['Member', 'Admin', 'Owner'];

/**
 * Invite by address, one per line.
 *
 * Multi-line rather than a chip input because the common case is pasting a list out of a
 * spreadsheet or an email, and a chip input turns that into one paste plus N corrections.
 */
export default function InviteDialog({ open, onClose, onSent, fullScreen }) {
  const [text, setText] = useState('');
  const [role, setRole] = useState('Member');
  const [send, { isLoading }] = useSendInvitesMutation();

  const emails = text
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  const submit = async () => {
    if (emails.length === 0) return;
    await send({ emails, role });
    onSent?.(
      emails.length === 1 ? `Invitation sent to ${emails[0]}` : `${emails.length} invitations sent`,
    );
    setText('');
    setRole('Member');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ fontSize: 18, fontWeight: 500 }}>Invite people</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          label="Email addresses"
          placeholder={'maya@acme.com\ntomas@acme.com'}
          helperText="One per line. Invitations expire after 30 days."
        />

        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 2, mb: 1 }}>
          Role for everyone in this batch
        </Typography>
        <Stack direction="row" spacing={1}>
          {ROLES.map((r) => (
            <Box
              key={r}
              component="button"
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              sx={{
                flex: 1,
                height: 36,
                borderRadius: 2,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                font: 'inherit',
                border: 1,
                borderColor: (t) => (role === r ? t.palette.primary.main : t.custom.border2),
                bgcolor: role === r ? 'background.selected' : 'transparent',
                color: role === r ? 'primary.main' : 'text.secondary',
              }}
            >
              {r}
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={emails.length === 0 || isLoading}>
          {emails.length > 1 ? `Send ${emails.length} invitations` : 'Send invitation'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
