import { defineConfig, devices } from "@playwright/test";
import net from "node:net";

const credentialedProofNoArtifacts =
  process.env.PANTHEON_CREDENTIALED_PLAYWRIGHT_NO_ARTIFACTS === "1";

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as net.AddressInfo;
      const port = address.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

const dynamicPort = process.env.PANTHEON_FE_PORT
  ? Number(process.env.PANTHEON_FE_PORT)
  : await getAvailablePort();

const defaultBaseUrl = `http://127.0.0.1:${dynamicPort}`;
const baseURL = process.env.PANTHEON_FE_BASE_URL || defaultBaseUrl;
process.env.PANTHEON_FE_BASE_URL ||= baseURL;
process.env.PANTHEON_FE_PORT ||= String(dynamicPort);

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
  webServer:
    process.env.PANTHEON_FE_BASE_URL &&
    process.env.PANTHEON_FE_BASE_URL !== defaultBaseUrl
      ? undefined
      : {
          command: `node scripts/build-e2e-server.mjs && npx vite preview --port ${dynamicPort} --host 127.0.0.1`,
          port: dynamicPort,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            VITE_BFF_MODE: process.env.VITE_BFF_MODE || "live",
            VITE_BFF_BASE_URL:
              process.env.VITE_BFF_BASE_URL ||
              "https://api.dev.mvl-cap.tw",
            VITE_BFF_FALLBACK: process.env.VITE_BFF_FALLBACK || "strict",
            VITE_BFF_REAL_WRITES: process.env.VITE_BFF_REAL_WRITES || "false",
            VITE_BFF_ALLOW_DEV_STUB_WRITES:
              process.env.VITE_BFF_ALLOW_DEV_STUB_WRITES || "false",
            VITE_BFF_EMBEDDED_BEARER_TOKEN:
              process.env.VITE_BFF_EMBEDDED_BEARER_TOKEN || "false",
            VITE_GCP_IDENTITY_API_KEY:
              process.env.VITE_GCP_IDENTITY_API_KEY ||
              "AIza01234567890123456789012345678901234",
            VITE_GCP_IDENTITY_PROJECT_ID:
              process.env.VITE_GCP_IDENTITY_PROJECT_ID ||
              "pantheon-dev-20260902",
            VITE_GCP_IDENTITY_AUTH_DOMAIN:
              process.env.VITE_GCP_IDENTITY_AUTH_DOMAIN ||
              "pantheon-dev-20260902.firebaseapp.com",
          },
        },
  use: {
    baseURL,
    trace: credentialedProofNoArtifacts ? "off" : "retain-on-failure",
    screenshot: credentialedProofNoArtifacts ? "off" : "only-on-failure",
    video: credentialedProofNoArtifacts ? "off" : "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});

