import React, { useCallback, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import AuthScreen from '@/features/auth/AuthScreen';
import ChatApp from '@/app/ChatApp';
import { login, register } from '@/services';

const STORAGE_KEY = 'user-data';

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};

function AppRoutes() {
  const navigate = useNavigate();
  const [user, setUser] = useState(readUser);
  const [busy, setBusy] = useState(false);

  const authenticate = useCallback(async (fn, payload) => {
    setBusy(true);
    try {
      const res = await fn(payload);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data));
      setUser(res.data);
      navigate('/dashboard', { replace: true });
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

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

      {/* v6 matches paths exactly, so the catch-all has to be "*" rather than "/". */}
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
