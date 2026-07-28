import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readEvents, redact } from "../../scripts/release-evidence.mjs";

const script = path.resolve(process.cwd(), "scripts/release-evidence.mjs");
const roots: string[] = [];

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-test-"));
  roots.push(root);
  return root;
}

function run(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function initArgs(log: string): string[] {
  return [
    "init",
    "--log",
    log,
    "--detail",
    `candidateSha=${"1".repeat(40)}`,
    "--detail",
    "integrationGateRunId=123",
    "--detail",
    "integrationGateRunUrl=https://github.com/ajoe734/execute-plans/actions/runs/123",
    "--detail",
    `artifactDigestSha256=${"a".repeat(64)}`,
    "--detail",
    `githubArtifactDigest=sha256:${"b".repeat(64)}`,
    "--detail",
    "emergencyOverride=false",
    "--detail",
    "rollbackDrill=false",
    "--detail",
    "overrideActor=github-actions[bot]",
    "--detail",
    "overrideReasonSha256=none",
  ];
}

function complete(log: string, outcome = "accepted") {
  return run([
    "append",
    "--log",
    log,
    "--type",
    outcome === "accepted" ? "release.completed" : "release.failed",
    "--status",
    outcome === "accepted" ? "passed" : "failed",
    "--detail",
    `outcome=${outcome}`,
  ]);
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe("release evidence hash chain", () => {
  it("creates an allowlisted append-only log and deterministic audit manifest", () => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    const summary = path.join(root, "evidence.json");
    const reportDir = path.join(root, "browser");
    fs.mkdirSync(reportDir);
    fs.writeFileSync(
      path.join(reportDir, "probe.json"),
      '{"status":"passed"}\n',
    );

    const initialized = run(initArgs(log));
    expect(initialized.status, initialized.stderr).toBe(0);

    const appended = run([
      "append",
      "--log",
      log,
      "--type",
      "candidate.integrity",
      "--status",
      "passed",
      "--detail",
      `frontendSha=${"1".repeat(40)}`,
      "--detail",
      `bffCommit=${"2".repeat(40)}`,
      "--detail",
      `controllerSha=${"3".repeat(40)}`,
      "--detail",
      `previousArtifactDigest=${"4".repeat(64)}`,
      "--detail",
      `releaseDir=${path.join(root, "release")}`,
      "--detail",
      "probeStatus=passed",
    ]);
    expect(appended.status, appended.stderr).toBe(0);
    expect(complete(log).status).toBe(0);

    const finalized = run([
      "finalize",
      "--log",
      log,
      "--summary",
      summary,
      "--outcome",
      "accepted",
      "--root",
      root,
    ]);
    expect(finalized.status, finalized.stderr).toBe(0);

    const events = readEvents(log);
    expect(events).toHaveLength(3);
    expect(events[1].previousHash).toBe(events[0].hash);
    expect(events[2].previousHash).toBe(events[1].hash);
    const manifest = JSON.parse(fs.readFileSync(summary, "utf8"));
    expect(manifest).toMatchObject({
      outcome: "accepted",
      candidateSha: "1".repeat(40),
      integrationGateRunId: "123",
      artifactDigestSha256: "a".repeat(64),
      githubArtifactDigest: `sha256:${"b".repeat(64)}`,
      eventCount: 3,
      headHash: events[2].hash,
    });
    expect(manifest.logSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(manifest.files).toEqual([
      {
        path: "browser/probe.json",
        sizeBytes: 20,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      {
        path: "evidence.jsonl",
        sizeBytes: expect.any(Number),
        sha256: manifest.logSha256,
      },
    ]);
    expect(
      manifest.files.map((file: { path: string }) => file.path),
    ).not.toContain("evidence.json");

    const verified = run([
      "verify",
      "--log",
      log,
      "--summary",
      summary,
      "--root",
      root,
    ]);
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.stdout.trim()).toBe(events[2].hash);
  });

  it("accepts every typed controller, gate, path, digest, and status detail", () => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    expect(run(initArgs(log)).status).toBe(0);
    const appended = run([
      "append",
      "--log",
      log,
      "--type",
      "controller.contract",
      "--status",
      "qualified",
      "--detail",
      `candidateSha=${"1".repeat(40)}`,
      "--detail",
      `controllerSha=${"2".repeat(40)}`,
      "--detail",
      `frontendSha=${"3".repeat(40)}`,
      "--detail",
      `bffCommit=${"4".repeat(40)}`,
      "--detail",
      `previousManifestBffCommit=${"8".repeat(40)}`,
      "--detail",
      `runtimeBffCommit=${"9".repeat(40)}`,
      "--detail",
      `currentDevSha=${"5".repeat(40)}`,
      "--detail",
      `validatedDevSha=${"6".repeat(40)}`,
      "--detail",
      "integrationGateRunId=456",
      "--detail",
      "previousGateRunId=legacy",
      "--detail",
      "acceptedGateRunId=455",
      "--detail",
      "incomingGateRunId=456",
      "--detail",
      "incomingEquivalentGateRunId=456",
      "--detail",
      "integrationGateRunUrl=https://github.com/ajoe734/execute-plans/actions/runs/456",
      "--detail",
      "integrationGateStatus=success",
      "--detail",
      `artifactDigestSha256=${"a".repeat(64)}`,
      "--detail",
      `githubArtifactDigest=sha256:${"b".repeat(64)}`,
      "--detail",
      "acceptedGithubArtifactDigest=legacy",
      "--detail",
      `incomingGithubArtifactDigest=sha256:${"e".repeat(64)}`,
      "--detail",
      `previousArtifactDigest=${"c".repeat(64)}`,
      "--detail",
      `previousCommit=${"7".repeat(40)}`,
      "--detail",
      "emergencyOverride=false",
      "--detail",
      "rollbackDrill=true",
      "--detail",
      "overrideActor=release-operator",
      "--detail",
      `overrideReasonSha256=${"d".repeat(64)}`,
      "--detail",
      `lockFile=${path.join(root, "deploy.lock")}`,
      "--detail",
      `deployRoot=${path.join(root, "live")}`,
      "--detail",
      `releaseDir=${path.join(root, "release")}`,
      "--detail",
      `observedTarget=${path.join(root, "previous")}`,
      "--detail",
      `previousTarget=${path.join(root, "previous")}`,
      "--detail",
      `candidateDir=${path.join(root, "candidate")}`,
      "--detail",
      `auditDir=${root}`,
      "--detail",
      "outcome=rolled_back",
      "--detail",
      "probeStatus=passed",
      "--detail",
      "rollbackStatus=verified",
      "--detail",
      "deploymentStatus=accepted",
    ]);
    expect(appended.status, appended.stderr).toBe(0);
    const details = readEvents(log)[1].details;
    expect(details).toMatchObject({
      integrationGateRunId: "456",
      integrationGateStatus: "success",
      outcome: "rolled_back",
      probeStatus: "passed",
      rollbackStatus: "verified",
      rollbackDrill: "true",
    });
  });

  it.each([
    ["provider key", "openaiProviderKey", "sk-proj-abcdefghijklmnopqrstuvwxyz"],
    ["generic token", "outcome", "token=generic-token-value-123456"],
    ["password", "overrideActor", "password=hunter2-do-not-log"],
    [
      "JWT",
      "overrideActor",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signature123456",
    ],
    [
      "credentialed URL",
      "integrationGateRunUrl",
      "https://operator:hunter2@github.com/ajoe734/execute-plans/actions/runs/123",
    ],
  ])("rejects and redacts a %s without leaking it", (_label, key, secret) => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    expect(run(initArgs(log)).status).toBe(0);
    const before = fs.readFileSync(log, "utf8");

    const rejected = run([
      "append",
      "--log",
      log,
      "--type",
      "candidate.integrity",
      "--status",
      "failed",
      "--detail",
      `${key}=${secret}`,
    ]);
    expect(rejected.status).toBe(2);
    expect(rejected.stderr).not.toContain(secret);
    expect(rejected.stderr).toMatch(/unsupported or invalid evidence detail/u);
    expect(fs.readFileSync(log, "utf8")).toBe(before);
    expect(redact(key, secret)).toBe("[REDACTED]");
  });

  it("rejects unknown, duplicate, and incorrectly typed detail fields", () => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    expect(run(initArgs(log)).status).toBe(0);
    const base = [
      "append",
      "--log",
      log,
      "--type",
      "candidate.integrity",
      "--status",
      "passed",
    ];

    const unknown = run([...base, "--detail", "harmlessButUnknown=value"]);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).not.toContain("harmlessButUnknown");
    expect(unknown.stderr).not.toContain("value");

    for (const details of [
      ["--detail", "frontendSha=not-a-sha"],
      ["--detail", "probeStatus=anything-goes"],
      [
        "--detail",
        `frontendSha=${"1".repeat(40)}`,
        "--detail",
        `frontendSha=${"2".repeat(40)}`,
      ],
    ]) {
      const rejected = run([...base, ...details]);
      expect(rejected.status).toBe(2);
      expect(rejected.stderr).toMatch(
        /unsupported or invalid evidence detail/u,
      );
    }
    expect(readEvents(log)).toHaveLength(1);
  });

  it("rejects a modified event and refuses to replace an existing log", () => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    expect(run(initArgs(log)).status).toBe(0);
    const secondInit = run(initArgs(log));
    expect(secondInit.status).toBe(2);
    expect(secondInit.stderr).toMatch(/refusing to replace/u);

    const event = JSON.parse(fs.readFileSync(log, "utf8").trim());
    event.status = "failed";
    fs.writeFileSync(log, `${JSON.stringify(event)}\n`);
    const verified = run(["verify", "--log", log]);
    expect(verified.status).toBe(2);
    expect(verified.stderr).toMatch(/hash chain mismatch/u);
  });

  it("requires the finalized outcome to match a typed terminal release event", () => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    const summary = path.join(root, "evidence.json");
    expect(run(initArgs(log)).status).toBe(0);

    const unterminated = run([
      "finalize",
      "--log",
      log,
      "--summary",
      summary,
      "--outcome",
      "accepted",
    ]);
    expect(unterminated.status).toBe(2);
    expect(unterminated.stderr).toMatch(/terminal release outcome/u);

    expect(complete(log, "rejected_before_switch").status).toBe(0);
    const mismatched = run([
      "finalize",
      "--log",
      log,
      "--summary",
      summary,
      "--outcome",
      "accepted",
    ]);
    expect(mismatched.status).toBe(2);
    expect(mismatched.stderr).toMatch(/does not match terminal/u);
  });

  it("detects tampered, missing, or newly added audit files", () => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    const summary = path.join(root, "evidence.json");
    const probe = path.join(root, "probe.json");
    fs.writeFileSync(probe, "passed\n");
    expect(run(initArgs(log)).status).toBe(0);
    expect(complete(log).status).toBe(0);
    expect(
      run([
        "finalize",
        "--log",
        log,
        "--summary",
        summary,
        "--outcome",
        "accepted",
        "--root",
        root,
      ]).status,
    ).toBe(0);
    expect(
      run(["verify", "--log", log, "--summary", summary, "--root", root])
        .status,
    ).toBe(0);

    fs.writeFileSync(probe, "tampered\n");
    const tampered = run([
      "verify",
      "--log",
      log,
      "--summary",
      summary,
      "--root",
      root,
    ]);
    expect(tampered.status).toBe(2);
    expect(tampered.stderr).toMatch(/checksum mismatch/u);

    fs.writeFileSync(probe, "passed\n");
    fs.writeFileSync(path.join(root, "late-file.json"), "{}\n");
    const added = run([
      "verify",
      "--log",
      log,
      "--summary",
      summary,
      "--root",
      root,
    ]);
    expect(added.status).toBe(2);
    expect(added.stderr).toMatch(/checksum mismatch/u);
  });

  it("rejects a tampered summary even when the log remains intact", () => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    const summary = path.join(root, "evidence.json");
    expect(run(initArgs(log)).status).toBe(0);
    expect(complete(log).status).toBe(0);
    expect(
      run([
        "finalize",
        "--log",
        log,
        "--summary",
        summary,
        "--outcome",
        "accepted",
        "--root",
        root,
      ]).status,
    ).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(summary, "utf8"));
    manifest.headHash = "0".repeat(64);
    fs.writeFileSync(summary, `${JSON.stringify(manifest)}\n`);

    const rejected = run([
      "verify",
      "--log",
      log,
      "--summary",
      summary,
      "--root",
      root,
    ]);
    expect(rejected.status).toBe(2);
    expect(rejected.stderr).toMatch(/does not match/u);
  });

  it.each([
    ["outcome", "rolled_back"],
    ["candidateSha", "9".repeat(40)],
    ["integrationGateRunId", "999"],
    ["artifactDigestSha256", "9".repeat(64)],
    ["githubArtifactDigest", `sha256:${"9".repeat(64)}`],
    ["generatedAt", "2000-01-01T00:00:00.000Z"],
    ["unexpected", "not-allowlisted"],
  ])("binds summary field %s to the append-only log", (field, replacement) => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    const summary = path.join(root, "evidence.json");
    expect(run(initArgs(log)).status).toBe(0);
    expect(complete(log).status).toBe(0);
    expect(
      run([
        "finalize",
        "--log",
        log,
        "--summary",
        summary,
        "--outcome",
        "accepted",
        "--root",
        root,
      ]).status,
    ).toBe(0);

    const manifest = JSON.parse(fs.readFileSync(summary, "utf8"));
    manifest[field] = replacement;
    fs.writeFileSync(summary, `${JSON.stringify(manifest)}\n`);
    const rejected = run([
      "verify",
      "--log",
      log,
      "--summary",
      summary,
      "--root",
      root,
    ]);
    expect(rejected.status).toBe(2);
    expect(rejected.stderr).toMatch(/does not match/u);
  });

  it("forbids symlinks and summary paths outside the audit root", () => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    const summary = path.join(root, "evidence.json");
    expect(run(initArgs(log)).status).toBe(0);
    expect(complete(log).status).toBe(0);
    const external = path.join(tempRoot(), "external.txt");
    fs.writeFileSync(external, "not evidence\n");
    fs.symlinkSync(external, path.join(root, "linked.txt"));

    const symlinked = run([
      "finalize",
      "--log",
      log,
      "--summary",
      summary,
      "--outcome",
      "accepted",
      "--root",
      root,
    ]);
    expect(symlinked.status).toBe(2);
    expect(symlinked.stderr).toMatch(/must not contain symlinks/u);

    fs.rmSync(path.join(root, "linked.txt"));
    const outsideSummary = path.join(tempRoot(), "evidence.json");
    const escaped = run([
      "finalize",
      "--log",
      log,
      "--summary",
      outsideSummary,
      "--outcome",
      "accepted",
      "--root",
      root,
    ]);
    expect(escaped.status).toBe(2);
    expect(escaped.stderr).toMatch(/inside the audit root/u);
  });
});
