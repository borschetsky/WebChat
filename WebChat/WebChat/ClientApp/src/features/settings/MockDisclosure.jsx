import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ScienceIcon from '@mui/icons-material/Science';
import { MOCK_FEATURES } from '@/services/chat-service';

const LABELS = {
  reactions: 'Reactions',
  readReceipts: 'Read receipts',
  unreadCounts: 'Unread counts',
  attachments: 'Attachments',
  replyQuote: 'Reply / quote',
  groupThreads: 'Group conversations',
  notifications: 'Notifications',
};

/**
 * Lists which parts of the UI are not backed by the API.
 *
 * This exists because the redesign is visually complete while a third of its interactions
 * are mocked. Without something saying so, a demo of this screen reads as a finished
 * product - and the person watching cannot tell that reactions vanish on reload or that
 * "Read by …" is asserting something nothing measures.
 */
export default function MockDisclosure() {
  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        mt: 2.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ScienceIcon fontSize="small" sx={{ color: 'warning.main' }} />
          <Typography sx={{ fontSize: 14 }}>Not backed by the server</Typography>
          <Chip size="small" label={MOCK_FEATURES.length} sx={{ height: 20 }} />
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Alert severity="info" icon={false} sx={{ fontSize: 12, mb: 1.5, py: 0.5 }}>
          These behave in the UI but are not persisted. They reset when you reload.
        </Alert>
        <Stack spacing={1.25}>
          {MOCK_FEATURES.map((f) => (
            <Box key={f.key}>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                {LABELS[f.key] ?? f.key}
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                Needs: {f.needs}
              </Typography>
            </Box>
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
