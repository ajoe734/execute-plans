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
  use: {
    baseURL: process.env.PANTHEON_FE_BASE_URL || "http://localhost:5173",
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
