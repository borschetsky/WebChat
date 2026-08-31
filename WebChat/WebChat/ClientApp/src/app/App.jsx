import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import { breadcrumb } from '@/lib/error-reporter';
import AuthScreen from '@/features/auth/AuthScreen';
import CheckYourEmail from '@/features/auth/CheckYourEmail';
import ConfirmEmail from '@/features/auth/ConfirmEmail';
import AcceptInvite from '@/features/auth/AcceptInvite';
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
import { useGetProfileQuery } from '@/app/api/chatApi';
import { isAdminRole } from '@/features/admin/adminAccess';
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

// Lazy and never prefetched: almost nobody is an admin, and the console is a large screen
// nobody should download on the chance that they are.
const AdminConsole = lazy(() => import('@/features/admin/AdminConsole'));

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
  const location = useLocation();
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

  // A navigation breadcrumb per route change, so a crash report says where the user came from
  // rather than only where they were standing. Recorded here rather than by patching
  // `history.pushState`, because the router already knows - and only the pathname, never the
  // search string: invitation and reset tokens travel there, and a breadcrumb trail is read by
  // an administrator who is not the person it is about.
  useEffect(() => {
    breadcrumb('navigation', location.pathname);
  }, [location.pathname]);

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

      {/* Statically imported like the other auth screens, not lazily like the console.
          This is the first page an invited stranger ever sees, and a chunk fetch failing
          here would leave them looking at nothing with no idea why. */}
      <Route path="/invite" element={<InviteRoute user={user} />} />

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
            // The boundary is inside Suspense, not outside: a chunk that fails to load is a
            // rejected promise for Suspense to surface, and wrapping the other way round would
            // put the fallback in place of the whole route before the chunk had a chance.
            <Suspense fallback={null}>
              <AppErrorBoundary name="ChatApp">
                <ChatApp user={user} onSignOut={signOut} />
              </AppErrorBoundary>
            </Suspense>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* The admin console, at its own route rather than a pane inside the chat app.

          Guarded here only so a non-admin who types the URL lands somewhere sensible - it is
          navigation, not authorization. Every endpoint the console will eventually call is
          re-checked server-side against the workspace role, because a client-side route
          guard protects nothing at all. */}
      <Route
        path="/admin"
        element={
          user ? (
            <Suspense fallback={null}>
              <AppErrorBoundary name="AdminConsole">
                <AdminRoute />
              </AppErrorBoundary>
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
/**
 * Reads the token from the query string, like ConfirmRoute - useSearchParams is a hook and
 * cannot be called inside a Route element expression.
 *
 * On success it goes to the dashboard rather than back to sign-in: the person is now a
 * member and already has a session, so anything else would be an extra click for nothing.
 */
function InviteRoute({ user }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  return (
    <AcceptInvite
      token={params.get('token')}
      user={user}
      // The token is kept in the URL through the sign-in trip, so returning here works -
      // the page is the same one either way.
      onSignIn={() => navigate('/login')}
      onDone={() => navigate('/dashboard', { replace: true })}
    />
  );
}

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

/**
 * Resolves the profile before deciding whether the console may be shown.
 *
 * Split into its own component because the profile arrives asynchronously: rendering the
 * redirect while it is still loading would bounce an owner straight back to the dashboard
 * on every hard refresh of /admin.
 */
function AdminRoute() {
  const { data: profile, isLoading } = useGetProfileQuery();

  if (isLoading) return null;
  if (!profile || !isAdminRole(profile.role)) return <Navigate to="/dashboard" replace />;

  return <AdminConsole profile={profile} />;
}
