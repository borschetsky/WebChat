import { Box, Divider, Typography } from '@mui/material';

export interface SystemMessageRowProps {
  text: string;
}

/**
 * A system message: "You renamed the group to X", centered between two rules.
 *
 * Deliberately not a `MessageRow` variant. It has no author, no avatar, no timestamp gutter,
 * no reactions and no reply affordance - almost nothing a message row is made of - so sharing
 * that component would mean threading a flag through every one of those and rendering nothing
 * for most of them.
 *
 * Renders nothing at all for an empty string, which is what an unrecognised `systemKind` from
 * a newer server produces. An empty divider is worse than no divider.
 */
export default function SystemMessageRow({ text }: SystemMessageRowProps) {
  if (!text) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, py: 1.25 }}>
      <Divider sx={{ flex: 1 }} />
      {/* No role="status" here. ConversationPane already wraps the whole list in
          role="log" aria-live="polite", so a system message arriving over the socket is
          announced by that - and a nested live region would either double-announce or
          swallow the outer one. */}
      <Typography
        sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center', whiteSpace: 'nowrap' }}
      >
        {text}
      </Typography>
      <Divider sx={{ flex: 1 }} />
    </Box>
  );
}
