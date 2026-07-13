import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { authToken } from "../../e2e/helpers/auth";
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

  it("keeps tracked privileged fallbacks out of every hosted probe path", () => {
    const networkPaths = [
      "e2e/01-startup-session.spec.ts",
      "e2e/02-control-room.spec.ts",
      "e2e/03-execution-loop.spec.ts",
      "e2e/06-entity-registry.spec.ts",
      "e2e/10-rollback-saga.spec.ts",
      "e2e/21-portfolio-workflow-hosted.spec.ts",
      "e2e/25-persona-fleet-live-linked-pages.spec.ts",
      "e2e/agora-shell-hosted.spec.ts",
      "e2e/agora-strategy-workshop-hosted.spec.ts",
      "e2e/agora-winner-branch-hosted.spec.ts",
      "scripts/accept-management-hosted-production.mjs",
      "scripts/probe-bff-write-paths.mjs",
      "scripts/probe-create-persona-then-fleet.mjs",
      "scripts/probe-persona-onboarding-endpoints.mjs",
    ];
    const source = networkPaths
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/op-fe-gate:[^"'\s]*mfa/);
    expect(source).not.toContain("pantheon-dev-browser:reviewer");
  });

  it.each([
    "scripts/probe-bff-write-paths.mjs",
    "scripts/probe-create-persona-then-fleet.mjs",
    "scripts/probe-persona-onboarding-endpoints.mjs",
  ])("fails closed before network access when %s has no target or credential", (script) => {
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
});
