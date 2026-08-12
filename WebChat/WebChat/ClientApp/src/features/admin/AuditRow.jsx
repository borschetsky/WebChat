import { Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { getRelativeTime } from '@/lib/date-time-format';
import AdminIcon from './AdminIcon';
import { auditMeta, auditSentence } from './auditSentence';

/**
 * One audit entry. The icon and its colour carry the kind, so a page of entries can be
 * scanned for the destructive ones without reading a word.
 *
 * The wording is built here from the entry's facts rather than read off it - see
 * `auditSentence.ts`. The timestamp likewise: this screen is one people leave open, and a
 * pre-formatted "2 h ago" would still say that at closing time.
 */
const STYLE = {
  block: ['block', '#d32f2f'],
  unblock: ['task_alt', '#2e7d32'],
  deactivate: ['person_remove', '#d32f2f'],
  login: ['gpp_maybe', '#ef6c00'],
  invite: ['mail', '#1976d2'],
  role: ['admin_panel_settings', '#7b1fa2'],
  policy: ['policy', '#00838f'],
  activate: ['task_alt', '#2e7d32'],
};

export default function AuditRow({ entry, compact = false }) {
  const [icon, color] = STYLE[entry.kind] ?? STYLE.policy;
  const meta = auditMeta(entry);

  return (
    <Stack
      direction="row"
      spacing={1.75}
      sx={{ alignItems: 'center', py: 1.375, borderBottom: 1, borderColor: 'divider' }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          flex: 'none',
          borderRadius: '50%',
          bgcolor: alpha(color, 0.12),
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AdminIcon name={icon} sx={{ fontSize: 18 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14 }}>{auditSentence(entry)}</Typography>
        {!compact && meta && (
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>{meta}</Typography>
        )}
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
        {getRelativeTime(entry.occurredAtUtc)}
      </Typography>
    </Stack>
  );
}
