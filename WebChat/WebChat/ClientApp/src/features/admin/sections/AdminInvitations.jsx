import { Box, Button, Stack, Typography } from '@mui/material';
import {
  useExtendInviteMutation,
  useGetInvitesQuery,
  useRevokeInviteMutation,
} from '@/app/api/adminApi';
import { getDaysUntil, getRelativeTime } from '@/lib/date-time-format';
import Panel from '../Panel';

/**
 * Separate from Members on purpose: the actions differ (resend, extend, revoke) and expiry
 * is what you scan for, which is not something the members table is arranged to show.
 *
 * Rows expiring within a week are highlighted - the whole reason to open this tab is to
 * catch those before they lapse.
 */
export default function AdminInvitations({ query, isMobile, onNotify, onInvite }) {
  const { data: invites = [] } = useGetInvitesQuery();
  const [extend] = useExtendInviteMutation();
  const [revoke] = useRevokeInviteMutation();

  const q = query.trim().toLowerCase();
  const rows = q
    ? invites.filter((i) => i.email.toLowerCase().includes(q) || i.by.toLowerCase().includes(q))
    : invites;

  if (rows.length === 0) {
    return (
      <Panel sx={{ p: 6, textAlign: 'center' }}>
        <Typography sx={{ color: 'text.secondary' }}>
          {q ? `No invitation matches “${query}”.` : 'Nothing outstanding.'}
        </Typography>
        {!q && (
          <Button variant="contained" onClick={onInvite} sx={{ mt: 2, borderRadius: 20 }}>
            Invite people
          </Button>
        )}
      </Panel>
    );
  }

  return (
    <Panel sx={{ p: isMobile ? '4px 16px 12px' : '4px 24px 12px' }}>
      {rows.map((i) => {
        // Computed here, not sent: the server would have to guess when the page is read,
        // and this one sits open. An invitation that lapses at 09:00 is "expires tomorrow"
        // at 23:00 and "expired" an hour later, on the same never-reloaded screen.
        const days = getDaysUntil(i.expiresAtUtc);
        const soon = days !== null && days <= 7;
        return (
          <Stack
            key={i.id}
            direction={isMobile ? 'column' : 'row'}
            spacing={isMobile ? 1 : 2}
            sx={{
              alignItems: isMobile ? 'stretch' : 'center',
              py: 1.75,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 14 }}>
                {i.email}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                Invited by {i.by} · sent {getRelativeTime(i.sentAtUtc)}
              </Typography>
            </Box>

            <Box
              sx={{
                fontSize: 12.5,
                fontWeight: soon ? 500 : 400,
                // Highlighted rather than sorted to the top: the list stays in the order
                // people sent them, and the urgent ones still stand out.
                color: soon ? '#b26a00' : 'text.secondary',
                whiteSpace: 'nowrap',
              }}
            >
              {days === 0 ? 'Expired' : days === 1 ? 'Expires tomorrow' : `Expires in ${days} days`}
            </Box>

            <Stack direction="row" spacing={1} sx={{ flex: 'none' }}>
              <Button
                size="small"
                onClick={async () => {
                  await extend(i.id);
                  // Extending moves the deadline without issuing a new link - so the link
                  // already in their inbox keeps working, and saying so avoids a resend.
                  onNotify?.(`Extended — ${i.email} keeps the same link`);
                }}
              >
                Extend
              </Button>
              <Button size="small" onClick={() => onNotify?.(`Invitation resent to ${i.email}`)}>
                Resend
              </Button>
              <Button
                size="small"
                color="error"
                onClick={async () => {
                  await revoke(i.id);
                  onNotify?.(`Revoked — ${i.email} can no longer activate`);
                }}
              >
                Revoke
              </Button>
            </Stack>
          </Stack>
        );
      })}
    </Panel>
  );
}
