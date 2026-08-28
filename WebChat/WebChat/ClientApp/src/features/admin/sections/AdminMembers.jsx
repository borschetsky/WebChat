import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, Chip, Stack, Typography } from '@mui/material';
import PresenceAvatar from '@/components/PresenceAvatar';
import { avatarColor } from '@/theme/tokens';
import { getRelativeTime } from '@/lib/date-time-format';
import { ROLE_LABEL } from '@/types/admin';
import { errorMessage } from '../adminErrors';
import { useGetMembersQuery, useSetMemberStatusMutation } from '@/app/api/adminApi';
import Panel from '../Panel';
import StatusChip from '../StatusChip';
import MemberDetail from '../MemberDetail';

const FILTERS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['pending', 'Pending'],
  ['blocked', 'Blocked'],
  ['deactivated', 'Deactivated'],
];

/**
 * The core table: avatar, name, email, role, status, last active.
 *
 * Multi-select with a bulk action bar is **desktop only** - the spec is explicit, and the
 * reason is sound: a mis-tap that blocks eleven people is not a mistake worth making
 * possible on a phone.
 */
export default function AdminMembers({
  query,
  isMobile,
  onNotify,
  onModalOpenChange,
  disableEnforceFocus,
}) {
  const { data: members = [] } = useGetMembersQuery();
  const [setStatus] = useSetMemberStatusMutation();

  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState([]);
  const [detailId, setDetailId] = useState(null);

  // The console owns the toast and has to know whether anything is trapping focus, and only
  // this section knows about its own drawer. The cleanup covers leaving the section with the
  // drawer open - the modal goes with the unmount, so the flag must too.
  useEffect(() => {
    onModalOpenChange?.(!!detailId);
    return () => onModalOpenChange?.(false);
  }, [detailId, onModalOpenChange]);

  const q = query.trim().toLowerCase();
  const rows = members
    .filter((m) => (filter === 'all' ? true : m.status === filter))
    .filter((m) =>
      q ? m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) : true,
    );

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const bulk = async (status, verb) => {
    const result = await setStatus({ ids: selected, status });

    if (result?.error) {
      // The selection is kept on a refusal. The server rejects a batch whole - one owner,
      // or the caller's own account, stops all of it - so the fix is to deselect the one
      // that caused it, which is impossible if the selection has just been cleared.
      onNotify?.(errorMessage(result.error));
      return;
    }

    onNotify?.(`${verb} ${selected.length === 1 ? '1 member' : `${selected.length} members`}`);
    setSelected([]);
  };

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        {FILTERS.map(([key, label]) => (
          <Chip
            key={key}
            label={label}
            onClick={() => {
              setFilter(key);
              setSelected([]);
            }}
            variant={filter === key ? 'filled' : 'outlined'}
            color={filter === key ? 'primary' : 'default'}
            size="small"
          />
        ))}
      </Stack>

      {!isMobile && selected.length > 0 && (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: 'center',
            mb: 2,
            p: '10px 16px',
            borderRadius: '12px',
            bgcolor: 'background.selected',
          }}
        >
          <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
            {selected.length} selected
          </Typography>
          <Button size="small" onClick={() => bulk('active', 'Unblocked')}>
            Unblock
          </Button>
          <Button size="small" color="error" onClick={() => bulk('blocked', 'Blocked')}>
            Block
          </Button>
          <Button size="small" onClick={() => setSelected([])}>
            Clear
          </Button>
        </Stack>
      )}

      <Panel sx={{ p: isMobile ? '4px 12px 12px' : '4px 20px 12px' }}>
        {rows.map((m) => (
          <Stack
            key={m.id}
            direction="row"
            spacing={1.5}
            sx={{
              alignItems: 'center',
              py: isMobile ? 1.5 : 1.25,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            {!isMobile && (
              <Checkbox
                size="small"
                checked={selected.includes(m.id)}
                onChange={() => toggle(m.id)}
                // slotProps, not inputProps - v9 drops the latter silently, and this bare
                // checkbox has no label element to fall back on.
                slotProps={{ input: { 'aria-label': `Select ${m.name}` } }}
              />
            )}

            <PresenceAvatar
              name={m.name}
              color={avatarColor(m.id)}
              avatarFileName={m.avatarFileName}
              presence={m.online ? 'online' : 'offline'}
              size={36}
            />

            <Box
              component="button"
              type="button"
              onClick={() => setDetailId(m.id)}
              sx={{
                flex: 1,
                minWidth: 0,
                textAlign: 'left',
                border: 0,
                bgcolor: 'transparent',
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography noWrap sx={{ fontSize: 14 }}>
                  {m.name}
                </Typography>
                {m.role !== 'member' && (
                  <Chip label={ROLE_LABEL[m.role]} size="small" sx={{ height: 19, fontSize: 11 }} />
                )}
              </Stack>
              <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
                {m.email}
              </Typography>
            </Box>

            {!isMobile && (
              <Typography sx={{ width: 110, fontSize: 12.5, color: 'text.secondary' }}>
                {getRelativeTime(m.lastActiveUtc) || '—'}
              </Typography>
            )}

            <StatusChip status={m.status} />
          </Stack>
        ))}

        {rows.length === 0 && (
          <Typography sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
            No member matches {q ? `“${query}”` : 'this filter'}.
          </Typography>
        )}
      </Panel>

      <MemberDetail
        member={members.find((m) => m.id === detailId) ?? null}
        onClose={() => setDetailId(null)}
        onNotify={onNotify}
        fullWidth={isMobile}
        disableEnforceFocus={disableEnforceFocus}
      />
    </>
  );
}
