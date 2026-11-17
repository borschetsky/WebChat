// Base URL for the API.
//
// Default is relative ("/") so every request is same-origin, which works in both dev setups:
//   - browsing the Vite dev server (:3000) - vite.config.ts proxies /api and /chat to the API
//   - browsing the ASP.NET host (:7199)    - the SPA is served from that same origin
//
// Set VITE_API_URL (e.g. "https://localhost:8081/") when the API lives on another origin.
// It must end with a trailing slash - callers append "api/..." directly.

/**
 * An external OpenID Connect provider the SPA can send people to. Mirrors one entry of the
 * server's `Auth:Oidc` - `name` must match it, because that is how the server will know
 * which provider a session came from.
 */
export interface ExternalProviderConfig {
  name: string;
  /** Shown on the button: "Continue with {label}". */
  label: string;
  clientId: string;
  /** e.g. https://webchatdev.ciamlogin.com/<tenant-id>/v2.0 */
  authority: string;
  /** The API scope, e.g. api://<api-client-id>/chat.access. */
  apiScope: string;
}

interface AppConfig {
  network: {
    /** Trailing slash required. */
    api: string;
    /** SignalR hub path, appended to `api`. */
    wss: string;
  };
  auth: {
    /**
     * The password forms. Turn off together with the server's Auth:Local:Enabled - the
     * server then answers 404 on api/auth/*, and forms that can only fail are worse than none.
     */
    local: boolean;
    /** Null when no VITE_ENTRA_CLIENT_ID is set, which keeps a fresh clone password-only. */
    external: ExternalProviderConfig | null;
  };
}

const env = import.meta.env;

const Config: AppConfig = {
  network: {
    api: env.VITE_API_URL || '/',

    wss: 'chat',
  },
  auth: {
    local: env.VITE_AUTH_LOCAL !== 'false',
    external: env.VITE_ENTRA_CLIENT_ID
      ? {
          name: 'entra',
          label: env.VITE_ENTRA_LABEL || 'Microsoft',
          clientId: env.VITE_ENTRA_CLIENT_ID,
          authority: env.VITE_ENTRA_AUTHORITY ?? '',
          apiScope: env.VITE_ENTRA_API_SCOPE ?? '',
        }
      : null,
  },
};

export default Config;
