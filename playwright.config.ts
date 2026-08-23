import { defineConfig, devices } from "@playwright/test";

const credentialedProofNoArtifacts =
  process.env.PANTHEON_CREDENTIALED_PLAYWRIGHT_NO_ARTIFACTS === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  webServer: process.env.PANTHEON_FE_BASE_URL
    ? undefined
    : {
        command: "npx vite preview --port 5173 --host 127.0.0.1",
        port: 5173,
        reuseExistingServer: true,
        timeout: 60_000,
        env: {
          VITE_GCP_IDENTITY_API_KEY: process.env.VITE_GCP_IDENTITY_API_KEY || "AIza01234567890123456789012345678901234",
          VITE_GCP_IDENTITY_PROJECT_ID: process.env.VITE_GCP_IDENTITY_PROJECT_ID || "pantheon-lupin-dev-20260719",
          VITE_GCP_IDENTITY_AUTH_DOMAIN: process.env.VITE_GCP_IDENTITY_AUTH_DOMAIN || "pantheon-lupin-dev-20260719.firebaseapp.com",
        },
      },
  use: {
    baseURL: process.env.PANTHEON_FE_BASE_URL || "http://127.0.0.1:5173",
    trace: credentialedProofNoArtifacts ? "off" : "retain-on-failure",
    screenshot: credentialedProofNoArtifacts ? "off" : "only-on-failure",
    video: credentialedProofNoArtifacts ? "off" : "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
});
