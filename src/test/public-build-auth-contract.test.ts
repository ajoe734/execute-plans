import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  authToken,
  targetsExternalE2eEnvironment,
} from "../../e2e/helpers/auth";
import {
  PUBLIC_DEV_VIEWER_BEARER_TOKEN,
  validatePublicBuildBearerToken,
} from "@/config/publicBuildAuth";

const originalToken = process.env.VITE_BFF_DEV_BEARER_TOKEN;

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

  it("rejects a privileged token at the standard Vite build boundary", () => {
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
  });

  it.each([
    " ",
    ` ${PUBLIC_DEV_VIEWER_BEARER_TOKEN}`,
    `${PUBLIC_DEV_VIEWER_BEARER_TOKEN} `,
  ])("rejects raw whitespace variant %j at the Vite build boundary", (token) => {
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
  });

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

  it("keeps tracked privileged fallbacks out of every hosted probe path", () => {
    const hostedE2ePaths = readdirSync("e2e", { withFileTypes: true })
      .filter((entry) => entry.isFile() && /hosted.*\.spec\.ts$/u.test(entry.name))
      .map((entry) => `e2e/${entry.name}`);
    const liveProbePaths = [
      "e2e/01-startup-session.spec.ts",
      "e2e/02-control-room.spec.ts",
      "e2e/03-execution-loop.spec.ts",
      "e2e/06-entity-registry.spec.ts",
      "e2e/08-create-intent.spec.ts",
      "e2e/10-rollback-saga.spec.ts",
      "e2e/25-persona-fleet-live-linked-pages.spec.ts",
      "scripts/accept-management-hosted-production.mjs",
      "scripts/probe-bff-write-paths.mjs",
      "scripts/probe-create-persona-then-fleet.mjs",
      "scripts/probe-persona-onboarding-endpoints.mjs",
    ];
    const networkPaths = [...new Set([...hostedE2ePaths, ...liveProbePaths])];
    const source = networkPaths
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const hostedSource = hostedE2ePaths
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/op-fe-gate:[^"'\s]*mfa/);
    expect(source).not.toContain("pantheon-dev-browser:reviewer");
    expect(hostedSource).not.toContain("VITE_BFF_DEV_BEARER_TOKEN");
    expect(hostedE2ePaths).toContain("e2e/agora-ui-polish-hosted.spec.ts");
  });

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
      name: "Agora UI polish hosted read/write",
      script: "e2e/agora-ui-polish-hosted.spec.ts",
      optIn: {
        AG_UIPOL_006_HOSTED: "1",
        AG_UIPOL_006_FE_BASE_URL: "https://fe.example.test",
      },
    },
    {
      name: "Agora winner branch",
      script: "e2e/agora-winner-branch-hosted.spec.ts",
      optIn: { AG_DYNUI_FULL_006_HOSTED: "1" },
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
