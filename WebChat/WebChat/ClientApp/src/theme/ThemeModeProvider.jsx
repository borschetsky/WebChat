import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { buildTheme } from '@/theme/tokens';

// Appearance state for the redesign: light/dark and comfortable/compact.
//
// Both are client-only preferences - the API has nowhere to store them - so they persist
// to localStorage rather than through the mock layer, which is for things the backend
// *should* own. Mode defaults to the OS preference on first visit.

const STORAGE = { mode: 'webchat-theme-mode', density: 'webchat-density' };

const ThemeModeContext = createContext(null);

export const useThemeMode = () => {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used inside <ThemeModeProvider>');
  return ctx;
};

const read = (key, allowed, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / storage disabled - preference just will not persist */
  }
};

export function ThemeModeProvider({ children }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });

  // null means "never chosen" - follow the OS until the user picks explicitly.
  const [storedMode, setStoredMode] = useState(() => read(STORAGE.mode, ['light', 'dark'], null));
  const [density, setDensityState] = useState(() =>
    read(STORAGE.density, ['comfortable', 'compact'], 'comfortable'));

  const mode = storedMode ?? (prefersDark ? 'dark' : 'light');

  const setMode = (next) => { setStoredMode(next); write(STORAGE.mode, next); };
  const setDensity = (next) => { setDensityState(next); write(STORAGE.density, next); };
  const toggleMode = () => setMode(mode === 'dark' ? 'light' : 'dark');

  const theme = useMemo(() => buildTheme(mode), [mode]);

  // Keep the browser UI (scrollbars, form controls) in step with the app.
  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  const value = useMemo(
    () => ({ mode, density, setMode, setDensity, toggleMode, followsSystem: storedMode === null }),
    [mode, density, storedMode]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export default ThemeModeProvider;
