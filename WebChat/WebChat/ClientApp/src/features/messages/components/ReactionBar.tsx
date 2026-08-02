import { Chip, Stack } from '@mui/material';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import type { Reaction } from '@/types/models';

interface ReactionBarProps {
  reactions: Reaction[];
  onToggle: (emoji: string) => void;
}

/** 26px reaction chips, radius 13. "Mine" gets the primary border and container fill. */
export default function ReactionBar({ reactions, onToggle }: ReactionBarProps) {
  if (reactions.length === 0) return null;

  return (
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', mt: 0.9 }}>
      {reactions.map((r) => (
        <Chip
          key={r.emoji}
          size="small"
          onClick={() => onToggle(r.emoji)}
          label={`${r.emoji} ${r.count}`}
          variant={r.mine ? 'filled' : 'outlined'}
          aria-label={`${r.emoji} reaction, ${r.count}${r.mine ? ', including yours' : ''}`}
          aria-pressed={r.mine}
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
        onClick={() => onToggle('👍')}
        aria-label="Add reaction"
        sx={{
          height: 26, width: 34, borderRadius: 13,
          border: '1px dashed', borderColor: 'divider', bgcolor: 'transparent',
          '& .MuiChip-label': { display: 'none' },
        }}
      />
    </Stack>
  );
}
