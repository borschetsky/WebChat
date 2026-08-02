import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Where the ASP.NET API is listening. Matches the launchSettings.json profiles.
// Override with VITE_API_PROXY_TARGET if you run Kestrel on a different port.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'https://localhost:7199';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The ASP.NET host proxies to this port via UseProxyToSpaDevelopmentServer,
    // and docker-compose publishes it. Keep it at 3000.
    port: 3000,
    strictPort: true,
    // Bind on all interfaces so the API container can reach the dev server by
    // its compose service name.
    host: true,
    // Same-origin API access when browsing the dev server directly. secure:false
    // accepts the ASP.NET developer certificate, which is self-signed.
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/chat': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  build: {
    // Matches AddSpaStaticFiles(RootPath = "ClientApp/dist") in Startup.cs.
    outDir: 'dist',
    sourcemap: true,
  },
});
