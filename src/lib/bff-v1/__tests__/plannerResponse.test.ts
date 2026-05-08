// Planner Response §A2 / §A3 / §B4 — contract alignment tests.
import { describe, it, expect } from "vitest";
import {
  ACTION_COMMAND_STATUSES,
  isActionCommandStatus,
  EVIDENCE_CAPABILITY_MAP,
  type EvidenceKind,
  type RedactedEvidenceRef,
} from "../dto";
import { ERROR_CODES } from "@/lib/v4/errorCodes";
import { SSE_CHANNELS, SSE_CHANNEL_SCOPES } from "../sse/channels";
import { TYPED_SSE_CHANNELS, isTypedSseChannel } from "../sse/payloads";

describe("Planner Response §A1 — ActionCommandStatus", () => {
  it("is the canonical 3-value enum", () => {
    expect(ACTION_COMMAND_STATUSES).toEqual(["accepted", "queued", "completed"]);
    expect(isActionCommandStatus("accepted")).toBe(true);
    expect(isActionCommandStatus("done")).toBe(false);
  });
});

describe("Planner Response §A2 — ErrorCode v26 master", () => {
  it("includes the 3 H2-added codes as canonical (no longer superset)", () => {
    expect(ERROR_CODES).toContain("RESOURCE_NOT_FOUND");
    expect(ERROR_CODES).toContain("APPROVAL_REQUIRED");
    expect(ERROR_CODES).toContain("CONFIRM_TOKEN_REVOKED");
    expect(ERROR_CODES.length).toBe(26);
  });
});

describe("Planner Response §A3 — Evidence capability map", () => {
  it("covers the 15 planner kinds + 4 v5 kinds + 3 legacy", () => {
    const plannerCanonical: EvidenceKind[] = [
      "alert", "incident", "job", "audit", "metric", "strategy",
      "persona", "deployment", "runtime", "policy", "approval",
      "artifact", "signal", "journal", "postmortem",
    ];
    for (const k of plannerCanonical) {
      expect(EVIDENCE_CAPABILITY_MAP[k]).toBeTruthy();
    }
    expect(EVIDENCE_CAPABILITY_MAP.loop_run).toBe("loop.read");
    expect(EVIDENCE_CAPABILITY_MAP.ask_session).toBe("agora.ask");
  });

  it("RedactedEvidenceRef supports both detail union and planner alias", () => {
    const ref: RedactedEvidenceRef = {
      kind: "incident",
      id: "inc_1",
      redacted: true,
      reason: "CAPABILITY_MISSING",
      redactionReasonCode: "INSUFFICIENT_CAPABILITY",
      capabilityRequired: "risk.incident.read",
    };
    expect(ref.redacted).toBe(true);
  });
});

describe("Planner Response §B4 — SSE channel catalog 32", () => {
  it("includes the 5 planner additions", () => {
    for (const c of ["confirm_token", "cooldown", "transition", "rollback", "handoff"] as const) {
      expect(SSE_CHANNELS).toContain(c);
      expect(SSE_CHANNEL_SCOPES[c]).toBeTruthy();
    }
    expect(SSE_CHANNELS.length).toBe(32);
  });

  it("typed channels narrow correctly", () => {
    expect(TYPED_SSE_CHANNELS.length).toBe(7);
    expect(isTypedSseChannel("approval")).toBe(true);
    expect(isTypedSseChannel("strategy")).toBe(false);
  });
});
