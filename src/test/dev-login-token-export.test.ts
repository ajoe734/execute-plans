import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

function fixtureFiles(payload: unknown) {
  const directory = mkdtempSync(join(tmpdir(), "pantheon-dev-login-token-"));
  temporaryDirectories.push(directory);
  const responsePath = join(directory, "response.json");
  const githubEnvPath = join(directory, "github-env");
  writeFileSync(responsePath, JSON.stringify(payload), { mode: 0o600 });
  writeFileSync(githubEnvPath, "PRESERVED=value\n", { mode: 0o600 });
  return { githubEnvPath, responsePath };
}

function runExporter(responsePath: string, githubEnvPath: string) {
  return spawnSync(
    "node",
    ["scripts/export-dev-login-token.mjs", responsePath, githubEnvPath],
    { cwd: process.cwd(), encoding: "utf8" },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("dev-login GitHub Actions token export", () => {
  it.each([
    "signed_short-lived-token_20260713",
    "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJvcGVyYXRvciJ9.c2lnbmF0dXJl",
  ])("exports a validated base64url/JWT credential without changing it (%s)", (token) => {
    const { githubEnvPath, responsePath } = fixtureFiles({
      access_token: token,
      expires_in: 300,
      token_type: "Bearer",
    });

    const result = runExporter(responsePath, githubEnvPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`::add-mask::${token}\n`);
    expect(readFileSync(githubEnvPath, "utf8")).toBe(
      `PRESERVED=value\nPANTHEON_DEPLOY_WRITE_PROBE_AUTH_TOKEN=${token}\n`,
    );
  });

  it("rejects a workflow-command/newline token before GITHUB_ENV mutation", () => {
    const { githubEnvPath, responsePath } = fixtureFiles({
      access_token: "safe-prefix\nPANTHEON_DEPLOY_REF=attacker-ref",
      expires_in: 300,
      token_type: "Bearer",
    });

    const deployMarker = join(dirname(responsePath), "deploy-ran");
    const result = spawnSync(
      "bash",
      [
        "-c",
        'node scripts/export-dev-login-token.mjs "$RESPONSE_PATH" "$GITHUB_ENV" && printf deployed > "$DEPLOY_MARKER"',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          DEPLOY_MARKER: deployMarker,
          GITHUB_ENV: githubEnvPath,
          RESPONSE_PATH: responsePath,
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/base64url token or three-segment JWT/);
    expect(readFileSync(githubEnvPath, "utf8")).toBe("PRESERVED=value\n");
    expect(existsSync(deployMarker)).toBe(false);
  });

  it.each([
    { access_token: "valid-base64url-token", expires_in: 300, token_type: "Basic" },
    { access_token: "valid-base64url-token", expires_in: 0, token_type: "Bearer" },
    { access_token: "valid-base64url-token", expires_in: "300", token_type: "Bearer" },
    { access_token: "Bearer", expires_in: 300, token_type: "Bearer" },
  ])("rejects malformed response %# before any Actions command", (payload) => {
    const { githubEnvPath, responsePath } = fixtureFiles(payload);

    const result = runExporter(responsePath, githubEnvPath);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(readFileSync(githubEnvPath, "utf8")).toBe("PRESERVED=value\n");
  });
});
