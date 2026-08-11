import { Box, Button, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PresenceAvatar from '@/components/PresenceAvatar';
import { avatarColor } from '@/theme/tokens';
import { useSetMemberRoleMutation, useSetMemberStatusMutation } from '@/app/api/adminApi';
import StatusChip from './StatusChip';

const ROLES = ['Member', 'Admin', 'Owner'];

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
        ['Joined', member.joined],
        ['Groups', String(member.groups)],
        ['Active sessions', String(member.sessions)],
        ['Two-factor', member.mfa ? 'On' : 'Off'],
        ['Last active', member.last],
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
                    await setRole({ id: member.id, role: r });
                    onNotify?.(`${member.name} is now ${r}`);
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
                  {r}
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
                    await setStatus({ ids: [member.id], status: 'active' });
                    onNotify?.(`${member.name} can sign in again`);
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
                    await setStatus({ ids: [member.id], status: 'blocked' });
                    // Naming what is kept matters: block is reversible, and an admin who
                    // thinks it deletes history will reach for the wrong action instead.
                    onNotify?.(`${member.name} blocked — account and history kept`);
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
                  await setStatus({ ids: [member.id], status: 'deactivated' });
                  onNotify?.(`${member.name} deactivated and removed from all groups`);
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
