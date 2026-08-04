import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Where the ASP.NET API is listening. Matches the launchSettings.json profiles.
// Override with VITE_API_PROXY_TARGET if you run Kestrel on a different port.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'https://localhost:7199';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // The ASP.NET host proxies to this port via UseProxyToSpaDevelopmentServer,
    // and docker-compose publishes it. Keep it at 3000.
    port: 3000,
    strictPort: true,
    // Bind on all interfaces so the API container can reach the dev server by
    // its compose service name.
    host: true,
    // ...and accept that service name in the Host header. Vite blocks hosts it does not
    // recognise as DNS-rebinding protection, and UseProxyToSpaDevelopmentServer forwards
    // the target's authority - so under docker compose every proxied request arrives as
    // Host: react-app and is answered with a plain-text 403 from Vite, not from Kestrel.
    // Requests that reach the dev server directly on localhost:3000 are unaffected, which
    // is what makes this look like an API bug rather than a client one.
    allowedHosts: ['react-app'],
    // Same-origin API access when browsing the dev server directly. secure:false
    // accepts the ASP.NET developer certificate, which is self-signed.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, secure: false },
      '/chat': { target: apiTarget, changeOrigin: true, secure: false, ws: true },
      // Avatars. getUserAvatar builds a relative /images/{fileName}, which without this
      // rule hits the dev server's SPA fallback and returns index.html to an <img> tag -
      // a broken avatar with a 200 status and no clue as to why.
      //
      // The API answers with a 302 whose Location is an absolute R2 URL, which passes
      // through untouched for the browser to follow - so dev behaves like production,
      // with the image bytes coming from R2 rather than through this proxy.
      '/images': { target: apiTarget, changeOrigin: true, secure: false },
    },
  },
  build: {
    // Matches AddSpaStaticFiles(RootPath = "ClientApp/dist") in Startup.cs.
    outDir: 'dist',
    sourcemap: true,
  },
});
