// Planner Stage 2 Audit (2026-05-08) — compatibility-layer tests.
import { describe, it, expect } from "vitest";
import {
  CANONICAL_EVIDENCE_KINDS,
  LEGACY_EVIDENCE_KIND_ALIASES,
  isLegacyEvidenceKind,
  isCanonicalEvidenceKind,
  normalizeRedactedEvidenceRef,
  EVIDENCE_CAPABILITY_MAP,
  type RedactedEvidenceRef,
} from "../dto";
import { ensureCorrelationId } from "../sse/payloads";
import { ROLES, isKnownRole } from "@/lib/v4/roleCapabilities";

describe("Planner Stage 2 Audit §1 — EvidenceKind canonical/legacy split", () => {
  it("has 19 canonical + 3 legacy = 22 total mapped", () => {
    expect(CANONICAL_EVIDENCE_KINDS.length).toBe(19);
    expect(LEGACY_EVIDENCE_KIND_ALIASES.length).toBe(3);
    expect(Object.keys(EVIDENCE_CAPABILITY_MAP).length).toBe(22);
  });
  it("classifies snapshot/rebalance/experiment as legacy", () => {
    for (const k of ["snapshot", "rebalance", "experiment"] as const) {
      expect(isLegacyEvidenceKind(k)).toBe(true);
      expect(isCanonicalEvidenceKind(k)).toBe(false);
    }
  });
  it("classifies the v5 four as canonical (planner §1.2)", () => {
    for (const k of ["loop_run", "sentinel_finding", "intervention", "ask_session"] as const) {
      expect(isCanonicalEvidenceKind(k)).toBe(true);
    }
  });
});

describe("Planner Stage 2 Audit §2 — RedactedEvidenceRef normalizer", () => {
  it("maps PERMISSION_DENIED + CAPABILITY_MISSING → INSUFFICIENT_CAPABILITY", () => {
    const a: RedactedEvidenceRef = { id: "1", kind: "incident", redacted: true, reason: "PERMISSION_DENIED", capabilityRequired: "risk.incident.read" };
    const b: RedactedEvidenceRef = { id: "2", kind: "incident", redacted: true, reason: "CAPABILITY_MISSING", capabilityRequired: "risk.incident.read" };
    expect(normalizeRedactedEvidenceRef(a).redactionReasonCode).toBe("INSUFFICIENT_CAPABILITY");
    expect(normalizeRedactedEvidenceRef(b).redactionReasonCode).toBe("INSUFFICIENT_CAPABILITY");
  });
  it("preserves TENANT_SCOPE_MISMATCH", () => {
    const r: RedactedEvidenceRef = { id: "3", kind: "audit", redacted: true, reason: "TENANT_SCOPE_MISMATCH", capabilityRequired: "audit.read" };
    expect(normalizeRedactedEvidenceRef(r).redactionReasonCode).toBe("TENANT_SCOPE_MISMATCH");
  });
  it("uses explicit redactionReasonCode when present", () => {
    const r: RedactedEvidenceRef = { id: "4", kind: "policy", redacted: true, redactionReasonCode: "POLICY_REDACTED", requiredCapability: "policy.read" };
    const out = normalizeRedactedEvidenceRef(r);
    expect(out.redactionReasonCode).toBe("POLICY_REDACTED");
    expect(out.requiredCapability).toBe("policy.read");
  });
  it("aliases capabilityRequired → requiredCapability", () => {
    const r: RedactedEvidenceRef = { id: "5", kind: "metric", redacted: true, reason: "PERMISSION_DENIED", capabilityRequired: "metric.read" };
    expect(normalizeRedactedEvidenceRef(r).requiredCapability).toBe("metric.read");
  });
});

describe("Planner Stage 2 Audit §4.3 — ensureCorrelationId", () => {
  it("fills synthetic correlationId when missing", () => {
    const ev = ensureCorrelationId({ id: "evt_1" });
    expect(ev.correlationId).toBe("corr_mock_evt_1");
  });
  it("preserves existing correlationId", () => {
    const ev = ensureCorrelationId({ id: "evt_2", correlationId: "corr_real_xyz" });
    expect(ev.correlationId).toBe("corr_real_xyz");
  });
});

describe("Planner Stage 2 Audit §3 — 12-role canonical superset", () => {
  it("contains all 12 planner canonical roles", () => {
    const expected = [
      "platform_admin", "portfolio_manager", "research_lead", "ops", "viewer",
      "admin", "risk_officer", "capital_manager", "strategy_manager",
      "system_operator", "reviewer", "capability_admin",
    ];
    expect(ROLES.length).toBe(12);
    for (const r of expected) expect(ROLES).toContain(r);
  });
  it("isKnownRole rejects unknown role string without crashing", () => {
    expect(isKnownRole("alien_role")).toBe(false);
    expect(isKnownRole("viewer")).toBe(true);
  });
});
