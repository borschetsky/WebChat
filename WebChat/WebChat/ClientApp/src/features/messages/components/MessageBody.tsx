import { Fragment } from 'react';
import { Box, Typography } from '@mui/material';

interface MessageBodyProps {
  text: string;
  fontSize: number;
  /** Active in-thread search term. Matches are wrapped in <mark>. */
  highlight?: string;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Message text, with in-thread search matches highlighted.
 *
 * The handoff's definition of done asks for <mark>-style highlighting; the reference app
 * filtered but never highlighted. Matching is case-insensitive and the term is escaped,
 * so a search for "c++" or "1+1" cannot blow up the regex.
 */
export default function MessageBody({ text, fontSize, highlight }: MessageBodyProps) {
  const term = highlight?.trim();

  const content = !term
    ? text
    : text.split(new RegExp(`(${escapeRegExp(term)})`, 'ig')).map((part, i) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <Box
            key={i}
            component="mark"
            sx={{
              px: 0.25,
              borderRadius: 0.5,
              color: 'inherit',
              bgcolor: 'background.selected',
              outline: (t) => `1px solid ${t.palette.primary.main}`,
            }}
          >
            {part}
          </Box>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      );

  return (
    <Typography
      sx={{
        fontSize,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        maxWidth: 640,
      }}
    >
      {content}
    </Typography>
  );
}
