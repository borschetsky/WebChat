import React, { useState } from 'react';
import { Box, Snackbar, Stack, Typography, useMediaQuery } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ShieldPersonIcon from '@mui/icons-material/AdminPanelSettings';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchField from '@/components/SearchField';
import PresenceAvatar from '@/components/PresenceAvatar';
import { ADMIN_NAV, navBadge } from './adminNav';
import AdminIcon from './AdminIcon';
import AdminOverview from './sections/AdminOverview';
import AdminMembers from './sections/AdminMembers';
import AdminInvitations from './sections/AdminInvitations';
import AdminErrors from './sections/AdminErrors';
import AdminAuditLog from './sections/AdminAuditLog';
import AdminPolicies from './sections/AdminPolicies';
import InviteDialog from './InviteDialog';
import { useGetErrorsQuery, useGetInvitesQuery } from '@/app/api/adminApi';

const SECTIONS = {
  overview: AdminOverview,
  members: AdminMembers,
  invites: AdminInvitations,
  errors: AdminErrors,
  audit: AdminAuditLog,
  policies: AdminPolicies,
};

/**
 * The admin console: a left rail on desktop, bottom navigation below 600px.
 *
 * Reached from Profile & settings → Workspace → Admin console, at its own route rather than
 * a persistent rail icon in the chat app - the spec's reasoning is that a rare,
 * high-consequence destination should not compete with chat's primary actions.
 *
 * Every section here is served from mocks (`services/admin-mocks.ts`); the only real thing
 * on this screen is the workspace role that gates reaching it at all. See #64.
 */
export default function AdminConsole({ profile }) {
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width:600px)');

  const [tab, setTab] = useState('overview');
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [snack, setSnack] = useState('');

  // Only for the badges. Each section fetches what it renders itself.
  const { data: invites = [] } = useGetInvitesQuery();
  const { data: errors = [] } = useGetErrorsQuery();

  const item = ADMIN_NAV.find((n) => n.key === tab) ?? ADMIN_NAV[0];
  const Section = SECTIONS[tab];

  const select = (key) => {
    setTab(key);
    // Search is per-section, so carrying a term across would filter a list the user never
    // typed it for.
    setQuery('');
  };

  const rail = (
    <Stack
      sx={{
        width: 248,
        flex: 'none',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      <Stack direction="row" spacing={1.375} sx={{ alignItems: 'center', p: '20px 20px 22px' }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: '9px',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShieldPersonIcon sx={{ fontSize: 20 }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 500, lineHeight: 1.2 }}>
            WebChat Admin
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            chat.vtechsolutions.site
          </Typography>
        </Box>
      </Stack>

      <Stack spacing="2px" sx={{ px: 1.5 }}>
        {ADMIN_NAV.map((n) => {
          const active = n.key === tab;
          const count = navBadge(n.key, invites, errors);
          return (
            <Stack
              key={n.key}
              component="button"
              type="button"
              direction="row"
              spacing={1.625}
              aria-current={active ? 'page' : undefined}
              onClick={() => select(n.key)}
              sx={{
                alignItems: 'center',
                height: 44,
                px: 1.75,
                borderRadius: '10px',
                cursor: 'pointer',
                border: 0,
                font: 'inherit',
                textAlign: 'left',
                bgcolor: active ? 'background.selected' : 'transparent',
                color: active ? 'primary.main' : 'text.secondary',
                '&:hover': { bgcolor: active ? 'background.selected' : 'action.hover' },
              }}
            >
              <AdminIcon name={n.icon} sx={{ fontSize: 21 }} />
              <Box sx={{ flex: 1, fontSize: 14, fontWeight: active ? 500 : 400 }}>{n.label}</Box>
              {count > 0 && (
                <Box
                  sx={{
                    minWidth: 22,
                    height: 20,
                    px: 0.875,
                    borderRadius: '10px',
                    bgcolor: active ? 'primary.main' : 'background.field',
                    color: active ? 'primary.contrastText' : 'text.secondary',
                    fontSize: 11,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {count}
                </Box>
              )}
            </Stack>
          );
        })}
      </Stack>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Stack
          component="button"
          type="button"
          direction="row"
          spacing={1.625}
          onClick={() => navigate('/dashboard')}
          sx={{
            alignItems: 'center',
            width: '100%',
            height: 42,
            px: 1.75,
            borderRadius: '10px',
            border: 0,
            bgcolor: 'transparent',
            color: 'text.secondary',
            font: 'inherit',
            fontSize: 14,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <ArrowBackIcon sx={{ fontSize: 20 }} />
          Back to chat
        </Stack>

        <Stack direction="row" spacing={1.375} sx={{ alignItems: 'center', p: '10px 14px 4px' }}>
          <PresenceAvatar
            name={profile?.name ?? ''}
            color={profile?.color}
            avatarFileName={profile?.avatarFileName}
            size={32}
            showPresence={false}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 500 }}>
              {profile?.name}
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'capitalize' }}>
              {profile?.role}
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Stack>
  );

  return (
    <Stack direction="row" sx={{ height: '100vh', bgcolor: 'background.default' }}>
      {!isMobile && rail}

      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction="row"
          useFlexGap
          sx={{
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px 16px',
            p: isMobile ? '14px 16px 13px' : '20px 28px 18px',
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 150 }}>
            <Typography sx={{ fontSize: isMobile ? 18 : 22, fontWeight: 500, lineHeight: 1.25 }}>
              {item.title}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: '2px' }}>
              {subtitleFor(tab, { invites, errors })}
            </Typography>
          </Box>

          {!isMobile && item.searchHint && (
            <Box sx={{ width: 300 }}>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder={item.searchHint}
                label={item.searchHint}
                height={42}
              />
            </Box>
          )}

          <Stack
            component="button"
            type="button"
            direction="row"
            spacing={1}
            onClick={() => setInviteOpen(true)}
            sx={{
              alignItems: 'center',
              justifyContent: 'center',
              height: 42,
              px: isMobile ? 0 : 2.5,
              width: isMobile ? 42 : 'auto',
              borderRadius: isMobile ? '50%' : '21px',
              border: 0,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              font: 'inherit',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              flex: 'none',
              boxShadow: (t) => t.custom.depth1,
            }}
          >
            <PersonAddIcon sx={{ fontSize: 19 }} />
            {!isMobile && 'Invite people'}
          </Stack>
        </Stack>

        {isMobile && item.searchHint && (
          <Box
            sx={{
              p: '12px 16px',
              bgcolor: 'background.paper',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={item.searchHint}
              label={item.searchHint}
              height={42}
            />
          </Box>
        )}

        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: isMobile ? '16px 16px 96px' : '24px 28px 40px',
          }}
        >
          <Section
            query={query}
            isMobile={isMobile}
            onNavigate={select}
            onNotify={setSnack}
            onInvite={() => setInviteOpen(true)}
          />
        </Box>

        {isMobile && (
          <Stack
            direction="row"
            sx={{
              flex: 'none',
              borderTop: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              position: 'sticky',
              bottom: 0,
            }}
          >
            {ADMIN_NAV.map((n) => {
              const active = n.key === tab;
              const count = navBadge(n.key, invites, errors);
              return (
                <Stack
                  key={n.key}
                  component="button"
                  type="button"
                  onClick={() => select(n.key)}
                  sx={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.25,
                    py: 1,
                    border: 0,
                    bgcolor: 'transparent',
                    color: active ? 'primary.main' : 'text.secondary',
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                >
                  <Box sx={{ position: 'relative', display: 'flex' }}>
                    <AdminIcon name={n.icon} sx={{ fontSize: 22 }} />
                    {count > 0 && (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: -4,
                          right: -8,
                          minWidth: 16,
                          height: 16,
                          px: 0.5,
                          borderRadius: 8,
                          bgcolor: 'error.main',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {count}
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ fontSize: 11, fontWeight: active ? 500 : 400 }}>{n.short}</Box>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Stack>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSent={setSnack}
        fullScreen={isMobile}
      />

      <AdminSnackbar message={snack} onClose={() => setSnack('')} />
    </Stack>
  );
}

/** Each section's one-line summary, which the design puts under the title. */
function subtitleFor(tab, { invites, errors }) {
  const unresolved = errors.filter((e) => e.status !== 'resolved').length;
  switch (tab) {
    case 'overview':
      return 'How the workspace is doing';
    case 'members':
      return 'Everyone with an account';
    case 'invites':
      return `${invites.length} outstanding · 30-day expiry`;
    case 'errors':
      return `${unresolved} unresolved · grouped by fingerprint`;
    case 'audit':
      return 'Every administrative action, newest first';
    case 'policies':
      return 'Membership, messaging and security';
    default:
      return '';
  }
}

function AdminSnackbar({ message, onClose }) {
  return (
    <Snackbar
      open={!!message}
      message={message}
      autoHideDuration={4000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />
  );
}
