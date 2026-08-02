import React from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import './index.css';

import App from '@/app/App';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';

// ThemeModeProvider owns light/dark and comfortable/compact, persists them to localStorage
// and supplies the MUI theme. CssBaseline is global now that every routed screen is a
// redesigned one - the legacy stylesheets it would have clobbered are out of the graph.

// createRoot is the only entry point on React 19 - the legacy render API is gone.
const root = createRoot(document.getElementById('root'));
root.render(
  <ThemeModeProvider>
    <CssBaseline />
    <App />
  </ThemeModeProvider>
);
