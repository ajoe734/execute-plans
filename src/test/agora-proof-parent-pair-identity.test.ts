import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Execute the consumer code from the actual workflow, including its shell argv
// plumbing. These local synthetic artifacts are regression fixtures, not proof.
const workflow = readFileSync(join(process.cwd(), ".github/workflows/pantheon-dev-fe-deploy.yml"), "utf8");
const confirmation = workflow.split("  proof-restore-confirmation:")[1];
const pythonMatch = confirmation.match(/evidence_summary="\$\((python3 -[^\n]*<<'PY'\n[\s\S]*?\n {10}PY)\n {10}\)"/u);
if (!pythonMatch) throw new Error("Missing real parent evidence consumer heredoc");
const parentEvidenceCommand = pythonMatch[1].replace(/^ {10}/gmu, "");
const nodeMatch = confirmation.match(/verified="\$\(node --input-type=module - <<'NODE'[^\n]*\n([\s\S]*?)\n {10}NODE/u);
if (!nodeMatch) throw new Error("Missing real parent served-pair consumer heredoc");
const parentReadbackCode = nodeMatch[1].replace(/^ {10}/gmu, "");

const frontendSha = "a".repeat(40);
const bffSha = "b".repeat(40);
const pairId = "c".repeat(64);
const legacyPair = `${frontendSha}:${bffSha}`;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function evidencePayload() {
  return {
    schema_version: "pantheon.agora.demo-run-evidence.v1",
    demo_run_id: "unit-demo-parent-pair",
    status: "passed",
    exact_pair: { frontend_sha: frontendSha, bff_sha: bffSha, manifest_pair_id: pairId },
    profile: "bounded-write-proof",
    objects: {
      proposal_id: "unit-proposal", persona_id: "unit-persona", workshop_id: "unit-workshop",
      message_event_id: "unit-event", reconstruction_id: "unit-reconstruction", strategy_id: "unit-strategy",
      version_id: "unit-version", interaction_id: "unit-interaction",
    },
    steps: [{ id: "interaction_terminal_readback", status: "passed" }],
    negative_controls: { viewer_write_denied: true, cross_tenant_non_enumerating: true, no_order_route_proof: true },
    restoration: { served_manifest_verified: true, read_only_restored: false },
  };
}

function runEvidenceConsumer(payload = evidencePayload(), expectedPair: string | null = pairId) {
  const directory = mkdtempSync(join(tmpdir(), "agora-parent-pair-test-"));
  temporaryDirectories.push(directory);
  const archive = join(directory, "synthetic-proof.zip");
  const prepared = spawnSync("python3", ["-c", [
    "import sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1], 'w') as archive:",
    "    archive.writestr('agora/agora-demo-run-evidence.json', sys.stdin.read())",
  ].join("\n"), archive], { input: JSON.stringify(payload), encoding: "utf8" });
  expect(prepared.status, prepared.stderr).toBe(0);
  return spawnSync("bash", ["-euo", "pipefail", "-c", parentEvidenceCommand], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      archive,
      EXACT_FE_SHA: frontendSha,
      EXACT_BFF_SHA: bffSha,
      ...(expectedPair === null ? {} : { EXPECTED_PAIR_ID: expectedPair }),
    },
  });
}

function runReadbackConsumer(
  deploymentOverrides: Record<string, unknown> = {},
  expectedPair = pairId,
  versionOverrides: Record<string, unknown> = {},
) {
  const deployment = {
    commit: frontendSha, bffCommit: bffSha, pairId, pair: { pairId },
    deploymentProfile: "read-only", buildMode: { VITE_BFF_REAL_WRITES: "false" },
    ...deploymentOverrides,
  };
  const version = { source_commit_known: true, source_commit_sha: bffSha, ...versionOverrides };
  const stub = `globalThis.fetch = async (url) => ({ ok: true, json: async () => url.includes("deployment.json") ? ${JSON.stringify(deployment)} : ${JSON.stringify(version)} });\n`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", stub + parentReadbackCode], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      PANTHEON_DEV_FE_HOST: "https://unit.invalid",
      PANTHEON_BFF_BASE_URL: "https://unit.invalid",
      EXACT_FE_SHA: frontendSha,
      EXACT_BFF_SHA: bffSha,
      EXPECTED_PAIR_ID: expectedPair,
    },
  });
}

describe("actual FE parent child-artifact consumer", () => {
  it("accepts the independently supplied artifact-pair digest with exact FE and BFF SHAs", () => {
    const result = runEvidenceConsumer();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).demo_run_id).toBe("unit-demo-parent-pair");
  });

  it.each(["", "0".repeat(64), "c".repeat(63), legacyPair])("rejects invalid parent pair identity %s", (expected) => {
    const result = runEvidenceConsumer(evidencePayload(), expected);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("authenticated nonzero SHA-256 digest");
  });

  it("refuses to consume child evidence without the parent pair expectation", () => {
    const result = runEvidenceConsumer(evidencePayload(), null);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("EXPECTED_PAIR_ID: unbound variable");
  });

  it.each(["", "d".repeat(64), legacyPair])("rejects missing, different, or legacy child pair %s", (observed) => {
    const payload = evidencePayload();
    payload.exact_pair.manifest_pair_id = observed;
    const result = runEvidenceConsumer(payload);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("manifest_pair_id mismatch");
  });

  it.each(["frontend_sha", "bff_sha"] as const)("retains the independent exact %s check", (field) => {
    const payload = evidencePayload();
    payload.exact_pair[field] = "d".repeat(40);
    const result = runEvidenceConsumer(payload);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Pair SHA mismatch");
  });

  it("retains the terminal interaction and negative-control requirements", () => {
    const payload = evidencePayload();
    payload.steps = [];
    expect(runEvidenceConsumer(payload).stderr).toContain("Missing passed interaction_terminal_readback");
    const unsafe = evidencePayload();
    unsafe.negative_controls.no_order_route_proof = false;
    expect(runEvidenceConsumer(unsafe).stderr).toContain("Negative controls not fully passed");
  });
});

describe("actual hosted proof source authorization GitHub script", () => {
  const gate = readFileSync(join(process.cwd(), ".github/workflows/pantheon-integration-gate.yml"), "utf8");
  const sourceStep = gate.split("      - name: Validate exact hosted proof source before credentials\n")[1]
    .split("\n      - name:")[0];
  const source = sourceStep.split("          script: |\n")[1].replace(/^ {12}/gmu, "");
  const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor;

  async function runAuthorization(finalSourceSha = frontendSha) {
    const controllerSha = "d".repeat(40);
    const releaseCandidate = "1".repeat(64);
    const artifactDigest = `sha256:${"e".repeat(64)}`;
    const failures: string[] = [];
    const outputs: Record<string, string> = {};
    const refs: string[] = [];
    let sourceReads = 0;
    const github = { rest: {
      actions: {
        getWorkflowRun: async () => ({ data: {
          path: ".github/workflows/pantheon-integration-gate.yml",
          head_repository: { full_name: "ajoe734/execute-plans" },
          event: "workflow_dispatch", head_branch: "dev", head_sha: controllerSha,
          status: "completed", conclusion: "success", run_attempt: 1,
          display_title: `Release candidate ${releaseCandidate}`,
        } }),
        listWorkflowRunArtifacts: async () => ({ data: { artifacts: [{
          id: 200, name: "pantheon-fe-release-candidate-attempt-1", expired: false, digest: artifactDigest,
        }] } }),
      },
      git: { getRef: async ({ ref }: { ref: string }) => {
        refs.push(ref);
        if (ref === "heads/dev") return { data: { object: { sha: controllerSha } } };
        sourceReads += 1;
        return { data: { object: { sha: sourceReads === 1 ? frontendSha : finalSourceSha } } };
      } },
    } };
    const core = {
      setFailed: (message: string) => failures.push(message),
      setOutput: (name: string, value: string) => { outputs[name] = value; },
    };
    const env = {
      PANTHEON_PINT_HOSTED_PROBE: "true", PANTHEON_PERSONA_INTERACTION_WRITE_PROOF: "true",
      PANTHEON_FRONTEND_SHA: frontendSha, EXPECTED_FRONTEND_REF: "task/unit-candidate",
      PANTHEON_PROOF_CORRELATION_ID: "12345678-1234-4123-8123-123456789abc",
      SOURCE_GATE_RUN_ID: "100", SOURCE_ARTIFACT_ID: "200", SOURCE_ARTIFACT_DIGEST: artifactDigest,
      EXPECTED_PAIR_ID: pairId, EXPECTED_READ_ONLY_DIGEST: "e".repeat(64), EXPECTED_WRITE_PROOF_DIGEST: "f".repeat(64),
      EXPECTED_RELEASE_CANDIDATE_ID: releaseCandidate,
    };
    // Parsing the actual body catches duplicate lexical declarations before any
    // mock API call; executing it also preserves the final fresh-ref recheck.
    const run = new AsyncFunction("github", "context", "core", "process", source);
    await run(github, { eventName: "workflow_dispatch", repo: { owner: "ajoe734", repo: "execute-plans" } }, core, { env });
    return { failures, outputs, refs };
  }

  it("parses and accepts the unchanged exact source and authenticated artifact identity", async () => {
    const result = await runAuthorization();
    expect(result.failures).toEqual([]);
    expect(result.outputs.pair_id).toBe(pairId);
    expect(result.refs).toEqual(["heads/dev", "heads/task/unit-candidate", "heads/task/unit-candidate"]);
  });

  it("retains the second exact-ref verification and rejects a source-ref change", async () => {
    const result = await runAuthorization("f".repeat(40));
    expect(result.failures).toEqual(["Hosted PINT proof candidate ref no longer points to the exact FE SHA"]);
    expect(result.outputs).toEqual({});
  });
});

describe("actual FE parent restored-manifest consumer", () => {
  it("accepts the same authenticated digest and read-only exact source pair", () => {
    const result = runReadbackConsumer();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("VERIFIED");
  });

  it.each(["", "0".repeat(64), "d".repeat(64), legacyPair])("rejects invalid or different parent pair %s", (expected) => {
    expect(runReadbackConsumer({}, expected).status).not.toBe(0);
  });

  it.each([
    { pairId: undefined },
    { pair: {} },
    { pairId: "d".repeat(64), pair: { pairId: "d".repeat(64) } },
    { pairId, pair: { pairId: "d".repeat(64) } },
    { pairId: legacyPair, pair: { pairId: legacyPair } },
    { commit: "d".repeat(40) },
    { bffCommit: "d".repeat(40) },
    { deploymentProfile: "write-proof" },
    { buildMode: { VITE_BFF_REAL_WRITES: "true" } },
  ])("rejects changed pair, exact sources, or write posture: %j", (deployment) => {
    expect(runReadbackConsumer(deployment).status).not.toBe(0);
  });

  it("retains live BFF identity and known-source verification", () => {
    expect(runReadbackConsumer({}, pairId, { source_commit_sha: "d".repeat(40) }).status).not.toBe(0);
    expect(runReadbackConsumer({}, pairId, { source_commit_known: false }).status).not.toBe(0);
  });
});
