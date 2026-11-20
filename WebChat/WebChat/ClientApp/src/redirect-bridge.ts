import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

/**
 * The page silent token renewal lands on (`redirect.html`).
 *
 * Once the SPA refresh token expires (24 hours for Entra), MSAL v5 renews in a hidden
 * iframe and waits for that iframe's redirect page to pass the response back with this
 * call. The app root cannot do it - it boots the whole SPA - so without this page every
 * renewal a day after sign-in timed out (BrowserAuthError timed_out / redirect_bridge_timeout).
 *
 * Deliberately separate from the app: it must load fast inside the iframe and must not run
 * anything else, such as handleRedirectPromise, against the same response.
 */
void broadcastResponseToMainFrame().catch(() => {
  // Nothing to do here: the main window's own timeout reports the failure, and the client
  // treats it as "please sign in again".
});
