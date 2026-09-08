import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "yaml";

const root = process.cwd();
const workflowPath = resolve(
  root,
  ".github/workflows/pantheon-canonical-review-gate.yml",
);
const workflowRaw = readFileSync(workflowPath, "utf8");
// Parse YAML structure safely (handling 'on' boolean coercion in some YAML parsers)
const workflow = (yaml.parse(workflowRaw) ?? {}) as Record<string, any>;
const triggers = workflow.on ?? workflow[true as any] ?? {};

describe("Pantheon canonical review gate workflow", () => {
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
    expect(prTarget.branches).toEqual(["dev", "main"]);
    expect(prTarget.types).toEqual([
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
    const inputKeys = Object.keys(dispatch.inputs ?? {});
    expect(inputKeys.sort()).toEqual(["head_ref", "head_sha"]);

    expect(dispatch.inputs.head_ref.required).toBe(true);
    expect(dispatch.inputs.head_ref.type).toBe("string");

    expect(dispatch.inputs.head_sha.required).toBe(true);
    expect(dispatch.inputs.head_sha.type).toBe("string");

    // Must not require or declare caller delivery_class in dispatch schema
    expect(dispatch.inputs.delivery_class).toBeUndefined();
  });

  it("unifies concurrency group to the exact target head SHA across PR and dispatch events", () => {
    expect(workflow.concurrency).toEqual({
      group:
        "pantheon-canonical-review-${{ github.event.pull_request.head.sha || github.event.inputs.head_sha }}",
      "cancel-in-progress": true,
    });
  });

  it("derives delivery classification solely from PR labels without trusting caller input", () => {
    const gateJob = workflow.jobs?.gate;
    expect(gateJob).toBeDefined();
    expect(gateJob.name).toBe("Publish canonical review status");
    expect(gateJob["runs-on"]).toBe("ubuntu-latest");

    const env = gateJob.env;
    expect(env).toBeDefined();
    expect(env.GH_TOKEN).toBe("${{ github.token }}");
    expect(env.REPO).toBe("${{ github.repository }}");
    expect(env.HEAD_REF).toBe(
      "${{ github.event.inputs.head_ref || github.event.pull_request.head.ref }}",
    );
    expect(env.HEAD_SHA).toBe(
      "${{ github.event.inputs.head_sha || github.event.pull_request.head.sha }}",
    );
    expect(env.DELIVERY_CLASS).toBe(
      "${{ contains(github.event.pull_request.labels.*.name, 'delivery:tooling') && 'tooling' || 'product' }}",
    );
    expect(env.TARGET_URL).toBe(
      "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}",
    );

    // Ensure untrusted caller delivery_class is not referenced anywhere in env
    expect(env.DELIVERY_CLASS).not.toContain("github.event.inputs.delivery_class");
  });

  it("checks out trusted Pantheon verifier from pantheon@dev with isolated path and disabled persist-credentials", () => {
    const steps = workflow.jobs?.gate?.steps as Array<Record<string, any>>;
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

  it("validates head SHA and head ref format, ensuring PR head identity matches event context", () => {
    const steps = workflow.jobs?.gate?.steps as Array<Record<string, any>>;
    const validateStep = steps.find((s) =>
      s.name?.toLowerCase().includes("validate exact head"),
    );
    expect(validateStep).toBeDefined();
    expect(validateStep?.run).toContain('[[ "$HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(validateStep?.run).toContain('[[ "$HEAD_REF" =~ ^[A-Za-z0-9._/-]+$ ]]');
    expect(validateStep?.run).toContain(
      '[[ "$HEAD_SHA" == "${{ github.event.pull_request.head.sha }}" ]]',
    );
    expect(validateStep?.run).toContain(
      '[[ "$HEAD_REF" == "${{ github.event.pull_request.head.ref }}" ]]',
    );
  });

  it("publishes status via canonical_review_gate_ci.py with truthful failure handling for external publication", () => {
    const steps = workflow.jobs?.gate?.steps as Array<Record<string, any>>;
    const publishStep = steps.find((s) =>
      s.name?.toLowerCase().includes("publish canonical review status"),
    );
    expect(publishStep).toBeDefined();
    expect(publishStep?.["working-directory"]).toBe("pantheon-verifier");

    const runScript = publishStep?.run as string;
    expect(runScript).toContain("python3 scripts/git/canonical_review_gate_ci.py");
    expect(runScript).toContain('--repo "$REPO"');
    expect(runScript).toContain('--head-ref "$HEAD_REF"');
    expect(runScript).toContain('--head-sha "$HEAD_SHA"');
    expect(runScript).toContain('--delivery-class "$DELIVERY_CLASS"');
    expect(runScript).toContain('--target-url "$TARGET_URL"');

    // Truthful external publication failure handling
    expect(runScript).toContain("gate_rc=0");
    expect(runScript).toContain("|| gate_rc=$?");
    expect(runScript).toContain('if [[ "$gate_rc" -eq 2 ]]');
    expect(runScript).toContain('exit "$gate_rc"');
    expect(runScript).toContain('if [[ "$gate_rc" -ne 0 && "$gate_rc" -ne 1 ]]');
  });
});
