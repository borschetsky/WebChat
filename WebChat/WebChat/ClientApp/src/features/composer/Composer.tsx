import { useRef, useState } from 'react';
import { Box, Chip, IconButton, InputBase, Paper, Popover, Stack, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MoodIcon from '@mui/icons-material/Mood';
import SendIcon from '@mui/icons-material/Send';
import ReplyIcon from '@mui/icons-material/Reply';
import CloseIcon from '@mui/icons-material/Close';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  attachmentAdded, attachmentRemoved, draftChanged, registerDraftFile, replyCancelled,
  selectAttachment, selectCanSend, selectDraft, selectReplyTo,
} from './composerSlice';

const EMOJIS = ['👍', '❤️', '😂', '🎉', '🙌', '🔥', '😮', '😢', '🚀', '✅', '👀', '🤝'];

export interface SendPayload {
  text: string;
  replyTo: ReturnType<typeof selectReplyTo>;
  attachment: ReturnType<typeof selectAttachment>;
}

interface ComposerProps {
  /**
   * Receives the composer contents. Passing them up rather than letting the parent read
   * them from the store is deliberate: if ChatApp subscribed to `draft` in order to send
   * it, every keystroke would re-render the message list again - the exact problem this
   * slice exists to remove.
   */
  onSend: (payload: SendPayload) => void;
  onTyping?: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}

/**
 * Message composer.
 *
 * Reads its state straight from the store rather than through props. That is the point:
 * with the draft here, a keystroke re-renders only this component, where it used to
 * re-render ChatApp, ConversationPane and every MessageRow.
 */
export default function Composer({ onSend, onTyping, placeholder, disabled }: ComposerProps) {
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectDraft);
  const replyTo = useAppSelector(selectReplyTo);
  const attachment = useAppSelector(selectAttachment);
  const ready = useAppSelector(selectCanSend);

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleChange = (value: string) => {
    dispatch(draftChanged(value));
    onTyping?.(value);
  };

  const send = () => {
    if (!ready || disabled) return;
    onSend({ text: draft.trim(), replyTo, attachment });
  };

  return (
    <Box sx={{ p: 2, pt: 1.5, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
      {replyTo && (
        <Stack
          direction="row"
          spacing={1.25}
          sx={{ alignItems: 'center', mb: 1.25, px: 1.5, py: 1, borderLeft: 3, borderColor: 'primary.main', bgcolor: 'background.quote', borderRadius: '0 8px 8px 0' }}
        >
          <ReplyIcon fontSize="small" color="primary" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'primary.main' }}>
              Replying to {replyTo.author}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>{replyTo.text}</Typography>
          </Box>
          <IconButton size="small" onClick={() => dispatch(replyCancelled())} aria-label="Cancel reply">
            <CloseIcon fontSize="inherit" />
          </IconButton>
        </Stack>
      )}

      {attachment && (
        <Chip
          sx={{ mb: 1.25 }}
          icon={<AttachFileIcon />}
          label={attachment.name}
          onDelete={() => dispatch(attachmentRemoved())}
        />
      )}

      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
        {/* Real file picker. The file is not uploaded - see mocks - but choosing one is genuine. */}
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) dispatch(attachmentAdded(registerDraftFile(f)));
            e.target.value = '';
          }}
        />
        <IconButton
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a file"
          title="Attach"
          disabled={disabled}
        >
          <AttachFileIcon />
        </IconButton>

        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flex: 1, minHeight: 44, pl: 2, pr: 1, borderRadius: 22, bgcolor: 'background.field', border: 1, borderColor: ready ? 'primary.main' : 'transparent' }}
        >
          <InputBase
            multiline
            maxRows={6}
            value={draft}
            disabled={disabled}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder={placeholder}
            inputProps={{ 'aria-label': placeholder }}
            sx={{ flex: 1, fontSize: 15 }}
          />
          <IconButton
            onClick={(e) => setAnchor(e.currentTarget)}
            aria-label="Insert emoji"
            aria-haspopup="true"
            title="Emoji"
            disabled={disabled}
          >
            <MoodIcon />
          </IconButton>
        </Stack>

        <IconButton
          onClick={send}
          aria-label="Send message"
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

      <Typography sx={{ mt: 1, fontSize: 11, color: 'text.disabled' }}>
        Enter to send · Shift+Enter for a new line
      </Typography>

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
                component="button"
                type="button"
                aria-label={`Insert ${e}`}
                onClick={() => { handleChange(draft + e); setAnchor(null); }}
                sx={{
                  height: 36, display: 'grid', placeItems: 'center', fontSize: 20,
                  border: 0, bgcolor: 'transparent', borderRadius: 1, cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
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
