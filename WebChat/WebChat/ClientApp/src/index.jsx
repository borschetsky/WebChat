import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

import App from './components/App';
import { ThemeModeProvider } from './theme-mode';

// ThemeModeProvider owns light/dark and comfortable/compact, persists them to
// localStorage and supplies the MUI theme.
//
// The global CssBaseline still is not mounted here: the legacy screens depend on their own
// stylesheets until Phase 5 removes them. AppShell applies ScopedCssBaseline to the
// redesigned subtree instead, so both can coexist during the migration.

// React 18+ entry point. ReactDOM.render still works in 18 but warns, and is removed in 19.
const root = createRoot(document.getElementById('root'));
root.render(
  <ThemeModeProvider>
    <App />
  </ThemeModeProvider>
);
