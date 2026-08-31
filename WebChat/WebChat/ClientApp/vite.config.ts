import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// Where the ASP.NET API is listening. Matches the launchSettings.json profiles.
// Override with VITE_API_PROXY_TARGET if you run Kestrel on a different port.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'https://localhost:7199';

/**
 * Watch by polling instead of by inotify, set only by docker-compose (#91).
 *
 * The container bind-mounts the host's source, and **inotify events do not cross a Docker
 * bind mount on Windows or macOS** - so the watcher never fires, the module graph is never
 * invalidated, and the dev server keeps serving the transform it cached the first time the
 * browser asked. The file on disk and the file in the browser silently disagree.
 *
 * That is worse than no reload: it makes a browser check *evidence for the wrong thing*. It
 * has already produced one confident, wrong bug report here (a PNG reported as stored
 * unconverted, on the strength of a page running code that no longer existed), and the
 * documented workaround was to restart the container after every edit.
 *
 * Deliberately opt-in rather than always on: polling wakes the process on a timer and costs
 * CPU for the whole session, and a native `npm run dev` on the host has working inotify and
 * needs none of it. 300ms is a compromise - fast enough that saving and alt-tabbing feels
 * immediate, slow enough not to spin a core over a few hundred files.
 */
const usePolling = process.env.VITE_USE_POLLING === 'true';

/**
 * What a crash report calls this build (#74).
 *
 * Baked in at build time rather than read from an environment variable at runtime, because a
 * browser has no environment to read - and folded to a literal by `define`, so the minifier
 * cannot rename it the way it renames a component.
 *
 * The package version is the honest default and it moves rarely, which is the weakness: two
 * deploys of the same version are indistinguishable on the errors screen. Set `VITE_RELEASE`
 * in CI to something that identifies the build - a short commit sha - and the "Release" line
 * on an issue starts being worth reading.
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

const release = process.env.VITE_RELEASE || `web@${pkg.version}`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Only this one key, not the whole of `import.meta.env` - replacing the object would
    // clobber everything Vite injects into it.
    'import.meta.env.VITE_RELEASE': JSON.stringify(release),
  },
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
    // See `usePolling` above. Left undefined outside compose so the host keeps native inotify.
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
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
    // Off by default. A production sourcemap here is not merely large (it was 4 MB against
    // an 845 kB bundle) - dist is served as static files, so it made the entire client
    // source readable to anyone who asked for it.
    //
    // 'hidden' would not have helped: it still writes the .map into dist, and the csproj's
    // IncludeSpaOutput target publishes dist wholesale, so the file would still be deployed
    // and still be fetchable by name. It only removes the //# sourceMappingURL comment.
    // Dropping it is the only option that keeps the map off the server; there is no error
    // tracker to upload it to yet.
    //
    // Set VITE_SOURCEMAP=true to get one back for a local investigation. The dev server is
    // unaffected either way - this setting only applies to `vite build`.
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
    rolldownOptions: {
      output: {
        // Vendor splitting. This does NOT make the first load smaller - the same bytes are
        // still fetched, just in more files. What it buys is cache reuse: react-dom and MUI
        // do not change between deploys, so a release that only touches src no longer
        // invalidates 400 kB of library code along with it.
        //
        // `tags: ['$initial']` is what makes this safe, and it is the whole trick. A plain
        // `test: /@mui/` group would be a regression: MUI straddles the lazy boundary (the
        // auth screens use a dozen components, ChatApp another few dozen), and merging all
        // of it into one group would drag the chat-only half back into the chunk the login
        // screen has to download. `$initial` restricts each group to modules that are
        // already in the entry's static import chain, so a group can only ever rearrange
        // the eager payload, never grow it. Anything reachable only through
        // `import('@/app/ChatApp')` stays in the lazy chunk.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|react-is|scheduler|react-router|react-router-dom|use-sync-external-store)[\\/]/,
              tags: ['$initial'],
            },
            {
              name: 'vendor-mui',
              test: /node_modules[\\/](@mui[\\/]|@emotion[\\/]|stylis[\\/])/,
              tags: ['$initial'],
            },
            {
              name: 'vendor-state',
              test: /node_modules[\\/](@reduxjs[\\/]|react-redux[\\/]|redux[\\/]|redux-thunk[\\/]|immer[\\/]|reselect[\\/])/,
              tags: ['$initial'],
            },
            {
              // axios serves every REST call and signalr the hub. Grouped together because
              // both are transport, both are stable, and neither is touched by app changes.
              name: 'vendor-net',
              test: /node_modules[\\/](axios[\\/]|@microsoft[\\/]signalr[\\/])/,
              tags: ['$initial'],
            },
          ],
        },
      },
    },
  },
});
