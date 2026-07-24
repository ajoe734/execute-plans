import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // A clean checkout must not need a developer's GCP project config just to
    // import auth-dependent components. These loopback-only placeholders are
    // confined to Vitest and are never used by a production build.
    env: {
      VITE_GCP_IDENTITY_API_KEY: "AIza00000000000000000000000000000000000",
      VITE_GCP_IDENTITY_PROJECT_ID: "pantheon-test",
      VITE_GCP_IDENTITY_AUTH_DOMAIN: "pantheon-test.firebaseapp.com",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
