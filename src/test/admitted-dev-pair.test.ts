import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const workflow = readFileSync(".github/workflows/pantheon-integration-gate.yml", "utf8");
const section = workflow.split("      - name: Validate active Pantheon release controller source\n")[1].split("\n      - name:")[0];
const script = section.split("          script: |\n")[1].split("\n").map(line => line.replace(/^ {12}/, "")).join("\n");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const frontend = "a".repeat(40), backend = "b".repeat(40), newer = "c".repeat(40);

afterEach(() => vi.unstubAllEnvs());

describe("in-flight exact dev pair admission", () => {
  async function admission({ active = true, ancestry = "ahead", head = newer } = {}) {
    for (const [key, value] of Object.entries({
      RELEASE_CANDIDATE_ID: "d".repeat(64), COMPATIBILITY_MANIFEST_SHA256: "e".repeat(64),
      RELEASE_CONTROLLER_RUN_ID: "123", EXPECTED_FRONTEND_SHA: frontend,
      EXPECTED_FRONTEND_REF: "dev", EXPECTED_BACKEND_SHA: backend,
    })) vi.stubEnv(key, value);
    const core = { setFailed: vi.fn() };
    const compare = vi.fn().mockResolvedValue({ data: { status: ancestry } });
    const github = { rest: {
      git: { getRef: vi.fn().mockResolvedValue({ data: { object: { sha: head } } }) },
      repos: { compareCommits: compare },
      actions: { getWorkflowRun: vi.fn().mockResolvedValue({ data: {
        path: ".github/workflows/nonprod-deploy.yml", head_repository: { full_name: "ajoe734/pantheon" },
        event: "workflow_dispatch", head_branch: "dev", head_sha: backend,
        status: active ? "in_progress" : "completed", conclusion: active ? null : "success",
      } }) },
    } };
    const context = { eventName: "workflow_dispatch", ref: "refs/heads/dev", sha: newer,
      repo: { owner: "ajoe734", repo: "execute-plans" } };
    await new AsyncFunction("github", "context", "core", script)(github, context, core);
    return { core, compare };
  }

  it("finishes the admitted FE source when dev advances during its active parent", async () => {
    const { core, compare } = await admission();
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(compare).toHaveBeenCalledWith(expect.objectContaining({ base: frontend, head: newer }));
  });
  it("rejects rewritten or unrelated dev history", async () => {
    const { core } = await admission({ ancestry: "diverged" });
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("no longer"));
  });
  it("does not replay an old completed controller after dev advances", async () => {
    const { core, compare } = await admission({ active: false });
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("active admitted"));
    expect(compare).not.toHaveBeenCalled();
  });
  it("retains completed exact-tip profile promotion", async () => {
    const { core, compare } = await admission({ active: false, head: frontend });
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
  });
});
