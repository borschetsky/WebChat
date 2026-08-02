import { createTheme, alpha } from '@mui/material/styles';

// Ported from the design handoff (design_handoff_chat_mui). The handoff states that
// colors, type and spacing are final, so token values here are reproduced verbatim -
// do not "tidy" them. Structure is adapted for MUI v9.

export const PRESENCE = { online: '#2e7d32', away: '#f9a825', offline: '#9aa0a6' };

export const AVATAR_PALETTE = ['#1976d2', '#7b1fa2', '#2e7d32', '#ef6c00', '#c2185b', '#00838f', '#5d4037'];

/** Deterministic avatar colour so a given user keeps the same colour across sessions. */
export const avatarColor = (key = '') => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/** density: 'comfortable' | 'compact' */
export const densityTokens = (density) =>
  density === 'compact'
    ? { rowPadY: 0.9, avatar: 34, nameSize: 14, msgSize: 14, msgPadY: 0.6, groupPadY: 0.15 }
    : { rowPadY: 1.4, avatar: 40, nameSize: 15, msgSize: 15, msgPadY: 1.1, groupPadY: 0.25 };

export const buildTheme = (mode) => {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#90caf9' : '#1976d2', contrastText: dark ? '#0b1b2b' : '#ffffff' },
      error: { main: dark ? '#f28b82' : '#d32f2f' },
      background: {
        default: dark ? '#0f1114' : '#eceff1',
        paper: dark ? '#1e2024' : '#ffffff',
        chat: dark ? '#191b1f' : '#ffffff',
        field: dark ? '#2a2d33' : '#f1f3f4',
        quote: dark ? '#22303c' : '#e8f1fb',
        selected: dark ? '#12344d' : '#e3f2fd',
        skeleton: dark ? '#2c3036' : '#e6e9ec',
      },
      divider: dark ? '#2c2f35' : '#e3e6e8',
      text: {
        primary: dark ? '#e6e1e5' : '#1c1b1f',
        secondary: dark ? '#a2a6ad' : '#5f6368',
        disabled: dark ? '#7d828a' : '#8b9096',
      },
      action: { hover: dark ? '#26292e' : '#f5f7f9' },
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: 'Roboto, Helvetica, Arial, sans-serif',
      button: { textTransform: 'uppercase', fontWeight: 500, letterSpacing: '.03em' },
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: { defaultProps: { disableElevation: false }, styleOverrides: { root: { borderRadius: 8, minHeight: 42 } } },
      MuiListItemButton: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
      MuiTooltip: { defaultProps: { arrow: false } },
    },
    custom: {
      border2: dark ? '#3a3e45' : '#c9ced3',
      depth1: dark ? '0 1px 3px rgba(0,0,0,.6)' : '0 1px 3px rgba(0,0,0,.18)',
      depth2: dark ? '0 12px 32px rgba(0,0,0,.55)' : '0 10px 30px rgba(0,0,0,.14)',
      tint: (c, a) => alpha(c, a),
    },
  });
};

export default buildTheme;
