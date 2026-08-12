import { Box, Button, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PresenceAvatar from '@/components/PresenceAvatar';
import { avatarColor } from '@/theme/tokens';
import { getAbsoluteDate, getRelativeTime } from '@/lib/date-time-format';
import { ROLE_LABEL } from '@/types/admin';
import { errorMessage } from './adminErrors';
import { useSetMemberRoleMutation, useSetMemberStatusMutation } from '@/app/api/adminApi';
import StatusChip from './StatusChip';

// The wire values, lower-case, exactly as WorkspaceRole stores them. ROLE_LABEL is what
// puts a capital on the button. There is no Guest: the mock had one, and nothing in this
// app has ever had a permission level behind that name.
const ROLES = ['member', 'admin', 'owner'];

/**
 * One member, with the destructive actions separated from the rest by a rule.
 *
 * The separation is not decoration: block and deactivate are the two actions on this screen
 * that end somebody's access, and they sit where a misplaced click cannot reach them.
 */
export default function MemberDetail({ member, onClose, onNotify, fullWidth }) {
  const [setRole] = useSetMemberRoleMutation();
  const [setStatus] = useSetMemberStatusMutation();

  const facts = member
    ? [
        ['Email', member.email],
        ['Joined', getAbsoluteDate(member.joinedUtc)],
        ['Groups', String(member.groups)],

        // Live hub connections, not "sessions". A JWT cannot be counted once issued, so the
        // mock's "3 active sessions" was a number nobody could have produced; this one is
        // read straight off the connection registry and is the same number blocking closes.
        ['Open connections', String(member.connections)],

        // Replaces the mock's "Two-factor". This app has no second factor at all, and a
        // row asserting one is the worst kind of fiction to leave on an admin screen.
        ['Email confirmed', member.emailConfirmed ? 'Yes' : 'No'],
        // An em dash, not "Never": a pending account has genuinely no last-active value,
        // and "Never signed in" is the status chip's job, not this row's.
        ['Last active', getRelativeTime(member.lastActiveUtc) || '—'],
      ]
    : [];

  return (
    <Drawer
      anchor="right"
      open={!!member}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: fullWidth ? '100%' : 380 } } }}
    >
      {member && (
        <>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: 'center', p: 1.75, borderBottom: 1, borderColor: 'divider' }}
          >
            <Typography sx={{ flex: 1, fontSize: 16, fontWeight: 500 }}>Member</Typography>
            <IconButton onClick={onClose} aria-label="Close member details">
              <CloseIcon />
            </IconButton>
          </Stack>

          <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2.5 }}>
            <Stack spacing={1.25} sx={{ alignItems: 'center', pb: 2.5 }}>
              <PresenceAvatar
                name={member.name}
                color={avatarColor(member.id)}
                avatarFileName={member.avatarFileName}
                presence={member.online ? 'online' : 'offline'}
                size={64}
              />
              <Typography sx={{ fontSize: 18, fontWeight: 500 }}>{member.name}</Typography>
              <StatusChip status={member.status} />
            </Stack>

            <Divider />

            {facts.map(([label, value]) => (
              <Stack
                key={label}
                direction="row"
                spacing={2}
                sx={{ alignItems: 'center', py: 1.25, borderBottom: 1, borderColor: 'divider' }}
              >
                <Typography sx={{ flex: 1, fontSize: 13, color: 'text.secondary' }}>
                  {label}
                </Typography>
                <Typography sx={{ fontSize: 13.5, textAlign: 'right' }}>{value}</Typography>
              </Stack>
            ))}

            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 3, mb: 1 }}>
              Workspace role
            </Typography>
            <Stack direction="row" spacing={0.75}>
              {ROLES.map((r) => (
                <Box
                  key={r}
                  component="button"
                  type="button"
                  aria-pressed={member.role === r}
                  onClick={async () => {
                    const result = await setRole({ id: member.id, role: r });

                    // The server owns this decision, not the button: only an owner may
                    // appoint or remove administrators, and an admin pressing "Owner" gets a
                    // 403 rather than a change. Saying "X is now Owner" regardless would
                    // report a promotion that did not happen.
                    onNotify?.(
                      result?.error
                        ? errorMessage(result.error)
                        : `${member.name} is now ${ROLE_LABEL[r]}`,
                    );
                  }}
                  sx={{
                    flex: 1,
                    height: 34,
                    borderRadius: 2,
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 500,
                    font: 'inherit',
                    border: 1,
                    borderColor: (t) =>
                      member.role === r ? t.palette.primary.main : t.custom.border2,
                    bgcolor: member.role === r ? 'background.selected' : 'transparent',
                    color: member.role === r ? 'primary.main' : 'text.secondary',
                  }}
                >
                  {ROLE_LABEL[r]}
                </Box>
              ))}
            </Stack>

            <Divider sx={{ mt: 3, mb: 2 }} />

            <Stack spacing={1}>
              {member.status === 'blocked' ? (
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={async () => {
                    const result = await setStatus({ ids: [member.id], status: 'active' });
                    onNotify?.(
                      result?.error
                        ? errorMessage(result.error)
                        : `${member.name} can sign in again`,
                    );
                  }}
                >
                  Unblock
                </Button>
              ) : (
                <Button
                  fullWidth
                  variant="outlined"
                  color="error"
                  onClick={async () => {
                    const result = await setStatus({ ids: [member.id], status: 'blocked' });

                    // Naming what is kept matters: block is reversible, and an admin who
                    // thinks it deletes history will reach for the wrong action instead.
                    // The refusal case matters just as much - blocking the last owner is
                    // stopped by the server, and reporting success would be a lie about
                    // who can still get in.
                    onNotify?.(
                      result?.error
                        ? errorMessage(result.error)
                        : `${member.name} blocked — account and history kept`,
                    );
                  }}
                >
                  Block
                </Button>
              )}
              <Button
                fullWidth
                variant="outlined"
                color="error"
                onClick={async () => {
                  const result = await setStatus({ ids: [member.id], status: 'deactivated' });
                  onNotify?.(
                    result?.error
                      ? errorMessage(result.error)
                      : `${member.name} deactivated and removed from all groups`,
                  );
                }}
              >
                Deactivate
              </Button>
            </Stack>
          </Box>
        </>
      )}
    </Drawer>
  );
}
