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

interface WorkflowStep {
  id?: string;
  name?: string;
  uses?: string;
  with?: Record<string, unknown>;
  run?: string;
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

export interface PrMetadata {
  number: number;
  headRefName: string;
  headRefOid: string;
  labels: Array<{ name: string }>;
  state: string;
}

export interface ConsumerResolutionInput {
  eventName: "pull_request_target" | "workflow_dispatch";
  targetHeadRef: string;
  targetHeadSha: string;
  pr?: PrMetadata | null;
  prList?: PrMetadata[];
}

export interface ConsumerResolutionResult {
  deliveryClass: "product" | "tooling";
  authHeadSha: string;
  authHeadRef: string;
}

/**
 * Pure consumer evaluation logic mirroring the bash step in
 * .github/workflows/pantheon-canonical-review-gate.yml.
 */
export function resolveConsumerMetadata(
  input: ConsumerResolutionInput,
): ConsumerResolutionResult {
  const shaRegex = /^[0-9a-f]{40}$/;
  const refRegex = /^[A-Za-z0-9._/-]+$/;

  if (!shaRegex.test(input.targetHeadSha)) {
    throw new Error("head_sha must be a full lowercase commit SHA");
  }
  if (!refRegex.test(input.targetHeadRef)) {
    throw new Error("head_ref contains unsafe characters");
  }

  let pr: PrMetadata | undefined;
  if (input.eventName === "pull_request_target") {
    if (!input.pr) {
      throw new Error("pull_request_target requires PR metadata");
    }
    pr = input.pr;
  } else if (input.eventName === "workflow_dispatch") {
    const list = input.prList ?? (input.pr ? [input.pr] : []);
    if (list.length === 0) {
      throw new Error(`no open pull request found for head branch ${input.targetHeadRef}`);
    }
    if (list.length > 1) {
      throw new Error(`multiple open pull requests found for head branch ${input.targetHeadRef}`);
    }
    pr = list[0];
  } else {
    throw new Error(`unsupported event ${input.eventName}`);
  }

  if (pr.state !== "OPEN") {
    throw new Error(`PR is not OPEN (state: ${pr.state})`);
  }

  if (input.targetHeadSha !== pr.headRefOid) {
    throw new Error(
      `target head SHA ${input.targetHeadSha} does not match authoritative PR head ${pr.headRefOid} (stale or wrong head)`,
    );
  }

  if (input.targetHeadRef !== pr.headRefName) {
    throw new Error(
      `target head ref ${input.targetHeadRef} does not match authoritative PR branch ${pr.headRefName}`,
    );
  }

  const hasToolingLabel = pr.labels.some((l) => l.name === "delivery:tooling");
  const deliveryClass = hasToolingLabel ? "tooling" : "product";

  return {
    deliveryClass,
    authHeadSha: pr.headRefOid,
    authHeadRef: pr.headRefName,
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

  it("checks out trusted Pantheon verifier from pantheon@dev with isolated path and disabled persist-credentials", () => {
    const steps = workflow.jobs?.gate?.steps ?? [];
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

  it("resolves authoritative PR metadata from GitHub API and validates exact head identity", () => {
    const steps = workflow.jobs?.gate?.steps ?? [];
    const metadataStep = steps.find((s) => s.id === "pr_metadata");
    expect(metadataStep).toBeDefined();

    const run = metadataStep?.run as string;
    expect(run).toContain("gh pr view");
    expect(run).toContain("gh pr list");
    expect(run).toContain('[[ "$TARGET_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(run).toContain('[[ "$TARGET_HEAD_REF" =~ ^[A-Za-z0-9._/-]+$ ]]');
    expect(run).toContain('[[ "$TARGET_HEAD_SHA" != "$AUTH_HEAD_SHA" ]]');
    expect(run).toContain('[[ "$TARGET_HEAD_REF" != "$AUTH_HEAD_REF" ]]');
    expect(run).toContain('[[ "$AUTH_STATE" != "OPEN" ]]');
    expect(run).toContain('delivery_class=');
    expect(run).toContain('echo "delivery_class=$DELIVERY_CLASS" >> "$GITHUB_OUTPUT"');
    expect(run).toContain('echo "auth_head_sha=$AUTH_HEAD_SHA" >> "$GITHUB_OUTPUT"');
    expect(run).toContain('echo "auth_head_ref=$AUTH_HEAD_REF" >> "$GITHUB_OUTPUT"');
  });

  it("binds verifier inputs strictly to authoritative step outputs rather than untrusted event snapshots", () => {
    const steps = workflow.jobs?.gate?.steps ?? [];
    const publishStep = steps.find((s) =>
      s.name?.toLowerCase().includes("publish canonical review status"),
    );
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

    // Truthful external publication failure handling
    expect(runScript).toContain("gate_rc=0");
    expect(runScript).toContain("|| gate_rc=$?");
    expect(runScript).toContain('if [[ "$gate_rc" -eq 2 ]]');
    expect(runScript).toContain('exit "$gate_rc"');
    expect(runScript).toContain('if [[ "$gate_rc" -ne 0 && "$gate_rc" -ne 1 ]]');
  });
});

describe("Pantheon canonical review gate - Consumer Behavior Coverage", () => {
  const validSha = "07f936d09ae29ca6f68a115cb1f0f292a711e0aa";
  const validRef = "task/OPS-FE-REVIEW-PROOF-001";

  describe("Current vs Stale Head Validation", () => {
    it("accepts valid exact head matching authoritative PR metadata", () => {
      const result = resolveConsumerMetadata({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        pr: {
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

    it("rejects stale head when PR head has moved to successor commit", () => {
      const successorSha = "1111111111111111111111111111111111111111";
      expect(() =>
        resolveConsumerMetadata({
          eventName: "pull_request_target",
          targetHeadRef: validRef,
          targetHeadSha: validSha,
          pr: {
            number: 747,
            headRefName: validRef,
            headRefOid: successorSha,
            labels: [{ name: "delivery:tooling" }],
            state: "OPEN",
          },
        }),
      ).toThrow(/stale or wrong head/);
    });

    it("rejects all-zero head even if PR is labeled delivery:tooling, preventing unearned success", () => {
      const allZeroSha = "0000000000000000000000000000000000000000";
      expect(() =>
        resolveConsumerMetadata({
          eventName: "workflow_dispatch",
          targetHeadRef: validRef,
          targetHeadSha: allZeroSha,
          pr: {
            number: 747,
            headRefName: validRef,
            headRefOid: validSha,
            labels: [{ name: "delivery:tooling" }],
            state: "OPEN",
          },
        }),
      ).toThrow(/stale or wrong head/);
    });

    it("rejects non-40-hex or malformed head SHA", () => {
      expect(() =>
        resolveConsumerMetadata({
          eventName: "workflow_dispatch",
          targetHeadRef: validRef,
          targetHeadSha: "not-a-sha",
          pr: {
            number: 747,
            headRefName: validRef,
            headRefOid: validSha,
            labels: [],
            state: "OPEN",
          },
        }),
      ).toThrow(/full lowercase commit SHA/);
    });

    it("rejects mismatched head branch ref", () => {
      expect(() =>
        resolveConsumerMetadata({
          eventName: "pull_request_target",
          targetHeadRef: "task/OTHER-TASK",
          targetHeadSha: validSha,
          pr: {
            number: 747,
            headRefName: validRef,
            headRefOid: validSha,
            labels: [],
            state: "OPEN",
          },
        }),
      ).toThrow(/does not match authoritative PR branch/);
    });
  });

  describe("Label Removal (unlabeled event) Re-evaluation", () => {
    it("evaluates to tooling delivery when delivery:tooling label is present", () => {
      const result = resolveConsumerMetadata({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        pr: {
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
      // Authoritative PR labels returned by GitHub API after unlabeled trigger
      const result = resolveConsumerMetadata({
        eventName: "pull_request_target",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        pr: {
          number: 747,
          headRefName: validRef,
          headRefOid: validSha,
          labels: [{ name: "ci" }], // delivery:tooling removed
          state: "OPEN",
        },
      });
      expect(result.deliveryClass).toBe("product");
    });
  });

  describe("Dispatch Classification and Authority", () => {
    it("derives delivery_class strictly from open PR labels on workflow_dispatch", () => {
      // Tooling PR dispatched without caller delivery_class hint
      const toolingResult = resolveConsumerMetadata({
        eventName: "workflow_dispatch",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prList: [
          {
            number: 747,
            headRefName: validRef,
            headRefOid: validSha,
            labels: [{ name: "delivery:tooling" }],
            state: "OPEN",
          },
        ],
      });
      expect(toolingResult.deliveryClass).toBe("tooling");

      // Product PR dispatched without caller delivery_class hint
      const productResult = resolveConsumerMetadata({
        eventName: "workflow_dispatch",
        targetHeadRef: validRef,
        targetHeadSha: validSha,
        prList: [
          {
            number: 747,
            headRefName: validRef,
            headRefOid: validSha,
            labels: [],
            state: "OPEN",
          },
        ],
      });
      expect(productResult.deliveryClass).toBe("product");
    });

    it("fails closed on dispatch if PR is closed or merged", () => {
      expect(() =>
        resolveConsumerMetadata({
          eventName: "workflow_dispatch",
          targetHeadRef: validRef,
          targetHeadSha: validSha,
          prList: [
            {
              number: 747,
              headRefName: validRef,
              headRefOid: validSha,
              labels: [{ name: "delivery:tooling" }],
              state: "MERGED",
            },
          ],
        }),
      ).toThrow(/PR is not OPEN/);
    });

    it("fails closed on dispatch if no open PR is found for head ref", () => {
      expect(() =>
        resolveConsumerMetadata({
          eventName: "workflow_dispatch",
          targetHeadRef: validRef,
          targetHeadSha: validSha,
          prList: [],
        }),
      ).toThrow(/no open pull request found/);
    });

    it("fails closed on dispatch if multiple open PRs match the same head branch", () => {
      expect(() =>
        resolveConsumerMetadata({
          eventName: "workflow_dispatch",
          targetHeadRef: validRef,
          targetHeadSha: validSha,
          prList: [
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
        }),
      ).toThrow(/multiple open pull requests found/);
    });
  });
});

