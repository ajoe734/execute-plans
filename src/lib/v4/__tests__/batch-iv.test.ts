import { describe, it, expect } from "vitest";
import {
  newUuid,
  newCorrelationId,
  rootCorrelation,
  deriveChild,
} from "../correlation";
import { assessBreach } from "../capitalBreach";
import {
  ASYNC_TRANSITION_POLICIES,
  findAsyncTransitionPolicy,
  transitionTimeoutFor,
  stageTimeoutState,
  DEFAULT_TIMEOUT_POLICY,
  V5_TIMEOUT_POLICY_VERSION,
} from "../asyncTransitionPolicy";
import { METRIC_REGISTRY, findMetric } from "../metricRegistry";
import { writeOverlay } from "@/lib/bff-v1/writeOverlay";

describe("Pack D Batch IV — correlation chain", () => {
  it("newUuid produces v4-shaped string", () => {
    const u = newUuid();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
  it("newCorrelationId is prefixed", () => {
    expect(newCorrelationId()).toMatch(/^corr_/);
  });
  it("deriveChild propagates correlationId + sets causation", () => {
    const root = rootCorrelation("trace-1");
    const child = deriveChild(root, "evt_42");
    expect(child.correlationId).toBe(root.correlationId);
    expect(child.causationId).toBe("evt_42");
    expect(child.parentCorrelationId).toBe(root.correlationId);
    expect(child.traceId).toBe("trace-1");
  });
});

describe("Pack D Batch IV — capital breach formula", () => {
  it("flags critical when utilization > 0.98", () => {
    const r = assessBreach({ utilized: 99, allocated: 100 });
    expect(r.level).toBe("critical");
  });
  it("flags high on risk budget usage > 1.0", () => {
    const r = assessBreach({ utilized: 50, allocated: 100, currentDrawdownPct: 0.06, riskBudgetPct: 0.05 });
    expect(r.level).toBe("high");
    expect(r.riskBudgetUsagePct).toBeGreaterThan(1);
  });
  it("ok when nothing breached", () => {
    const r = assessBreach({ utilized: 10, allocated: 100 });
    expect(r.level).toBe("ok");
  });
});

describe("Pack D Batch IV — AsyncTransitionDescriptor", () => {
  it("registers 15 canonical transition policies", () => {
    expect(ASYNC_TRANSITION_POLICIES.length).toBe(15);
    expect(V5_TIMEOUT_POLICY_VERSION).toBe("v0-mock");
  });
  it("findAsyncTransitionPolicy and transitionTimeoutFor resolve canonical triggers including rollback", () => {
    expect(findAsyncTransitionPolicy("deployment.execute")?.timeoutMs).toBe(600_000);
    expect(findAsyncTransitionPolicy("deployment.rollback")?.failureState).toBe("rollback_required");
    expect(findAsyncTransitionPolicy("rollback.saga")?.timeoutMs).toBe(900_000);
    expect(transitionTimeoutFor("rebalance.apply")).toBe(900_000);
  });
  it("stageTimeoutState honors backend stage thresholds when present and falls back to provisional policy", () => {
    const now = Date.now();
    expect(
      stageTimeoutState(
        { status: "running", startedAt: new Date(now - 60_000).toISOString(), warnAfterMs: 30_000 },
        DEFAULT_TIMEOUT_POLICY,
        now,
      ),
    ).toBe("warn");
    expect(
      stageTimeoutState(
        { status: "blocked", startedAt: new Date(now - 120_000).toISOString(), timeoutMs: 60_000 },
        DEFAULT_TIMEOUT_POLICY,
        now,
      ),
    ).toBe("escalate");
  });
});

describe("Pack D Batch IV — metric registry", () => {
  it("contains all 14 canonical metrics", () => {
    expect(METRIC_REGISTRY.length).toBe(14);
    expect(findMetric("sharpe")?.higherIsBetter).toBe(true);
    expect(findMetric("max_drawdown_pct")?.higherIsBetter).toBe(false);
  });
});

describe("Pack D Batch IV — writeOverlay correlationId + idempotency", () => {
  it("idempotencyKey replays same auditId", () => {
    writeOverlay.clear();
    const a = writeOverlay.add("strategy", { id: "stg_x" }, { idempotencyKey: "k1" });
    const b = writeOverlay.add("strategy", { id: "stg_x" }, { idempotencyKey: "k1" });
    expect(a).toBe(b);
  });
  it("auto-mints correlationId when omitted", () => {
    writeOverlay.clear();
    const auditId = writeOverlay.add("persona", { id: "per_x" });
    expect(auditId).toMatch(/^aud_/);
  });
});
