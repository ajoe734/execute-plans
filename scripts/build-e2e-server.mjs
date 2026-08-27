#!/usr/bin/env node

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function getCurrentHeadSha() {
  if (process.env.EXPECTED_FE_SHA) {
    return process.env.EXPECTED_FE_SHA.trim().toLowerCase();
  }
  try {
    return execSync("git rev-parse HEAD", { cwd: rootDir, encoding: "utf8" }).trim().toLowerCase();
  } catch (err) {
    console.warn("Could not determine git HEAD SHA:", err.message);
    return "0".repeat(40);
  }
}

const commitSha = getCurrentHeadSha();

const buildEnv = {
  ...process.env,
  VITE_BFF_MODE: process.env.VITE_BFF_MODE || "live",
  VITE_BFF_BASE_URL: process.env.VITE_BFF_BASE_URL || "https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io",
  VITE_BFF_FALLBACK: process.env.VITE_BFF_FALLBACK || "strict",
  VITE_BFF_REAL_WRITES: process.env.VITE_BFF_REAL_WRITES || "false",
  VITE_BFF_ALLOW_DEV_STUB_WRITES: process.env.VITE_BFF_ALLOW_DEV_STUB_WRITES || "false",
  VITE_BFF_EMBEDDED_BEARER_TOKEN: process.env.VITE_BFF_EMBEDDED_BEARER_TOKEN || "false",
  VITE_GCP_IDENTITY_API_KEY: process.env.VITE_GCP_IDENTITY_API_KEY || "AIza01234567890123456789012345678901234",
  VITE_GCP_IDENTITY_PROJECT_ID: process.env.VITE_GCP_IDENTITY_PROJECT_ID || "pantheon-lupin-dev-20260719",
  VITE_GCP_IDENTITY_AUTH_DOMAIN: process.env.VITE_GCP_IDENTITY_AUTH_DOMAIN || "pantheon-lupin-dev-20260719.firebaseapp.com",
};

console.log(`[build-e2e-server] Building execute-plans for commit ${commitSha} with strict live / mock-write env...`);

const viteBin = path.resolve(rootDir, "node_modules/vite/bin/vite.js");
execFileSync(process.execPath, [viteBin, "build"], {
  cwd: rootDir,
  env: buildEnv,
  stdio: "inherit",
});

const deploymentManifest = {
  schemaVersion: 1,
  app: "execute-plans",
  environment: "pantheon-dev-fe",
  repository: "ajoe734/execute-plans",
  commit: commitSha,
  sourceBranch: "dev",
  frontend: {
    repository: "ajoe734/execute-plans",
    commitSha: commitSha,
  },
  deploymentProfile: "read-only",
  buildMode: {
    VITE_BFF_MODE: buildEnv.VITE_BFF_MODE,
    VITE_BFF_BASE_URL: buildEnv.VITE_BFF_BASE_URL,
    VITE_BFF_FALLBACK: buildEnv.VITE_BFF_FALLBACK,
    VITE_BFF_REAL_WRITES: buildEnv.VITE_BFF_REAL_WRITES,
    VITE_BFF_ALLOW_DEV_STUB_WRITES: buildEnv.VITE_BFF_ALLOW_DEV_STUB_WRITES,
    VITE_BFF_EMBEDDED_BEARER_TOKEN: buildEnv.VITE_BFF_EMBEDDED_BEARER_TOKEN,
  },
};

const distDir = path.resolve(rootDir, "dist");
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(
  path.join(distDir, "deployment.json"),
  JSON.stringify(deploymentManifest, null, 2) + "\n",
  "utf8",
);

console.log(`[build-e2e-server] Successfully wrote ${path.join(distDir, "deployment.json")}`);
