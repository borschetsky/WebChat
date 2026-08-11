import { Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AdminIcon from './AdminIcon';

/**
 * One audit entry. The icon and its colour carry the kind, so a page of entries can be
 * scanned for the destructive ones without reading a word.
 */
const STYLE = {
  block: ['block', '#d32f2f'],
  deactivate: ['person_remove', '#d32f2f'],
  login: ['gpp_maybe', '#ef6c00'],
  invite: ['mail', '#1976d2'],
  role: ['admin_panel_settings', '#7b1fa2'],
  policy: ['policy', '#00838f'],
  activate: ['task_alt', '#2e7d32'],
};

export default function AuditRow({ entry, compact = false }) {
  const [icon, color] = STYLE[entry.kind] ?? STYLE.policy;

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
        <Typography sx={{ fontSize: 14 }}>{entry.text}</Typography>
        {!compact && (
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
            {entry.meta}
          </Typography>
        )}
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
        {entry.time}
      </Typography>
    </Stack>
  );
}
