import { describe, expect, it } from "vitest";
import {
  validateStrategyTriple, explainTripleViolation,
  HIGH_RISK_CATALOG, lookupHighRisk, validateHighRiskMemo,
  PERMISSION_MATRIX, canRoleInvoke,
  HANDOFF_SLA, validateAttachment, ATTACHMENT_LIMITS,
  classifyBreach, MANDATE_MONITOR_DEFAULT,
  REBALANCE_STEPS, canRollbackTo,
  validateConfidenceFeedback, SIGNAL_CONFIDENCE,
  clampPageSize, parseSort, PAGE_SIZE_MAX,
  sortActions, type ActionDescriptor,
  renderKpi,
  mapPersonaState,
  validateRange, EVOLUTION_LIMITS_DEFAULT,
  LIFECYCLE_BUCKET_TOKEN,
  SSE_CHANNELS, SSE_HEARTBEAT_INTERVAL_MS,
  CONFIRM_TOKEN_TTL_DEFAULT_MS, CONFIRM_TOKEN_TTL_CRITICAL_MS,
} from "@/lib/v4";

describe("v4 / Pack C smoke", () => {
  it("C008 strategy triple whitelist accepts canonical combos", () => {
    expect(validateStrategyTriple({ lifecycleStatus: "live", reviewStatus: "approved", deploymentStatus: "live_running" })).toBe(true);
    expect(validateStrategyTriple({ lifecycleStatus: "discovered", reviewStatus: "none", deploymentStatus: "none" })).toBe(true);
  });

  it("C008 rejects illegal combos with explanation", () => {
    const bad = { lifecycleStatus: "discovered" as const, reviewStatus: "approved" as const, deploymentStatus: "live_running" as const };
    expect(validateStrategyTriple(bad)).toBe(false);
    expect(explainTripleViolation(bad)).toContain("Invariant violated");
  });

  it("C013 permission matrix covers all 11 entities", () => {
    const entities = new Set(PERMISSION_MATRIX.map((r) => r.entity));
    expect(entities.size).toBeGreaterThanOrEqual(11);
    expect(canRoleInvoke("admin", "deployment", "emergency_kill")).toBe(true);
    expect(canRoleInvoke("reviewer", "deployment", "emergency_kill")).toBe(false);
  });

  it("C014 sortActions: primary < secondary < destructive", () => {
    const a: ActionDescriptor[] = [
      { id: "x", entityType: "t", labelKey: "k", group: "destructive", order: 0, enabled: true, riskLevel: "high", requiresApproval: true, requiresConfirmToken: true, requiresTwoMan: true, idempotencyKeyRequired: true },
      { id: "y", entityType: "t", labelKey: "k", group: "primary", order: 5, enabled: true, riskLevel: "low", requiresApproval: false, requiresConfirmToken: false, requiresTwoMan: false, idempotencyKeyRequired: true },
      { id: "z", entityType: "t", labelKey: "k", group: "secondary", order: 0, enabled: true, riskLevel: "low", requiresApproval: false, requiresConfirmToken: false, requiresTwoMan: false, idempotencyKeyRequired: true },
    ];
    expect(sortActions(a).map((x) => x.id)).toEqual(["y", "z", "x"]);
  });

  it("C019 confirm token TTL constants", () => {
    expect(CONFIRM_TOKEN_TTL_DEFAULT_MS).toBe(120_000);
    expect(CONFIRM_TOKEN_TTL_CRITICAL_MS).toBe(60_000);
  });

  it("C020-C023 high-risk catalog has 19 actions and validates memo", () => {
    expect(HIGH_RISK_CATALOG.length).toBe(19);
    const rule = lookupHighRisk("deployment", "emergency_kill")!;
    expect(rule.twoMan).toBe(true);
    expect(validateHighRiskMemo(rule, { text: "short", format: "text", referenceType: "incident", referenceId: "I-1" })).not.toBeNull();
    expect(validateHighRiskMemo(rule, { text: "x".repeat(120), format: "text", referenceType: "incident", referenceId: "I-1" })).toBeNull();
  });

  it("C024-C026 pagination clamping & sort parsing", () => {
    expect(clampPageSize(undefined)).toBe(50);
    expect(clampPageSize(99999)).toBe(PAGE_SIZE_MAX);
    expect(parseSort("updatedAt,-riskLevel")).toEqual([
      { field: "updatedAt", direction: "asc" },
      { field: "riskLevel", direction: "desc" },
    ]);
  });

  it("C029 SSE channel catalog covers all main domains + heartbeat", () => {
    expect(SSE_CHANNELS.find((c) => c.channel === "handoff.*")).toBeDefined();
    expect(SSE_HEARTBEAT_INTERVAL_MS).toBe(15_000);
  });

  it("C033-C036 handoff SLA + attachment limits", () => {
    expect(HANDOFF_SLA.length).toBe(7);
    expect(validateAttachment({ mime: "image/png", bytes: 1000 })).toBeNull();
    expect(validateAttachment({ mime: "image/png", bytes: ATTACHMENT_LIMITS.maxFileBytes + 1 })).toContain("25MB");
    expect(validateAttachment({ mime: "application/zip", bytes: 100 })).toContain("not allowed");
  });

  it("C038 mandate breach severity classification", () => {
    expect(classifyBreach(2, MANDATE_MONITOR_DEFAULT)).toBe("low");
    expect(classifyBreach(10, MANDATE_MONITOR_DEFAULT)).toBe("medium");
    expect(classifyBreach(20, MANDATE_MONITOR_DEFAULT)).toBe("high");
    expect(classifyBreach(30, MANDATE_MONITOR_DEFAULT)).toBe("critical");
  });

  it("C040 rebalance rollback rules", () => {
    expect(REBALANCE_STEPS.length).toBe(7);
    expect(canRollbackTo("review", "constraint_check")).toBe(true);
    expect(canRollbackTo("review", "metric_freeze")).toBe(false);
    expect(canRollbackTo("applied", "review")).toBe(false);
  });

  it("C043 evolution range validator", () => {
    expect(validateRange(100, EVOLUTION_LIMITS_DEFAULT.populationSize)).toBeNull();
    expect(validateRange(1000, EVOLUTION_LIMITS_DEFAULT.populationSize)).toContain("out of range");
  });

  it("C075 signal confidence feedback validation", () => {
    expect(SIGNAL_CONFIDENCE.length).toBe(5);
    expect(validateConfidenceFeedback(3)).toBeNull();
    expect(validateConfidenceFeedback(5)).toContain("reason required");
    expect(validateConfidenceFeedback(5, "valid because of strong OOS performance and risk profile")).toBeNull();
  });

  it("C077 KPI null/zero-denominator handling", () => {
    expect(renderKpi(null).kind).toBe("missing");
    expect(renderKpi(1, 0).kind).toBe("na");
    expect(renderKpi(0.42).kind).toBe("value");
  });

  it("C078 lifecycle bucket → token mapping", () => {
    expect(LIFECYCLE_BUCKET_TOKEN.live).toBe("--status-live");
    expect(LIFECYCLE_BUCKET_TOKEN.degraded).toBe("--risk-high");
  });

  it("C001 persona degraded → restricted with warning", () => {
    const r = mapPersonaState("degraded");
    expect(r.value).toBe("restricted");
    expect(r.warning).toBeDefined();
  });
});
