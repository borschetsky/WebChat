import React, { useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import AuthScreen from '@/features/auth/AuthScreen';
import ChatApp from '@/app/ChatApp';
import { login, register } from '@/services';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  authBusy, signedIn, signedOut, selectAuthBusy, selectUser,
} from '@/features/auth/authSlice';

function AppRoutes() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const busy = useAppSelector(selectAuthBusy);

  const authenticate = useCallback(async (fn, payload) => {
    dispatch(authBusy(true));
    try {
      const res = await fn(payload);
      // The reducer owns localStorage, so persistence is not a component concern.
      dispatch(signedIn(res.data));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      dispatch(authBusy(false));
      throw err;
    }
  }, [dispatch, navigate]);

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
            onSubmit={(p) => authenticate(login, p)}
            onSwitch={() => navigate('/register')}
          />
        )}
      />

      <Route
        path="/register"
        element={user ? <Navigate to="/dashboard" replace /> : (
          <AuthScreen
            mode="register"
            busy={busy}
            onSubmit={(p) => authenticate(register, p)}
            onSwitch={() => navigate('/login')}
          />
        )}
      />

      <Route
        path="/dashboard"
        element={user ? <ChatApp user={user} onSignOut={signOut} /> : <Navigate to="/login" replace />}
      />

      {/* v6+ matches paths exactly, so the catch-all has to be "*" rather than "/". */}
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
