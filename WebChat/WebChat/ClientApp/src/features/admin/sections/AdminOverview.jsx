import { Box, Stack, Typography } from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import ScheduleIcon from '@mui/icons-material/Schedule';
import BlockIcon from '@mui/icons-material/Block';
import { useGetAuditQuery, useGetOverviewQuery } from '@/app/api/adminApi';
import AuditRow from '../AuditRow';
import Panel from '../Panel';

/**
 * The funnel's wording and colour, keyed by the stage the server sends.
 *
 * Keys cross the wire, labels do not - the same rule as system messages and audit entries.
 * A stage the server sends that this build has no entry for renders with its raw key rather
 * than vanishing, so a client one deploy behind shows something odd instead of a funnel
 * that quietly loses a bar.
 */
const FUNNEL_STAGE = {
  registered: { label: 'Registered', color: '#1976d2' },
  confirmed: { label: 'Confirmed their address', color: '#00838f' },
  joined: { label: 'In a conversation', color: '#2e7d32' },
  wrote: { label: 'Sent a message', color: '#7b1fa2' },
};

/**
 * "M", "T", "W" … from an instant.
 *
 * Derived here rather than sent, for the same reason every other timestamp on this screen
 * is: the server does not know the reader's timezone, and a letter computed in UTC is wrong
 * for anyone who is not.
 */
const weekdayLetter = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { weekday: 'narrow' });
};

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

  // Real, unlike everything else on this screen (#70). Asking for a few more than are shown
  // is pointless, so the page size is the row count - and the audit log is the one section
  // where "just fetch them all" would be genuinely unbounded.
  const { data: recent = [] } = useGetAuditQuery({ limit: 6 });

  if (!data) return null;

  const pct = (n) => (data.total ? Math.round((n / data.total) * 100) : 0);

  const stats = [
    {
      label: 'Total accounts',
      value: data.total,
      icon: 'group',
      color: 'primary.main',
      // Counted, not asserted. This read "+3 in the last 30 days" as a literal - the worst
      // kind of fiction on a dashboard, because it is specific, plausible, and nobody
      // cross-checks a stat card.
      hint:
        data.joinedRecently > 0
          ? `+${data.joinedRecently} in the last 30 days`
          : 'None in the last 30 days',
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
      hint:
        data.expiringSoon > 0
          ? `${data.expiringSoon} expire${data.expiringSoon === 1 ? 's' : ''} within a week`
          : 'Nothing expiring soon',
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

  // A real funnel now, not a status breakdown. Each stage is a subset of the one above, so
  // the bars mean "how far people get" - the question this panel is for. The old version
  // split accounts by status, which the members table answers better and which produced
  // three bars that could not be compared to each other at all.
  //
  // Percentages are of the widest stage rather than of the total, so the first bar is always
  // full and each one after it reads as the share that survived.
  const funnel = data.funnel.map((stage) => ({
    label: stage.key,
    color: 'text.disabled',
    ...stage,
    ...FUNNEL_STAGE[stage.key],
  }));

  const funnelMax = Math.max(...data.funnel.map((s) => s.value), 1);

  /** Share of the widest funnel stage, so the first bar is always full. */
  const share = (n) => Math.round((n / funnelMax) * 100);

  const chartMax = Math.max(...data.chart.map((b) => b.value), 1);

  // Counted, like everything else here. This sentence used to end "Two expire within seven
  // days" as a literal, next to a number that was real - which is worse than a wholly made-up
  // panel, because the true half lends the invented half its credibility.
  const footnote =
    data.pending === 0
      ? 'Nobody has an invitation outstanding.'
      : `${data.pending} ${data.pending === 1 ? 'person has' : 'people have'} an open invitation. ` +
        (data.expiringSoon === 0
          ? 'None expire in the next seven days.'
          : `${data.expiringSoon} ${data.expiringSoon === 1 ? 'expires' : 'expire'} within seven days — extend ${data.expiringSoon === 1 ? 'it' : 'them'} from the Invitations tab before ${data.expiringSoon === 1 ? 'it lapses' : 'they lapse'}.`);

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
                <Box sx={{ fontSize: 10, color: 'text.disabled' }}>{weekdayLetter(b.dayUtc)}</Box>
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
            <Box key={f.key} sx={{ mb: 2 }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'baseline', fontSize: 13, mb: 0.75 }}
              >
                <Box sx={{ flex: 1, color: 'text.secondary' }}>{f.label}</Box>
                <Box sx={{ fontWeight: 500 }}>{f.value}</Box>
                <Box sx={{ fontSize: 12, color: 'text.disabled' }}>{share(f.value)}%</Box>
              </Stack>
              <Box
                sx={{ height: 7, borderRadius: 1, bgcolor: 'background.field', overflow: 'hidden' }}
              >
                <Box
                  sx={{
                    height: '100%',
                    width: `${share(f.value)}%`,
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
            {footnote}
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
        {recent.map((a) => (
          <AuditRow key={a.id} entry={a} compact />
        ))}
        {recent.length === 0 && (
          <Typography sx={{ py: 3, fontSize: 13, color: 'text.secondary' }}>
            Nothing administrative has happened yet.
          </Typography>
        )}
      </Panel>
    </>
  );
}
