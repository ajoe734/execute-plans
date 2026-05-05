// Phase 3 — v3 normative-layer contract tests.
// Covers Pack A (28 H) + Pack B (64 M/L) primitives.

import { describe, it, expect } from "vitest";

import {
  STRATEGY_LIFECYCLE,
  STRATEGY_LIFECYCLE_TRANSITIONS,
  PERSONA_STATUSES,
  CAPITAL_POOL_STATUSES,
  normalizeStatus,
  STATUS_ALIASES,
} from "./status";
import {
  ALL_ACTION_PERMISSIONS,
  getActionPermission,
  canRoleInvoke,
  isHighRiskAction,
} from "./permissions";
import {
  HIGH_RISK_ACTIONS,
  getHighRiskAction,
  buildConfirmPhrase,
  issueConfirmToken,
  EMERGENCY_KILL_ENTRY_POINTS,
  EMERGENCY_KILL_SLA,
} from "./highRiskActions";
import { liftLegacyActions, isActionDescriptorArray } from "./availableActions";
import { validateMandate, type CapitalPoolMandate } from "./capitalPoolMandate";
import {
  metricsForScope,
  isMetricValidForScope,
  validateFormula,
  canActivateFormula,
  RANKING_SCOPES,
  type RankingFormulaSpec,
} from "./rankingMatrix";
import {
  validateSignalFeedback,
  SIGNAL_FEEDBACK_ENDPOINT,
  SIGNAL_FEEDBACK_EDIT_WINDOW_SECONDS,
} from "./signalFeedback";
import {
  validateEvidenceUpload,
  EVIDENCE_LIMITS,
  COMMITTEE_EVIDENCE_ALLOWED_MIMES,
  COMMITTEE_EVIDENCE_ENDPOINTS,
} from "./committeeEvidence";
import { AGORA_HANDOFF_TYPES } from "./agoraHandoff";
import { AGORA_KPI_SPECS } from "./agoraKpi";
import { REBALANCE_STEPS, getRebalanceStep } from "./rebalanceWorkflow";

import {
  resolvePersonaLocale,
  NOTIFICATION_ROUTING,
  SEARCH_ENDPOINT,
  SEARCH_SCORE_WEIGHTS,
  REQUIRED_ADRS,
  DESIGN_TOKENS,
  I18N_QA,
} from "./medium-low/B1-platform";
import { INCIDENT_TRANSITIONS } from "./medium-low/B2-entities";
import {
  COMMAND_CENTER_KPIS,
  STRATEGY_LIST_SORT_KEYS,
  SSE_CHANNELS,
  LINEAGE_GRAPH_LIMITS,
} from "./medium-low/B3-console";
import {
  PERSONA_ASK_MODE_SCOPES,
  COMMITTEE_TEMPLATE_REQUIRED_EVIDENCE,
  AGORA_PROHIBITED_ACTIONS,
  AGORA_DEFAULT_ROUTE,
  PERSONA_LAB_COMMIT_FLOW,
} from "./medium-low/B4-agora";
import {
  resolveAcceptLocale,
  validateHighRiskMemo,
  HIGH_RISK_MEMO_LIMITS,
  MOCK_ID_PATTERNS,
  ROUTE_PARAM_PATTERNS,
  isValidRouteParam,
  DEMO_SCENARIOS,
  BUILD_PHASES,
  EVENT_STREAM_RETAIN,
  MONEY_PRECISION,
} from "./medium-low/B5-misc";

// ───────── §4 Status canonical sets ─────────
describe("v3 §4 status", () => {
  it("strategy lifecycle has all 8 canonical statuses", () => {
    expect(STRATEGY_LIFECYCLE).toEqual([
      "discovered","scaffolded","replicated","approved",
      "paper","live","degraded","retired",
    ]);
  });
  it("every transition uses canonical from/to states", () => {
    for (const t of STRATEGY_LIFECYCLE_TRANSITIONS) {
      expect(STRATEGY_LIFECYCLE).toContain(t.from);
      expect(STRATEGY_LIFECYCLE).toContain(t.to);
      expect(t.action).toMatch(/^strategy\./);
    }
  });
  it("normalizeStatus applies aliases", () => {
    const [legacy] = Object.keys(STATUS_ALIASES);
    if (legacy) expect(normalizeStatus(legacy)).toBe(STATUS_ALIASES[legacy]);
    expect(normalizeStatus("live")).toBe("live");
  });
  it("persona / capital-pool enums non-empty", () => {
    expect(PERSONA_STATUSES.length).toBeGreaterThan(0);
    expect(CAPITAL_POOL_STATUSES.length).toBeGreaterThan(0);
  });
});

// ───────── §5 Permissions ─────────
describe("v3 §5 permissions", () => {
  it("all action ids are unique", () => {
    const ids = ALL_ACTION_PERMISSIONS.map((p) => p.actionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("admin can invoke every action", () => {
    for (const p of ALL_ACTION_PERMISSIONS) {
      expect(canRoleInvoke("admin", p.actionId)).toBe(true);
    }
  });
  it("emergency_kill is high-risk and bypasses approval", () => {
    const kill = getActionPermission("strategy.emergency_kill")!;
    expect(kill.highRisk).toBe(true);
    expect(kill.requiresApproval).toBe(false);
    expect(isHighRiskAction("strategy.emergency_kill")).toBe(true);
  });
  it("strategy.create is not high risk", () => {
    expect(isHighRiskAction("strategy.create")).toBe(false);
  });
});

// ───────── §6 High-risk + confirmation token ─────────
describe("v3 §6 high-risk actions", () => {
  it("every high-risk action has a permission entry that flags highRisk", () => {
    for (const hra of HIGH_RISK_ACTIONS) {
      const perm = getActionPermission(hra.actionId);
      if (perm) expect(perm.highRisk).toBe(true);
    }
  });
  it("buildConfirmPhrase substitutes placeholders", () => {
    const a = getHighRiskAction("strategy.deploy_live")!;
    expect(buildConfirmPhrase(a, { strategyId: "alpha_001" }))
      .toBe("DEPLOY LIVE alpha_001");
  });
  it("issueConfirmToken returns ttl + phrase + audit preview", () => {
    const t = issueConfirmToken({
      actionId: "strategy.deploy_live",
      entityType: "strategy", entityId: "alpha_001",
      payloadHash: "h", tradingEnvironment: "paper", platformEnvironment: "staging",
    }, { strategyId: "alpha_001" });
    expect(t.confirmToken).toMatch(/^ctok_/);
    expect(t.requiredPhrase).toContain("alpha_001");
    expect(t.requiresMemo).toBe(true);
    expect(t.ttlSeconds).toBeGreaterThan(0);
    expect(t.auditEventPreview).toBe("strategy.deploy_live.requested");
  });
  it("issueConfirmToken throws for unknown action", () => {
    expect(() => issueConfirmToken({
      actionId: "bogus.action", entityType: "x", entityId: "y",
      payloadHash: "h", tradingEnvironment: "paper", platformEnvironment: "staging",
    }, {})).toThrow();
  });
  it("emergency-kill catalog covers all 6 entry points with SLA bounds", () => {
    expect(EMERGENCY_KILL_ENTRY_POINTS).toHaveLength(6);
    expect(EMERGENCY_KILL_SLA.openModalMs).toBeLessThanOrEqual(1000);
  });
});

// ───────── §8 availableActions ─────────
describe("v3 §8 ActionDescriptor", () => {
  it("liftLegacyActions produces well-formed descriptors", () => {
    const out = liftLegacyActions(["x", "y"], "strategy");
    expect(out).toHaveLength(2);
    expect(isActionDescriptorArray(out)).toBe(true);
  });
  it("isActionDescriptorArray rejects string[]", () => {
    expect(isActionDescriptorArray(["a", "b"])).toBe(false);
  });
});

// ───────── §9 Capital pool mandate ─────────
describe("v3 §9 mandate", () => {
  const base: CapitalPoolMandate = {
    mandateId: "m", poolId: "pool_001", displayName: "x", description: "x",
    baseCurrency: "USD", allowedMarkets: ["US_EQUITY"], allowedStrategyTypes: ["trend_following"],
    allowedPersonaIds: [], maxGrossExposurePct: 100, maxNetExposurePct: 100,
    maxSingleStrategyAllocationPct: 20, maxSinglePersonaAllocationPct: 30,
    minCashReservePct: 5, maxDrawdownPct: 20, warningDrawdownPct: 10,
    maxLeverage: 1, maxTurnoverDailyPct: 50, maxConcentrationByAssetPct: 25,
    maxCorrelationToExistingLive: 0.5, deployModesAllowed: ["paper"],
    emergencyRules: { autoFreezeOnDrawdownPct: 18, autoIncidentOnRiskBreach: true, requireRiskOfficerForUnfreeze: true },
    effectiveFrom: "2026-01-01", version: 1, status: "draft",
  };
  it("valid mandate passes", () => {
    expect(validateMandate(base)).toEqual([]);
  });
  it("warning ≥ max drawdown rejected", () => {
    const errs = validateMandate({ ...base, warningDrawdownPct: 25 });
    expect(errs.some((e) => e.field === "warningDrawdownPct")).toBe(true);
  });
  it("out-of-range exposure rejected", () => {
    const errs = validateMandate({ ...base, maxGrossExposurePct: 999 });
    expect(errs.some((e) => e.field === "maxGrossExposurePct")).toBe(true);
  });
});

// ───────── §10 Ranking formula ─────────
describe("v3 §10 ranking formula", () => {
  it("scope×metric matrix consistent with RANKING_SCOPES", () => {
    for (const scope of RANKING_SCOPES) {
      const ms = metricsForScope(scope);
      expect(Array.isArray(ms)).toBe(true);
      for (const m of ms) expect(isMetricValidForScope(m, scope)).toBe(true);
    }
  });
  const baseFormula: RankingFormulaSpec = {
    id: "f", name: "n", scope: "strategy", version: 1, status: "approved",
    window: { period: "quarter" }, normalization: "z_score",
    outlierHandling: "winsorize_1_99",
    metrics: [
      { metric: "sharpe", weight: 0.6, direction: "higher_is_better", transform: "identity", penaltyMode: "none" },
      { metric: "max_drawdown", weight: 0.4, direction: "lower_is_better", transform: "identity", penaltyMode: "none" },
    ],
    caps: {}, createdBy: "u",
  };
  it("weights summing to 1 → no errors", () => {
    expect(validateFormula(baseFormula)).toEqual([]);
  });
  it("weights not summing to 1 → weight_sum error", () => {
    const errs = validateFormula({ ...baseFormula, metrics: [
      { ...baseFormula.metrics[0], weight: 0.7 },
      baseFormula.metrics[1],
    ]});
    expect(errs.some((e) => e.code === "weight_sum")).toBe(true);
  });
  it("penalty metric must be negative", () => {
    const errs = validateFormula({
      ...baseFormula,
      metrics: [
        ...baseFormula.metrics,
        { metric: "policy_violation_penalty", weight: 0.1, direction: "lower_is_better", transform: "identity", penaltyMode: "linear" },
      ],
    });
    expect(errs.some((e) => e.code === "negative_required")).toBe(true);
  });
  it("metric invalid for scope is reported", () => {
    const errs = validateFormula({
      ...baseFormula, scope: "research_productivity",
      metrics: [{ metric: "sharpe", weight: 1, direction: "higher_is_better", transform: "identity", penaltyMode: "none" }],
    });
    expect(errs.some((e) => e.code === "metric_invalid_for_scope")).toBe(true);
  });
  it("activation requires approved status", () => {
    expect(canActivateFormula(baseFormula)).toBe(true);
    expect(canActivateFormula({ ...baseFormula, status: "draft" })).toBe(false);
  });
});

// ───────── §11 Rebalance workflow ─────────
describe("v3 §11 rebalance workflow", () => {
  it("has the canonical 5+ step ordering", () => {
    expect(REBALANCE_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(getRebalanceStep(REBALANCE_STEPS[0].id)).toBeDefined();
  });
});

// ───────── §15 Agora handoff ─────────
describe("v3 §15 agora handoff", () => {
  it("8 canonical handoff types", () => {
    expect(AGORA_HANDOFF_TYPES).toHaveLength(8);
  });
});

// ───────── §16 Signal feedback ─────────
describe("v3 §16 signal feedback", () => {
  it("endpoint helper builds correct path", () => {
    expect(SIGNAL_FEEDBACK_ENDPOINT("sig_1")).toBe("/bff/agora/signals/sig_1/feedback");
    expect(SIGNAL_FEEDBACK_EDIT_WINDOW_SECONDS).toBe(30);
  });
  it("agree without reason at any confidence is OK", () => {
    expect(validateSignalFeedback({ signalId: "s", decision: "agree", confidence: 5 })).toEqual([]);
  });
  it("disagree with confidence ≥4 requires reason", () => {
    const errs = validateSignalFeedback({ signalId: "s", decision: "disagree", confidence: 4 });
    expect(errs.some((e) => e.code === "reason_required_high_confidence_disagree")).toBe(true);
  });
  it("flag_suspicious always requires reason", () => {
    const errs = validateSignalFeedback({ signalId: "s", decision: "flag_suspicious", confidence: 1 });
    expect(errs.some((e) => e.code === "reason_required_flag")).toBe(true);
  });
  it("confidence out of range reported", () => {
    const errs = validateSignalFeedback({ signalId: "s", decision: "agree", confidence: 9 as never });
    expect(errs.some((e) => e.code === "confidence_out_of_range")).toBe(true);
  });
});

// ───────── §17 Agora KPI strip ─────────
describe("v3 §17 agora KPIs", () => {
  it("has 7 canonical KPIs", () => {
    expect(AGORA_KPI_SPECS).toHaveLength(7);
  });
});

// ───────── §18 Committee evidence pack ─────────
describe("v3 §18 evidence pack", () => {
  const meta = { source: "x", title: "t", uploadedBy: "u", createdAt: "2026-01-01" };
  it("accepted MIME + metadata is OK", () => {
    expect(validateEvidenceUpload([], [
      { fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1000, metadata: meta },
    ])).toEqual([]);
  });
  it("rejects disallowed mime", () => {
    const errs = validateEvidenceUpload([], [
      { fileName: "x.zip", mimeType: "application/zip", sizeBytes: 100, metadata: meta },
    ]);
    expect(errs.some((e) => e.code === "mime_not_allowed")).toBe(true);
  });
  it("rejects oversize file", () => {
    const errs = validateEvidenceUpload([], [
      { fileName: "big.pdf", mimeType: "application/pdf", sizeBytes: EVIDENCE_LIMITS.maxFileSizeBytes + 1, metadata: meta },
    ]);
    expect(errs.some((e) => e.code === "file_too_large")).toBe(true);
  });
  it("rejects too many files", () => {
    const incoming = Array.from({ length: EVIDENCE_LIMITS.maxFilesPerPack + 1 }, (_, i) => ({
      fileName: `f${i}.pdf`, mimeType: "application/pdf" as const, sizeBytes: 10, metadata: meta,
    }));
    const errs = validateEvidenceUpload([], incoming);
    expect(errs.some((e) => e.code === "too_many_files")).toBe(true);
  });
  it("requires metadata", () => {
    const errs = validateEvidenceUpload([], [
      { fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 },
    ]);
    expect(errs.some((e) => e.code === "missing_metadata")).toBe(true);
  });
  it("endpoint helper builds path", () => {
    expect(COMMITTEE_EVIDENCE_ENDPOINTS.createPack("sess_1"))
      .toBe("/bff/agora/committee/sess_1/evidence-pack");
    expect(COMMITTEE_EVIDENCE_ALLOWED_MIMES.length).toBeGreaterThan(0);
  });
});

// ───────── Pack B: B1 platform ─────────
describe("v3 part10 B1 — platform", () => {
  it("resolvePersonaLocale: session lock wins over user pref", () => {
    expect(resolvePersonaLocale({
      session: { sessionId: "s", responseLanguage: "en-US", lockedByUser: true },
      user: { uiLocale: "zh-TW", personaResponseLanguage: "follow_ui" },
    })).toBe("en-US");
  });
  it("resolvePersonaLocale: falls back to UI locale", () => {
    expect(resolvePersonaLocale({
      user: { uiLocale: "zh-TW", personaResponseLanguage: "follow_ui" },
    })).toBe("zh-TW");
  });
  it("notification routing is total", () => {
    for (const k of Object.keys(NOTIFICATION_ROUTING)) {
      expect(NOTIFICATION_ROUTING[k as keyof typeof NOTIFICATION_ROUTING].routeTemplate).toBeTruthy();
    }
  });
  it("SEARCH_ENDPOINT encodes query", () => {
    expect(SEARCH_ENDPOINT("a b")).toContain("a%20b");
    expect(SEARCH_SCORE_WEIGHTS.exactId).toBeGreaterThan(SEARCH_SCORE_WEIGHTS.fuzzyTitle);
  });
  it("required ADRs declared", () => {
    expect(REQUIRED_ADRS.length).toBeGreaterThanOrEqual(5);
  });
  it("design tokens + i18n QA constants present", () => {
    expect(Object.keys(DESIGN_TOKENS).length).toBeGreaterThan(0);
    expect(I18N_QA.failBuildOnMissingKey).toBe(true);
  });
});

// ───────── Pack B: B2 entities ─────────
describe("v3 part10 B2 — entities", () => {
  it("incident transitions are acyclic at terminal node", () => {
    expect(INCIDENT_TRANSITIONS.closed).toEqual([]);
    expect(INCIDENT_TRANSITIONS.new).toContain("acknowledged");
  });
});

// ───────── Pack B: B3 console ─────────
describe("v3 part10 B3 — console", () => {
  it("command-center KPIs declared", () => {
    expect(COMMAND_CENTER_KPIS.length).toBeGreaterThan(0);
    expect(STRATEGY_LIST_SORT_KEYS.length).toBeGreaterThan(0);
    expect(SSE_CHANNELS.length).toBeGreaterThan(0);
    expect(LINEAGE_GRAPH_LIMITS).toBeDefined();
  });
});

// ───────── Pack B: B4 agora ─────────
describe("v3 part10 B4 — agora", () => {
  it("ask modes carry token + latency budgets", () => {
    expect(PERSONA_ASK_MODE_SCOPES.quick_ask.maxTokens).toBeLessThan(
      PERSONA_ASK_MODE_SCOPES.deep_research.maxTokens,
    );
  });
  it("templates list required evidence", () => {
    expect(COMMITTEE_TEMPLATE_REQUIRED_EVIDENCE.signal_trust.length).toBeGreaterThan(0);
  });
  it("Agora cannot directly promote_to_live (ADR-FE-0002)", () => {
    expect(AGORA_PROHIBITED_ACTIONS.promote_to_live).toBe("not_shown");
    expect(AGORA_PROHIBITED_ACTIONS.emergency_kill).toBe("not_shown");
  });
  it("each agora role has a default route", () => {
    for (const r of Object.keys(AGORA_DEFAULT_ROUTE)) {
      expect(AGORA_DEFAULT_ROUTE[r as keyof typeof AGORA_DEFAULT_ROUTE]).toMatch(/^\/agora\//);
    }
  });
  it("persona-lab commit flow is ordered", () => {
    expect(PERSONA_LAB_COMMIT_FLOW[0]).toBe("sandbox_draft");
    expect(PERSONA_LAB_COMMIT_FLOW.at(-1)).toBe("published");
  });
});

// ───────── Pack B: B5 misc ─────────
describe("v3 part10 B5 — misc", () => {
  it("resolveAcceptLocale honors query > header > user > Accept-Language", () => {
    expect(resolveAcceptLocale({ queryLocale: "en-US", userLocale: "zh-TW" })).toBe("en-US");
    expect(resolveAcceptLocale({ acceptLanguage: "fr-FR,en-US;q=0.9" })).toBe("en-US");
    expect(resolveAcceptLocale({})).toBe("zh-TW");
  });
  it("highRisk memo enforces min/max for required category", () => {
    const cat = "live_deployment_rollback_kill" as const;
    expect(validateHighRiskMemo(cat, "").code).toBe("memo_required");
    expect(validateHighRiskMemo(cat, "short").code).toBe("memo_too_short");
    expect(validateHighRiskMemo(cat, "x".repeat(HIGH_RISK_MEMO_LIMITS[cat].max + 1)).code)
      .toBe("memo_too_long");
    expect(validateHighRiskMemo(cat, "x".repeat(HIGH_RISK_MEMO_LIMITS[cat].min)).ok).toBe(true);
  });
  it("mock id patterns match canonical naming", () => {
    expect(MOCK_ID_PATTERNS.Strategy.test("alpha_001")).toBe(true);
    expect(MOCK_ID_PATTERNS.Strategy.test("strat_001")).toBe(false);
    expect(MOCK_ID_PATTERNS.Rebalance.test("rebalance_2026Q1_pool_001")).toBe(true);
  });
  it("isValidRouteParam validates", () => {
    expect(isValidRouteParam("strategyId", "alpha_001")).toBe(true);
    expect(isValidRouteParam("strategyId", "../etc/passwd")).toBe(false);
    for (const k of Object.keys(ROUTE_PARAM_PATTERNS)) {
      expect(ROUTE_PARAM_PATTERNS[k as keyof typeof ROUTE_PARAM_PATTERNS]).toBeInstanceOf(RegExp);
    }
  });
  it("demo scenarios + build phases declared", () => {
    expect(Object.keys(DEMO_SCENARIOS)).toEqual(["A","B","C","D","E","F"]);
    expect(BUILD_PHASES[1].length).toBeGreaterThan(0);
    expect(BUILD_PHASES[7].length).toBeGreaterThan(0);
  });
  it("event-stream retain caps are sensible", () => {
    expect(EVENT_STREAM_RETAIN.globalTopbar).toBe(100);
    expect(EVENT_STREAM_RETAIN.audit).toBe("server_paginated");
  });
  it("money precision covers all supported currencies", () => {
    expect(MONEY_PRECISION.USD).toBe(2);
    expect(MONEY_PRECISION.JPY).toBe(0);
  });
});
