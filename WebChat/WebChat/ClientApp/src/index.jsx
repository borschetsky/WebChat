import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import CssBaseline from '@mui/material/CssBaseline';
import './index.css';

import App from '@/app/App';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import { store } from '@/app/store';
import { installErrorReporter } from '@/lib/error-reporter';
import { externalAuth } from '@/features/auth/externalAuth';
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

// An external provider's redirect lands here with its response in the URL. It has to be
// consumed before the router renders: the first <Navigate> would rewrite the URL and throw
// the response away. Only with a provider configured - a password-only build never loads it.
// A failure must not stop the app rendering; the sign-in screen is where it gets retried.
const ready = externalAuth ? externalAuth.completeRedirect().catch(() => {}) : Promise.resolve();

// createRoot is the only entry point on React 19 - the legacy render API is gone.
const root = createRoot(document.getElementById('root'));
void ready.then(() =>
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
  ),
);
