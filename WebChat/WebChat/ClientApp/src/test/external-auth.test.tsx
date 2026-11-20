import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore } from '@/app/store';
import AuthScreen from '@/features/auth/AuthScreen';
import { createMsalClient } from '@/features/auth/externalAuth';
import type { ExternalAuthClient, ExternalToken } from '@/features/auth/externalAuth';
import { useExternalSession } from '@/features/auth/useExternalSession';
import { readStoredUser, signedIn, tokenRefreshed } from '@/features/auth/authSlice';
import type { ExternalProviderConfig } from '@/config';

const getProfile = vi.fn();
vi.mock('@/services', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getProfile: (...args: unknown[]) => getProfile(...args),
}));

const provider: ExternalProviderConfig = {
  name: 'entra',
  label: 'Microsoft',
  clientId: 'spa-client',
  authority: 'https://tenant.ciamlogin.com/tid/v2.0',
  apiScope: 'api://api-client/chat.access',
};

/**
 * Just enough of @azure/msal-browser for createMsalClient: a client application whose
 * accounts and token answers each test arranges, and the one error class it checks for.
 */
class InteractionRequiredAuthError extends Error {}

/** MSAL's own error type, carrying the code the client branches on. */
class BrowserAuthError extends Error {
  constructor(
    public errorCode: string,
    public subError = '',
  ) {
    super(errorCode);
  }
}

const fakeMsal = (opts: {
  redirectAccount?: object | null;
  cachedAccounts?: object[];
  silent?: () => Promise<{ accessToken: string; expiresOn: Date | null }>;
}) => {
  let active: object | null = null;
  const pca = {
    config: null as unknown,
    handleRedirectPromise: vi.fn(async () =>
      opts.redirectAccount ? { account: opts.redirectAccount } : null,
    ),
    getActiveAccount: () => active,
    getAllAccounts: () => opts.cachedAccounts ?? [],
    setActiveAccount: (a: object | null) => {
      active = a;
    },
    clearCache: vi.fn(async () => {}),
    acquireTokenSilent: vi.fn(
      opts.silent ?? (async () => ({ accessToken: 'at', expiresOn: new Date(1_900_000_000_000) })),
    ),
    loginRedirect: vi.fn(async () => {}),
    logoutRedirect: vi.fn(async () => {}),
  };
  const module = {
    InteractionRequiredAuthError,
    BrowserAuthError,
    createStandardPublicClientApplication: vi.fn(async (config: unknown) => {
      pca.config = config;
      return pca;
    }),
  };
  // The cast is the fake's whole point: it implements only what the client calls.
  return { pca, load: async () => module as unknown as typeof import('@azure/msal-browser') };
};

describe('createMsalClient', () => {
  it('trusts the provider host explicitly - MSAL refuses ciamlogin.com otherwise', async () => {
    const { pca, load } = fakeMsal({});
    await createMsalClient(provider, load).completeRedirect();

    const config = pca.config as { auth: { knownAuthorities: string[]; redirectUri: string } };
    expect(config.auth.knownAuthorities).toEqual(['tenant.ciamlogin.com']);
    expect(config.auth.redirectUri).toBe(`${window.location.origin}/`);
  });

  it('resumes nothing when the provider holds no account', async () => {
    const { pca, load } = fakeMsal({});
    expect(await createMsalClient(provider, load).resume()).toBeNull();
    expect(pca.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('turns a redirect that just landed into a token, in Unix seconds', async () => {
    const { pca, load } = fakeMsal({ redirectAccount: { homeAccountId: 'a' } });

    const token = await createMsalClient(provider, load).resume();

    expect(token).toEqual({ token: 'at', tokenExpirationTime: 1_900_000_000 });
    expect(pca.acquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: [provider.apiScope], account: { homeAccountId: 'a' } }),
    );
  });

  /**
   * MSAL v5 renews in a hidden iframe once the SPA refresh token (24 hours) is gone, and the
   * iframe's redirect page must hand the response back with broadcastResponseToMainFrame.
   * The app root cannot - it boots the whole SPA instead - so the iframe waited 10 s and
   * failed with timed_out / redirect_bridge_timeout for everyone signed in a day earlier.
   */
  it('renews silently through the redirect bridge page, not the app root', async () => {
    const { pca, load } = fakeMsal({ redirectAccount: { homeAccountId: 'a' } });

    await createMsalClient(provider, load).resume();

    expect(pca.acquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: `${window.location.origin}/redirect.html` }),
    );
  });

  it('reports a renewal that timed out as null, so the sign-in button is all that shows', async () => {
    const { load } = fakeMsal({
      redirectAccount: { homeAccountId: 'a' },
      silent: async () => {
        throw new BrowserAuthError('timed_out', 'redirect_bridge_timeout');
      },
    });

    expect(await createMsalClient(provider, load).resume()).toBeNull();
  });

  /**
   * The stale account is what Entra then refused: MSAL sent it as login_hint with the next
   * sign-in, and the provider answered "We couldn't sign you in" until its cache was cleared
   * by hand.
   */
  it('forgets the stale account when renewal cannot continue, so the next sign-in starts clean', async () => {
    const stale = { homeAccountId: 'a' };
    const { pca, load } = fakeMsal({
      redirectAccount: stale,
      silent: async () => {
        throw new BrowserAuthError('timed_out', 'redirect_bridge_timeout');
      },
    });

    await createMsalClient(provider, load).resume();

    expect(pca.clearCache).toHaveBeenCalledWith({ account: stale });
    expect(pca.getActiveAccount()).toBeNull();
  });

  it('falls back to a cached account when no redirect is in flight', async () => {
    const { load } = fakeMsal({ cachedAccounts: [{ homeAccountId: 'cached' }] });
    expect(await createMsalClient(provider, load).resume()).not.toBeNull();
  });

  /**
   * Without `email` consented Entra leaves the email claim out of the access token, and the
   * server cannot create an account for a first sign-in - it answers 401.
   */
  it('asks for the email scope at sign-in', async () => {
    const { pca, load } = fakeMsal({});
    await createMsalClient(provider, load).signIn();
    expect(pca.loginRedirect).toHaveBeenCalledWith({ scopes: [provider.apiScope, 'email'] });
  });

  it('reports a renewal that needs the sign-in page as null, not a redirect', async () => {
    const { pca, load } = fakeMsal({
      redirectAccount: { homeAccountId: 'a' },
      silent: async () => {
        throw new InteractionRequiredAuthError('login_required');
      },
    });

    expect(await createMsalClient(provider, load).refresh()).toBeNull();
    expect(pca.loginRedirect).not.toHaveBeenCalled();
  });

  it('does not swallow other failures', async () => {
    const { load } = fakeMsal({
      redirectAccount: { homeAccountId: 'a' },
      silent: async () => {
        throw new Error('network down');
      },
    });

    await expect(createMsalClient(provider, load).refresh()).rejects.toThrow('network down');
  });

  it('initialises MSAL once however many calls arrive', async () => {
    const { load } = fakeMsal({ redirectAccount: { homeAccountId: 'a' } });
    const spy = vi.fn(load);
    const client = createMsalClient(provider, spy);

    await Promise.all([client.completeRedirect(), client.resume(), client.refresh()]);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('external sessions in the auth slice', () => {
  beforeEach(() => localStorage.clear());

  it('never persists an external session - its token outlives nothing', () => {
    const store = makeStore({ user: null, busy: false });
    store.dispatch(signedIn({ token: 't', tokenExpirationTime: 1, id: 'u1', provider: 'entra' }));

    expect(localStorage.getItem('user-data')).toBeNull();
  });

  it('ignores an external session found in storage anyway', () => {
    localStorage.setItem(
      'user-data',
      JSON.stringify({ token: 't', tokenExpirationTime: 1, id: 'u1', provider: 'entra' }),
    );
    expect(readStoredUser()).toBeNull();
  });

  it('still restores a password session stored before provider existed', () => {
    localStorage.setItem(
      'user-data',
      JSON.stringify({ token: 't', tokenExpirationTime: 1, id: 'u1' }),
    );
    expect(readStoredUser()?.id).toBe('u1');
  });

  it('renews the token without touching who is signed in', () => {
    const store = makeStore({ user: null, busy: false });
    store.dispatch(signedIn({ token: 'old', tokenExpirationTime: 1, id: 'u1', provider: 'entra' }));
    store.dispatch(tokenRefreshed({ token: 'new', tokenExpirationTime: 2 }));

    expect(store.getState().auth.user).toEqual({
      token: 'new',
      tokenExpirationTime: 2,
      id: 'u1',
      provider: 'entra',
    });
  });
});

const fakeClient = (overrides: Partial<ExternalAuthClient> = {}): ExternalAuthClient => ({
  name: 'entra',
  label: 'Microsoft',
  completeRedirect: vi.fn(async () => {}),
  resume: vi.fn(async (): Promise<ExternalToken | null> => null),
  signIn: vi.fn(async () => {}),
  refresh: vi.fn(async (): Promise<ExternalToken | null> => null),
  signOut: vi.fn(async () => {}),
  ...overrides,
});

const withStore = (store: ReturnType<typeof makeStore>) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };

describe('useExternalSession', () => {
  beforeEach(() => {
    localStorage.clear();
    getProfile.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  /**
   * The session's id is the *local* user id, from the API - never anything out of the
   * provider's token. Every request the app makes names the caller by that id.
   */
  it('signs in with the id the API returns for the provider token', async () => {
    const store = makeStore({ user: null, busy: false });
    const client = fakeClient({
      resume: vi.fn(async () => ({ token: 'at', tokenExpirationTime: 9 })),
    });
    getProfile.mockResolvedValue({ data: { id: 'local-42' } });
    const onSignedIn = vi.fn();

    renderHook(() => useExternalSession(client, onSignedIn), { wrapper: withStore(store) });

    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(getProfile).toHaveBeenCalledWith('at');
    expect(store.getState().auth.user).toEqual({
      token: 'at',
      tokenExpirationTime: 9,
      id: 'local-42',
      provider: 'entra',
    });
  });

  it('explains a session the API refused instead of failing silently', async () => {
    const store = makeStore({ user: null, busy: false });
    const client = fakeClient({
      resume: vi.fn(async () => ({ token: 'at', tokenExpirationTime: 9 })),
    });
    getProfile.mockRejectedValue({ response: { status: 401 } });

    const { result } = renderHook(() => useExternalSession(client, vi.fn()), {
      wrapper: withStore(store),
    });

    await waitFor(() => expect(result.current.resuming).toBe(false));
    expect(result.current.error).toMatch(/refused the session/);
    expect(store.getState().auth.user).toBeNull();
  });

  it('leaves a restored password session alone', async () => {
    const store = makeStore({
      user: { token: 'local', tokenExpirationTime: 9, id: 'u1' },
      busy: false,
    });
    const client = fakeClient();

    const { result } = renderHook(() => useExternalSession(client, vi.fn()), {
      wrapper: withStore(store),
    });

    await waitFor(() => expect(result.current.resuming).toBe(false));
    expect(client.resume).not.toHaveBeenCalled();
  });

  it('renews the token before it expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const now = Date.now();
    const store = makeStore({
      user: {
        token: 'old',
        tokenExpirationTime: Math.floor(now / 1000) + 3600,
        id: 'u1',
        provider: 'entra',
      },
      busy: false,
    });
    const client = fakeClient({
      refresh: vi.fn(async () => ({ token: 'new', tokenExpirationTime: 123 })),
    });

    renderHook(() => useExternalSession(client, vi.fn()), { wrapper: withStore(store) });

    // An hour-long token is renewed five minutes early, not at expiry.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55 * 60 * 1000 + 1000);
    });

    expect(client.refresh).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.user?.token).toBe('new');
  });

  it('signs out when the session can no longer be renewed silently', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const store = makeStore({
      user: {
        token: 'old',
        tokenExpirationTime: Math.floor(Date.now() / 1000),
        id: 'u1',
        provider: 'entra',
      },
      busy: false,
    });
    const client = fakeClient({ refresh: vi.fn(async () => null) });

    renderHook(() => useExternalSession(client, vi.fn()), { wrapper: withStore(store) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000);
    });

    expect(store.getState().auth.user).toBeNull();
  });
});

describe('AuthScreen with an external provider', () => {
  const external = { label: 'Microsoft', busy: false, error: null, onClick: vi.fn() };

  it('offers the provider beside the password form', () => {
    render(<AuthScreen mode="login" external={external} onSubmit={vi.fn()} onSwitch={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }));

    expect(external.onClick).toHaveBeenCalled();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows only the provider when local sign-in is off', () => {
    render(
      <AuthScreen
        mode="login"
        external={external}
        localEnabled={false}
        onSubmit={vi.fn()}
        onSwitch={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Continue with Microsoft' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/create an account/i)).not.toBeInTheDocument();
  });

  it('shows why the last external sign-in failed', () => {
    render(
      <AuthScreen
        mode="login"
        external={{ ...external, error: 'WebChat refused the session.' }}
        onSubmit={vi.fn()}
        onSwitch={vi.fn()}
      />,
    );
    expect(screen.getByText('WebChat refused the session.')).toBeInTheDocument();
  });

  it('draws no provider button without one configured', () => {
    render(<AuthScreen mode="login" onSubmit={vi.fn()} onSwitch={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /continue with/i })).not.toBeInTheDocument();
  });
});
