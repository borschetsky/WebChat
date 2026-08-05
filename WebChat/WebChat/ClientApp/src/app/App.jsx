import React, { useCallback, useState } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams,
} from 'react-router-dom';
import AuthScreen from '@/features/auth/AuthScreen';
import CheckYourEmail from '@/features/auth/CheckYourEmail';
import ConfirmEmail from '@/features/auth/ConfirmEmail';
import ForgotPassword from '@/features/auth/ForgotPassword';
import ResetPassword from '@/features/auth/ResetPassword';
import ChatApp from '@/app/ChatApp';
import {
  login, register, confirmEmail, resendConfirmation, forgotPassword, resetPassword,
} from '@/services';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  authBusy, signedIn, signedOut, selectAuthBusy, selectUser,
} from '@/features/auth/authSlice';

function AppRoutes() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const busy = useAppSelector(selectAuthBusy);

  // Who just registered, and whether their mail actually went out. Held here rather than in
  // the store because it is worthless after a reload - the account exists either way, and a
  // refreshed page should show the sign-in screen, not a stale "check your email".
  const [pending, setPending] = useState(null);

  const signIn = useCallback(async (payload) => {
    dispatch(authBusy(true));
    try {
      const res = await login(payload);
      // The reducer owns localStorage, so persistence is not a component concern.
      dispatch(signedIn(res.data));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      dispatch(authBusy(false));
      throw err;
    }
  }, [dispatch, navigate]);

  // Registration no longer returns a session: the address has to be proven reachable first.
  // So this ends on the check-your-email screen rather than the dashboard.
  const signUp = useCallback(async (payload) => {
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
  }, [dispatch, navigate]);

  const activate = useCallback(async (token) => {
    const res = await confirmEmail(token);
    return res.data;
  }, []);

  const activated = useCallback((auth) => {
    dispatch(signedIn(auth));
    navigate('/dashboard', { replace: true });
  }, [dispatch, navigate]);

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
        element={user ? <Navigate to="/dashboard" replace /> : (
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
        )}
      />

      <Route
        path="/register"
        element={user ? <Navigate to="/dashboard" replace /> : (
          <AuthScreen
            mode="register"
            busy={busy}
            onSubmit={signUp}
            onSwitch={() => navigate('/login')}
          />
        )}
      />

      <Route
        path="/check-email"
        element={pending ? (
          <CheckYourEmail
            email={pending.email}
            emailSent={pending.emailSent}
            onResend={resend}
            onBackToLogin={() => navigate('/login')}
          />
        ) : <Navigate to="/login" replace />}
      />

      <Route path="/confirm" element={<ConfirmRoute onConfirm={activate} onDone={activated} />} />

      <Route
        path="/forgot-password"
        element={user ? <Navigate to="/dashboard" replace /> : (
          <ForgotPassword onRequest={requestReset} onBackToLogin={() => navigate('/login')} />
        )}
      />

      <Route path="/reset-password" element={<ResetRoute onReset={applyReset} onDone={activated} />} />

      <Route
        path="/dashboard"
        element={user ? <ChatApp user={user} onSignOut={signOut} /> : <Navigate to="/login" replace />}
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
