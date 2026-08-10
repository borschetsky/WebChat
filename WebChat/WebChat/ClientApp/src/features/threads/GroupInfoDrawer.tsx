import { useState } from 'react';
import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import LockIcon from '@mui/icons-material/Lock';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import ShieldPersonIcon from '@mui/icons-material/AdminPanelSettings';
import RemoveModeratorIcon from '@mui/icons-material/RemoveModerator';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import PresenceAvatar from '@/components/PresenceAvatar';
import AvatarStack from '@/components/AvatarStack';
import SectionLabel from '@/components/SectionLabel';
import {
  can,
  canManageRoles,
  isLastAdmin,
  memberActions,
  ownsGroup,
  renameLockText,
  ruleLabel,
} from './groupPermissions';
import type { MemberAction } from './groupPermissions';
import type { SxProps, Theme } from '@mui/material/styles';
import type { Group, GroupMember, PermRule } from '@/types/models';

// Not SxProps: that type already includes arrays, and nesting one inside the array form
// below is what MUI's overloads reject.
type SxEntry = Exclude<SxProps<Theme>, readonly unknown[]>;

const ROLE_CHIP: Record<string, { label: string; sx: SxEntry }> = {
  owner: {
    label: 'Owner',
    // The one pair of colours in the drawer that are not palette tokens. The handoff gives
    // them per mode for the owner chip specifically, so they are reproduced verbatim rather
    // than approximated with `warning`.
    sx: (theme: Theme) => ({
      bgcolor: theme.palette.mode === 'dark' ? '#3a2f16' : '#fef4e0',
      color: theme.palette.mode === 'dark' ? '#ffd08a' : '#8a5c00',
    }),
  },
  admin: {
    label: 'Admin',
    sx: { bgcolor: 'background.selected', color: 'primary.main' },
  },
};

const PERM_ROWS: { key: 'rename' | 'invite' | 'remove'; label: string; hint: string }[] = [
  { key: 'rename', label: 'Rename the group', hint: 'Change the name and photo' },
  { key: 'invite', label: 'Add members', hint: 'Bring new people into the conversation' },
  { key: 'remove', label: 'Remove members', hint: 'Take someone out of the group' },
];

const RULES: PermRule[] = ['owner', 'admins', 'everyone'];
const RULE_SHORT: Record<PermRule, string> = {
  owner: 'Owner',
  admins: 'Admins',
  everyone: 'Everyone',
};

const ACTION_ICON: Record<MemberAction['key'], typeof EditIcon> = {
  'make-owner': WorkspacePremiumIcon,
  'make-admin': ShieldPersonIcon,
  'remove-admin': RemoveModeratorIcon,
  remove: PersonRemoveIcon,
};

export interface GroupInfoDrawerProps {
  open: boolean;
  onClose: () => void;
  group?: Group;
  loading?: boolean;
  meId: string | null;
  fullWidth?: boolean;
  onRename: (name: string | null) => void;
  onSetRole: (userId: string, gRole: 'admin' | 'member') => void;
  onTransferOwnership: (userId: string) => void;
  onRemoveMember: (userId: string) => void;
  onSetPermission: (key: 'rename' | 'invite' | 'remove', rule: PermRule) => void;
  onLeave: () => void;
}

/**
 * Conversation info: who is in the group, what they may do, and what you may do to them.
 *
 * The whole component is a function of `group.myRole` and `group.perms` - see
 * `SPEC-group-wire-contract.md` §3, which is unusually specific about the *absence* of
 * controls. Two rules drive most of what follows:
 *
 * - a viewer who cannot rename sees static text and a line naming who can, not a disabled
 *   pencil;
 * - a viewer with no applicable actions against a member has no overflow button at all,
 *   because a menu that opens empty is worse than no menu.
 *
 * Nothing here decides authority. Every capability is re-checked server-side; these checks
 * only decide what is worth drawing.
 */
export default function GroupInfoDrawer({
  open,
  onClose,
  group,
  loading = false,
  meId,
  fullWidth,
  onRename,
  onSetRole,
  onTransferOwnership,
  onRemoveMember,
  onSetPermission,
  onLeave,
}: GroupInfoDrawerProps) {
  // Draft state for the inline rename. Local rather than in the slice for the same reason
  // the settings drawer's fields are: it is a controlled input, and a keystroke that
  // reached the store would re-render everything subscribed to it.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [menuFor, setMenuFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);

  const mayRename = can(group, 'rename');
  const isOwner = ownsGroup(group);
  const members = group?.members ?? [];

  const startRename = () => {
    if (!mayRename) return;
    // The auto-name is a placeholder, not a value: opening the field with a derived name
    // pre-filled would turn "save without thinking" into a permanent snapshot of today's
    // membership, which is exactly what auto-naming exists to avoid.
    setDraft(group?.name ?? '');
    setEditing(true);
  };

  const commitRename = () => {
    const next = draft.trim();
    // Blank clears the name and returns the group to auto-naming, which is a real
    // instruction rather than a no-op - hence null, not ''.
    onRename(next === '' ? null : next);
    setEditing(false);
  };

  const closeMenu = () => setMenuFor(null);

  const runAction = (member: GroupMember, action: MemberAction) => {
    closeMenu();
    switch (action.key) {
      case 'make-owner':
        onTransferOwnership(member.id);
        break;
      case 'make-admin':
        onSetRole(member.id, 'admin');
        break;
      case 'remove-admin':
        onSetRole(member.id, 'member');
        break;
      case 'remove':
        onRemoveMember(member.id);
        break;
    }
  };

  const openFor = menuFor ? members.find((m) => m.id === menuFor.id) : undefined;
  const openActions = openFor ? memberActions(group, openFor, meId) : [];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: fullWidth ? '100%' : 360 } } }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'center', p: 1.75, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography sx={{ flex: 1, fontSize: 16, fontWeight: 500 }}>Conversation info</Typography>
        <IconButton onClick={onClose} aria-label="Close conversation info">
          <CloseIcon />
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pt: 2.75, pb: 3.5 }} aria-busy={loading}>
        <Stack spacing={1.25} sx={{ alignItems: 'center', pb: 2.5 }}>
          <AvatarStack members={members.filter((m) => m.id !== meId)} size={64} />

          {editing ? (
            <Stack direction="row" spacing={1} sx={{ width: '100%', mt: 0.5 }}>
              <TextField
                autoFocus
                fullWidth
                size="small"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditing(false);
                }}
                // The auto-name as placeholder, so submitting blank is an obvious and
                // expected path rather than an error state.
                placeholder={group?.title ?? 'Group name'}
                label="Group name"
                slotProps={{ htmlInput: { maxLength: 80 } }}
              />
              <IconButton onClick={commitRename} aria-label="Save group name" color="primary">
                <CheckIcon />
              </IconButton>
              <IconButton onClick={() => setEditing(false)} aria-label="Cancel rename">
                <CloseIcon />
              </IconButton>
            </Stack>
          ) : (
            <Stack
              direction="row"
              spacing={1}
              onClick={startRename}
              sx={{
                alignItems: 'center',
                px: 1,
                py: 0.5,
                borderRadius: 2,
                cursor: mayRename ? 'pointer' : 'default',
                // A button's default chrome, cleared. The design is plain text plus a pencil
                // with a hover background - the browser's border and grey fill made the name
                // look like a form control rather than a heading.
                border: 0,
                bgcolor: 'transparent',
                font: 'inherit',
                color: 'inherit',
                '&:hover': mayRename ? { bgcolor: 'action.hover' } : undefined,
              }}
              {...(mayRename
                ? {
                    component: 'button' as const,
                    type: 'button' as const,
                    'aria-label': `Rename ${group?.title ?? 'group'}`,
                  }
                : {})}
            >
              <Typography sx={{ fontSize: 18, fontWeight: 500 }}>{group?.title ?? ''}</Typography>
              {mayRename && <EditIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
            </Stack>
          )}

          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', textAlign: 'center' }}>
            {members.length} members · you are {group?.myRole ?? 'member'}
          </Typography>

          {/* The lock line names who *can* rename, derived from perms - not a fixed string,
              and not shown at all to someone who can. */}
          <Stack
            direction="row"
            spacing={0.75}
            sx={{
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: 'text.disabled',
              textAlign: 'center',
            }}
          >
            {!mayRename && <LockIcon sx={{ fontSize: 15 }} />}
            <span>
              {mayRename
                ? group?.named
                  ? 'Renamed — this name sticks even as members change'
                  : 'Auto-named from members — rename it to make it stick'
                : renameLockText(group?.perms?.rename)}
            </span>
          </Stack>
        </Stack>

        <Divider />

        <Stack direction="row" sx={{ alignItems: 'baseline', mt: 2.75, mb: 0.5 }}>
          <SectionLabel sx={{ flex: 1 }}>Members</SectionLabel>
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>{members.length}</Typography>
        </Stack>

        {members.map((m) => {
          const actions = memberActions(group, m, meId);
          const chip = ROLE_CHIP[m.gRole];
          return (
            <Stack
              key={m.id}
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: 'center',
                px: 1,
                py: 1.125,
                borderRadius: 2.5,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <PresenceAvatar
                name={m.name}
                color={m.color}
                avatarFileName={m.avatarFileName}
                presence={m.presence}
                size={36}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.875} sx={{ alignItems: 'center' }}>
                  <Typography noWrap sx={{ fontSize: 14 }}>
                    {m.id === meId ? `${m.name} (you)` : m.name}
                  </Typography>
                  {/* Only owner and admin carry a chip. Labelling everyone "Member" adds a
                      row of noise that says nothing - the absence is the information. */}
                  {chip && (
                    <Chip
                      label={chip.label}
                      size="small"
                      sx={[{ height: 19, fontSize: 11 }, chip.sx]}
                    />
                  )}
                </Stack>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {m.presence === 'online' ? 'Active now' : 'Offline'}
                </Typography>
              </Box>

              {/* Absent, not disabled, when there is nothing to do. */}
              {actions.length > 0 && (
                <IconButton
                  size="small"
                  aria-label={`Manage ${m.name}`}
                  onClick={(e) => setMenuFor({ id: m.id, anchor: e.currentTarget })}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>
          );
        })}

        <Menu anchorEl={menuFor?.anchor ?? null} open={!!menuFor} onClose={closeMenu}>
          {openFor &&
            openActions.map((a) => {
              const Icon = ACTION_ICON[a.key];
              return (
                <MenuItem
                  key={a.key}
                  onClick={() => runAction(openFor, a)}
                  sx={{
                    gap: 1.375,
                    fontSize: 13.5,
                    color: a.destructive ? 'error.main' : 'inherit',
                  }}
                >
                  <Icon sx={{ fontSize: 19 }} />
                  {a.label}
                </MenuItem>
              );
            })}
          {/* Warn, do not prevent: an empty admin tier is a legal configuration, and the
              owner can always undo it. */}
          {openFor && isLastAdmin(group, openFor) && canManageRoles(group) && (
            <Typography sx={{ px: 2, py: 1, fontSize: 12, color: 'text.secondary', maxWidth: 240 }}>
              {openFor.name.split(' ')[0]} is the last admin. Renaming and member changes will need
              you.
            </Typography>
          )}
        </Menu>

        <SectionLabel sx={{ mt: 3, mb: 1 }}>Who can</SectionLabel>

        {PERM_ROWS.map((row) => {
          const current = group?.perms?.[row.key] ?? 'admins';
          return (
            <Box key={row.key} sx={{ py: 1.375, borderTop: 1, borderColor: 'divider' }}>
              {isOwner ? (
                <>
                  <Typography sx={{ fontSize: 14 }}>{row.label}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                    {row.hint}
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1.125 }}>
                    {RULES.map((rule) => (
                      <Box
                        key={rule}
                        component="button"
                        type="button"
                        aria-pressed={current === rule}
                        onClick={() => onSetPermission(row.key, rule)}
                        sx={{
                          flex: 1,
                          height: 32,
                          borderRadius: 2,
                          cursor: 'pointer',
                          fontSize: 12.5,
                          fontWeight: 500,
                          fontFamily: 'inherit',
                          border: 1,
                          // theme.custom is not a palette namespace, so sx's string-path
                          // shorthand cannot reach it - hence the callback.
                          borderColor: (t: Theme) =>
                            current === rule ? t.palette.primary.main : t.custom.border2,
                          bgcolor: current === rule ? 'background.selected' : 'transparent',
                          color: current === rule ? 'primary.main' : 'text.secondary',
                        }}
                      >
                        {RULE_SHORT[rule]}
                      </Box>
                    ))}
                  </Stack>
                </>
              ) : (
                /* A value row, not a disabled control: it states the fact and moves on,
                   rather than inviting a click that can only fail. */
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14 }}>{row.label}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                      {row.hint}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      // 'Everyone' is the permissive default and should not read as a
                      // restriction, so it stays dim rather than taking the primary colour.
                      color: current === 'everyone' ? 'text.secondary' : 'primary.main',
                    }}
                  >
                    {ruleLabel(current)}
                  </Typography>
                </Stack>
              )}
            </Box>
          );
        })}

        <Stack
          direction="row"
          spacing={1.125}
          sx={{ alignItems: 'flex-start', mt: 1.5, fontSize: 12, color: 'text.disabled' }}
        >
          {isOwner ? (
            <InfoOutlinedIcon sx={{ fontSize: 16, mt: '1px' }} />
          ) : (
            <LockIcon sx={{ fontSize: 16, mt: '1px' }} />
          )}
          <span>
            {isOwner ? 'You own this group, so you can change these. ' : 'Set by the group owner. '}
            Group roles are separate from workspace roles — a workspace admin has no power here
            unless they are also a group admin.
          </span>
        </Stack>

        {/* The owner sees the prerequisite rather than a hidden action: their next question
            is exactly "how do I leave?". */}
        <Box
          component="button"
          type="button"
          onClick={isOwner ? undefined : onLeave}
          disabled={isOwner}
          sx={{
            width: '100%',
            mt: 2.75,
            height: 42,
            borderRadius: 2,
            border: 1,
            borderColor: 'error.main',
            bgcolor: 'transparent',
            color: 'error.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'inherit',
            cursor: isOwner ? 'default' : 'pointer',
            opacity: isOwner ? 0.6 : 1,
          }}
        >
          <LogoutIcon sx={{ fontSize: 19 }} />
          {isOwner ? 'Transfer ownership before leaving' : 'Leave group'}
        </Box>
      </Box>
    </Drawer>
  );
}
