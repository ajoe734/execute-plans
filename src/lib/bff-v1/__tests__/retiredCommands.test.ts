import { describe, expect, it } from "vitest";
import {
  buildRunActionCommand,
  bffWrites,
  RETIRED_BACKEND_COMMANDS,
} from "@/lib/bff-v1/writes";

/**
 * Pinned backend retired commands from Pantheon:
 * Repo commit: 7b0b5cd00110c759f672c4e582453c28ef0eb0c4
 * Source: services/control-plane/bff/command_adapters/retired.py
 */
export const PANTHEON_DEV_COMMIT = "7b0b5cd00110c759f672c4e582453c28ef0eb0c4";
export const PANTHEON_RETIRED_SOURCE =
  "services/control-plane/bff/command_adapters/retired.py";

export const BACKEND_RETIRED_COMMANDS = [
  "ApproveRollback",
  "RejectRollback",
  "RankingAction",
  "RankingFormulaAction",
  "QuarterlyRankingRecommendationSubmit",
  "AuditExport",
  "ToolAction",
  "McpServerAction",
  "SkillAction",
  "HumanGateApprove",
  "HumanGateReject",
  "HumanGateRequestMoreEvidence",
  "HumanGateExtendTtl",
  "RequestReview",
] as const;

describe("FE retired backend commands safety gate", () => {
  it("pins the exact backend retired command list from pantheon dev commit", () => {
    expect(PANTHEON_DEV_COMMIT).toBe("7b0b5cd00110c759f672c4e582453c28ef0eb0c4");
    expect(BACKEND_RETIRED_COMMANDS).toHaveLength(14);
    for (const cmd of BACKEND_RETIRED_COMMANDS) {
      expect(RETIRED_BACKEND_COMMANDS.has(cmd)).toBe(true);
    }
  });

  it("proves that buildRunActionCommand never emits any retired backend command", () => {
    const supportedKinds = [
      "Strategy",
      "Persona",
      "CapitalPool",
      "Rebalance",
      "Deployment",
      "Evolution",
      "Research",
      "Artifact",
      "Channel",
      "Runtime",
      "Job",
    ];

    const actions = [
      "promote",
      "pause",
      "resume",
      "archive",
      "cancel",
      "Observe",
      "PausePaperRuntime",
      "ResumePaperRuntime",
      "Demote",
      "PromoteCandidate",
      "RebalanceProposal",
      "ApprovedApply",
      "EmergencyContainment",
    ];

    for (const kind of supportedKinds) {
      for (const action of actions) {
        const envelope = buildRunActionCommand({
          kind,
          id: "target-1",
          action,
        });

        expect(BACKEND_RETIRED_COMMANDS).not.toContain(envelope.command);
      }
    }
  });

  it("proves buildRunActionCommand does not emit RequestReview when requested as an action", () => {
    const envelope = buildRunActionCommand({
      kind: "Persona",
      id: "p1",
      action: "RequestReview",
    });

    expect(envelope.command).not.toBe("RequestReview");
    expect(BACKEND_RETIRED_COMMANDS).not.toContain(envelope.command);
  });

  it("proves retired capability and ranking kinds do not emit retired commands", () => {
    const retiredKinds = ["Ranking", "RankingFormula", "Tool", "McpServer", "McpTool", "Skill"];

    for (const kind of retiredKinds) {
      const envelope = buildRunActionCommand({
        kind,
        id: "id-1",
        action: "activate",
      });

      expect(envelope.command).not.toBe("RankingAction");
      expect(envelope.command).not.toBe("RankingFormulaAction");
      expect(envelope.command).not.toBe("ToolAction");
      expect(envelope.command).not.toBe("McpServerAction");
      expect(envelope.command).not.toBe("SkillAction");
      expect(BACKEND_RETIRED_COMMANDS).not.toContain(envelope.command);
    }
  });

  it("proves bffWrites exports do not expose retired rankingAction or setActiveRankingFormula helpers", () => {
    const exportedKeys = Object.keys(bffWrites);
    expect(exportedKeys).not.toContain("rankingAction");
    expect(exportedKeys).not.toContain("setActiveRankingFormula");
  });
});
