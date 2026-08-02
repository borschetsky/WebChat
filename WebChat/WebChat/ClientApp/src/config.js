// Base URL for the API.
//
// Default is relative ("/") so every request is same-origin, which works in both dev setups:
//   - browsing the Vite dev server (:3000) - vite.config.js proxies /api and /chat to the API
//   - browsing the ASP.NET host (:7199)    - the SPA is served from that same origin
//
// Set VITE_API_URL (e.g. "https://localhost:8081/") when the API lives on another origin.
// It must end with a trailing slash - callers append "api/..." directly.
const Config = {
  network: {
    api: import.meta.env.VITE_API_URL || "/",

    wss: "chat"
  }
}

export default Config;
