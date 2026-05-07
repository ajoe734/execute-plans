// E3 — Loop run mutation overlay + bff.v5.loops.* end-to-end.

import { describe, it, expect, beforeEach } from "vitest";
import { legacyBff as bff } from "@/lib/bff-v1";
import {
  applyLoopOverlay,
  loopRunOverlay,
  advanceLoopRun,
  pauseLoopRun,
  resumeLoopRun,
  cancelLoopRun,
  stageTimeoutState,
  DEFAULT_TIMEOUT_POLICY,
} from "@/lib/v5";
import type { LoopRun } from "@/lib/v5";

beforeEach(() => loopRunOverlay.clear());

const sampleRun = (): LoopRun => ({
  id: "lr_exec_test",
  loopKind: "execution",
  status: "running",
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  triggeredBy: "tester",
  stages: [
    { id: "s1", name: "Plan",   status: "succeeded" },
    { id: "s2", name: "Run",    status: "running", startedAt: new Date(Date.now() - 60_000).toISOString() },
    { id: "s3", name: "Verify", status: "pending" },
  ],
  currentStageId: "s2",
});

describe("E3 loopOverlay", () => {
  it("advance promotes running → succeeded and next pending → running", () => {
    advanceLoopRun(sampleRun());
    const [out] = applyLoopOverlay([sampleRun()]);
    expect(out.stages.find((s) => s.id === "s2")?.status).toBe("succeeded");
    expect(out.stages.find((s) => s.id === "s3")?.status).toBe("running");
    expect(out.status).toBe("running");
  });

  it("pause sets running stage → blocked and run.status → blocked", () => {
    pauseLoopRun(sampleRun(), "manual hold");
    const [out] = applyLoopOverlay([sampleRun()]);
    expect(out.status).toBe("blocked");
    expect(out.stages.find((s) => s.id === "s2")?.status).toBe("blocked");
  });

  it("resume reverses pause", () => {
    pauseLoopRun(sampleRun(), "x");
    resumeLoopRun({ ...sampleRun(), stages: sampleRun().stages.map((s) => s.id === "s2" ? { ...s, status: "blocked" } : s) });
    const [out] = applyLoopOverlay([sampleRun()]);
    expect(out.status).toBe("running");
  });

  it("cancel marks pending→skipped, running→failed, status cancelled", () => {
    cancelLoopRun(sampleRun());
    const [out] = applyLoopOverlay([sampleRun()]);
    expect(out.status).toBe("cancelled");
    expect(out.stages.find((s) => s.id === "s2")?.status).toBe("failed");
    expect(out.stages.find((s) => s.id === "s3")?.status).toBe("skipped");
  });
});

describe("E3 stageTimeoutState", () => {
  it("returns warn after runningWarnMs", () => {
    const stage = { id: "s", name: "x", status: "running" as const, startedAt: new Date(Date.now() - DEFAULT_TIMEOUT_POLICY.runningWarnMs - 1000).toISOString() };
    expect(stageTimeoutState(stage, DEFAULT_TIMEOUT_POLICY)).toBe("warn");
  });
  it("returns escalate after blockedEscalateMs", () => {
    const stage = { id: "s", name: "x", status: "blocked" as const, startedAt: new Date(Date.now() - DEFAULT_TIMEOUT_POLICY.blockedEscalateMs - 1000).toISOString() };
    expect(stageTimeoutState(stage, DEFAULT_TIMEOUT_POLICY)).toBe("escalate");
  });
  it("returns idle for terminal stages", () => {
    expect(stageTimeoutState({ id: "s", name: "x", status: "succeeded" }, DEFAULT_TIMEOUT_POLICY)).toBe("idle");
  });
});

describe("E3 bff.v5.loops mutations", () => {
  it("advance returns ok and emits via overlay", async () => {
    const list = await bff.v5.loops.list("execution");
    const target = list.items[0];
    if (!target) return;
    const r = await bff.v5.loops.advance(target.id);
    expect(r.ok).toBe(true);
    const next = await bff.v5.loops.get(target.id);
    expect(next?.id).toBe(target.id);
  });

  it("returns not_found for unknown id", async () => {
    const r = await bff.v5.loops.pause("lr_does_not_exist");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("not_found");
  });
});
