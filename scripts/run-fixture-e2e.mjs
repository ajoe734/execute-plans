#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_E2E_SPECS = Object.freeze([
  "e2e/01-startup-session.spec.ts",
  "e2e/02-control-room.spec.ts",
  "e2e/03-execution-loop.spec.ts",
  "e2e/04b-optimization-loop.spec.ts",
  "e2e/06-entity-registry.spec.ts",
  "e2e/07-high-risk-confirm.spec.ts",
  "e2e/08-create-intent.spec.ts",
  "e2e/08-sse-reconnect.spec.ts",
  "e2e/09-strict-vs-hybrid.spec.ts",
  "e2e/10-rollback-saga.spec.ts",
  "e2e/11-handoff-sla.spec.ts",
  "e2e/12-approvals.spec.ts",
  "e2e/13-agora.spec.ts",
  "e2e/16-audit-correlation.spec.ts",
  "e2e/17-a11y-v5.spec.ts",
  "e2e/18-perf.spec.ts",
]);

export const FIXTURE_E2E_PROJECT = "chromium";
export const FIXTURE_E2E_GREP_INVERT =
  "asserts MeResponse tenant/env/user/capabilities shape";
export const FIXTURE_E2E_RETRIES = 0;
export const FIXTURE_E2E_TRACE = "off";
export const DEFAULT_LOOPBACK_HOST = "127.0.0.1";
export const DEFAULT_LOOPBACK_PORT = 4173;

export const FIXTURE_E2E_ISOLATED_ENV = Object.freeze({
  PANTHEON_HOSTED_E2E: "",
  FE_INT_GATE_LIVE_BFF: "",
  F08_CREATE_INTENT_LIVE_BFF: "",
  RUN_LIVE_BFF_CONTRACTS: "",
  VITE_BFF_FALLBACK: "strict",
  BFF_FALLBACK: "strict",
  VITE_BFF_DEV_BEARER_TOKEN: "",
});

const UNSET_CREDENTIAL_ENV_KEYS = Object.freeze([
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
  "PANTHEON_BFF_SMOKE_TOKEN",
  "PANTHEON_HOSTED_BROWSER_BEARER_TOKEN",
  "PANTHEON_BFF_OPERATOR_A_TOKEN",
  "PANTHEON_BFF_RBAC_TOKENS_JSON",
]);

export function buildFixtureE2ePlaywrightArgs({
  outputDir = "",
  reporter = "list",
} = {}) {
  const args = [
    "playwright",
    "test",
    ...FIXTURE_E2E_SPECS,
    `--project=${FIXTURE_E2E_PROJECT}`,
    "--grep-invert",
    FIXTURE_E2E_GREP_INVERT,
    `--retries=${FIXTURE_E2E_RETRIES}`,
  ];
  if (outputDir) {
    args.push("--output", outputDir);
  }
  args.push(`--trace=${FIXTURE_E2E_TRACE}`);
  if (reporter) {
    args.push(`--reporter=${reporter}`);
  }
  return args;
}

export function buildFixtureE2eEnv(baseEnv, baseUrl, { bffBaseUrl = "" } = {}) {
  const resolvedBffBaseUrl =
    bffBaseUrl || baseEnv.PANTHEON_BFF_BASE_URL || baseUrl;
  const env = {
    ...baseEnv,
    PANTHEON_FE_BASE_URL: baseUrl,
    FRONTEND_BASE_URL: baseUrl,
    PLAYWRIGHT_BASE_URL: baseUrl,
    PANTHEON_SSE_ORIGIN_URL: baseUrl,
    PANTHEON_BFF_BASE_URL: resolvedBffBaseUrl,
    PANTHEON_RELEASE_GATE_CONTEXT:
      baseEnv.PANTHEON_RELEASE_GATE_CONTEXT || "pull_request",
    ...FIXTURE_E2E_ISOLATED_ENV,
  };
  for (const key of UNSET_CREDENTIAL_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

function parseArgs(argv) {
  const options = {
    serve: true,
    distDir: process.env.PANTHEON_FIXTURE_E2E_DIST_DIR || "dist",
    outputDir: "",
    reporter: "list",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-serve") {
      options.serve = false;
    } else if (arg === "--serve") {
      options.serve = true;
    } else if (arg === "--dist-dir") {
      options.distDir = argv[i + 1] || "";
      i += 1;
    } else if (arg.startsWith("--dist-dir=")) {
      options.distDir = arg.slice("--dist-dir=".length);
    } else if (arg === "--output") {
      options.outputDir = argv[i + 1] || "";
      i += 1;
    } else if (arg.startsWith("--output=")) {
      options.outputDir = arg.slice("--output=".length);
    } else if (arg === "--reporter") {
      options.reporter = argv[i + 1] || "";
      i += 1;
    } else if (arg.startsWith("--reporter=")) {
      options.reporter = arg.slice("--reporter=".length);
    } else {
      throw new Error(`Unknown option for run-fixture-e2e.mjs: ${arg}`);
    }
  }

  return options;
}

function isLoopbackPortFree(host, port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, host);
  });
}

async function startLoopbackBundleServer(distDir) {
  const resolvedDist = path.resolve(distDir);
  const indexFile = path.join(resolvedDist, "index.html");
  if (!fs.existsSync(indexFile) || !fs.statSync(indexFile).isFile()) {
    throw new Error(
      `Fixture E2E bundle missing index.html at ${indexFile}. Run 'npm run build' before running fixture E2E.`,
    );
  }

  const preferDefaultPort = await isLoopbackPortFree(
    DEFAULT_LOOPBACK_HOST,
    DEFAULT_LOOPBACK_PORT,
  );
  const portArg = preferDefaultPort ? String(DEFAULT_LOOPBACK_PORT) : "0";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pantheon-fixture-e2e-"));
  const infoPath = path.join(tmpDir, "server-info.json");

  const child = spawn(
    process.execPath,
    [
      path.resolve("scripts/serve-release-candidate.mjs"),
      "--root",
      resolvedDist,
      "--port",
      portArg,
    ],
    {
      env: {
        ...process.env,
        PANTHEON_CANDIDATE_HOST: DEFAULT_LOOPBACK_HOST,
        PANTHEON_CANDIDATE_SERVER_INFO: infoPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let serverLogs = "";
  child.stdout?.on("data", (chunk) => {
    serverLogs += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    serverLogs += String(chunk);
  });

  for (let i = 0; i < 100; i += 1) {
    if (fs.existsSync(infoPath)) {
      const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
      const origin = String(info.origin || "").replace(/\/+$/u, "");
      if (origin) {
        const res = await fetch(`${origin}/`).catch(() => null);
        if (res && res.ok) {
          return {
            origin,
            stop: () => {
              child.kill("SIGTERM");
              fs.rmSync(tmpDir, { recursive: true, force: true });
            },
          };
        }
      }
    }
    if (child.exitCode !== null) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  child.kill("SIGTERM");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  throw new Error(
    `Failed to start loopback candidate server for ${resolvedDist}.\n${serverLogs}`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let serverHandle = null;

  try {
    let baseUrl =
      process.env.PANTHEON_FE_BASE_URL ||
      `http://${DEFAULT_LOOPBACK_HOST}:${DEFAULT_LOOPBACK_PORT}`;
    let bffBaseUrl = process.env.PANTHEON_BFF_BASE_URL || "";

    if (options.serve) {
      serverHandle = await startLoopbackBundleServer(options.distDir);
      baseUrl = serverHandle.origin;
      if (!bffBaseUrl) {
        bffBaseUrl = baseUrl;
      }
    }

    const args = buildFixtureE2ePlaywrightArgs({
      outputDir: options.outputDir,
      reporter: options.reporter,
    });
    const env = buildFixtureE2eEnv(process.env, baseUrl, { bffBaseUrl });
    const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
    const result = spawnSync(npxBin, args, {
      env,
      stdio: "inherit",
    });

    if (result.error) {
      throw result.error;
    }
    process.exitCode = result.status ?? 1;
  } finally {
    serverHandle?.stop();
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  await main();
}
