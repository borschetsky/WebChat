import { Box, Stack, Typography } from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import ScheduleIcon from '@mui/icons-material/Schedule';
import BlockIcon from '@mui/icons-material/Block';
import { useGetOverviewQuery } from '@/app/api/adminApi';
import AuditRow from '../AuditRow';
import Panel from '../Panel';

const STAT_ICON = {
  group: GroupIcon,
  task_alt: TaskAltIcon,
  schedule: ScheduleIcon,
  block: BlockIcon,
};

/**
 * Four stat cards, a 14-day message-volume chart, an activation funnel, and recent activity.
 *
 * Every stat card is a link into the members table with the matching filter applied - a
 * number you cannot act on is decoration.
 */
export default function AdminOverview({ isMobile, onNavigate }) {
  const { data } = useGetOverviewQuery();
  if (!data) return null;

  const pct = (n) => (data.total ? Math.round((n / data.total) * 100) : 0);

  const stats = [
    {
      label: 'Total accounts',
      value: data.total,
      icon: 'group',
      color: 'primary.main',
      hint: '+3 in the last 30 days',
      filter: 'all',
    },
    {
      label: 'Active',
      value: data.active,
      icon: 'task_alt',
      color: '#2e7d32',
      hint: `${pct(data.active)}% of accounts`,
      filter: 'active',
    },
    {
      label: 'Awaiting activation',
      value: data.pending,
      icon: 'schedule',
      color: '#f9a825',
      hint: data.pending > 0 ? '2 expire within a week' : 'Nothing outstanding',
      filter: 'pending',
    },
    {
      label: 'Blocked or off',
      value: data.blocked,
      icon: 'block',
      color: 'error.main',
      hint: 'Sign-in refused',
      filter: 'blocked',
    },
  ];

  const funnel = [
    { label: 'Activated', value: data.active, color: '#2e7d32' },
    { label: 'Invited, not yet activated', value: data.pending, color: '#f9a825' },
    { label: 'Blocked or deactivated', value: data.blocked, color: '#d32f2f' },
  ];

  const chartMax = Math.max(...data.chart.map((b) => b.value), 1);

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? 'repeat(2,minmax(0,1fr))'
            : 'repeat(auto-fit,minmax(210px,1fr))',
          gap: isMobile ? 1.25 : 2,
        }}
      >
        {stats.map((s) => {
          const Icon = STAT_ICON[s.icon];
          return (
            <Box
              key={s.label}
              component="button"
              type="button"
              onClick={() => onNavigate('members')}
              sx={{
                textAlign: 'left',
                cursor: 'pointer',
                p: isMobile ? '14px 14px 15px' : '18px 20px 19px',
                borderRadius: '14px',
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                minWidth: 0,
                font: 'inherit',
                color: 'inherit',
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <Stack
                direction="row"
                spacing={1.125}
                sx={{
                  alignItems: 'flex-start',
                  fontSize: 12.5,
                  lineHeight: 1.3,
                  color: 'text.secondary',
                  minWidth: 0,
                }}
              >
                <Icon sx={{ fontSize: 18, color: s.color, flex: 'none' }} />
                <Box sx={{ minWidth: 0 }}>{s.label}</Box>
              </Stack>
              <Box
                sx={{
                  fontSize: isMobile ? 30 : 34,
                  fontWeight: 300,
                  letterSpacing: '-.02em',
                  mt: 1,
                  lineHeight: 1,
                }}
              >
                {s.value}
              </Box>
              <Box sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.875, lineHeight: 1.4 }}>
                {s.hint}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.35fr) minmax(0,1fr)',
          gap: 2,
          mt: 2,
        }}
      >
        <Panel sx={{ p: '22px 24px 18px' }}>
          <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1.25 }}>
            <Typography sx={{ flex: 1, fontSize: 15, fontWeight: 500 }}>Messages sent</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Last 14 days</Typography>
          </Stack>
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ alignItems: 'flex-end', height: 150, mt: 2.75 }}
          >
            {data.chart.map((b, i) => (
              <Stack
                key={i}
                title={`${b.value} messages`}
                sx={{
                  flex: 1,
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 0.875,
                  height: '100%',
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    height: `${Math.round((b.value / chartMax) * 100)}%`,
                    borderRadius: '5px 5px 2px 2px',
                    // The newest bar is the one being read; the rest are context.
                    bgcolor: (t) =>
                      i === data.chart.length - 1
                        ? t.palette.primary.main
                        : t.palette.mode === 'dark'
                          ? '#31414f'
                          : '#cfe3f7',
                  }}
                />
                <Box sx={{ fontSize: 10, color: 'text.disabled' }}>{b.day}</Box>
              </Stack>
            ))}
          </Stack>
        </Panel>

        <Panel sx={{ p: '22px 24px' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 500, mb: 0.5 }}>Activation</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 2.25 }}>
            Where invited people stand
          </Typography>
          {funnel.map((f) => (
            <Box key={f.label} sx={{ mb: 2 }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'baseline', fontSize: 13, mb: 0.75 }}
              >
                <Box sx={{ flex: 1, color: 'text.secondary' }}>{f.label}</Box>
                <Box sx={{ fontWeight: 500 }}>{f.value}</Box>
                <Box sx={{ fontSize: 12, color: 'text.disabled' }}>{pct(f.value)}%</Box>
              </Stack>
              <Box
                sx={{ height: 7, borderRadius: 1, bgcolor: 'background.field', overflow: 'hidden' }}
              >
                <Box
                  sx={{
                    height: '100%',
                    width: `${pct(f.value)}%`,
                    borderRadius: 1,
                    bgcolor: f.color,
                  }}
                />
              </Box>
            </Box>
          ))}
          <Box
            sx={{
              mt: 2.75,
              pt: 2,
              borderTop: 1,
              borderColor: 'divider',
              fontSize: 13,
              color: 'text.secondary',
              lineHeight: 1.55,
            }}
          >
            {data.pending} people have an open invitation. Two expire within seven days — extend
            them from the Invitations tab before they lapse.
          </Box>
        </Panel>
      </Box>

      <Panel sx={{ mt: 2, p: '22px 24px' }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 0.75 }}>
          <Typography sx={{ flex: 1, fontSize: 15, fontWeight: 500 }}>
            Recent admin activity
          </Typography>
          <Box
            component="button"
            type="button"
            onClick={() => onNavigate('audit')}
            sx={{
              cursor: 'pointer',
              border: 0,
              bgcolor: 'transparent',
              font: 'inherit',
              fontSize: 13,
              fontWeight: 500,
              color: 'primary.main',
            }}
          >
            View audit log
          </Box>
        </Stack>
        {data.recentAudit.map((a) => (
          <AuditRow key={a.id} entry={a} compact />
        ))}
      </Panel>
    </>
  );
}
