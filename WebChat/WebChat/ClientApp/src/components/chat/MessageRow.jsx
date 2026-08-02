import React from 'react';
import { Box, Chip, IconButton, Stack, Typography } from '@mui/material';
import ReplyIcon from '@mui/icons-material/Reply';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import PresenceAvatar from './PresenceAvatar';
import { densityTokens } from '../../theme';

export default function MessageRow({ message: m, grouped, density, onReact, onReply, receiptLabel, showReceipt }) {
  const d = densityTokens(density);

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        px: 3,
        py: grouped ? d.groupPadY : d.msgPadY,
        position: 'relative',
        '&:hover': { bgcolor: 'action.hover' },
        '&:hover .row-actions': { opacity: 1 },
      }}
    >
      <Box sx={{ width: d.avatar, flex: 'none', display: 'flex', justifyContent: 'center', pt: '2px' }}>
        {grouped ? (
          <Typography sx={{ fontSize: 11, color: 'text.disabled', fontFamily: '"Roboto Mono", monospace' }}>
            {(m.time || '').replace(/\s?(AM|PM)/, '')}
          </Typography>
        ) : (
          <PresenceAvatar name={m.author} color={m.color} avatarFileName={m.avatarFileName} size={d.avatar} showPresence={false} />
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {!grouped && (
          <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.25 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 500, color: m.own ? 'primary.main' : 'text.primary' }}>{m.author}</Typography>
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{m.time}</Typography>
          </Stack>
        )}

        {m.quote && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ my: 0.5, px: 1.25, py: 0.5, borderLeft: 3, borderColor: 'primary.main', bgcolor: 'background.quote', borderRadius: '0 6px 6px 0', maxWidth: 520 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'primary.main', whiteSpace: 'nowrap' }}>{m.quote.author}</Typography>
            <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>{m.quote.text}</Typography>
          </Stack>
        )}

        <Typography sx={{ fontSize: d.msgSize, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 640 }}>
          {m.text}
        </Typography>

        {m.attachment && (
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mt: 1, p: 1.25, px: 1.75, border: 1, borderColor: 'divider', borderRadius: 2.5, display: 'inline-flex' }}>
            <DescriptionIcon color="primary" />
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{m.attachment.name}</Typography>
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{m.attachment.meta}</Typography>
            </Box>
            <IconButton size="small"><DownloadIcon fontSize="inherit" /></IconButton>
          </Stack>
        )}

        {m.reactions?.length > 0 && (
          <Stack direction="row" flexWrap="wrap" spacing={0.75} sx={{ mt: 0.9 }}>
            {m.reactions.map((r) => (
              <Chip
                key={r.emoji}
                size="small"
                onClick={() => onReact(m.id, r.emoji)}
                label={`${r.emoji} ${r.count}`}
                variant={r.mine ? 'filled' : 'outlined'}
                sx={{
                  height: 26,
                  borderRadius: 13,
                  bgcolor: r.mine ? 'background.selected' : 'background.field',
                  color: r.mine ? 'primary.main' : 'text.secondary',
                  borderColor: r.mine ? 'primary.main' : 'transparent',
                }}
              />
            ))}
            <Chip
              size="small"
              icon={<AddReactionIcon sx={{ fontSize: 15 }} />}
              label=""
              onClick={() => onReact(m.id, '👍')}
              sx={{ height: 26, width: 34, borderRadius: 13, border: '1px dashed', borderColor: 'divider', bgcolor: 'transparent', '& .MuiChip-label': { display: 'none' } }}
            />
          </Stack>
        )}

        {showReceipt && receiptLabel && (
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.75 }}>
            <DoneAllIcon sx={{ fontSize: 15, color: 'primary.main' }} />
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{receiptLabel}</Typography>
          </Stack>
        )}
      </Box>

      <Stack className="row-actions" direction="row" sx={{ opacity: 0.55, transition: 'opacity .15s', flex: 'none' }}>
        <IconButton size="small" title="React" onClick={() => onReact(m.id, '👍')}><AddReactionIcon fontSize="inherit" /></IconButton>
        <IconButton size="small" title="Reply" onClick={() => onReply(m)}><ReplyIcon fontSize="inherit" /></IconButton>
      </Stack>
    </Stack>
  );
}
