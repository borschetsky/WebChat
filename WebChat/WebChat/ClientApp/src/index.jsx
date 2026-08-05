import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import CssBaseline from '@mui/material/CssBaseline';
import './index.css';

import App from '@/app/App';
import { store } from '@/app/store';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';

// ThemeModeProvider owns light/dark and comfortable/compact, persists them to localStorage
// and supplies the MUI theme. Redux owns session, view and composer state.

// createRoot is the only entry point on React 19 - the legacy render API is gone.
const root = createRoot(document.getElementById('root'));
root.render(
  <Provider store={store}>
    <ThemeModeProvider>
      <CssBaseline />
      <App />
    </ThemeModeProvider>
  </Provider>,
);
