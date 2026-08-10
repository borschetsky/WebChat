import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  Stack,
  Typography,
} from '@mui/material';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import PresenceAvatar from '@/components/PresenceAvatar';
import SearchField from '@/components/SearchField';
import { useSearchDirectoryQuery } from '@/app/api/chatApi';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

/**
 * New-conversation dialog, following the design handoff exactly.
 *
 * It is modeless: one list serves both outcomes. Ticking a row selects someone for a group,
 * and the chat-bubble button on the row opens a direct message straight away. The earlier
 * version had two modes behind a toggle and made a group cost a mode switch, a typed name
 * and a submit; this reaches a group in two ticks and one press.
 *
 * There is deliberately no group-name field - the handoff derives the name from the members
 * (see deriveGroupName in ChatApp). That is why the minimum is two people rather than the
 * one the API accepts: a nameless two-person group would be indistinguishable from a direct
 * thread, which is the whole argument CreateGroupViewModel makes for allowing one.
 *
 * Unlike the handoff, which filtered a local fixture array, this queries /api/users/search
 * through RTK Query. The query owns the results and the in-flight flag; the only thing left
 * here is a debounce, because every distinct term is a distinct request.
 */
export default function ComposeDialog({
  open,
  onClose,
  onStart,
  onStartGroup,
  creating = false,
  fullScreen,
}) {
  // `q` and `picked` stay local deliberately. `q` is a controlled input, and `picked` is
  // dialog-scoped selection that must not survive a close. What used to live here and does
  // not any more: `people` (a hand-kept copy of server data), `loading` (a hand-kept request
  // flag), and `creating` (a copy of the mutation's own isLoading).
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);

  const term = useDebouncedValue(q.trim(), 250);

  // The query owns the results, the in-flight flag, cancellation of superseded responses, and
  // a cache - so retyping a term that was searched a moment ago is instant rather than
  // another round trip. `skip` is what keeps a closed dialog and an empty box from querying.
  const { data: people = [], isFetching } = useSearchDirectoryQuery(term, {
    skip: !open || term.length === 0,
  });

  const toggle = (person) =>
    setPicked((current) =>
      current.some((p) => p.id === person.id)
        ? current.filter((p) => p.id !== person.id)
        : [...current, person],
    );

  const startDirect = (person) => {
    setPicked([]);
    onStart(person);
  };

  const createGroup = () => onStartGroup(picked);

  // Everything resets on close. Reopening into a half-built group with people selected from
  // last time would be a surprising place to land.
  useEffect(() => {
    if (!open) {
      // The idiomatic replacement is remounting the dialog from a key at the call site,
      // which is a change to ChatApp rather than to this file. Deferred; see the ctx note.
      // oxlint-disable-next-line rh/set-state-in-effect
      setQ('');
      setPicked([]);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      fullScreen={fullScreen}
      slotProps={{ paper: { sx: { borderRadius: fullScreen ? 0 : 4 } } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>
        New conversation
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
          Tick two or more people to start a group, or open a direct message.
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5 }}>
        <Box sx={{ mb: 1 }}>
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search directory"
            label="Search the directory for someone to message"
            icon={<PersonSearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
            loading={isFetching}
            autoFocus
          />
        </Box>

        {picked.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1.25 }}>
            {picked.map((p) => (
              <Chip
                key={p.id}
                size="medium"
                label={p.name.split(' ')[0]}
                onDelete={() => toggle(p)}
                avatar={
                  <PresenceAvatar
                    name={p.name}
                    color={p.color}
                    avatarFileName={p.avatarFileName}
                    size={24}
                    showPresence={false}
                  />
                }
              />
            ))}
          </Stack>
        )}

        <List disablePadding>
          {people.map((p) => {
            const on = picked.some((s) => s.id === p.id);
            return (
              <ListItemButton
                key={p.id}
                selected={on}
                onClick={() => toggle(p)}
                sx={{
                  gap: 1.5,
                  borderRadius: 2.5,
                  py: 1,
                  '&.Mui-selected': { bgcolor: 'background.selected' },
                }}
              >
                {/* slotProps, not the handoff's inputProps: MUI v9 drops the latter
                    silently, leaving the checkbox with no accessible name at all. */}
                <Checkbox
                  edge="start"
                  checked={on}
                  tabIndex={-1}
                  disableRipple
                  sx={{ p: 0 }}
                  slotProps={{ input: { 'aria-label': `Select ${p.name}` } }}
                />
                <PresenceAvatar
                  name={p.name}
                  color={p.color}
                  avatarFileName={p.avatarFileName}
                  size={38}
                  showPresence={false}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14 }}>
                    {p.name}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{p.role}</Typography>
                </Box>
                {/* stopPropagation, or selecting the row would race the direct message. */}
                <IconButton
                  size="small"
                  aria-label={`Direct message ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    startDirect(p);
                  }}
                >
                  <ChatBubbleIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            );
          })}
        </List>

        {!isFetching && term && people.length === 0 && (
          <Typography sx={{ textAlign: 'center', py: 4.5, fontSize: 13, color: 'text.secondary' }}>
            Nobody in the directory matches “{q.trim()}”.
          </Typography>
        )}
        {!q.trim() && (
          <Typography sx={{ textAlign: 'center', py: 4.5, fontSize: 13, color: 'text.secondary' }}>
            Start typing a name.
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2, gap: 1 }}>
        <Typography sx={{ flex: 1, fontSize: 13, color: 'text.secondary' }}>
          {picked.length === 0
            ? 'No one selected'
            : picked.length === 1
              ? '1 selected · pick one more for a group'
              : `${picked.length} selected`}
        </Typography>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<GroupAddIcon />}
          disabled={creating || picked.length < 2}
          onClick={createGroup}
        >
          {creating
            ? 'Creating…'
            : picked.length > 1
              ? `Create group (${picked.length})`
              : 'Create group'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
