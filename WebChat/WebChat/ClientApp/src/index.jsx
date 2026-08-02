import React from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import './index.css';

import App from './components/App';
import { ThemeModeProvider } from './theme-mode';

// ThemeModeProvider owns light/dark and comfortable/compact, persists them to localStorage
// and supplies the MUI theme. CssBaseline is global now that every routed screen is a
// redesigned one - the legacy stylesheets it would have clobbered are out of the graph.

// React 18+ entry point. ReactDOM.render still works in 18 but warns, and is removed in 19.
const root = createRoot(document.getElementById('root'));
root.render(
  <ThemeModeProvider>
    <CssBaseline />
    <App />
  </ThemeModeProvider>
);
