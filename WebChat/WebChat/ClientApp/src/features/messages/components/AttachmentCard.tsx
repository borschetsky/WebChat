import { Box, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import TableChartIcon from '@mui/icons-material/TableChart';
import CodeIcon from '@mui/icons-material/Code';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import MovieIcon from '@mui/icons-material/Movie';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import DownloadIcon from '@mui/icons-material/Download';
import type { Attachment } from '@/types/models';

const ICONS: Record<string, typeof DescriptionIcon> = {
  pdf: PictureAsPdfIcon,
  png: ImageIcon, jpg: ImageIcon, jpeg: ImageIcon, gif: ImageIcon, webp: ImageIcon, svg: ImageIcon,
  xls: TableChartIcon, xlsx: TableChartIcon, csv: TableChartIcon,
  js: CodeIcon, ts: CodeIcon, jsx: CodeIcon, tsx: CodeIcon, json: CodeIcon, cs: CodeIcon, html: CodeIcon,
  zip: FolderZipIcon, rar: FolderZipIcon, '7z': FolderZipIcon, gz: FolderZipIcon,
  mp4: MovieIcon, mov: MovieIcon, avi: MovieIcon, webm: MovieIcon,
  mp3: AudioFileIcon, wav: AudioFileIcon, ogg: AudioFileIcon, flac: AudioFileIcon,
};

/** Per-file-type icon, per the handoff's definition of done. Falls back to a generic doc. */
export const iconForFile = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ICONS[ext] ?? DescriptionIcon;
};

interface AttachmentCardProps {
  attachment: Attachment;
  /** 0-100 while uploading; omit when complete. */
  progress?: number;
}

export default function AttachmentCard({ attachment, progress }: AttachmentCardProps) {
  const Icon = iconForFile(attachment.name);
  const uploading = progress !== undefined && progress < 100;

  return (
    <Stack
      direction="row"
      spacing={1.25}
      sx={{
        alignItems: 'center',
        mt: 1, p: 1.25, px: 1.75,
        border: 1, borderColor: 'divider', borderRadius: 2.5,
        display: 'inline-flex',
        minWidth: 240,
      }}
    >
      <Icon color="primary" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 13, fontWeight: 500 }}>{attachment.name}</Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
          {uploading ? `Uploading… ${Math.round(progress)}%` : attachment.meta}
        </Typography>
        {uploading && (
          <LinearProgress variant="determinate" value={progress} sx={{ mt: 0.5, height: 3, borderRadius: 2 }} />
        )}
      </Box>
      {!uploading && (
        <IconButton size="small" aria-label={`Download ${attachment.name}`}>
          <DownloadIcon fontSize="inherit" />
        </IconButton>
      )}
    </Stack>
  );
}
