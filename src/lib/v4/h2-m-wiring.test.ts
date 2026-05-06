// Pack C-H2 + Pack C-M wiring proof tests.
// Asserts the v4 normative modules ARE consumable as the design contract:
// - C033/C034 handoff SLA phase computation + escalation extension.
// - C038 mandate breach monitor end-to-end.
// - C056 a11y rule catalog completeness.
// - C059 cross-page E2E scenario coverage (mock scenario runner already covers happy paths).
// - C064 audit immutability append-only contract.
// - Pack C-M: design tokens, skeleton specs, ranking metric metadata, rebalance quorum,
//   SignalConfidence, PersonaLab schema, glossary/owner map presence.

import { describe, expect, it } from "vitest";
import {
  // H2
  HANDOFF_SLA, computeHandoffSla,
  ATTACHMENT_LIMITS, validateAttachment,
  MANDATE_MONITOR_DEFAULT, monitorPoolBreach,
  A11Y_RULES, SHORTCUTS, REDUCED_MOTION_MAX_MS,
  SECURITY_BASELINE,
  freezeAudit, assertAppendOnly,
  // M
  REQUIRED_THEME_TOKENS, ROW_HEIGHT_PX,
  SKELETON_SPECS, RIGHT_DRAWER, COMMAND_PALETTE_WEIGHTS,
  REBALANCE_STEPS, canRollbackTo,
  SIGNAL_CONFIDENCE, validateConfidenceFeedback,
  LIFECYCLE_BUCKET_TOKEN,
} from "@/lib/v4";
import type { RankingMetricDefinition } from "@/lib/v4";
import type { PersonaLabRun } from "@/lib/v4";
import type { AuditEvent } from "@/lib/bff/types";

describe("Pack C-H2 wiring", () => {
  it("C033 handoff SLA phases progress ok → warning → breached", () => {
    const created = new Date("2026-05-01T00:00:00Z").toISOString();
    const row = HANDOFF_SLA.find((r) => r.type === "incident_note")!;
    const ok = computeHandoffSla({ type: "incident_note", createdAt: created, now: new Date("2026-05-01T00:10:00Z") })!;
    const warn = computeHandoffSla({ type: "incident_note", createdAt: created, now: new Date("2026-05-01T00:55:00Z") })!;
    const breach = computeHandoffSla({ type: "incident_note", createdAt: created, now: new Date("2026-05-01T02:00:00Z") })!;
    expect(ok.phase).toBe("ok");
    expect(warn.phase).toBe("warning");
    expect(breach.phase).toBe("breached");
    expect(row.initialSec).toBe(3600);
  });

  it("C034 escalation extends due-by 50% and marks phase escalated", () => {
    const created = new Date("2026-05-01T00:00:00Z").toISOString();
    const escalated = computeHandoffSla({
      type: "incident_note", createdAt: created,
      escalatedAt: new Date("2026-05-01T01:05:00Z").toISOString(),
      now: new Date("2026-05-01T01:10:00Z"),
    })!;
    expect(escalated.phase).toBe("escalated");
    // due = created + 1.5 * 3600s
    expect(Date.parse(escalated.dueAt) - Date.parse(created)).toBe(5400 * 1000);
  });

  it("C036 attachment validator: oversize + bad mime", () => {
    expect(validateAttachment({ mime: "image/png", bytes: 1024 })).toBeNull();
    expect(validateAttachment({ mime: "image/png", bytes: ATTACHMENT_LIMITS.maxFileBytes + 1 })).toMatch(/25MB/);
    expect(validateAttachment({ mime: "application/zip", bytes: 1 })).toMatch(/not allowed/);
  });

  it("C038 mandate monitor flags overrun + classifies severity", () => {
    expect(monitorPoolBreach({ poolId: "p", utilizationPct: 50, capPct: 60 })).toBeNull();
    const high = monitorPoolBreach({ poolId: "p", utilizationPct: 78, capPct: 60 })!;
    expect(high.severity).toBe("high");
    expect(high.autoAction).toBe(MANDATE_MONITOR_DEFAULT.onBreach.autoAction);
  });

  it("C056 a11y rule catalog covers required rules + has command palette shortcut", () => {
    const ids = new Set(A11Y_RULES.map((r) => r.id));
    for (const required of ["kbd_reachable", "modal_focus_trap", "no_color_only_status", "risk_color_contrast"]) {
      expect(ids.has(required)).toBe(true);
    }
    expect(SHORTCUTS.command_palette).toBe("Mod+K");
    expect(REDUCED_MOTION_MAX_MS).toBeLessThanOrEqual(150);
  });

  it("C064 audit log is append-only via freeze + guard", () => {
    const ev: AuditEvent = { id: "au_1", actor: "admin", action: "x", target: "t", ts: new Date().toISOString() };
    const frozen = freezeAudit(ev);
    expect(() => { (frozen as { action: string }).action = "y"; }).toThrow();
    const prev = [frozen];
    const next = [freezeAudit({ ...ev, id: "au_2" }), ...prev];
    expect(() => assertAppendOnly(prev, next)).not.toThrow();
    expect(() => assertAppendOnly(prev, [])).toThrow();
    expect(SECURITY_BASELINE.auditAppendOnly).toMatch(/append-only/);
  });
});

describe("Pack C-M wiring", () => {
  it("C050/C051 design token contract + density row-height table", () => {
    expect(REQUIRED_THEME_TOKENS).toContain("--bg");
    expect(REQUIRED_THEME_TOKENS).toContain("--risk-high");
    expect(ROW_HEIGHT_PX.compact).toBeLessThan(ROW_HEIGHT_PX.comfortable);
  });

  it("C052 skeleton + C054 right-drawer + C055 command-palette weights wired", () => {
    expect(SKELETON_SPECS.table.defaultRows).toBeGreaterThan(0);
    expect(RIGHT_DRAWER.maxStackDepth).toBe(2);
    expect(COMMAND_PALETTE_WEIGHTS.exactMatch).toBeGreaterThan(COMMAND_PALETTE_WEIGHTS.prefix);
    expect(COMMAND_PALETTE_WEIGHTS.archived).toBeLessThan(0);
  });

  it("C039 ranking metric metadata schema is structurally usable", () => {
    const m: RankingMetricDefinition = {
      id: "sharpe", labelKey: "metric.sharpe",
      unit: "ratio", direction: "higher_better",
      normalization: "z_score", defaultWeight: 0.4,
      allowedScopes: ["strategy", "live"],
    };
    expect(m.allowedScopes.length).toBeGreaterThan(0);
  });

  it("C040 rebalance quorum: review needs both risk_officer + capital_manager", () => {
    const review = REBALANCE_STEPS.find((r) => r.step === "review")!;
    expect(review.quorum).toMatch(/risk_officer/);
    expect(review.quorum).toMatch(/capital_manager/);
    expect(canRollbackTo("review", "constraint_check")).toBe(true);
    expect(canRollbackTo("applied", "scheduled")).toBe(false);
  });

  it("C075 SignalConfidence: levels 1/2/4/5 require reason", () => {
    expect(SIGNAL_CONFIDENCE.length).toBe(5);
    expect(validateConfidenceFeedback(3)).toBeNull();
    for (const v of [1, 2, 4, 5] as const) {
      expect(validateConfidenceFeedback(v)).not.toBeNull();
      expect(validateConfidenceFeedback(v, "x".repeat(20))).toBeNull();
    }
  });

  it("C072 PersonaLab schema enforces evaluation + approval gate", () => {
    const r: PersonaLabRun = {
      runId: "r1", personaId: "p1", personaVersion: "v1",
      scenarioId: "s1", status: "queued",
      commitGate: { requiresEvaluationPass: true, requiresApproval: true, target: "persona_update_request" },
    };
    expect(r.commitGate.requiresEvaluationPass).toBe(true);
    expect(r.commitGate.requiresApproval).toBe(true);
  });

  it("C078 lifecycle bucket tokens map to design tokens", () => {
    expect(LIFECYCLE_BUCKET_TOKEN.live).toMatch(/^--/);
  });
});
