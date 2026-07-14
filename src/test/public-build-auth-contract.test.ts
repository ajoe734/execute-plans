import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";

import {
  LOCAL_FIXTURE_AUTH_TOKEN,
  authToken,
  bearerHeader,
  devLoginSession,
  installOidcDevLogin,
  targetsExternalE2eEnvironment,
} from "../../e2e/helpers/auth";
import {
  bearerAuthorization as scriptBearerAuthorization,
  normalizeBearerToken as normalizeScriptBearerToken,
} from "../../scripts/lib/bearer-token.mjs";
import {
  PUBLIC_DEV_VIEWER_BEARER_TOKEN,
  validatePublicBuildBearerToken,
} from "@/config/publicBuildAuth";

const originalToken = process.env.VITE_BFF_DEV_BEARER_TOKEN;
// These two subprocess checks are optional in a browser-free unit-test phase;
// the workflow provisions Chromium separately before its Playwright phase.
const chromiumInstalled = existsSync(chromium.executablePath());

function filesRecursively(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesRecursively(path) : [path];
  });
}

afterEach(() => {
  if (originalToken === undefined) delete process.env.VITE_BFF_DEV_BEARER_TOKEN;
  else process.env.VITE_BFF_DEV_BEARER_TOKEN = originalToken;
});

describe("public frontend build auth boundary", () => {
  it("accepts only empty or the canonical dev viewer identity", () => {
    expect(validatePublicBuildBearerToken("")).toBe("");
    expect(validatePublicBuildBearerToken(undefined)).toBe("");
    expect(validatePublicBuildBearerToken(PUBLIC_DEV_VIEWER_BEARER_TOKEN)).toBe(
      PUBLIC_DEV_VIEWER_BEARER_TOKEN,
    );
    for (const rejected of [
      " ",
      ` ${PUBLIC_DEV_VIEWER_BEARER_TOKEN}`,
      `${PUBLIC_DEV_VIEWER_BEARER_TOKEN} `,
      PUBLIC_DEV_VIEWER_BEARER_TOKEN.toUpperCase(),
      "pantheon-dev-browser:admin:mfa:assistant.kernel.repair",
    ]) {
      expect(() => validatePublicBuildBearerToken(rejected)).toThrow(
        /canonical public dev viewer identity/,
      );
    }
  });

  it(
    "rejects a privileged token at the standard Vite build boundary",
    () => {
      const result = spawnSync("npm", ["run", "build"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          VITE_BFF_DEV_BEARER_TOKEN:
            "pantheon-dev-browser:admin:mfa:assistant.kernel.repair",
        },
      });

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(
        /canonical public dev viewer identity/,
      );
    },
    30_000,
  );

  it("rejects a privileged token before the standard Vite dev server can bind", () => {
    const result = spawnSync(
      "npm",
      [
        "run",
        "dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        "41739",
        "--strictPort",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          VITE_BFF_DEV_BEARER_TOKEN:
            "pantheon-dev-browser:admin:mfa:assistant.kernel.repair",
        },
        timeout: 10_000,
      },
    );

    expect(result.error?.message ?? "").not.toMatch(/timed out|ETIMEDOUT/i);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /canonical public dev viewer identity/,
    );
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/Local:\s+http/i);
  });

  it.each([
    " ",
    ` ${PUBLIC_DEV_VIEWER_BEARER_TOKEN}`,
    `${PUBLIC_DEV_VIEWER_BEARER_TOKEN} `,
  ])(
    "rejects raw whitespace variant %j at the Vite build boundary",
    (token) => {
      const result = spawnSync("npm", ["run", "build"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          VITE_BFF_DEV_BEARER_TOKEN: token,
        },
      });

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(
        /canonical public dev viewer identity/,
      );
    },
    30_000,
  );

  it("requires an explicit credential for hosted or external E2E", () => {
    expect(() => authToken({
      env: { PANTHEON_BFF_BASE_URL: "https://bff.example.test" },
    })).toThrow(/short-lived BFF_AUTH_TOKEN/);
    expect(authToken({
      env: { PANTHEON_BFF_BASE_URL: "https://bff.example.test" },
      token: "signed-short-lived-test-token",
    })).toBe("signed-short-lived-test-token");
    expect(authToken({
      env: { PANTHEON_BFF_BASE_URL: "http://127.0.0.1:9000" },
    })).toMatch(/^op-fe-gate:/);
  });

  it.each([
    "",
    " ",
    "\t\n",
    "Bearer",
    "Bearer ",
    " bearer\t",
    " signed-token",
    "signed-token ",
    "signed-token\n",
    "Bearer  signed-token",
    "Bearer\tsigned-token",
    "Bearer Bearer",
    "Bearer Bearer signed-token",
    "signed-token\nworkflow-command",
  ])("rejects blank or Bearer-only explicit credentials before network access (%j)", (token) => {
    expect(() => authToken({ env: {}, token })).toThrow(/non-blank bearer token/);
    expect(() => bearerHeader(token)).toThrow(/non-blank bearer token/);
    expect(() => devLoginSession({ token })).toThrow(/non-blank bearer token/);
  });

  it("does not silently replace a whitespace credential environment variable with fixture auth", () => {
    expect(() => authToken({
      env: {
        BFF_AUTH_TOKEN: " ",
        PANTHEON_BFF_BASE_URL: "http://127.0.0.1:9000",
      },
    })).toThrow(/non-blank bearer token/);
  });

  it("accepts one exact Bearer scheme separator and returns the opaque credential", () => {
    expect(authToken({ env: {}, token: "Bearer signed-token" })).toBe("signed-token");
    expect(bearerHeader("Bearer signed-token")).toBe("Bearer signed-token");
  });

  it("applies the same strict normalization to changed Node live probes", () => {
    expect(normalizeScriptBearerToken("signed-token")).toBe("signed-token");
    expect(normalizeScriptBearerToken("Bearer signed-token")).toBe("signed-token");
    expect(scriptBearerAuthorization("Bearer signed-token")).toBe("Bearer signed-token");
    for (const rejected of [
      "",
      " signed-token",
      "signed-token ",
      "signed token",
      "signed-token\nworkflow-command",
      "Bearer  signed-token",
      "Bearer Bearer",
      "Bearer Bearer signed-token",
    ]) {
      expect(() => normalizeScriptBearerToken(rejected)).toThrow(
        /non-blank bearer token/,
      );
      expect(() => scriptBearerAuthorization(rejected)).toThrow(
        /non-blank bearer token/,
      );
    }
  });

  it("does not let an explicit local fixture token bypass an external frontend origin", async () => {
    const browserOperations: string[] = [];
    const page = {
      addInitScript: async () => { browserOperations.push("addInitScript"); },
      evaluate: async () => { browserOperations.push("evaluate"); },
      goto: async () => { browserOperations.push("goto"); },
    } as unknown as Parameters<typeof installOidcDevLogin>[0];

    await expect(installOidcDevLogin(page, {
      env: { PANTHEON_FE_BASE_URL: "https://fe.example.test" },
      goto: false,
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    })).rejects.toThrow(/proven loopback-only E2E target/);
    expect(browserOperations).toEqual([]);

    expect(devLoginSession({
      env: { PANTHEON_FE_BASE_URL: "https://fe.example.test" },
      token: "signed-short-lived-test-token",
    }).token).toBe("signed-short-lived-test-token");
    expect(() => devLoginSession({
      env: {},
      pageBaseUrl: "https://fe.example.test",
      roles: ["viewer"],
    })).toThrow(/proven loopback-only E2E target/);
    expect(() => devLoginSession({
      env: {
        PANTHEON_BFF_BASE_URL: "https://bff.example.test",
        PANTHEON_FE_BASE_URL: "http://127.0.0.1:5173",
      },
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    })).toThrow(/proven loopback-only E2E target/);
  });

  it("rejects an explicit local fixture token for external direct BFF headers", () => {
    expect(() => authToken({
      env: { PANTHEON_BFF_BASE_URL: "https://bff.example.test" },
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    })).toThrow(/tracked fixture credentials are local-only/);
  });

  it.each([
    "https://bff.example.test",
    "https://127.attacker.example",
    "https://127.0.0.1.attacker.example",
    "//bff.example.test",
    "bff.example.test",
    "ftp://127.0.0.1/resource",
  ])("treats unsafe or non-loopback target %s as external", (target) => {
    const env = { PANTHEON_BFF_BASE_URL: target };
    expect(targetsExternalE2eEnvironment(env)).toBe(true);
    expect(() => authToken({ env })).toThrow(/short-lived BFF_AUTH_TOKEN/);
  });

  it("does not send local fixture auth through an external Vite proxy target", () => {
    const env = {
      PANTHEON_FE_BASE_URL: "http://127.0.0.1:5173",
      VITE_BFF_PROXY_TARGET: "https://bff.example.test",
    };

    expect(targetsExternalE2eEnvironment(env)).toBe(true);
    expect(() => authToken({ env, token: LOCAL_FIXTURE_AUTH_TOKEN })).toThrow(
      /tracked fixture credentials are local-only/,
    );
    expect(() => devLoginSession({ env, token: LOCAL_FIXTURE_AUTH_TOKEN })).toThrow(
      /proven loopback-only E2E target/,
    );
  });

  it.each([
    "http://localhost:9000",
    "http://localhost.:9000",
    "http://0.0.0.0:9000",
    "http://127.0.0.1:9000",
    "https://127.255.255.254:9443",
    "http://[::1]:9000",
  ])("recognizes exact loopback target %s", (target) => {
    const env = { PANTHEON_BFF_BASE_URL: target };
    expect(targetsExternalE2eEnvironment(env)).toBe(false);
    expect(authToken({ env })).toBe("op-fe-gate:operator,reviewer,approver:mfa");
  });

  it("treats the alternate F08 live-write opt-in as external", () => {
    const env = { F08_CREATE_INTENT_LIVE_BFF: "1" };
    expect(targetsExternalE2eEnvironment(env)).toBe(true);
    expect(() => authToken({ env })).toThrow(/short-lived BFF_AUTH_TOKEN/);
  });

  it("keeps tracked privileged fallbacks out of every network-capable E2E probe", () => {
    const allNetworkE2ePaths = filesRecursively("e2e")
      .filter((file) => /\.spec\.ts$/u.test(file));
    const hostedE2ePaths = allNetworkE2ePaths.filter((file) =>
      /hosted.*\.spec\.ts$/u.test(file),
    );
    const networkPaths = [
      ...allNetworkE2ePaths,
      "scripts/accept-management-hosted-production.mjs",
      "scripts/probe-bff-write-paths.mjs",
      "scripts/probe-create-persona-then-fleet.mjs",
      "scripts/probe-persona-onboarding-endpoints.mjs",
    ];
    const source = networkPaths
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const hostedSource = hostedE2ePaths
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/op-fe-gate:[^"'\s]*mfa/);
    expect(source).not.toContain("pantheon-dev-browser:reviewer");
    expect(hostedSource).not.toContain("VITE_BFF_DEV_BEARER_TOKEN");
    expect(hostedE2ePaths).toContain("e2e/agora-winner-branch-hosted.spec.ts");
    expect(allNetworkE2ePaths).toContain("e2e/04-sentinel-remediation.spec.ts");

    for (const file of [
      "scripts/accept-management-hosted-production.mjs",
      "scripts/probe-bff-write-paths.mjs",
      "scripts/probe-create-persona-then-fleet.mjs",
      "scripts/probe-persona-onboarding-endpoints.mjs",
    ]) {
      const probeSource = readFileSync(file, "utf8");
      expect(probeSource).toContain("./lib/bearer-token.mjs");
      expect(probeSource).not.toMatch(/Authorization:\s*`Bearer \$\{BEARER_TOKEN\}`/u);
    }
  });

  it.skipIf(!chromiumInstalled)(
    "fails the fixture-only portfolio specs before navigation for an external frontend",
    () => {
      const env = {
        ...process.env,
        PANTHEON_FE_BASE_URL: "https://fe.example.test",
        FRONTEND_BASE_URL: "https://fe.example.test",
        PLAYWRIGHT_BASE_URL: "https://fe.example.test",
        PANTHEON_HOSTED_E2E: "",
        FE_INT_GATE_LIVE_BFF: "",
        F08_CREATE_INTENT_LIVE_BFF: "",
        RUN_LIVE_BFF_CONTRACTS: "",
      };
      const result = spawnSync(
        "npx",
        [
          "playwright",
          "test",
          "e2e/20-portfolio-book-monitor.spec.ts",
          "e2e/22-persona-trade-journal.spec.ts",
          "--project=chromium",
          "--retries=0",
          "--reporter=line",
        ],
        { cwd: process.cwd(), encoding: "utf8", env, timeout: 60_000 },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.error?.message ?? "").not.toMatch(/timed out|ETIMEDOUT/i);
      expect(result.status).not.toBe(0);
      expect(output).toMatch(/20-portfolio-book-monitor/);
      expect(output).toMatch(/22-persona-trade-journal/);
      expect(output).toMatch(/proven loopback-only E2E target/);
      expect(output).not.toMatch(
        /ERR_NAME_NOT_RESOLVED|ENOTFOUND|fe\.example\.test\/management/,
      );
    },
    75_000,
  );

  it("discovers fully intercepted fixtures under external global targets without a secret", () => {
    const env = {
      ...process.env,
      PANTHEON_BFF_BASE_URL: "https://bff.example.test",
      PANTHEON_FE_BASE_URL: "https://fe.example.test",
      FRONTEND_BASE_URL: "https://fe.example.test",
      PLAYWRIGHT_BASE_URL: "https://fe.example.test",
      PANTHEON_HOSTED_E2E: "",
      FE_INT_GATE_LIVE_BFF: "",
      F08_CREATE_INTENT_LIVE_BFF: "",
      RUN_LIVE_BFF_CONTRACTS: "",
    };
    for (const key of [
      "BFF_AUTH_TOKEN",
      "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
      "PANTHEON_BFF_SMOKE_TOKEN",
      "VITE_BFF_DEV_BEARER_TOKEN",
    ]) {
      delete env[key];
    }

    const result = spawnSync(
      "npx",
      [
        "playwright",
        "test",
        "e2e/08-create-intent.spec.ts",
        "e2e/20-portfolio-book-monitor.spec.ts",
        "e2e/04-sentinel-remediation.spec.ts",
        "--list",
        "--reporter=line",
      ],
      { cwd: process.cwd(), encoding: "utf8", env },
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/08-create-intent|20-portfolio-book-monitor/);
  }, 30_000);

  it.skipIf(!chromiumInstalled)(
    "runs the fully intercepted F08 fixture with an external global BFF and no secret",
    () => {
      const env = {
        ...process.env,
        PANTHEON_BFF_BASE_URL: "https://bff.example.test",
        PANTHEON_FE_BASE_URL: "http://127.0.0.1:9",
        FRONTEND_BASE_URL: "http://127.0.0.1:9",
        PLAYWRIGHT_BASE_URL: "http://127.0.0.1:9",
        PANTHEON_HOSTED_E2E: "",
        FE_INT_GATE_LIVE_BFF: "",
        F08_CREATE_INTENT_LIVE_BFF: "",
        RUN_LIVE_BFF_CONTRACTS: "",
      };
      for (const key of [
        "BFF_AUTH_TOKEN",
        "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
        "PANTHEON_BFF_SMOKE_TOKEN",
        "VITE_BFF_DEV_BEARER_TOKEN",
      ]) {
        delete env[key];
      }

      const result = spawnSync(
        "npx",
        [
          "playwright",
          "test",
          "e2e/08-create-intent.spec.ts",
          "--project=chromium",
          "--reporter=line",
        ],
        { cwd: process.cwd(), encoding: "utf8", env },
      );

      expect(result.status).toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/2 passed/);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/1 skipped/);
    },
    30_000,
  );

  it("does not opt the Agora winner branch into live execution from token presence alone", () => {
    const env = {
      ...process.env,
      AG_DYNUI_FULL_006_HOSTED: "",
      PANTHEON_HOSTED_E2E: "",
      PANTHEON_BFF_BASE_URL: "http://127.0.0.1:9",
      PANTHEON_FE_BASE_URL: "http://127.0.0.1:9",
      BFF_AUTH_TOKEN: "signed_short-lived-token_20260713",
    };
    const result = spawnSync(
      "npx",
      [
        "playwright",
        "test",
        "e2e/agora-winner-branch-hosted.spec.ts",
        "--project=chromium",
        "--reporter=line",
      ],
      { cwd: process.cwd(), encoding: "utf8", env },
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/skipped/i);
  }, 30_000);

  it("lists the explicitly enabled Agora winner branch when a token is present", () => {
    const env = {
      ...process.env,
      AG_DYNUI_FULL_006_HOSTED: "1",
      PANTHEON_HOSTED_E2E: "",
      PANTHEON_BFF_BASE_URL: "http://127.0.0.1:9",
      PANTHEON_FE_BASE_URL: "http://127.0.0.1:9",
      BFF_AUTH_TOKEN: "signed_short-lived-token_20260713",
    };
    const result = spawnSync(
      "npx",
      [
        "playwright",
        "test",
        "e2e/agora-winner-branch-hosted.spec.ts",
        "--project=chromium",
        "--list",
        "--reporter=line",
      ],
      { cwd: process.cwd(), encoding: "utf8", env },
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/live readiness cards to Trading Room workspace/);
  }, 30_000);

  it.each([
    {
      name: "F08 alternate live writes",
      script: "e2e/08-create-intent.spec.ts",
      optIn: { F08_CREATE_INTENT_LIVE_BFF: "1" },
    },
    {
      name: "Agora hosted shell",
      script: "e2e/agora-shell-hosted.spec.ts",
      optIn: { AG_UIPOL_002_FE_BASE_URL: "https://fe.example.test" },
    },
    {
      name: "Agora hosted workshop",
      script: "e2e/agora-strategy-workshop-hosted.spec.ts",
      optIn: {
        AG_DYNUI_LIVE_WORKSHOP_FE_013_BASE_URL: "https://fe.example.test",
        AG_DYNUI_LIVE_WORKSHOP_FE_013_BFF_BASE_URL: "https://bff.example.test",
      },
    },
    {
      name: "Agora winner branch",
      script: "e2e/agora-winner-branch-hosted.spec.ts",
      optIn: { AG_DYNUI_FULL_006_HOSTED: "1" },
    },
    {
      name: "Evolution journal hosted evidence",
      script: "e2e/evochain009.spec.ts",
      optIn: { PANTHEON_HOSTED_E2E: "1" },
    },
  ])("fails $name before test execution without an explicit token", ({ script, optIn }) => {
    const env = {
      ...process.env,
      PANTHEON_HOSTED_E2E: "",
      FE_INT_GATE_LIVE_BFF: "",
      RUN_LIVE_BFF_CONTRACTS: "",
      ...optIn,
    };
    for (const key of [
      "BFF_AUTH_TOKEN",
      "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
      "PANTHEON_BFF_SMOKE_TOKEN",
      "VITE_BFF_DEV_BEARER_TOKEN",
    ]) {
      delete env[key];
    }
    const result = spawnSync(
      "npx",
      ["playwright", "test", script, "--list", "--reporter=line"],
      { cwd: process.cwd(), encoding: "utf8", env },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/explicit short-lived BFF_AUTH_TOKEN|short-lived BFF_AUTH_TOKEN/);
  }, 30_000);

  it.each([
    "scripts/probe-bff-write-paths.mjs",
    "scripts/probe-create-persona-then-fleet.mjs",
    "scripts/probe-persona-onboarding-endpoints.mjs",
  ])("fails closed before network access when %s has no target", (script) => {
    const env = { ...process.env };
    for (const key of [
      "PANTHEON_BFF_BASE_URL",
      "VITE_BFF_BASE_URL",
      "PANTHEON_BFF_WRITE_PROBE_BEARER_TOKEN",
      "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
      "BFF_AUTH_TOKEN",
    ]) {
      delete env[key];
    }
    const result = spawnSync("node", [script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env,
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /PANTHEON_BFF_BASE_URL is required/,
    );
  });

  it.each([
    "scripts/probe-bff-write-paths.mjs",
    "scripts/probe-create-persona-then-fleet.mjs",
    "scripts/probe-persona-onboarding-endpoints.mjs",
  ])("fails closed before network access when %s has a target but no credential", (script) => {
    const env = {
      ...process.env,
      PANTHEON_BFF_BASE_URL: "http://127.0.0.1:9",
    };
    for (const key of [
      "VITE_BFF_BASE_URL",
      "PANTHEON_BFF_WRITE_PROBE_BEARER_TOKEN",
      "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
      "BFF_AUTH_TOKEN",
    ]) {
      delete env[key];
    }
    const result = spawnSync("node", [script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env,
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /short-lived BFF_AUTH_TOKEN is required/,
    );
  });
});
