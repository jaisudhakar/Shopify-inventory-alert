import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";


// Shopify tunnels (cloudflared/ngrok) terminate TLS in front of Vite, so HMR
// has to be told to speak wss on 443 rather than guessing from the local port.
const host = (process.env.HOST ? new URL(process.env.HOST).host : undefined) ??
  (process.env.SHOPIFY_APP_URL ? new URL(process.env.SHOPIFY_APP_URL).host : undefined);

let hmrConfig: UserConfig["server"] extends infer S
  ? S extends { hmr?: infer H }
    ? H
    : never
  : never;

if (host === "localhost") {
  hmrConfig = { protocol: "ws", host: "localhost", port: 64999, clientPort: 64999 };
} else {
  hmrConfig = { protocol: "wss", host, port: Number(process.env.FRONTEND_PORT) || 8002, clientPort: 443 };
}

export default defineConfig({
  server: {
    allowedHosts: host ? [host] : true,
    cors: { preflightContinue: true },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // Let Vite read the Shopify CLI's generated files.
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: false,
        v3_routeConfig: false,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
});
