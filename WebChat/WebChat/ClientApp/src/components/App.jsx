import React, { useCallback, useState } from 'react';
import { BrowserRouter, Switch, Route, Redirect, useHistory } from 'react-router-dom';
import AuthScreen from './auth/AuthScreen';
import ChatApp from './chat/ChatApp';
import { login, register } from '../services';

const STORAGE_KEY = 'user-data';

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};

function Routes() {
  const history = useHistory();
  const [user, setUser] = useState(readUser);
  const [busy, setBusy] = useState(false);

  const authenticate = useCallback(async (fn, payload) => {
    setBusy(true);
    try {
      const res = await fn(payload);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data));
      setUser(res.data);
      history.push('/dashboard');
    } finally {
      setBusy(false);
    }
  }, [history]);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    history.push('/login');
  }, [history]);

  return (
    <Switch>
      <Route path="/login">
        {user ? <Redirect to="/dashboard" /> : (
          <AuthScreen mode="login" busy={busy}
            onSubmit={(p) => authenticate(login, p)}
            onSwitch={() => history.push('/register')} />
        )}
      </Route>

      <Route path="/register">
        {user ? <Redirect to="/dashboard" /> : (
          <AuthScreen mode="register" busy={busy}
            onSubmit={(p) => authenticate(register, p)}
            onSwitch={() => history.push('/login')} />
        )}
      </Route>

      <Route path="/dashboard">
        {user ? <ChatApp user={user} onSignOut={signOut} /> : <Redirect to="/login" />}
      </Route>

      <Route path="/">
        <Redirect to={user ? '/dashboard' : '/login'} />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes />
    </BrowserRouter>
  );
}
