import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import CssBaseline from '@mui/material/CssBaseline';
import './index.css';

import App from '@/app/App';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import { store } from '@/app/store';
import { installErrorReporter } from '@/lib/error-reporter';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';

// ThemeModeProvider owns light/dark and comfortable/compact, persists them to localStorage
// and supplies the MUI theme. Redux owns session, view and composer state.

// Crash reporting (#74). Installed here, before the first render, because the two global
// handlers it registers have to be in place before anything can throw.
//
// The token is read through a function rather than passed in: the reporter outlives every
// session, and a crash an hour after sign-in has to carry that session's token, not the
// null there was at start-up.
installErrorReporter(() => store.getState().auth.user?.token ?? null);

// createRoot is the only entry point on React 19 - the legacy render API is gone.
const root = createRoot(document.getElementById('root'));
root.render(
  <Provider store={store}>
    <ThemeModeProvider>
      <CssBaseline />
      {/* The last resort. The route-level boundaries inside App catch almost everything
          worth catching and leave the rest of the app running; this one exists so that a
          failure above them - in the router itself, say - shows a message and reports
          itself rather than leaving a blank document. It is inside the theme provider on
          purpose, since its fallback is MUI. */}
      <AppErrorBoundary name="Root">
        <App />
      </AppErrorBoundary>
    </ThemeModeProvider>
  </Provider>,
);
