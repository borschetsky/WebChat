import { Chip } from '@mui/material';

/**
 * The four account statuses, which the spec insists are genuinely distinct and must not be
 * collapsed - "blocked" keeps the account and its history, "deactivated" is an offboarding.
 * Colour carries the distinction; the label states it.
 */
const STYLE = {
  active: { label: 'Active', fg: '#2e7d32', bg: 'rgba(46,125,50,.12)' },
  pending: { label: 'Pending', fg: '#b26a00', bg: 'rgba(249,168,37,.16)' },
  blocked: { label: 'Blocked', fg: '#d32f2f', bg: 'rgba(211,47,47,.12)' },
  deactivated: { label: 'Deactivated', fg: '#5f6368', bg: 'rgba(95,99,104,.14)' },
};

export default function StatusChip({ status }) {
  const s = STYLE[status] ?? STYLE.active;
  return (
    <Chip
      label={s.label}
      size="small"
      sx={{ height: 22, fontSize: 11.5, color: s.fg, bgcolor: s.bg }}
    />
  );
}
