import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import './index.css';

import App from './components/App';
import { buildTheme } from './theme';

// Phase 0 of the MUI redesign: the provider is mounted so every subsequent screen can
// consume the design tokens. CssBaseline is deliberately NOT enabled yet - it would reset
// the legacy stylesheets the current screens still depend on. It lands in Phase 2 with the
// new app shell, once those stylesheets are removed.
const theme = buildTheme('light');

// React 18+ entry point. ReactDOM.render still works in 18 but warns, and is removed in 19.
const root = createRoot(document.getElementById('root'));
root.render(
  <ThemeProvider theme={theme}>
    <App />
  </ThemeProvider>
);
