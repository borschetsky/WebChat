import React from 'react';
import { List, ListItem, ListItemIcon, ListItemText, Switch, Typography } from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import DensitySmallIcon from '@mui/icons-material/DensitySmall';
import { useThemeMode } from '../../theme-mode';

/**
 * The "Appearance" block of the settings drawer: dark mode and compact density.
 * Both are client-only preferences persisted to localStorage by ThemeModeProvider.
 */
export default function AppearanceControls() {
  const { mode, density, setMode, setDensity, followsSystem } = useThemeMode();

  return (
    <>
      <Typography sx={{ px: 2, pt: 2, pb: 0.5, fontSize: 12, fontWeight: 500, color: 'text.secondary', letterSpacing: '.04em' }}>
        APPEARANCE
      </Typography>
      <List disablePadding>
        <ListItem
          secondaryAction={
            <Switch
              edge="end"
              checked={mode === 'dark'}
              onChange={(e) => setMode(e.target.checked ? 'dark' : 'light')}
              inputProps={{ 'aria-label': 'Dark mode' }}
            />
          }
        >
          <ListItemIcon sx={{ minWidth: 40 }}><DarkModeIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Dark mode"
            secondary={followsSystem ? 'Following system' : null}
            slotProps={{ primary: { fontSize: 14 }, secondary: { fontSize: 12 } }}
          />
        </ListItem>

        <ListItem
          secondaryAction={
            <Switch
              edge="end"
              checked={density === 'compact'}
              onChange={(e) => setDensity(e.target.checked ? 'compact' : 'comfortable')}
              inputProps={{ 'aria-label': 'Compact density' }}
            />
          }
        >
          <ListItemIcon sx={{ minWidth: 40 }}><DensitySmallIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Compact density"
            secondary="Tighter rows and smaller avatars"
            slotProps={{ primary: { fontSize: 14 }, secondary: { fontSize: 12 } }}
          />
        </ListItem>
      </List>
    </>
  );
}
