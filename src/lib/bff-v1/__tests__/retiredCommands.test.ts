import { describe, expect, it } from "vitest";
import {
  buildRunActionCommand,
  bffWrites,
  ENTITY_COMMAND_SPECS,
  OPERATIONS_COMMAND_TYPES,
} from "@/lib/bff-v1/writes";

/**
 * Pinned backend retired commands from Pantheon:
 * Repo commit: 7b0b5cd00110c759f672c4e582453c28ef0eb0c4
 * Source: services/control-plane/bff/command_adapters/retired.py
 *
 * Backend 410 ACTION_RETIRED is the single runtime authority.
 * This test pins the exact 15 retired commands (including CreateDeployment)
 * to prove disjointness from the outside without a production duplicate list.
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
  "CreateDeployment",
] as const;

/**
 * Exhaustive enumeration from the outside of every command name the frontend can emit in production source:
 * - Every command configured in ENTITY_COMMAND_SPECS (12 distinct command names)
 * - Every command in OPERATIONS_COMMAND_TYPES (8 distinct command names)
 * - Every other command literal passed to command builder or submitCommand in production source:
 *   - "EvidenceRefAction" (src/lib/bff-v1/evidenceOperations.ts:46)
 *   - "ApproveEvolutionDecision" (src/lib/bff-v1/writes.ts:1280 in evolutionReviewDecisionPayload)
 */
export const FRONTEND_EMITTED_COMMANDS = [
  // 1. Commands emitted via ENTITY_COMMAND_SPECS
  "StrategyAction",
  "PersonaAction",
  "CapitalPoolAction",
  "RebalanceAction",
  "DeploymentAction",
  "RuntimeAction",
  "ReviewAction",
  "RiskAlertAction",
  "IncidentAction",
  "EvolutionProgramAction",
  "ExperimentAction",
  "JobAction",

  // 2. Commands emitted via OPERATIONS_COMMAND_TYPES
  "Observe",
  "PausePaperRuntime",
  "ResumePaperRuntime",
  "Demote",
  "PromoteCandidate",
  "RebalanceProposal",
  "ApprovedApply",
  "EmergencyContainment",

  // 3. Other command literals passed to command builder or submitCommand in production source
  "EvidenceRefAction",
  "ApproveEvolutionDecision",
] as const;

describe("FE retired backend commands safety gate", () => {
  it("pins the exact backend retired command list (all 15 entries) from pantheon dev commit", () => {
    expect(PANTHEON_DEV_COMMIT).toBe("7b0b5cd00110c759f672c4e582453c28ef0eb0c4");
    expect(BACKEND_RETIRED_COMMANDS).toHaveLength(15);
    expect(new Set(BACKEND_RETIRED_COMMANDS).size).toBe(15);
    expect(BACKEND_RETIRED_COMMANDS).toContain("CreateDeployment");
  });

  it("proves from the outside that FRONTEND_EMITTED_COMMANDS and BACKEND_RETIRED_COMMANDS are completely disjoint", () => {
    expect(FRONTEND_EMITTED_COMMANDS).toHaveLength(22);
    expect(new Set(FRONTEND_EMITTED_COMMANDS).size).toBe(22);

    for (const cmd of FRONTEND_EMITTED_COMMANDS) {
      expect(BACKEND_RETIRED_COMMANDS).not.toContain(cmd);
    }

    const intersection = FRONTEND_EMITTED_COMMANDS.filter((cmd) =>
      (BACKEND_RETIRED_COMMANDS as readonly string[]).includes(cmd),
    );
    expect(intersection).toEqual([]);
  });

  it("proves all ENTITY_COMMAND_SPECS commands are in FRONTEND_EMITTED_COMMANDS and none is retired", () => {
    const specsCommands = new Set(
      Object.values(ENTITY_COMMAND_SPECS).map((s) => s.command),
    );
    for (const cmd of specsCommands) {
      expect(FRONTEND_EMITTED_COMMANDS).toContain(cmd);
      expect(BACKEND_RETIRED_COMMANDS).not.toContain(cmd);
    }
  });

  it("proves all OPERATIONS_COMMAND_TYPES commands are in FRONTEND_EMITTED_COMMANDS and none is retired", () => {
    for (const cmd of OPERATIONS_COMMAND_TYPES) {
      expect(FRONTEND_EMITTED_COMMANDS).toContain(cmd);
      expect(BACKEND_RETIRED_COMMANDS).not.toContain(cmd);
    }
  });

  it("proves production writes.ts does not export an internal duplicate retirement list", async () => {
    const writesModule = await import("@/lib/bff-v1/writes");
    expect(
      (writesModule as Record<string, unknown>).RETIRED_BACKEND_COMMANDS,
    ).toBeUndefined();
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
        expect(FRONTEND_EMITTED_COMMANDS).toContain(envelope.command);
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

  it("proves bffWrites exports do not expose retired rankingAction, setActiveRankingFormula, or requestReview helpers", () => {
    const exportedKeys = Object.keys(bffWrites);
    expect(exportedKeys).not.toContain("rankingAction");
    expect(exportedKeys).not.toContain("setActiveRankingFormula");
    expect(exportedKeys).not.toContain("requestReview");
  });
});
