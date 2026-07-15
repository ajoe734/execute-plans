import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalizeSha256,
  createCandidateResolver,
  inspectDeploymentMetadata,
  listCandidateScriptAndStyleFiles,
  redactDiagnosticText,
  scanTextForSensitiveValues,
} from "../../scripts/probe-hosted-browser-bff.mjs";

const cleanupRoots: string[] = [];

function temporaryCandidate() {
  const root = mkdtempSync(join(tmpdir(), "pantheon-fe-candidate-"));
  cleanupRoots.push(root);
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(
    join(root, "index.html"),
    '<!doctype html><script src="/assets/app.js"></script>',
    "utf8",
  );
  writeFileSync(join(root, "assets", "app.js"), "console.log('safe');", "utf8");
  writeFileSync(join(root, "assets", "app.css"), "body { color: white; }", "utf8");
  writeFileSync(
    join(root, "deployment.json"),
    JSON.stringify({ app: "execute-plans" }),
    "utf8",
  );
  return root;
}

afterEach(() => {
  for (const root of cleanupRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("hosted browser strict release policy", () => {
  it("accepts an exact gated, tokenless, safe-write deployment manifest", () => {
    const frontendSha = "a".repeat(40);
    const backendSha = "b".repeat(40);
    const digest = "c".repeat(64);
    const policy = inspectDeploymentMetadata(
      {
        app: "execute-plans",
        environment: "pantheon-dev-fe",
        commit: frontendSha,
        artifactDigest: "sha256:" + digest,
        artifactDigestSha256: digest,
        integrationGateRunId: 29328923603,
        bffCommit: backendSha,
        bffCommitEvidence: true,
        buildMode: {
          VITE_BFF_MODE: "live",
          VITE_BFF_FALLBACK: "strict",
          VITE_BFF_REAL_WRITES: "false",
          VITE_BFF_ALLOW_DEV_STUB_WRITES: false,
          VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
        },
      },
      {
        expectedSha: frontendSha,
        expectedArtifactDigest: digest,
      },
    );

    expect(policy.pass).toBe(true);
    expect(policy.failures).toEqual([]);
    expect(policy.deployment?.artifactDigest).toBe(digest);
    expect(policy.deployment?.integrationGateRunId).toBe("29328923603");
  });

  it("fails closed on identity drift, unsafe writes, or missing gate evidence", () => {
    const frontendSha = "a".repeat(40);
    const digest = "c".repeat(64);
    const policy = inspectDeploymentMetadata(
      {
        commit: "d".repeat(40),
        artifactDigest: digest,
        integrationGateRunId: "",
        bffCommit: "b".repeat(40),
        bffCommitEvidence: true,
        buildMode: {
          VITE_BFF_MODE: "live",
          VITE_BFF_FALLBACK: "strict",
          VITE_BFF_REAL_WRITES: "true",
          VITE_BFF_ALLOW_DEV_STUB_WRITES: "false",
          VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
        },
      },
      {
        expectedSha: frontendSha,
        expectedArtifactDigest: digest,
      },
    );

    expect(policy.pass).toBe(false);
    expect(policy.failures).toEqual(
      expect.arrayContaining([
        "commitMatchesExpected",
        "integrationGateRunIdValid",
        "realWritesDisabled",
      ]),
    );
  });

  it("canonicalizes SHA-256 prefixes but rejects malformed digests", () => {
    const digest = "c".repeat(64);
    expect(canonicalizeSha256("sha256:" + digest.toUpperCase())).toBe(digest);
    expect(canonicalizeSha256("deadbeef")).toBe("");
  });

  it("reports secret categories without returning the matched values", () => {
    const bearer = "Bearer sensitive-value-123456";
    const clientSecret = 'client_secret="client-value-123456"';
    const privateKey =
      "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----";
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({ role: "service_role" }),
    ).toString("base64url");
    const serviceRoleJwt = header + "." + payload + ".signature123";
    const sourceText = [
      bearer,
      clientSecret,
      privateKey,
      serviceRoleJwt,
    ].join("\n");

    const findings = scanTextForSensitiveValues("assets/app.js", sourceText);
    const serialized = JSON.stringify(findings);

    expect(findings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining([
        "bearer_credential",
        "client_secret_literal",
        "private_key",
        "service_role_jwt",
      ]),
    );
    expect(serialized).not.toContain("sensitive-value-123456");
    expect(serialized).not.toContain("client-value-123456");
    expect(serialized).not.toContain("private-material");
    expect(serialized).not.toContain(serviceRoleJwt);
    expect(redactDiagnosticText(sourceText)).not.toContain(
      "sensitive-value-123456",
    );
  });

  it("serves SPA routes from a candidate without allowing traversal or symlinks", () => {
    const root = temporaryCandidate();
    const resolver = createCandidateResolver(root);

    const spa = resolver.resolve(
      "https://pantheon.example/management/persona-fleet?nocache=abc",
    );
    const script = resolver.resolve(
      "https://pantheon.example/assets/app.js",
    );
    const missing = resolver.resolve(
      "https://pantheon.example/assets/missing.js",
    );

    expect(spa.status).toBe(200);
    expect(spa.relativePath).toBe("index.html");
    expect(script.status).toBe(200);
    expect(script.contentType).toContain("text/javascript");
    expect(missing.status).toBe(404);
    expect(() =>
      resolver.resolve("https://pantheon.example/%2e%2e/etc/passwd"),
    ).toThrow(/traversal/iu);

    const outside = resolve(root, "..", "outside-candidate.js");
    writeFileSync(outside, "outside", "utf8");
    cleanupRoots.push(outside);
    symlinkSync(outside, join(root, "assets", "linked.js"));
    expect(() =>
      resolver.resolve("https://pantheon.example/assets/linked.js"),
    ).toThrow(/symbolic link/iu);
  });

  it("enumerates every candidate JavaScript and CSS file", () => {
    const root = temporaryCandidate();
    const files = listCandidateScriptAndStyleFiles(root).map(
      (entry) => entry.relativePath,
    );

    expect(files).toEqual(["assets/app.css", "assets/app.js"]);
  });

  it("keeps every requested hard-mode signal wired into the CLI source", () => {
    const source = readFileSync(
      resolve("scripts/probe-hosted-browser-bff.mjs"),
      "utf8",
    );

    expect(source).toContain("PANTHEON_PROBE_RELEASE_STRICT");
    expect(source).toContain("PANTHEON_EXPECTED_FE_SHA");
    expect(source).toContain("PANTHEON_EXPECTED_ARTIFACT_DIGEST");
    expect(source).toContain("PANTHEON_PROBE_JSON_OUT");
    expect(source).toContain("PANTHEON_CANDIDATE_DIR");
    expect(source).toContain('page.on("pageerror"');
    expect(source).toContain('page.on("requestfailed"');
    expect(source).toContain('page.on("console"');
    expect(source).toContain("window.localStorage");
    expect(source).toContain("window.sessionStorage");
    expect(source).toContain("installCandidateRoute");
  });
});
