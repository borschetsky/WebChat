import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import CssBaseline from '@mui/material/CssBaseline';
import App from '@/app/App';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';

// SignalR now lives in middleware; stub the hub so no socket is opened.
vi.mock('@microsoft/signalr', () => ({
  HubConnectionState: { Connected: 'Connected' },
  HubConnectionBuilder: class {
    withUrl() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    build() {
      return {
        state: 'Disconnected',
        on() {},
        off() {},
        onreconnecting() {},
        onreconnected() {},
        onclose() {},
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
        invoke: () => Promise.resolve(),
      };
    }
  },
}));

// Every API call goes through chat-service, so stubbing it stubs the whole data layer.
vi.mock('@/services/chat-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chat-service')>();
  return {
    ...actual,
    loadProfile: vi.fn().mockResolvedValue({
      id: 'me',
      name: 'Test User',
      email: 't@e.com',
      avatarFileName: null,
      color: '#1976d2',
    }),
    loadThreads: vi.fn().mockResolvedValue([]),
    loadMessages: vi.fn().mockResolvedValue([]),
  };
});

import { makeStore } from '@/app/store';

const renderApp = (store = makeStore()) =>
  render(
    <Provider store={store}>
      <ThemeModeProvider>
        <CssBaseline />
        <App />
      </ThemeModeProvider>
    </Provider>,
  );

describe('app boot', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('renders the sign-in screen when signed out', async () => {
    renderApp();
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('renders the chat shell when a session exists', async () => {
    localStorage.setItem(
      'user-data',
      JSON.stringify({ token: 'jwt', tokenExpirationTime: 1, id: 'me' }),
    );
    renderApp();
    // The thread list header shows the signed-in user once the profile query resolves.
    expect(await screen.findByText('Test User')).toBeInTheDocument();
    expect(screen.getByLabelText('New conversation')).toBeInTheDocument();
    expect(screen.getByLabelText('Search people and messages')).toBeInTheDocument();
  });

  it('shows the empty state with no threads', async () => {
    localStorage.setItem(
      'user-data',
      JSON.stringify({ token: 'jwt', tokenExpirationTime: 1, id: 'me' }),
    );
    renderApp();
    expect(await screen.findByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByText('No conversation selected')).toBeInTheDocument();
  });
});
