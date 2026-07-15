import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  digestReleaseDist,
  prepareReleaseCandidate,
  SAFE_BUILD_MODE,
  verifyReleaseCandidate,
} from "../../scripts/release-candidate.mjs";

const FRONTEND_SHA = "1".repeat(40);
const OTHER_FRONTEND_SHA = "2".repeat(40);
const BFF_SHA = "a".repeat(40);
const GATE_RUN_ID = "123456";
const GATE_RUN_URL = `https://github.test/actions/runs/${GATE_RUN_ID}`;
const BFF_BASE_URL = "https://bff.test";
const SCRIPT_PATH = path.resolve(
  process.cwd(),
  "scripts/release-candidate.mjs",
);
const temporaryRoots: string[] = [];

function temporaryRoot() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-candidate-test-"),
  );
  temporaryRoots.push(root);
  return root;
}

function writeFile(
  root: string,
  relativePath: string,
  contents: string | Buffer,
) {
  const filePath = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function makeDist(root: string, additions: Record<string, string> = {}) {
  const dist = path.join(root, "dist");
  writeFile(
    dist,
    "index.html",
    '<!doctype html><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script>',
  );
  writeFile(
    dist,
    "assets/app.js",
    "globalThis.__PANTHEON_RELEASE__ = 'safe';\n",
  );
  writeFile(dist, "assets/app.css", "body { color: #111; }\n");
  writeFile(
    dist,
    "assets/config.json",
    `${JSON.stringify({ mode: "live" })}\n`,
  );
  for (const [relativePath, contents] of Object.entries(additions)) {
    writeFile(dist, relativePath, contents);
  }
  return dist;
}

function prepare(root: string, overrides: Record<string, unknown> = {}) {
  const distDir = String(overrides.distDir || makeDist(root));
  const outputDir = String(overrides.outputDir || path.join(root, "candidate"));
  return prepareReleaseCandidate({
    distDir,
    outputDir,
    frontendSha: FRONTEND_SHA,
    bffSha: BFF_SHA,
    gateRunId: GATE_RUN_ID,
    gateRunUrl: GATE_RUN_URL,
    bffBaseUrl: BFF_BASE_URL,
    ...overrides,
  });
}

function verify(candidateDir: string, overrides: Record<string, unknown> = {}) {
  return verifyReleaseCandidate({
    candidateDir,
    expectedFrontendSha: FRONTEND_SHA,
    expectedGateRunId: GATE_RUN_ID,
    expectedBffSha: BFF_SHA,
    expectedBffBaseUrl: BFF_BASE_URL,
    ...overrides,
  });
}

function cli(args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      VITE_BFF_DEV_BEARER_TOKEN: "",
      VITE_BFF_MODE: "live",
      VITE_BFF_FALLBACK: "strict",
      VITE_BFF_REAL_WRITES: "false",
      VITE_BFF_ALLOW_DEV_STUB_WRITES: "false",
      ...extraEnv,
    },
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("release candidate preparation and verification", () => {
  it("produces a deterministic canonical digest and strict deployment aliases", () => {
    const root = temporaryRoot();
    const distDir = makeDist(root);
    const firstDir = path.join(root, "candidate-a");
    const secondDir = path.join(root, "candidate-b");

    const first = prepare(root, { distDir, outputDir: firstDir });
    const second = prepare(root, { distDir, outputDir: secondDir });

    expect(first.artifactDigestSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(second.artifactDigestSha256).toBe(first.artifactDigestSha256);
    expect(fs.readFileSync(path.join(firstDir, "candidate.json"), "utf8")).toBe(
      fs.readFileSync(path.join(secondDir, "candidate.json"), "utf8"),
    );
    expect(
      fs.readFileSync(path.join(firstDir, "dist", "deployment.json"), "utf8"),
    ).toBe(
      fs.readFileSync(path.join(secondDir, "dist", "deployment.json"), "utf8"),
    );

    const candidate = JSON.parse(
      fs.readFileSync(path.join(firstDir, "candidate.json"), "utf8"),
    );
    const deployment = JSON.parse(
      fs.readFileSync(path.join(firstDir, "dist", "deployment.json"), "utf8"),
    );
    expect(candidate.files.map((file: { path: string }) => file.path)).toEqual([
      "assets/app.css",
      "assets/app.js",
      "assets/config.json",
      "index.html",
    ]);
    expect(candidate.files).not.toContainEqual(
      expect.objectContaining({ path: "deployment.json" }),
    );
    expect(candidate.artifactDigest).toBe(candidate.artifactDigestSha256);
    expect(deployment.artifactDigest).toBe(first.artifactDigestSha256);
    expect(deployment.artifactDigestSha256).toBe(first.artifactDigestSha256);
    expect(deployment.integrationGateRunId).toBe(GATE_RUN_ID);
    expect(deployment.bffCommitEvidence).toBe(true);
    expect(deployment.buildMode).toEqual(SAFE_BUILD_MODE);

    expect(verify(firstDir).artifactDigestSha256).toBe(
      first.artifactDigestSha256,
    );
  });

  it("supports prepare and verify through the CLI", () => {
    const root = temporaryRoot();
    const distDir = makeDist(root);
    const candidateDir = path.join(root, "candidate");
    const prepared = cli([
      "prepare",
      "--dist-dir",
      distDir,
      "--output-dir",
      candidateDir,
      "--frontend-sha",
      FRONTEND_SHA,
      "--bff-sha",
      BFF_SHA,
      "--gate-run-id",
      GATE_RUN_ID,
      "--gate-run-url",
      GATE_RUN_URL,
      "--bff-base-url",
      BFF_BASE_URL,
    ]);
    expect(prepared.status, prepared.stderr).toBe(0);
    const digest = prepared.stdout.trim();
    expect(digest).toMatch(/^[a-f0-9]{64}$/u);

    const verified = cli([
      "verify",
      "--candidate-dir",
      candidateDir,
      "--expected-frontend-sha",
      FRONTEND_SHA,
      "--expected-gate-run-id",
      GATE_RUN_ID,
      "--expected-bff-sha",
      BFF_SHA,
      "--expected-bff-base-url",
      BFF_BASE_URL,
      "--expected-artifact-digest",
      digest,
    ]);
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.stdout.trim()).toBe(digest);
  });

  it("computes and verifies a staged release dist digest while excluding deployment metadata", () => {
    const root = temporaryRoot();
    const distDir = makeDist(root);
    const initial = digestReleaseDist({ distDir });

    expect(initial.artifactDigestSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(initial.fileCount).toBe(4);
    expect(initial.files.map((file) => file.path)).not.toContain(
      "deployment.json",
    );

    writeFile(
      distDir,
      "deployment.json",
      `${JSON.stringify({ changedAt: Date.now() })}\n`,
    );
    expect(
      digestReleaseDist({
        distDir,
        expectedArtifactDigest: initial.artifactDigestSha256,
      }).artifactDigestSha256,
    ).toBe(initial.artifactDigestSha256);

    const cliDigest = cli([
      "digest",
      "--dist-dir",
      distDir,
      "--expected-artifact-digest",
      initial.artifactDigestSha256,
    ]);
    expect(cliDigest.status, cliDigest.stderr).toBe(0);
    expect(cliDigest.stdout.trim()).toBe(initial.artifactDigestSha256);
  });

  it("rejects a tampered release dist against its expected canonical digest", () => {
    const root = temporaryRoot();
    const distDir = makeDist(root);
    const expectedDigest = digestReleaseDist({ distDir }).artifactDigestSha256;

    fs.appendFileSync(path.join(distDir, "assets", "app.js"), "// tampered\n");
    expect(() =>
      digestReleaseDist({ distDir, expectedArtifactDigest: expectedDigest }),
    ).toThrow(/does not match the expected digest/u);

    const result = cli([
      "digest",
      "--dist-dir",
      distDir,
      "--expected-artifact-digest",
      expectedDigest,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/does not match the expected digest/u);
  });

  it("rejects symlinks while digesting a staged release dist", () => {
    const root = temporaryRoot();
    const distDir = makeDist(root);
    fs.symlinkSync(
      path.join(distDir, "assets", "app.js"),
      path.join(distDir, "assets", "alias.js"),
    );

    expect(() => digestReleaseDist({ distDir })).toThrow(
      /symlinks are forbidden/u,
    );
  });

  it("scans staged release assets for generic and environment-provided secrets", () => {
    const genericRoot = temporaryRoot();
    const genericDist = makeDist(genericRoot, {
      "assets/config.js":
        "const config = { client_secret: 'never-ship-this' };\n",
    });
    expect(() => digestReleaseDist({ distDir: genericDist })).toThrow(
      /client secret/u,
    );

    const environmentRoot = temporaryRoot();
    const sentinel = "environment-secret-never-log-12345";
    const environmentDist = makeDist(environmentRoot, {
      "assets/config.js": `globalThis.releaseValue = '${sentinel}';\n`,
    });
    const result = cli(["digest", "--dist-dir", environmentDist], {
      RELEASE_CLIENT_SECRET: sentinel,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/configured secret sentinel/u);
    expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
  });

  it("rejects asset tampering and digest alias tampering", () => {
    const root = temporaryRoot();
    const candidateDir = path.join(root, "candidate");
    prepare(root, { outputDir: candidateDir });
    fs.appendFileSync(
      path.join(candidateDir, "dist", "assets", "app.js"),
      "// tampered\n",
    );
    expect(() => verify(candidateDir)).toThrow(
      /asset manifest does not match/u,
    );

    const aliasRoot = temporaryRoot();
    const aliasDir = path.join(aliasRoot, "candidate");
    prepare(aliasRoot, { outputDir: aliasDir });
    const candidatePath = path.join(aliasDir, "candidate.json");
    const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
    candidate.artifactDigest = "f".repeat(64);
    fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
    expect(() => verify(aliasDir)).toThrow(/digest aliases do not match/u);
  });

  it("rejects the wrong expected frontend SHA or gate run", () => {
    const root = temporaryRoot();
    const candidateDir = path.join(root, "candidate");
    prepare(root, { outputDir: candidateDir });

    expect(() =>
      verify(candidateDir, { expectedFrontendSha: OTHER_FRONTEND_SHA }),
    ).toThrow(/frontend SHA does not match/u);
    expect(() => verify(candidateDir, { expectedGateRunId: "999999" })).toThrow(
      /gate run ID does not match/u,
    );
  });

  it("rejects unsafe build flags during prepare and verify", () => {
    const root = temporaryRoot();
    const distDir = makeDist(root);
    expect(() =>
      prepare(root, {
        distDir,
        buildMode: { ...SAFE_BUILD_MODE, VITE_BFF_REAL_WRITES: "true" },
      }),
    ).toThrow(/VITE_BFF_REAL_WRITES must be false/u);

    const verifyRoot = temporaryRoot();
    const candidateDir = path.join(verifyRoot, "candidate");
    prepare(verifyRoot, { outputDir: candidateDir });
    const candidatePath = path.join(candidateDir, "candidate.json");
    const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
    candidate.buildMode.VITE_BFF_ALLOW_DEV_STUB_WRITES = "true";
    fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
    expect(() => verify(candidateDir)).toThrow(
      /VITE_BFF_ALLOW_DEV_STUB_WRITES must be false/u,
    );
  });

  it.each([
    [
      "bearer",
      "globalThis.auth = 'Bearer top-secret-token-123';\n",
      /bearer credential/u,
    ],
    [
      "client-secret",
      "const config = { client_secret: 'client-secret-value' };\n",
      /client secret/u,
    ],
    [
      "private-key",
      "const key = `-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----`;\n",
      /private key/u,
    ],
    [
      "service-role",
      "const config = { service_role_key: 'service-role-secret' };\n",
      /service-role credential/u,
    ],
    [
      "token-sentinel",
      "const token = 'release-token-sentinel-value';\n",
      /token sentinel/u,
    ],
  ])(
    "rejects a generic %s credential without reflecting its value",
    (_name, source, expectedError) => {
      const root = temporaryRoot();
      const distDir = makeDist(root, { "assets/leak.js": source });
      let message = "";
      try {
        prepare(root, { distDir });
      } catch (error) {
        message = String((error as Error).message);
      }
      expect(message).toMatch(expectedError);
      expect(message).not.toContain(source.trim());
    },
  );

  it("rejects an exact configured secret sentinel without echoing it", () => {
    const sentinel = "configured-sensitive-value-987654321";
    const root = temporaryRoot();
    const distDir = makeDist(root, {
      "assets/leak.css": `.x::after { content: "${sentinel}"; }\n`,
    });
    let message = "";
    try {
      prepare(root, { distDir, secretSentinels: [sentinel] });
    } catch (error) {
      message = String((error as Error).message);
    }
    expect(message).toMatch(/configured secret sentinel/u);
    expect(message).not.toContain(sentinel);
  });

  it("rejects symlinks and canonical-manifest path escapes", () => {
    const root = temporaryRoot();
    const distDir = makeDist(root);
    fs.symlinkSync(
      path.join(distDir, "assets", "app.js"),
      path.join(distDir, "assets", "alias.js"),
    );
    expect(() => prepare(root, { distDir })).toThrow(/symlinks are forbidden/u);

    const escapeRoot = temporaryRoot();
    const candidateDir = path.join(escapeRoot, "candidate");
    prepare(escapeRoot, { outputDir: candidateDir });
    const candidatePath = path.join(candidateDir, "candidate.json");
    const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
    candidate.files[0].path = "../outside.js";
    fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
    expect(() => verify(candidateDir)).toThrow(/canonical relative path/u);
  });

  it("fails closed on a non-empty browser bearer environment input", () => {
    const root = temporaryRoot();
    const distDir = makeDist(root);
    const sentinel = "browser-bearer-sentinel-never-log";
    const result = cli(
      [
        "prepare",
        "--dist-dir",
        distDir,
        "--output-dir",
        path.join(root, "candidate"),
        "--frontend-sha",
        FRONTEND_SHA,
        "--bff-sha",
        BFF_SHA,
        "--gate-run-id",
        GATE_RUN_ID,
        "--gate-run-url",
        GATE_RUN_URL,
        "--bff-base-url",
        BFF_BASE_URL,
      ],
      { VITE_BFF_DEV_BEARER_TOKEN: sentinel },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /browser bearer environment input must be empty/u,
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
  });
});
