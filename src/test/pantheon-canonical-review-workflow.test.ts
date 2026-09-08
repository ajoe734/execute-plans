import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import yaml from "yaml";

const root = process.cwd();
const workflowPath = resolve(
  root,
  ".github/workflows/pantheon-canonical-review-gate.yml",
);
const workflowRaw = readFileSync(workflowPath, "utf8");

interface WorkflowStep {
  id?: string;
  name?: string;
  uses?: string;
  with?: Record<string, unknown>;
  run?: string;
  shell?: string;
  env?: Record<string, string>;
  [key: string]: unknown;
}

interface WorkflowTriggers {
  pull_request_target?: {
    branches?: string[];
    types?: string[];
  };
  workflow_dispatch?: {
    inputs?: Record<string, { description?: string; required?: boolean; type?: string }>;
  };
  [key: string]: unknown;
}

interface WorkflowData {
  name?: string;
  permissions?: Record<string, string>;
  on?: WorkflowTriggers;
  true?: WorkflowTriggers;
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean;
  };
  jobs?: {
    gate?: {
      name?: string;
      "runs-on"?: string;
      env?: Record<string, string>;
      steps?: WorkflowStep[];
    };
  };
}

const workflow = (yaml.parse(workflowRaw) ?? {}) as WorkflowData;
const triggers = (workflow.on ?? workflow.true ?? {}) as WorkflowTriggers;
const steps = workflow.jobs?.gate?.steps ?? [];

const prMetadataStep = steps.find((s) => s.id === "pr_metadata");
const prMetadataBash = prMetadataStep?.run;
if (!prMetadataBash) {
  throw new Error("Missing pr_metadata step run script in workflow");
}

const publishStep = steps.find((s) =>
  s.name?.toLowerCase().includes("publish canonical review status"),
);
const publishBash = publishStep?.run;
if (!publishBash) {
  throw new Error("Missing publish step run script in workflow");
}

let mockDir = "";

beforeAll(() => {
  mockDir = mkdtempSync(resolve(tmpdir(), "pantheon-workflow-test-mocks-"));

  const ghMockScript = `#!/usr/bin/env node
const fs = require("node:fs");
const process = require("node:process");

const exitCode = parseInt(process.env.MOCK_GH_EXIT_CODE || "0", 10);
if (exitCode !== 0) {
  if (process.env.MOCK_GH_STDERR) {
    process.stderr.write(process.env.MOCK_GH_STDERR + "\\n");
  }
  process.exit(exitCode);
}

const args = process.argv.slice(2);
if (process.env.MOCK_GH_LOG_FILE) {
  fs.appendFileSync(process.env.MOCK_GH_LOG_FILE, JSON.stringify(args) + "\\n");
}

if (args[0] === "pr" && args[1] === "view") {
  if (process.env.MOCK_GH_PR_VIEW_FILE) {
    process.stdout.write(fs.readFileSync(process.env.MOCK_GH_PR_VIEW_FILE, "utf8"));
    process.exit(0);
  }
} else if (args[0] === "pr" && args[1] === "list") {
  if (process.env.MOCK_GH_PR_LIST_FILE) {
    process.stdout.write(fs.readFileSync(process.env.MOCK_GH_PR_LIST_FILE, "utf8"));
    process.exit(0);
  }
}

if (process.env.MOCK_GH_DEFAULT_FILE) {
  process.stdout.write(fs.readFileSync(process.env.MOCK_GH_DEFAULT_FILE, "utf8"));
  process.exit(0);
}

process.stderr.write("No mock response configured for gh " + args.join(" ") + "\\n");
process.exit(1);
`;
  const ghMockPath = resolve(mockDir, "gh");
  writeFileSync(ghMockPath, ghMockScript);
  chmodSync(ghMockPath, 0o755);

  const pythonMockScript = `#!/usr/bin/env node
const fs = require("node:fs");
const process = require("node:process");

const args = process.argv.slice(2);
if (process.env.MOCK_PYTHON_LOG_FILE) {
  fs.appendFileSync(process.env.MOCK_PYTHON_LOG_FILE, JSON.stringify(args) + "\\n");
}

if (process.env.MOCK_PYTHON_STDERR) {
  process.stderr.write(process.env.MOCK_PYTHON_STDERR + "\\n");
}

const exitCode = parseInt(process.env.MOCK_PYTHON_EXIT_CODE || "0", 10);
process.exit(exitCode);
`;
  const pythonMockPath = resolve(mockDir, "python3");
  writeFileSync(pythonMockPath, pythonMockScript);
  chmodSync(pythonMockPath, 0o755);
});

afterAll(() => {
  if (mockDir && existsSync(mockDir)) {
    rmSync(mockDir, { recursive: true, force: true });
  }
});

export interface RunPrMetadataOptions {
  eventName?: string;
  targetHeadRef?: string;
  targetHeadSha?: string;
  prNumber?: string | number;
  repo?: string;
  prViewJson?: unknown;
  prListJson?: unknown;
  ghExitCode?: number;
  ghStderr?: string;
}

export interface StepRunResult {
  status: number;
  stdout: string;
  stderr: string;
  outputs: Record<string, string>;
}

export function runPrMetadataStep(opts: RunPrMetadataOptions): StepRunResult {
  const tmpDir = mkdtempSync(resolve(mockDir, "run-meta-"));
  const githubOutputFile = resolve(tmpDir, "github_output");
  writeFileSync(githubOutputFile, "");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${mockDir}:${process.env.PATH}`,
    GITHUB_OUTPUT: githubOutputFile,
    GITHUB_EVENT_NAME: opts.eventName ?? "pull_request_target",
    TARGET_HEAD_REF: opts.targetHeadRef ?? "task/OPS-FE-REVIEW-PROOF-001",
    TARGET_HEAD_SHA: opts.targetHeadSha ?? "07f936d09ae29ca6f68a115cb1f0f292a711e0aa",
    REPO: opts.repo ?? "ajoe734/execute-plans",
    PR_NUMBER: opts.prNumber !== undefined ? String(opts.prNumber) : "747",
  };

  if (opts.ghExitCode !== undefined) {
    env.MOCK_GH_EXIT_CODE = String(opts.ghExitCode);
  }
  if (opts.ghStderr !== undefined) {
    env.MOCK_GH_STDERR = opts.ghStderr;
  }
  if (opts.prViewJson !== undefined) {
    const prViewFile = resolve(tmpDir, "pr_view.json");
    writeFileSync(prViewFile, JSON.stringify(opts.prViewJson));
    env.MOCK_GH_PR_VIEW_FILE = prViewFile;
  }
  if (opts.prListJson !== undefined) {
    const prListFile = resolve(tmpDir, "pr_list.json");
    writeFileSync(prListFile, JSON.stringify(opts.prListJson));
    env.MOCK_GH_PR_LIST_FILE = prListFile;
  }

  const res = spawnSync("bash", ["-c", prMetadataBash], {
    env,
    timeout: 5000,
    encoding: "utf8",
  });

  const outputContent = existsSync(githubOutputFile)
    ? readFileSync(githubOutputFile, "utf8")
    : "";
  const outputs: Record<string, string> = {};
  for (const line of outputContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      outputs[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  }

  rmSync(tmpDir, { recursive: true, force: true });

  return {
    status: res.status ?? 1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    outputs,
  };
}

export function executePrMetadata(opts: RunPrMetadataOptions): {
  deliveryClass: string;
  authHeadSha: string;
  authHeadRef: string;
} {
  const res = runPrMetadataStep(opts);
  if (res.status !== 0) {
    throw new Error(`pr_metadata failed with status ${res.status}: ${res.stderr || res.stdout}`);
  }
  return {
    deliveryClass: res.outputs.delivery_class,
    authHeadSha: res.outputs.auth_head_sha,
    authHeadRef: res.outputs.auth_head_ref,
  };
}

export interface RunPublishOptions {
  repo?: string;
  headRef?: string;
  headSha?: string;
  deliveryClass?: string;
  targetUrl?: string;
  pythonExitCode?: number;
  pythonStderr?: string;
}

export interface PublishRunResult {
  status: number;
  stdout: string;
  stderr: string;
  capturedPythonArgs: string[];
}

export function runPublishStep(opts: RunPublishOptions): PublishRunResult {
  const tmpDir = mkdtempSync(resolve(mockDir, "run-pub-"));
  const logFile = resolve(tmpDir, "python_calls.log");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${mockDir}:${process.env.PATH}`,
    REPO: opts.repo ?? "ajoe734/execute-plans",
    HEAD_REF: opts.headRef ?? "task/OPS-FE-REVIEW-PROOF-001",
    HEAD_SHA: opts.headSha ?? "07f936d09ae29ca6f68a115cb1f0f292a711e0aa",
    DELIVERY_CLASS: opts.deliveryClass ?? "product",
    TARGET_URL: opts.targetUrl ?? "https://github.com/ajoe734/execute-plans/actions/runs/12345",
    MOCK_PYTHON_LOG_FILE: logFile,
  };

  if (opts.pythonExitCode !== undefined) {
    env.MOCK_PYTHON_EXIT_CODE = String(opts.pythonExitCode);
  }
  if (opts.pythonStderr !== undefined) {
    env.MOCK_PYTHON_STDERR = opts.pythonStderr;
  }

  const res = spawnSync("bash", ["-c", publishBash], {
    env,
    timeout: 5000,
    encoding: "utf8",
  });

  let capturedPythonArgs: string[] = [];
  if (existsSync(logFile)) {
    const logContent = readFileSync(logFile, "utf8").trim();
    if (logContent) {
      const firstLine = logContent.split("\n")[0];
      try {
        capturedPythonArgs = JSON.parse(firstLine);
      } catch {
        capturedPythonArgs = [];
      }
    }
  }

  rmSync(tmpDir, { recursive: true, force: true });

  return {
    status: res.status ?? 1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    capturedPythonArgs,
  };
}

describe("Pantheon canonical review gate workflow - YAML Contract", () => {
  it("declares the exact workflow name and required permissions matching branch protection", () => {
    expect(workflow.name).toBe("Pantheon canonical review gate");
    expect(workflow.permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
      statuses: "write",
    });
  });

  it("configures pull_request_target on dev and main with complete event types including unlabeled", () => {
    const prTarget = triggers.pull_request_target;
    expect(prTarget).toBeDefined();
    expect(prTarget?.branches).toEqual(["dev", "main"]);
    expect(prTarget?.types).toEqual([
      "opened",
      "synchronize",
      "reopened",
      "ready_for_review",
      "labeled",
      "unlabeled",
    ]);
  });

  it("aligns workflow_dispatch inputs to require only head_ref and head_sha without requiring delivery_class", () => {
    const dispatch = triggers.workflow_dispatch;
    expect(dispatch).toBeDefined();
    const inputKeys = Object.keys(dispatch?.inputs ?? {});
    expect(inputKeys.sort()).toEqual(["head_ref", "head_sha"]);

    expect(dispatch?.inputs?.head_ref?.required).toBe(true);
    expect(dispatch?.inputs?.head_ref?.type).toBe("string");

    expect(dispatch?.inputs?.head_sha?.required).toBe(true);
    expect(dispatch?.inputs?.head_sha?.type).toBe("string");

    expect((dispatch?.inputs as Record<string, unknown> | undefined)?.delivery_class).toBeUndefined();
  });

  it("unifies concurrency group to the exact target head SHA across PR and dispatch events", () => {
    expect(workflow.concurrency).toEqual({
      group:
        "pantheon-canonical-review-${{ github.event.pull_request.head.sha || github.event.inputs.head_sha }}",
      "cancel-in-progress": true,
    });
  });

  it("checks out trusted Pantheon verifier from pantheon@dev with isolated path and disabled persist-credentials", () => {
    const checkoutStep = steps.find(
      (s) => s.uses === "actions/checkout@v4" && s.with?.repository === "ajoe734/pantheon",
    );
    expect(checkoutStep).toBeDefined();
    expect(checkoutStep?.with?.ref).toBe("dev");
    expect(checkoutStep?.with?.path).toBe("pantheon-verifier");
    expect(checkoutStep?.with?.["fetch-depth"]).toBe(1);
    expect(checkoutStep?.with?.["persist-credentials"]).toBe(false);

    const provenanceStep = steps.find((s) =>
      s.name?.toLowerCase().includes("verifier provenance"),
    );
    expect(provenanceStep).toBeDefined();
    expect(provenanceStep?.["working-directory"]).toBe("pantheon-verifier");
    expect(provenanceStep?.run).toContain("git rev-parse HEAD");
  });

  it("declares pr_metadata step using bash and passing outputs to GITHUB_OUTPUT", () => {
    expect(prMetadataStep).toBeDefined();
    expect(prMetadataStep?.shell).toBe("bash");

    const run = prMetadataStep?.run as string;
    expect(run).toContain("gh pr view");
    expect(run).toContain("gh pr list");
    expect(run).toContain('[[ "$TARGET_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(run).toContain('[[ "$TARGET_HEAD_REF" =~ ^[A-Za-z0-9._/-]+$ ]]');
    expect(run).toContain('[[ "$TARGET_HEAD_SHA" != "$AUTH_HEAD_SHA" ]]');
    expect(run).toContain('[[ "$TARGET_HEAD_REF" != "$AUTH_HEAD_REF" ]]');
    expect(run).toContain('[[ "$AUTH_STATE" != "OPEN" ]]');
    expect(run).toContain('echo "delivery_class=$DELIVERY_CLASS" >> "$GITHUB_OUTPUT"');
    expect(run).toContain('echo "auth_head_sha=$AUTH_HEAD_SHA" >> "$GITHUB_OUTPUT"');
    expect(run).toContain('echo "auth_head_ref=$AUTH_HEAD_REF" >> "$GITHUB_OUTPUT"');
  });

  it("binds verifier inputs strictly to authoritative step outputs rather than untrusted event snapshots", () => {
    expect(publishStep).toBeDefined();
    expect(publishStep?.["working-directory"]).toBe("pantheon-verifier");

    const env = publishStep?.env;
    expect(env).toBeDefined();
    expect(env?.DELIVERY_CLASS).toBe("${{ steps.pr_metadata.outputs.delivery_class }}");
    expect(env?.HEAD_REF).toBe("${{ steps.pr_metadata.outputs.auth_head_ref }}");
    expect(env?.HEAD_SHA).toBe("${{ steps.pr_metadata.outputs.auth_head_sha }}");

    const runScript = publishStep?.run as string;
    expect(runScript).toContain("python3 scripts/git/canonical_review_gate_ci.py");
    expect(runScript).toContain('--repo "$REPO"');
    expect(runScript).toContain('--head-ref "$HEAD_REF"');
    expect(runScript).toContain('--head-sha "$HEAD_SHA"');
    expect(runScript).toContain('--delivery-class "$DELIVERY_CLASS"');
    expect(runScript).toContain('--target-url "$TARGET_URL"');

    expect(runScript).toContain("gate_rc=0");
    expect(runScript).toContain("|| gate_rc=$?");
    expect(runScript).toContain('if [[ "$gate_rc" -eq 2 ]]');
    expect(runScript).toContain('exit "$gate_rc"');
    expect(runScript).toContain('if [[ "$gate_rc" -ne 0 && "$gate_rc" -ne 1 ]]');
  });
});

describe("Pantheon canonical review gate - Bounded Execution of YAML-extracted Bash", () => {
  const validSha = "07f936d09ae29ca6f68a115cb1f0f292a711e0aa";
  const validRef = "task/OPS-FE-REVIEW-PROOF-001";

  describe("Metadata Step: Current vs Stale/Wrong Head Validation", () => {
    it("accepts valid exact head matching authoritative PR metadata and outputs delivery_class=tooling", () => {
      const result = executePrMetadata({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prNumber: 747,
        prViewJson: {
          number: 747,
          headRefName: validRef,
          headRefOid: validSha,
          labels: [{ name: "delivery:tooling" }],
          state: "OPEN",
        },
      });

      expect(result.authHeadSha).toBe(validSha);
      expect(result.authHeadRef).toBe(validRef);
      expect(result.deliveryClass).toBe("tooling");
    });

    it("rejects stale head when PR head has moved to successor commit (exits 1)", () => {
      const successorSha = "1111111111111111111111111111111111111111";
      const res = runPrMetadataStep({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prNumber: 747,
        prViewJson: {
          number: 747,
          headRefName: validRef,
          headRefOid: successorSha,
          labels: [{ name: "delivery:tooling" }],
          state: "OPEN",
        },
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("stale or wrong head");
      expect(() =>
        executePrMetadata({
          eventName: "pull_request_target",
          targetHeadRef: validRef,
          targetHeadSha: validSha,
          prNumber: 747,
          prViewJson: {
            number: 747,
            headRefName: validRef,
            headRefOid: successorSha,
            labels: [{ name: "delivery:tooling" }],
            state: "OPEN",
          },
        }),
      ).toThrow(/stale or wrong head/);
    });

    it("rejects mismatched head branch ref (exits 1)", () => {
      const res = runPrMetadataStep({
        eventName: "pull_request_target",
        targetHeadRef: "task/OTHER-BRANCH",
        targetHeadSha: validSha,
        prNumber: 747,
        prViewJson: {
          number: 747,
          headRefName: validRef,
          headRefOid: validSha,
          labels: [],
          state: "OPEN",
        },
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("does not match authoritative PR branch");
    });

    it("rejects non-OPEN PR state (exits 1)", () => {
      const res = runPrMetadataStep({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prNumber: 747,
        prViewJson: {
          number: 747,
          headRefName: validRef,
          headRefOid: validSha,
          labels: [],
          state: "MERGED",
        },
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("PR is not OPEN");
    });

    it("rejects non-40-hex or malformed head SHA (exits 1)", () => {
      const res = runPrMetadataStep({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: "not-a-valid-sha",
        prNumber: 747,
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("head_sha must be a full lowercase commit SHA");
    });

    it("rejects head ref containing unsafe characters (exits 1)", () => {
      const res = runPrMetadataStep({
        eventName: "pull_request_target",
        targetHeadRef: "branch;rm -rf /",
        targetHeadSha: validSha,
        prNumber: 747,
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("head_ref contains unsafe characters");
    });

    it("rejects pull_request_target when PR_NUMBER is empty (exits 1)", () => {
      const res = runPrMetadataStep({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prNumber: "",
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("pull_request_target requires PR number");
    });
  });

  describe("Metadata Step: Authoritative Label Removal (unlabeled event)", () => {
    it("evaluates to tooling delivery when delivery:tooling label is present", () => {
      const result = executePrMetadata({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prNumber: 747,
        prViewJson: {
          number: 747,
          headRefName: validRef,
          headRefOid: validSha,
          labels: [{ name: "delivery:tooling" }, { name: "ci" }],
          state: "OPEN",
        },
      });
      expect(result.deliveryClass).toBe("tooling");
    });

    it("re-evaluates to product delivery when delivery:tooling label is removed", () => {
      const result = executePrMetadata({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prNumber: 747,
        prViewJson: {
          number: 747,
          headRefName: validRef,
          headRefOid: validSha,
          labels: [{ name: "ci" }],
          state: "OPEN",
        },
      });
      expect(result.deliveryClass).toBe("product");
    });
  });

  describe("Metadata Step: Dispatch Events, Missing/Ambiguous Head, and API Failures", () => {
    it("accepts workflow_dispatch matching open PR and derives delivery_class", () => {
      const result = executePrMetadata({
        eventName: "workflow_dispatch",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prListJson: [
          {
            number: 747,
            headRefName: validRef,
            headRefOid: validSha,
            labels: [],
            state: "OPEN",
          },
        ],
      });
      expect(result.deliveryClass).toBe("product");
      expect(result.authHeadSha).toBe(validSha);
      expect(result.authHeadRef).toBe(validRef);
    });

    it("rejects workflow_dispatch when no open pull request is found (missing head, exits 1)", () => {
      const res = runPrMetadataStep({
        eventName: "workflow_dispatch",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prListJson: [],
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("no open pull request found for head branch");
    });

    it("rejects workflow_dispatch when multiple open pull requests match head branch (ambiguous head, exits 1)", () => {
      const res = runPrMetadataStep({
        eventName: "workflow_dispatch",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prListJson: [
          {
            number: 747,
            headRefName: validRef,
            headRefOid: validSha,
            labels: [],
            state: "OPEN",
          },
          {
            number: 748,
            headRefName: validRef,
            headRefOid: validSha,
            labels: [],
            state: "OPEN",
          },
        ],
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("multiple open pull requests found for head branch");
    });

    it("fails closed when gh API fails (API failure, exits non-zero)", () => {
      const res = runPrMetadataStep({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prNumber: 747,
        ghExitCode: 1,
        ghStderr: "gh: HTTP 500 Internal Server Error",
      });

      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain("HTTP 500");
    });

    it("rejects unsupported workflow events (exits 1)", () => {
      const res = runPrMetadataStep({
        eventName: "push",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("unsupported event");
    });
  });

  describe("Publish Step: Verifier Argument Forwarding and Exit Code Handling", () => {
    it("forwards verifier CLI arguments accurately to python3 verifier", () => {
      const res = runPublishStep({
        repo: "ajoe734/execute-plans",
        headRef: validRef,
        headSha: validSha,
        deliveryClass: "tooling",
        targetUrl: "https://github.com/ajoe734/execute-plans/actions/runs/99999",
        pythonExitCode: 0,
      });

      expect(res.status).toBe(0);
      expect(res.capturedPythonArgs).toEqual([
        "scripts/git/canonical_review_gate_ci.py",
        "--repo",
        "ajoe734/execute-plans",
        "--head-ref",
        validRef,
        "--head-sha",
        validSha,
        "--delivery-class",
        "tooling",
        "--target-url",
        "https://github.com/ajoe734/execute-plans/actions/runs/99999",
      ]);
    });

    it("handles verifier exit 0 (approved status posted, step succeeds)", () => {
      const res = runPublishStep({ pythonExitCode: 0 });
      expect(res.status).toBe(0);
    });

    it("handles verifier exit 1 (unapproved failure status published, step succeeds without failing Actions job)", () => {
      const res = runPublishStep({ pythonExitCode: 1 });
      expect(res.status).toBe(0);
    });

    it("handles verifier exit 2 (publication failure after retries, fails step loudly with exit 2)", () => {
      const res = runPublishStep({ pythonExitCode: 2 });
      expect(res.status).toBe(2);
      expect(res.stderr).toContain(
        "canonical review gate could not POST any status after retries",
      );
    });

    it("handles verifier unexpected exit code (e.g. exit 3 or exit 137, fails step with that exit code)", () => {
      const res = runPublishStep({ pythonExitCode: 3 });
      expect(res.status).toBe(3);

      const res137 = runPublishStep({ pythonExitCode: 137 });
      expect(res137.status).toBe(137);
    });
  });
});


