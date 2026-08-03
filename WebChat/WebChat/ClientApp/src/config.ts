// Base URL for the API.
//
// Default is relative ("/") so every request is same-origin, which works in both dev setups:
//   - browsing the Vite dev server (:3000) - vite.config.ts proxies /api and /chat to the API
//   - browsing the ASP.NET host (:7199)    - the SPA is served from that same origin
//
// Set VITE_API_URL (e.g. "https://localhost:8081/") when the API lives on another origin.
// It must end with a trailing slash - callers append "api/..." directly.

interface AppConfig {
  network: {
    /** Trailing slash required. */
    api: string;
    /** SignalR hub path, appended to `api`. */
    wss: string;
  };
}

const Config: AppConfig = {
  network: {
    api: import.meta.env.VITE_API_URL || '/',

    wss: 'chat',
  },
};

export default Config;
