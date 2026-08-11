import { Box, Stack, Switch, Typography } from '@mui/material';
import Panel from '../Panel';

/**
 * Workspace policies, grouped the way the spec groups them.
 *
 * MOCK: every switch is presentational - nothing enforces any of these yet, and each one
 * needs its own server-side rule before it means anything. They are rendered rather than
 * omitted because the grouping and the copy are the part being reviewed.
 */
const GROUPS = [
  {
    title: 'Membership',
    sub: 'Who can join, and how',
    rows: [
      [
        'Require admin approval for invites',
        'Members can propose an invite; an admin confirms it.',
        true,
      ],
      ['Allow guest accounts', 'Guests see only the conversations they are added to.', true],
      ['Automatically deactivate after 90 days idle', 'Accounts are kept, sessions ended.', false],
    ],
  },
  {
    title: 'Messaging',
    sub: 'What people can do in conversations',
    rows: [
      ['Members can create groups', 'Turning this off leaves group creation to admins.', true],
      ['Members can delete their own messages', 'Deletions are recorded in the audit log.', true],
      ['Retain messages indefinitely', 'When off, messages older than a year are removed.', true],
    ],
  },
  {
    title: 'Security',
    sub: 'Sign-in and sessions',
    rows: [
      ['Require two-factor authentication', 'Applies to admins and owners first.', false],
      ['End sessions on password change', 'Already enforced by the security stamp.', true],
      [
        'Allow sign-in from new devices without confirmation',
        'Off means an email check per device.',
        false,
      ],
    ],
  },
];

export default function AdminPolicies({ onNotify }) {
  return (
    <Stack spacing={2}>
      {GROUPS.map((g) => (
        <Panel key={g.title} sx={{ p: '20px 24px 8px' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 500 }}>{g.title}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>{g.sub}</Typography>
          {g.rows.map(([label, hint, on]) => (
            <Stack
              key={label}
              direction="row"
              spacing={2}
              sx={{ alignItems: 'center', py: 1.5, borderTop: 1, borderColor: 'divider' }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 14 }}>{label}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                  {hint}
                </Typography>
              </Box>
              <Switch
                defaultChecked={on}
                onChange={() => onNotify?.('Policies are not enforced yet — see issue #64')}
                inputProps={{ 'aria-label': label }}
              />
            </Stack>
          ))}
        </Panel>
      ))}
    </Stack>
  );
}
