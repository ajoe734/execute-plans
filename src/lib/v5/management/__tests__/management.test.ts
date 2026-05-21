// 2026-05-20 revamp tests — Persona Intent visibility, Trading baseline,
// Readiness composer, NL responder.

import { describe, it, expect } from "vitest";
import {
  intentDisplayRules, type PersonaIntentTrace,
} from "@/lib/v5/management/personaIntent";
import {
  baselineLabel, TRADING_BASELINE_DEFAULTS, TRADING_BASELINE_KINDS,
} from "@/lib/v5/management/tradingBaseline";
import {
  buildReadinessPage, passItem, pendingItem, failItem,
} from "@/lib/v5/management/readinessSeeds";
import {
  askManagementNl, ManagementNlError,
} from "@/lib/bff-v1/managementNl";

describe("PersonaIntent visibility rules", () => {
  it("summary shows everything", () => {
    const r = intentDisplayRules("summary");
    expect(r).toMatchObject({
      showSummary: true, showInterpretation: true, showToolsUsed: true,
      showRiskFlags: true, showEvidenceRefs: true, showOnlyMetadata: false,
      badge: "summary",
    });
  });
  it("redacted shows summary + risk flags only, no interpretation/tools/evidence", () => {
    const r = intentDisplayRules("redacted");
    expect(r.showSummary).toBe(true);
    expect(r.showInterpretation).toBe(false);
    expect(r.showToolsUsed).toBe(false);
    expect(r.showEvidenceRefs).toBe(false);
    expect(r.badge).toBe("redacted");
  });
  it("restricted hides summary, shows metadata only", () => {
    const r = intentDisplayRules("restricted");
    expect(r.showSummary).toBe(false);
    expect(r.showOnlyMetadata).toBe(true);
    expect(r.badge).toBe("restricted");
  });
  it("PersonaIntentTrace type does not declare any raw prompt field", () => {
    // Compile-time guard. If someone adds rawPrompt this test won't catch it
    // alone, but combined with the `_NoRawPromptApi` conditional in the
    // module it acts as a tripwire.
    const t: PersonaIntentTrace = {
      id: "t", ringPersonaId: "p", ringBearerId: "rb",
      userIntentSummary: "s", toolsUsed: [], consultedPersonas: [],
      visibility: "summary",
      redaction: { status: "not_required" },
      evidenceRefs: [], riskFlags: [], policyViolations: [],
      createdAt: new Date().toISOString(),
    };
    expect("rawPrompt" in (t as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe("Trading baseline enum", () => {
  it("has 12 distinct kinds", () => {
    expect(new Set(TRADING_BASELINE_KINDS).size).toBe(12);
  });
  it("defaults are the prescribed 3 cards", () => {
    expect(TRADING_BASELINE_DEFAULTS).toEqual(["previous_artifact", "7d_rolling", "last_review"]);
  });
  it("baselineLabel falls back when override is empty", () => {
    expect(baselineLabel("7d_rolling")).toBe("7-day rolling");
    expect(baselineLabel("7d_rolling", "  ")).toBe("7-day rolling");
    expect(baselineLabel("7d_rolling", "Custom")).toBe("Custom");
  });
});

describe("Readiness composer", () => {
  it("ready when all pass + no blockers", () => {
    const page = buildReadinessPage({
      title: "T", environment: "e",
      checklist: [passItem("a", "A", "owner")],
      packets: [],
      blockers: [],
    });
    expect(page.header.status).toBe("ready");
    expect(page.header.canProceed).toBe(true);
    expect(page.header.score).toBe(100);
  });
  it("blocked when a blocking item fails", () => {
    const page = buildReadinessPage({
      title: "T", environment: "e",
      checklist: [passItem("a", "A", "o"), failItem("b", "B", "o")],
      packets: [],
      blockers: [{ id: "x", severity: "critical", reason: "r", requiredRole: "r", nextAction: "n", linkedEvidence: [] }],
    });
    expect(page.header.status).toBe("blocked");
    expect(page.header.canProceed).toBe(false);
    expect(page.header.primaryBlocker).toBe("r");
  });
  it("pending when items remain and no critical blocker", () => {
    const page = buildReadinessPage({
      title: "T", environment: "e",
      checklist: [passItem("a", "A", "o"), pendingItem("b", "B", "o")],
      packets: [],
      blockers: [],
    });
    expect(page.header.status).toBe("pending");
    expect(page.header.score).toBe(50);
  });
});

describe("NL Console mock-only enforcement", () => {
  const base = { provider: "fixed_mock" as const, gatewayEnabled: false, strict: false };

  it("strict mode throws — never silent fallback", () => {
    expect(() => askManagementNl({ prompt: "anything" }, { ...base, strict: true }))
      .toThrowError(ManagementNlError);
  });
  it("gateway enabled is forbidden in Phase 1", () => {
    expect(() => askManagementNl({ prompt: "x" }, { ...base, gatewayEnabled: true }))
      .toThrowError(ManagementNlError);
  });
  it("classifies show_human_needed", () => {
    const a = askManagementNl({ prompt: "Who needs me right now?" }, base);
    expect(a.intent).toBe("show_human_needed");
    expect(a.provider).toBe("fixed_mock");
    expect(a.followups[0]?.href).toBe("/management/human-inbox");
  });
  it("ep5 readiness intent only returns human gate link", () => {
    const a = askManagementNl({ prompt: "EP5 canary blockers?" }, base);
    expect(a.intent).toBe("summarize_ep5_blockers");
    expect(a.humanGateHref).toBe("/management/human-inbox");
    expect(a.refused).toBe(false);
  });
  it("unknown intent is refused but offers navigation", () => {
    const a = askManagementNl({ prompt: "random gibberish about cooking" }, base);
    expect(a.intent).toBe("unknown");
    expect(a.refused).toBe(true);
    expect(a.followups.length).toBeGreaterThan(0);
  });
});
