import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { validatePublicBuildBearerToken } from "./src/config/publicBuildAuth";
import { validatePublicSupabaseConfig } from "./src/config/publicSupabase";

const bffProxyTarget =
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_PROXY_TARGET ||
  process.env.VITE_BFF_BASE_URL;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_* values are transformed into browser-visible source in both serve
  // and build modes. Validate while the config is loading so `vite` cannot
  // bind a development server with a privileged ambient credential either.
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  validatePublicBuildBearerToken(
    process.env.VITE_BFF_DEV_BEARER_TOKEN ?? loadedEnv.VITE_BFF_DEV_BEARER_TOKEN,
  );
  validatePublicSupabaseConfig(
    process.env.VITE_SUPABASE_URL ?? loadedEnv.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY
      ?? loadedEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
  );

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: bffProxyTarget
        ? {
            "/bff": {
              target: bffProxyTarget,
              changeOrigin: true,
              secure: false,
            },
            "/health": {
              target: bffProxyTarget,
              changeOrigin: true,
              secure: false,
            },
            "/healthz": {
              target: bffProxyTarget,
              changeOrigin: true,
              secure: false,
            },
            "/readyz": {
              target: bffProxyTarget,
              changeOrigin: true,
              secure: false,
            },
            "/openapi.json": {
              target: bffProxyTarget,
              changeOrigin: true,
              secure: false,
            },
          }
        : undefined,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
  };
});
