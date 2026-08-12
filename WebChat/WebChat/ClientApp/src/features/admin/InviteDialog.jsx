import { useState } from 'react';
import { ROLE_LABEL } from '@/types/admin';
import { errorMessage } from './adminErrors';

/**
 * What actually happened, which is rarely just "sent".
 *
 * Three outcomes have to stay distinguishable. Skipped addresses already had an account -
 * those people are in and nothing is owed. Failed ones have an invitation stored but no mail
 * delivered, so somebody has to resend and the recipient has been told nothing. Reporting
 * "5 invitations sent" over either would be a straightforward lie.
 */
const summarise = (result, attempted) => {
  const sent = attempted.length - (result?.skipped?.length ?? 0) - (result?.failed?.length ?? 0);
  const parts = [];

  if (sent > 0) parts.push(sent === 1 ? '1 invitation sent' : `${sent} invitations sent`);
  if (result?.skipped?.length) parts.push(`${result.skipped.length} already a member`);
  if (result?.failed?.length) {
    parts.push(`${result.failed.length} could not be emailed — resend from the list`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Nothing to send';
};
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

// Lower-case wire values, matching WorkspaceRole; ROLE_LABEL supplies the capital. Owner is
// absent on purpose: an invitation cannot hand over the workspace, and the role endpoint
// would refuse it anyway unless an owner sent it.
const ROLES = ['member', 'admin'];

/**
 * Invite by address, one per line.
 *
 * Multi-line rather than a chip input because the common case is pasting a list out of a
 * spreadsheet or an email, and a chip input turns that into one paste plus N corrections.
 */
export default function InviteDialog({ open, onClose, onSent, fullScreen }) {
  const [text, setText] = useState('');
  const [role, setRole] = useState('member');
  const [send, { isLoading }] = useSendInvitesMutation();

  const emails = text
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  const submit = async () => {
    if (emails.length === 0) return;

    const result = await send({ emails, role });

    if (result?.error) {
      // The dialog stays open with the addresses still in it. Closing on a failure would
      // lose a pasted list of twenty and give no way to retry except retyping them.
      onSent?.(errorMessage(result.error));
      return;
    }

    onSent?.(summarise(result.data, emails));
    setText('');
    setRole('member');
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
              {ROLE_LABEL[r]}
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
