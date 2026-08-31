import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { validatePublicBuildBearerToken } from "./src/config/publicBuildAuth";
import { validatePublicGcpIdentityConfig } from "./src/config/publicGcpIdentity";

const bffProxyTarget =
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_PROXY_TARGET ||
  process.env.VITE_BFF_BASE_URL;

const mockFixtureModule = path.resolve(__dirname, "./src/mocks/seed.ts");
const strictLiveFixtureStub = path.resolve(__dirname, "./src/mocks/strictLiveFixtureUnavailable.ts");
const strictLiveSeedTaxonomyStub = path.resolve(__dirname, "./src/mocks/strictLiveSeedTaxonomyStub.json");
const strictLiveWriteOverlayStub = path.resolve(__dirname, "./src/mocks/strictLiveWriteOverlayUnavailable.ts");
const strictLiveMockAdaptersStub = path.resolve(__dirname, "./src/mocks/strictLiveMockAdaptersUnavailable.ts");
const strictLiveMockRegistryStub = path.resolve(__dirname, "./src/mocks/strictLiveMockRegistryUnavailable.ts");

const FORBIDDEN_STRICT_LIVE_MODULES = [
  path.resolve(__dirname, "./src/mocks/seed.ts"),
  path.resolve(__dirname, "./src/lib/bff-v1/mocks/adapters.ts"),
  path.resolve(__dirname, "./src/lib/bff-v1/mocks/registry.ts"),
  path.resolve(__dirname, "./src/lib/bff-v1/mocks/persistence.ts"),
  path.resolve(__dirname, "./src/lib/bff-v1/mocks/mutations.ts"),
  path.resolve(__dirname, "./src/lib/bff-v1/mocks/scenarios.ts"),
  path.resolve(__dirname, "./src/lib/bff-v1/seed-taxonomy.json"),
  path.resolve(__dirname, "./src/lib/bff-v1/writeOverlay.ts"),
];

function isStrictLiveBuild(env: Record<string, string | undefined>): boolean {
  return env.VITE_BFF_MODE === "live" && env.VITE_BFF_FALLBACK === "strict";
}

function assertStrictLiveFixtureIsolation() {
  return {
    name: "pantheon-strict-live-fixture-isolation",
    generateBundle(_: unknown, bundle: Record<string, { type: string; modules?: Record<string, unknown> }>) {
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk") {
          for (const moduleId of Object.keys(output.modules ?? {})) {
            const resolvedModule = path.resolve(moduleId.split("?")[0]);
            for (const forbidden of FORBIDDEN_STRICT_LIVE_MODULES) {
              if (resolvedModule === forbidden) {
                throw new Error(
                  `Strict-live production bundle must not contain ${forbidden}. `
                  + "Use a typed unavailable state instead of a mock fixture fallback.",
                );
              }
            }
          }
        }
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_* values are transformed into browser-visible source in both serve
  // and build modes. Validate while the config is loading so `vite` cannot
  // bind a development server with a privileged ambient credential either.
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  const buildEnv = {
    ...loadedEnv,
    VITE_BFF_MODE: process.env.VITE_BFF_MODE ?? loadedEnv.VITE_BFF_MODE,
    VITE_BFF_FALLBACK: process.env.VITE_BFF_FALLBACK ?? loadedEnv.VITE_BFF_FALLBACK,
  };
  const strictLiveBuild = isStrictLiveBuild(buildEnv);
  validatePublicBuildBearerToken(
    process.env.VITE_BFF_DEV_BEARER_TOKEN ?? loadedEnv.VITE_BFF_DEV_BEARER_TOKEN,
  );
  validatePublicGcpIdentityConfig(
    process.env.VITE_GCP_IDENTITY_API_KEY
      ?? loadedEnv.VITE_GCP_IDENTITY_API_KEY,
    process.env.VITE_GCP_IDENTITY_PROJECT_ID
      ?? loadedEnv.VITE_GCP_IDENTITY_PROJECT_ID,
    process.env.VITE_GCP_IDENTITY_AUTH_DOMAIN
      ?? loadedEnv.VITE_GCP_IDENTITY_AUTH_DOMAIN,
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
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      strictLiveBuild && assertStrictLiveFixtureIsolation(),
    ].filter(Boolean),
    resolve: {
      alias: strictLiveBuild
        ? [
            { find: "@/mocks/seed", replacement: strictLiveFixtureStub },
            { find: "@/lib/bff-v1/seed-taxonomy.json", replacement: strictLiveSeedTaxonomyStub },
            { find: "./seed-taxonomy.json", replacement: strictLiveSeedTaxonomyStub },
            { find: "@/lib/bff-v1/writeOverlay", replacement: strictLiveWriteOverlayStub },
            { find: "./writeOverlay", replacement: strictLiveWriteOverlayStub },
            { find: "@/lib/bff-v1/mocks/adapters", replacement: strictLiveMockAdaptersStub },
            { find: "./mocks/adapters", replacement: strictLiveMockAdaptersStub },
            { find: "@/lib/bff-v1/mocks/registry", replacement: strictLiveMockRegistryStub },
            { find: "./mocks/registry", replacement: strictLiveMockRegistryStub },
            { find: "@/lib/v5/overlay", replacement: strictLiveWriteOverlayStub },
            { find: "./overlay", replacement: strictLiveWriteOverlayStub },
            { find: "@/lib/v5/loopOverlay", replacement: strictLiveWriteOverlayStub },
            { find: "./loopOverlay", replacement: strictLiveWriteOverlayStub },
            { find: "@", replacement: path.resolve(__dirname, "./src") },
          ]
        : {
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
