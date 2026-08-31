// E3 — Loop run mutation overlay + bffV5.loops.* end-to-end.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bffV5 } from "@/lib/bff-v1/v5Client";
import {
  applyLoopOverlay,
  loopRunOverlay,
  advanceLoopRun,
  pauseLoopRun,
  resumeLoopRun,
  cancelLoopRun,
} from "@/lib/v5/loopOverlay";
import {
  stageTimeoutState,
  DEFAULT_TIMEOUT_POLICY,
  type LoopRun,
} from "@/lib/v5";

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

describe("E3 bffV5.loops mutations", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("advance returns ok when write-gated", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    vi.stubEnv("VITE_BFF_REAL_WRITES", "true");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) {
        return new Response(JSON.stringify({
          data: {
            session: { authenticated: true, session_kind: "cookie" },
            environment: { name: "dev", strict_auth: false },
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/advance")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fetchMock;

    const r = await bffV5.loops.advance("lr_exec_001");
    expect(r.ok).toBe(true);
  });

  it("rejects for unknown id when write-gated and backend errors", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    vi.stubEnv("VITE_BFF_REAL_WRITES", "true");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) {
        return new Response(JSON.stringify({
          data: {
            session: { authenticated: true, session_kind: "cookie" },
            environment: { name: "dev", strict_auth: false },
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "not found" } }), { status: 404, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = fetchMock;

    await expect(bffV5.loops.pause("lr_does_not_exist")).rejects.toThrow();
  });
});
