import { useEffect, useState } from 'react';
import { Box, Button, Chip, Drawer, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useGetErrorsQuery, useSetErrorStatusMutation } from '@/app/api/adminApi';
import { getRelativeTime } from '@/lib/date-time-format';
import Panel from '../Panel';

const LEVELS = {
  fatal: { label: 'Fatal', color: '#b3261e' },
  error: { label: 'Error', color: '#d32f2f' },
  warning: { label: 'Warning', color: '#f9a825' },
};

const FILTERS = [
  ['unresolved', 'Unresolved'],
  ['all', 'All'],
  ['resolved', 'Resolved'],
];

/**
 * One row per **fingerprint** - component + function + error name - never the raw message.
 *
 * That distinction is the whole design: a message with an interpolated value in it would
 * open a new issue on every occurrence, and the list would become a log rather than a set
 * of problems worth fixing.
 */
export default function AdminErrors({
  query,
  isMobile,
  onNotify,
  onModalOpenChange,
  disableEnforceFocus,
}) {
  const { data: errors = [] } = useGetErrorsQuery();
  const [setStatus] = useSetErrorStatusMutation();
  const [filter, setFilter] = useState('unresolved');
  const [openId, setOpenId] = useState(null);

  // The console owns the toast and cannot see this drawer, which is the third focus trap on
  // the screen and the one #102 nearly missed. Same report-up as AdminMembers.
  useEffect(() => {
    onModalOpenChange?.(!!openId);
    return () => onModalOpenChange?.(false);
  }, [openId, onModalOpenChange]);

  const q = query.trim().toLowerCase();
  const rows = errors
    .filter((e) =>
      filter === 'all'
        ? true
        : filter === 'resolved'
          ? e.status === 'resolved'
          : e.status !== 'resolved',
    )
    .filter((e) => (q ? `${e.name} ${e.message} ${e.culprit}`.toLowerCase().includes(q) : true));

  const open = errors.find((e) => e.id === openId) ?? null;

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {FILTERS.map(([key, label]) => (
          <Chip
            key={key}
            label={label}
            onClick={() => setFilter(key)}
            variant={filter === key ? 'filled' : 'outlined'}
            color={filter === key ? 'primary' : 'default'}
            size="small"
          />
        ))}
      </Stack>

      <Panel sx={{ p: isMobile ? '4px 12px 12px' : '4px 20px 12px' }}>
        {rows.map((e) => {
          const level = LEVELS[e.level] ?? LEVELS.error;
          const max = Math.max(...e.spark, 1);
          return (
            <Stack
              key={e.id}
              component="button"
              type="button"
              direction="row"
              spacing={2}
              onClick={() => setOpenId(e.id)}
              sx={{
                alignItems: 'center',
                width: '100%',
                py: 1.75,
                borderBottom: 1,
                borderColor: 'divider',
                border: 0,
                bgcolor: 'transparent',
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: level.color,
                      flex: 'none',
                    }}
                  />
                  <Typography noWrap sx={{ fontSize: 14, fontWeight: 500 }}>
                    {e.name}
                  </Typography>
                  {e.status === 'resolved' && (
                    <Chip label="Resolved" size="small" sx={{ height: 18, fontSize: 10.5 }} />
                  )}
                </Stack>
                <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25 }}>
                  {e.message}
                </Typography>
                <Typography noWrap sx={{ fontSize: 11.5, color: 'text.disabled', mt: 0.25 }}>
                  {e.culprit} · {e.release}
                </Typography>
              </Box>

              {!isMobile && (
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ alignItems: 'flex-end', height: 30, flex: 'none' }}
                >
                  {e.spark.map((v, i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 3,
                        height: `${Math.max(2, Math.round((v / max) * 100))}%`,
                        borderRadius: 1,
                        bgcolor: level.color,
                        opacity: 0.55,
                      }}
                    />
                  ))}
                </Stack>
              )}

              <Box sx={{ width: 74, flex: 'none', textAlign: 'right' }}>
                <Typography sx={{ fontSize: 14 }}>{e.events}</Typography>
                <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                  {e.users} users
                </Typography>
              </Box>
            </Stack>
          );
        })}

        {rows.length === 0 && (
          <Typography sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
            Nothing here.
          </Typography>
        )}
      </Panel>

      <Drawer
        anchor="right"
        open={!!open}
        onClose={() => setOpenId(null)}
        // While a toast is up, stop the trap pulling focus back off it - see `AppSnackbar`
        // and issues #96 and #102.
        disableEnforceFocus={disableEnforceFocus}
        slotProps={{ paper: { sx: { width: isMobile ? '100%' : 460 } } }}
      >
        {open && (
          <>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: 'center', p: 1.75, borderBottom: 1, borderColor: 'divider' }}
            >
              <Typography sx={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{open.name}</Typography>
              <IconButton onClick={() => setOpenId(null)} aria-label="Close error details">
                <CloseIcon />
              </IconButton>
            </Stack>

            <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2 }}>
              <Typography sx={{ fontSize: 13.5, mb: 2 }}>{open.message}</Typography>

              {[
                ['Where', open.culprit],
                ['Route', open.route],
                ['Release', open.release],
                ['Events', `${open.events} · ${open.users} users`],
                ['First seen', getRelativeTime(open.firstSeenUtc)],
                ['Last seen', getRelativeTime(open.lastSeenUtc)],
                ['Browsers', open.browsers],
              ].map(([k, v]) => (
                <Stack
                  key={k}
                  direction="row"
                  spacing={2}
                  sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}
                >
                  <Typography sx={{ flex: 1, fontSize: 12.5, color: 'text.secondary' }}>
                    {k}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, textAlign: 'right' }}>{v}</Typography>
                </Stack>
              ))}

              <Typography sx={{ fontSize: 13, fontWeight: 500, mt: 3, mb: 1 }}>
                Stack trace
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: 'background.field',
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  overflowX: 'auto',
                }}
              >
                {open.stack.join('\n')}
              </Box>

              <Typography sx={{ fontSize: 13, fontWeight: 500, mt: 3, mb: 1 }}>
                Breadcrumbs
              </Typography>
              {open.crumbs.map((c, i) => (
                <Stack key={i} direction="row" spacing={1.5} sx={{ py: 0.75, fontSize: 12 }}>
                  <Box sx={{ color: 'text.disabled', flex: 'none' }}>{c.t}</Box>
                  <Box sx={{ color: 'text.secondary', width: 72, flex: 'none' }}>{c.k}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>{c.v}</Box>
                </Stack>
              ))}

              <Button
                fullWidth
                variant="outlined"
                sx={{ mt: 3 }}
                onClick={async () => {
                  const next = open.status === 'resolved' ? 'acknowledged' : 'resolved';
                  await setStatus({ id: open.id, status: next });
                  onNotify?.(
                    next === 'resolved' ? `${open.name} marked resolved` : `${open.name} reopened`,
                  );
                }}
              >
                {open.status === 'resolved' ? 'Reopen' : 'Mark resolved'}
              </Button>
            </Box>
          </>
        )}
      </Drawer>
    </>
  );
}
