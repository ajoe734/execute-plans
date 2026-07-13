import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

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
    expect(validatePublicBuildBearerToken(PUBLIC_DEV_VIEWER_BEARER_TOKEN)).toBe(
      PUBLIC_DEV_VIEWER_BEARER_TOKEN,
    );
    expect(() =>
      validatePublicBuildBearerToken(
        "pantheon-dev-browser:admin:mfa:assistant.kernel.repair",
      ),
    ).toThrow(/canonical public dev viewer identity/);
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
});
