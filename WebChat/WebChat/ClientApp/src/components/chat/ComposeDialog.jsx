import React, { useEffect, useState } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  InputBase, List, ListItemButton, Stack, Typography,
} from '@mui/material';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import PresenceAvatar from './PresenceAvatar';

/**
 * New-conversation dialog. Unlike the handoff, which filtered a local fixture array, this
 * queries /api/users/search - so it debounces and shows a loading state.
 *
 * The handoff's "New group" action is omitted: Thread has a single OponentId, so there is
 * nothing a group button could actually create. See mocks.js (groupThreads).
 */
export default function ComposeDialog({ open, onClose, onStart, onSearch, fullScreen }) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const term = q.trim();
    if (!term) { setPeople([]); return undefined; }

    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const found = await onSearch(term);
        if (!cancelled) setPeople(found);
      } catch {
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open, onSearch]);

  useEffect(() => { if (!open) { setQ(''); setPeople([]); } }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={fullScreen} slotProps={{ paper: { sx: { borderRadius: fullScreen ? 0 : 4 } } }}>
      <DialogTitle sx={{ pb: 0.5 }}>
        New conversation
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>Search for someone to start talking to.</Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', height: 44, px: 1.75, borderRadius: 22, bgcolor: 'background.field', mb: 1 }}>
          <PersonSearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <InputBase autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search directory" sx={{ flex: 1, fontSize: 14 }} />
          {loading && <CircularProgress size={16} />}
        </Stack>

        <List disablePadding>
          {people.map((p) => (
            <ListItemButton key={p.id} onClick={() => onStart(p)} sx={{ gap: 1.5, borderRadius: 2.5 }}>
              <PresenceAvatar name={p.name} color={p.color} avatarFileName={p.avatarFileName} size={38} presence={p.presence} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 14 }}>{p.name}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{p.role}</Typography>
              </Box>
              <ChatBubbleIcon fontSize="small" sx={{ color: 'text.secondary' }} />
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
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
