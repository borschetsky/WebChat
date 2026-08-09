import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import AuthScreen from '@/features/auth/AuthScreen';
import CheckYourEmail from '@/features/auth/CheckYourEmail';
import ConfirmEmail from '@/features/auth/ConfirmEmail';
import ForgotPassword from '@/features/auth/ForgotPassword';
import ResetPassword from '@/features/auth/ResetPassword';
import {
  login,
  register,
  confirmEmail,
  resendConfirmation,
  forgotPassword,
  resetPassword,
} from '@/services';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  authBusy,
  signedIn,
  signedOut,
  selectAuthBusy,
  selectUser,
} from '@/features/auth/authSlice';

/**
 * The authenticated app, split out of the initial download.
 *
 * ChatApp pulls in the bulk of the client - the message list and its virtualizer, the
 * settings drawer, the compose dialog, and the long tail of MUI components and icons only
 * those screens use. None of it is needed to render a sign-in form, and before this it all
 * arrived before the login screen could paint.
 *
 * The import lives in a named function rather than inline so it can also be *called*, to
 * warm the chunk before anything renders it - see prefetchChatApp below. Vite dedupes the
 * two: it is one chunk and one request, whichever call starts it.
 */
const importChatApp = () => import('@/app/ChatApp');
const ChatApp = lazy(importChatApp);

/**
 * Start downloading the chat chunk without rendering it.
 *
 * This is what keeps the Suspense boundary below from ever being seen in practice. Two
 * callers: an effect that fires once the auth screens have painted (the network is idle
 * while someone types their password), and signIn, which awaits it while the submit button
 * is already showing "Please wait…". A rejection is swallowed - a failed prefetch must not
 * fail a sign-in, and the lazy render will retry the import anyway.
 */
const prefetchChatApp = () => importChatApp().catch(() => {});

function AppRoutes() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const busy = useAppSelector(selectAuthBusy);

  // Who just registered, and whether their mail actually went out. Held here rather than in
  // the store because it is worthless after a reload - the account exists either way, and a
  // refreshed page should show the sign-in screen, not a stale "check your email".
  const [pending, setPending] = useState(null);

  // Warm the chat chunk as soon as the first screen has painted. On the auth routes that is
  // dead time - the visitor is reading or typing - and by the time they submit, the chunk is
  // already in the module cache. For a session restored from storage the route renders
  // ChatApp immediately, so this runs concurrently with the lazy import rather than instead
  // of it, and costs nothing.
  useEffect(() => {
    void prefetchChatApp();
  }, []);

  const signIn = useCallback(
    async (payload) => {
      dispatch(authBusy(true));
      try {
        const res = await login(payload);
        // Have the chunk in hand before switching routes. `busy` is still true here, so the
        // submit button reads "Please wait…" for the (usually zero) time this takes, rather
        // than the sign-in screen blanking into a Suspense fallback.
        await prefetchChatApp();
        // The reducer owns localStorage, so persistence is not a component concern.
        dispatch(signedIn(res.data));
        navigate('/dashboard', { replace: true });
      } catch (err) {
        dispatch(authBusy(false));
        throw err;
      }
    },
    [dispatch, navigate],
  );

  // Registration no longer returns a session: the address has to be proven reachable first.
  // So this ends on the check-your-email screen rather than the dashboard.
  const signUp = useCallback(
    async (payload) => {
      dispatch(authBusy(true));
      try {
        const res = await register(payload);
        setPending({ email: payload.email, emailSent: res.data?.emailSent !== false });
        dispatch(authBusy(false));
        navigate('/check-email', { replace: true });
      } catch (err) {
        dispatch(authBusy(false));
        throw err;
      }
    },
    [dispatch, navigate],
  );

  const activate = useCallback(async (token) => {
    const res = await confirmEmail(token);
    return res.data;
  }, []);

  // Same reasoning as signIn: ConfirmEmail and ResetPassword have both already switched to
  // their "taking you to your messages…" state when they call this, so waiting for the chunk
  // here happens under a screen that is already explaining the wait.
  const activated = useCallback(
    async (auth) => {
      await prefetchChatApp();
      dispatch(signedIn(auth));
      navigate('/dashboard', { replace: true });
    },
    [dispatch, navigate],
  );

  const resend = useCallback(async (email) => {
    await resendConfirmation(email);
  }, []);

  const requestReset = useCallback(async (email) => {
    await forgotPassword(email);
  }, []);

  const applyReset = useCallback(async (token, password) => {
    const res = await resetPassword(token, password);
    return res.data;
  }, []);

  const signOut = useCallback(() => {
    dispatch(signedOut());
    navigate('/login', { replace: true });
  }, [dispatch, navigate]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthScreen
              mode="login"
              busy={busy}
              onSubmit={signIn}
              onSwitch={() => navigate('/register')}
              onForgotPassword={() => navigate('/forgot-password')}
              onNeedsConfirmation={(email) => {
                // The API answered 403 email_not_confirmed. Reuse the post-registration
                // screen: the situation and the way out of it are identical.
                setPending({ email, emailSent: true });
                navigate('/check-email', { replace: true });
              }}
            />
          )
        }
      />

      <Route
        path="/register"
        element={
          user ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthScreen
              mode="register"
              busy={busy}
              onSubmit={signUp}
              onSwitch={() => navigate('/login')}
            />
          )
        }
      />

      <Route
        path="/check-email"
        element={
          pending ? (
            <CheckYourEmail
              email={pending.email}
              emailSent={pending.emailSent}
              onResend={resend}
              onBackToLogin={() => navigate('/login')}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route path="/confirm" element={<ConfirmRoute onConfirm={activate} onDone={activated} />} />

      <Route
        path="/forgot-password"
        element={
          user ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <ForgotPassword onRequest={requestReset} onBackToLogin={() => navigate('/login')} />
          )
        }
      />

      <Route
        path="/reset-password"
        element={<ResetRoute onReset={applyReset} onDone={activated} />}
      />

      {/* The Suspense boundary wraps this element and nothing else.
          Putting it around <Routes> would be wrong: every auth screen is statically imported
          and can never suspend, so a boundary up there would only widen what a chat-chunk
          fetch is allowed to blank out - the sign-in card included.

          The fallback is null rather than a spinner, deliberately. Every path into this
          route awaits prefetchChatApp first, so the only way to reach the fallback is a
          first load straight onto /dashboard with a stored session, where the alternative to
          "nothing" is not the previous screen - it is the empty document that was there
          anyway. A spinner would flash on a fast connection and say nothing on a slow one. */}
      <Route
        path="/dashboard"
        element={
          user ? (
            <Suspense fallback={null}>
              <ChatApp user={user} onSignOut={signOut} />
            </Suspense>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* v6+ matches paths exactly, so the catch-all has to be "*" rather than "/". */}
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}

/**
 * Reads the token from the query string. Split out because useSearchParams is a hook and
 * cannot be called inside the Route element expression above.
 */
function ConfirmRoute({ onConfirm, onDone }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  return (
    <ConfirmEmail
      token={params.get('token')}
      onConfirm={onConfirm}
      onDone={onDone}
      onBackToLogin={() => navigate('/login', { replace: true })}
    />
  );
}

/**
 * Reads the token from the query string, for the same reason ConfirmRoute does: useSearchParams
 * is a hook and cannot be called inside a Route element expression.
 */
function ResetRoute({ onReset, onDone }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  return (
    <ResetPassword
      token={params.get('token')}
      onReset={onReset}
      onDone={onDone}
      onBackToLogin={() => navigate('/login', { replace: true })}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
