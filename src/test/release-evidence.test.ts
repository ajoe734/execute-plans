import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readEvents } from "../../scripts/release-evidence.mjs";

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

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("release evidence hash chain", () => {
  it("creates an append-only redacted log and checksummed summary", () => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    const summary = path.join(root, "evidence.json");
    const candidate = "1".repeat(40);
    const digest = "a".repeat(64);

    const initialized = run([
      "init", "--log", log,
      "--detail", `candidateSha=${candidate}`,
      "--detail", "integrationGateRunId=123",
      "--detail", `artifactDigestSha256=${digest}`,
      "--detail", "githubArtifactDigest=sha256:bbbb",
      "--detail", "clientSecret=must-never-appear",
    ]);
    expect(initialized.status, initialized.stderr).toBe(0);

    const appended = run([
      "append", "--log", log,
      "--type", "candidate.integrity",
      "--status", "passed",
      "--detail", "frontendSha=1111111111111111111111111111111111111111",
    ]);
    expect(appended.status, appended.stderr).toBe(0);

    const finalized = run([
      "finalize", "--log", log,
      "--summary", summary,
      "--outcome", "accepted",
    ]);
    expect(finalized.status, finalized.stderr).toBe(0);

    const rawLog = fs.readFileSync(log, "utf8");
    expect(rawLog).not.toContain("must-never-appear");
    expect(rawLog).toContain("[REDACTED]");
    const events = readEvents(log);
    expect(events).toHaveLength(2);
    expect(events[1].previousHash).toBe(events[0].hash);

    const manifest = JSON.parse(fs.readFileSync(summary, "utf8"));
    expect(manifest).toMatchObject({
      outcome: "accepted",
      candidateSha: candidate,
      integrationGateRunId: "123",
      artifactDigestSha256: digest,
      eventCount: 2,
      headHash: events[1].hash,
    });
    expect(manifest.logSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rejects a modified event and refuses to replace an existing log", () => {
    const root = tempRoot();
    const log = path.join(root, "evidence.jsonl");
    expect(run(["init", "--log", log, "--detail", `candidateSha=${"2".repeat(40)}`]).status).toBe(0);
    const secondInit = run(["init", "--log", log, "--detail", `candidateSha=${"2".repeat(40)}`]);
    expect(secondInit.status).toBe(2);
    expect(secondInit.stderr).toMatch(/refusing to replace/u);

    const event = JSON.parse(fs.readFileSync(log, "utf8").trim());
    event.status = "failed";
    fs.writeFileSync(log, `${JSON.stringify(event)}\n`);
    const verified = run(["verify", "--log", log]);
    expect(verified.status).toBe(2);
    expect(verified.stderr).toMatch(/hash chain mismatch/u);
  });
});
