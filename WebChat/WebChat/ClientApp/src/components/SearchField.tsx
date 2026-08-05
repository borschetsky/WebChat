import type { ReactNode } from 'react';
import { CircularProgress, IconButton, InputBase, Stack } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: ReactNode;
  /** 44 in the sidebar, 40 in the thread header. Radius follows automatically. */
  height?: number;
  autoFocus?: boolean;
  loading?: boolean;
  /** Accessible name; the visible placeholder is not one. */
  label: string;
}

/**
 * The pill-shaped filled search input used by the thread list, the in-thread search bar
 * and the compose dialog. Each had its own copy with slightly different heights.
 */
export default function SearchField({
  value,
  onChange,
  placeholder,
  icon,
  height = 44,
  autoFocus = false,
  loading = false,
  label,
}: SearchFieldProps) {
  return (
    <Stack
      direction="row"
      spacing={1.25}
      sx={{
        alignItems: 'center',
        flex: 1,
        height,
        px: 1.75,
        borderRadius: height / 2,
        bgcolor: 'background.field',
      }}
    >
      {icon}
      <InputBase
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputProps={{ 'aria-label': label }}
        sx={{ flex: 1, fontSize: 14 }}
      />
      {loading && <CircularProgress size={16} />}
      {!loading && value && (
        <IconButton size="small" aria-label="Clear search" onClick={() => onChange('')}>
          <CloseIcon fontSize="inherit" />
        </IconButton>
      )}
    </Stack>
  );
}
