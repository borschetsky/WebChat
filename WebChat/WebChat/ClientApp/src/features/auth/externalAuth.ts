import type {
  AccountInfo,
  AuthenticationResult,
  IPublicClientApplication,
} from '@azure/msal-browser';
import Config from '@/config';
import type { ExternalProviderConfig } from '@/config';

/** A token from an external provider, in the shape the session already stores. */
export interface ExternalToken {
  token: string;
  /** Unix seconds, like the local session's. */
  tokenExpirationTime: number;
}

/**
 * Everything the app needs from an external identity provider - and the only thing it may
 * depend on. The server's counterpart is one `Auth:Oidc` entry; switching provider means a
 * different implementation of this behind the same name, not a change to any screen.
 *
 * The local password sign-in is deliberately not one of these: its forms, confirmation and
 * reset flows have no external equivalent, and pretending otherwise would make every method
 * here optional.
 */
export interface ExternalAuthClient {
  /** Matches the server's provider Name; stored on the session as `provider`. */
  readonly name: string;
  readonly label: string;
  /**
   * Must run before the router first navigates: the provider's redirect lands on the app
   * with its response in the URL, and a client-side redirect would discard it.
   */
  completeRedirect(): Promise<void>;
  /** A token for the session the provider already holds, without any UI; null when none. */
  resume(): Promise<ExternalToken | null>;
  /** Leaves the app for the provider's sign-in page. */
  signIn(): Promise<void>;
  /** A current token for the existing session, or null when it can only be renewed with UI. */
  refresh(): Promise<ExternalToken | null>;
  /** Ends the provider session too, so the next sign-in is not silently the same person. */
  signOut(): Promise<void>;
}

type MsalModule = typeof import('@azure/msal-browser');

const toToken = (result: AuthenticationResult): ExternalToken => ({
  token: result.accessToken,
  tokenExpirationTime: Math.floor(
    (result.expiresOn?.getTime() ?? Date.now() + 5 * 60 * 1000) / 1000,
  ),
});

/**
 * Microsoft Entra (External ID) through MSAL.
 *
 * MSAL is imported on first use rather than at module scope, so a password-only deployment
 * never downloads it - it is the largest dependency the sign-in screen would otherwise carry.
 * `loadMsal` is a parameter only so tests can supply a fake.
 */
export const createMsalClient = (
  provider: ExternalProviderConfig,
  loadMsal: () => Promise<MsalModule> = () => import('@azure/msal-browser'),
): ExternalAuthClient => {
  // Requested at sign-in as well as the API scope: without `email` consented, Entra leaves
  // the email optional claim out of the access token, and the server cannot create an
  // account for a first sign-in. openid/profile/offline_access MSAL adds by itself.
  const signInScopes = [provider.apiScope, 'email'];
  const apiScopes = [provider.apiScope];
  const appRoot = () => `${window.location.origin}/`;
  // Silent renewal's redirect target. Once the SPA refresh token is gone (24 hours), MSAL v5
  // renews in a hidden iframe, and the page that iframe lands on must hand the response back
  // with broadcastResponseToMainFrame - which redirect.html does and the app root cannot.
  // Must be registered as an SPA redirect URI in Entra, beside the app root.
  const bridgePage = () => `${window.location.origin}/redirect.html`;

  let ready: Promise<{ msal: MsalModule; pca: IPublicClientApplication }> | null = null;

  const start = () => {
    ready ??= (async () => {
      const msal = await loadMsal();
      // v5 dropped the static PublicClientApplication.createPublicClientApplication; this is
      // its replacement, and it returns an already-initialised instance.
      const pca = await msal.createStandardPublicClientApplication({
        auth: {
          clientId: provider.clientId,
          authority: provider.authority,
          // ciamlogin.com is not one of the hosts MSAL trusts by default; without this it
          // refuses the authority before making a single request.
          knownAuthorities: [new URL(provider.authority).host],
          // The app root, which is a registered redirect URI in every environment. A
          // deep link here would need registering per route.
          redirectUri: appRoot(),
          postLogoutRedirectUri: appRoot(),
        },
        // localStorage so a second tab is signed in too, matching the password session.
        cache: { cacheLocation: 'localStorage' },
      });

      const result = await pca.handleRedirectPromise();
      const account: AccountInfo | null =
        result?.account ?? pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
      if (account) pca.setActiveAccount(account);

      return { msal, pca };
    })();
    return ready;
  };

  const silent = async (): Promise<ExternalToken | null> => {
    const { msal, pca } = await start();
    const account = pca.getActiveAccount();
    if (!account) return null;

    try {
      return toToken(
        await pca.acquireTokenSilent({ scopes: apiScopes, account, redirectUri: bridgePage() }),
      );
    } catch (err) {
      // The refresh token expired or consent changed: only the sign-in page can fix that,
      // and sending someone there unasked mid-conversation would lose what they were typing.
      // A timed-out iframe means the same thing in practice - the provider's session could
      // not be used silently - and must read as "signed out", not as a failure: reported as
      // an error it put "did not complete" over a sign-in button that worked.
      const cannotRenew =
        err instanceof msal.InteractionRequiredAuthError ||
        (err instanceof msal.BrowserAuthError && err.errorCode === 'timed_out');
      if (!cannotRenew) throw err;

      // Forget the account too. Left cached, MSAL sends it as the next sign-in's login_hint,
      // and Entra refused that stale hint with "We couldn't sign you in" until the cache was
      // cleared by hand. clearCache drops only this app's local copy; it signs nobody out.
      await pca.clearCache({ account }).catch(() => {});
      pca.setActiveAccount(null);
      return null;
    }
  };

  return {
    name: provider.name,
    label: provider.label,

    completeRedirect: async () => {
      await start();
    },

    resume: silent,

    signIn: async () => {
      const { pca } = await start();
      await pca.loginRedirect({ scopes: signInScopes });
    },

    refresh: silent,

    signOut: async () => {
      const { pca } = await start();
      await pca.logoutRedirect({
        account: pca.getActiveAccount() ?? undefined,
        postLogoutRedirectUri: appRoot(),
      });
    },
  };
};

/** The configured provider, or null for a password-only build. One instance per page. */
export const externalAuth: ExternalAuthClient | null = Config.auth.external
  ? createMsalClient(Config.auth.external)
  : null;
