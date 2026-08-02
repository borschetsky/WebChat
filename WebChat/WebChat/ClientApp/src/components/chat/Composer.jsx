import React, { useRef, useState } from 'react';
import { Box, Chip, IconButton, InputBase, Paper, Popover, Stack, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MoodIcon from '@mui/icons-material/Mood';
import SendIcon from '@mui/icons-material/Send';
import ReplyIcon from '@mui/icons-material/Reply';
import CloseIcon from '@mui/icons-material/Close';

const EMOJIS = ['👍', '❤️', '😂', '🎉', '🙌', '🔥', '😮', '😢', '🚀', '✅', '👀', '🤝'];

export default function Composer({
  draft, setDraft, onSend, onTyping,
  replyTo, onCancelReply,
  attachment, onAttach, onRemoveAttach,
  placeholder, disabled,
}) {
  const [anchor, setAnchor] = useState(null);
  const fileRef = useRef(null);
  const ready = draft.trim().length > 0 || !!attachment;

  const handleChange = (e) => {
    setDraft(e.target.value);
    onTyping?.(e.target.value);
  };

  return (
    <Box sx={{ p: 2, pt: 1.5, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
      {replyTo && (
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.25, px: 1.5, py: 1, borderLeft: 3, borderColor: 'primary.main', bgcolor: 'background.quote', borderRadius: '0 8px 8px 0' }}>
          <ReplyIcon fontSize="small" color="primary" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'primary.main' }}>Replying to {replyTo.author}</Typography>
            <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>{replyTo.text}</Typography>
          </Box>
          <IconButton size="small" onClick={onCancelReply}><CloseIcon fontSize="inherit" /></IconButton>
        </Stack>
      )}

      {attachment && (
        <Chip sx={{ mb: 1.25 }} icon={<AttachFileIcon />} label={attachment.name} onDelete={onRemoveAttach} />
      )}

      <Stack direction="row" alignItems="flex-end" spacing={1}>
        {/* Real file picker. The file is not uploaded - see mocks.js - but choosing one is genuine. */}
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onAttach(f); e.target.value = ''; }}
        />
        <IconButton onClick={() => fileRef.current?.click()} title="Attach" disabled={disabled}><AttachFileIcon /></IconButton>

        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ flex: 1, minHeight: 44, pl: 2, pr: 1, borderRadius: 22, bgcolor: 'background.field', border: 1, borderColor: ready ? 'primary.main' : 'transparent' }}
        >
          <InputBase
            multiline
            maxRows={6}
            value={draft}
            disabled={disabled}
            onChange={handleChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder={placeholder}
            sx={{ flex: 1, fontSize: 15 }}
          />
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} title="Emoji" disabled={disabled}><MoodIcon /></IconButton>
        </Stack>

        <IconButton
          onClick={onSend}
          title="Send"
          disabled={disabled || !ready}
          sx={{
            width: 44, height: 44,
            bgcolor: ready ? 'primary.main' : 'background.field',
            color: ready ? 'primary.contrastText' : 'text.disabled',
            '&:hover': { bgcolor: ready ? 'primary.dark' : 'background.field' },
            '&.Mui-disabled': { bgcolor: 'background.field', color: 'text.disabled' },
          }}
        >
          <SendIcon />
        </IconButton>
      </Stack>

      <Typography sx={{ mt: 1, fontSize: 11, color: 'text.disabled' }}>Enter to send · Shift+Enter for a new line</Typography>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Paper sx={{ p: 1.5, width: 266 }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>Frequently used</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 0.5 }}>
            {EMOJIS.map((e) => (
              <Box
                key={e}
                onClick={() => { setDraft(draft + e); setAnchor(null); }}
                sx={{ height: 36, display: 'grid', placeItems: 'center', fontSize: 20, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              >
                {e}
              </Box>
            ))}
          </Box>
        </Paper>
      </Popover>
    </Box>
  );
}
