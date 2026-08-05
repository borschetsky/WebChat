import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  List, ListItemButton, TextField, Typography,
} from '@mui/material';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import PresenceAvatar from '@/components/PresenceAvatar';
import SearchField from '@/components/SearchField';

/**
 * New-conversation dialog. Unlike the handoff, which filtered a local fixture array, this
 * queries /api/users/search - so it debounces and shows a loading state.
 *
 * Two modes. Direct starts a thread as soon as someone is picked, because there is nothing
 * else to decide. Group collects people first and needs a name, so it only creates on
 * submit - the handoff's "New group" action, which used to be omitted because Thread had a
 * single OponentId and there was nothing a group button could create.
 */
export default function ComposeDialog({ open, onClose, onStart, onStartGroup, onSearch, fullScreen }) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isGroup, setIsGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [picked, setPicked] = useState([]);
  const [creating, setCreating] = useState(false);

  const toggle = (person) => setPicked((current) => (
    current.some((p) => p.id === person.id)
      ? current.filter((p) => p.id !== person.id)
      : [...current, person]
  ));

  const createGroup = async () => {
    setCreating(true);
    try {
      await onStartGroup(groupName.trim(), picked);
    } finally {
      setCreating(false);
    }
  };

  // Held in a ref so the effect below does not depend on its identity. Listing onSearch as a
  // dependency makes this component only as stable as its caller: an inline arrow prop
  // re-runs the effect every render, the effect sets loading state, and that render triggers
  // the next run - an endless stream of requests whose results are each thrown away by the
  // following run's cleanup, so the spinner never stops and nothing is ever displayed.
  // A ref keeps the latest callback without making a re-render mean a refetch.
  const search = useRef(onSearch);
  useEffect(() => { search.current = onSearch; }, [onSearch]);

  useEffect(() => {
    if (!open) return undefined;
    const term = q.trim();
    // Clearing results for an empty box should really be derived at render rather than set
    // here. Left as-is deliberately: this effect is the one that caused the request loop in
    // docs/ctx/2026-08-04-compose-search-render-loop.md, it is pinned by a regression test,
    // and restructuring it does not belong in the change that introduced the linter.
    // oxlint-disable-next-line rh/set-state-in-effect
    if (!term) { setPeople([]); return undefined; }

    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const found = await search.current(term);
        if (!cancelled) setPeople(found);
      } catch {
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  // Everything resets on close, including the mode. Reopening into a half-built group with
  // people selected from last time would be a surprising place to land.
  useEffect(() => {
    if (!open) {
      // The idiomatic replacement is remounting the dialog from a key at the call site,
      // which is a change to ChatApp rather than to this file. Deferred; see the ctx note
      // for this change.
      // oxlint-disable-next-line rh/set-state-in-effect
      setQ(''); setPeople([]); setIsGroup(false); setGroupName(''); setPicked([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={fullScreen} slotProps={{ paper: { sx: { borderRadius: fullScreen ? 0 : 4 } } }}>
      <DialogTitle sx={{ pb: 0.5 }}>
        {isGroup ? 'New group' : 'New conversation'}
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
          {isGroup
            ? 'Name it, then pick who should be in it.'
            : 'Search for someone to start talking to.'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5 }}>
        {isGroup && (
          <TextField
            label="Group name" fullWidth size="small" autoFocus
            value={groupName} onChange={(e) => setGroupName(e.target.value)}
            sx={{ mb: 2 }}
          />
        )}

        {isGroup && picked.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
            {picked.map((p) => (
              <Chip key={p.id} label={p.name} size="small" onDelete={() => toggle(p)} />
            ))}
          </Box>
        )}

        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search directory"
          label="Search the directory for someone to message"
          icon={<PersonSearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
          loading={loading}
          autoFocus
        />

        <List disablePadding>
          {people.map((p) => (
            <ListItemButton
              key={p.id}
              // Direct mode starts the thread immediately; group mode only toggles
              // selection, because a group is not created until it has a name.
              onClick={() => (isGroup ? toggle(p) : onStart(p))}
              selected={isGroup && picked.some((s) => s.id === p.id)}
              sx={{ gap: 1.5, borderRadius: 2.5 }}
            >
              <PresenceAvatar name={p.name} color={p.color} avatarFileName={p.avatarFileName} size={38} presence={p.presence} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 14 }}>{p.name}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{p.role}</Typography>
              </Box>
              {isGroup
                ? <Checkbox edge="end" checked={picked.some((s) => s.id === p.id)} tabIndex={-1} disableRipple />
                : <ChatBubbleIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
            </ListItemButton>
          ))}
        </List>

        {!loading && q.trim() && people.length === 0 && (
          <Typography sx={{ py: 3, textAlign: 'center', fontSize: 13, color: 'text.secondary' }}>
            Nobody matches “{q.trim()}”.
          </Typography>
        )}
        {!q.trim() && (
          <Typography sx={{ py: 3, textAlign: 'center', fontSize: 13, color: 'text.secondary' }}>
            Start typing a name.
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2 }}>
        {/* Only offered when a caller supplied the handler, so the button cannot appear
            somewhere that has no way to create a group. */}
        {onStartGroup && (
          <Button
            startIcon={<GroupAddIcon />}
            onClick={() => setIsGroup((v) => !v)}
            sx={{ mr: 'auto' }}
          >
            {isGroup ? 'Direct message' : 'New group'}
          </Button>
        )}

        <Button onClick={onClose}>Cancel</Button>

        {isGroup && (
          <Button
            variant="contained"
            onClick={createGroup}
            disabled={creating || !groupName.trim() || picked.length === 0}
          >
            {creating ? 'Creating…' : `Create${picked.length ? ` (${picked.length})` : ''}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
