import { act, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { RealRankingPanel } from "./RealRankingPanel";
import type { AllocationPolicyInputRow, AllocationPolicyLine, ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import type { PersonaLeagueRow } from "@/lib/v5/management/personaLeague";

const mocks = vi.hoisted(() => ({
  personaFleetGet: vi.fn(),
  personaLeagueRankingsLiveOnly: vi.fn(),
  allocationPolicyEvaluate: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    mgmt: {
      ...actual.mgmt,
      personaFleet: { get: mocks.personaFleetGet },
      personaLeague: { ...actual.mgmt.personaLeague, rankingsLiveOnly: mocks.personaLeagueRankingsLiveOnly },
      allocationPolicy: { evaluate: mocks.allocationPolicyEvaluate },
    },
  };
});

void i18n.changeLanguage("en-US");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const fleetRow: ManagementPersonaFleetRow = {
  personaId: "persona-canary-alpha",
  personaName: "Canary Alpha",
  owner: "research-1",
  ooda: "Orient",
  autonomy: "supervised",
  perfDelta: 0.01,
  humanNeeded: false,
  lastMutation: "2026-07-01",
  deploymentStage: "canary_running",
  capitalMode: "canary",
  capitalScope: "canary_sleeve",
  capitalSleeveId: "sleeve-canary-01",
  currentWeight: 0.03,
  bindingState: "bound",
};

const leagueRow: PersonaLeagueRow = {
  personaId: "persona-canary-alpha",
  personaName: "Canary Alpha",
  currentRank: 1,
  tier: "S",
  score: 92,
  scoreBreakdown: {
    pnlScore: 80, sharpeScore: 75, drawdownControlScore: 70, executionQualityScore: 85,
    riskComplianceScore: 90, improvementScore: 60, interventionPenalty: 2, hardPenalty: 0,
  },
  pnlToday: 1000, pnl7d: 5000, pnl30d: 20000, pnlQuarter: 60000, pnlYtd: 100000,
  sharpe: 2.1, maxDrawdown: -0.03, winRate: 0.6, turnover: 1.2, slippageBps: 2,
  fillRatio: 0.98, orderRejectRate: 0.002, riskPolicyViolations: 0, humanInterventions: 0,
  sentinelFindings: 0, mutationCount: 4, improvedMutations: 3, degradedMutations: 1,
  status: "active",
  links: { manageHref: "/management/personas/persona-canary-alpha" },
};

function renderPanel() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <RealRankingPanel />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("RealRankingPanel re-evaluation", () => {
  beforeEach(() => {
    mocks.personaFleetGet.mockReset();
    mocks.personaLeagueRankingsLiveOnly.mockReset();
    mocks.allocationPolicyEvaluate.mockReset();
  });

  it("re-runs allocation-policy evaluation once league scores resolve after fleet rows (fleet-first / league-later)", async () => {
    const fleetDeferred = deferred<ManagementPersonaFleetRow[]>();
    const leagueDeferred = deferred<PersonaLeagueRow[]>();
    mocks.personaFleetGet.mockReturnValue(fleetDeferred.promise);
    mocks.personaLeagueRankingsLiveOnly.mockReturnValue(leagueDeferred.promise);

    const evaluateCalls: AllocationPolicyInputRow[][] = [];
    mocks.allocationPolicyEvaluate.mockImplementation(async (rows: AllocationPolicyInputRow[]) => {
      evaluateCalls.push(rows);
      const line: AllocationPolicyLine = {
        personaId: rows[0].personaId,
        stage: rows[0].stage,
        capitalScope: "real",
        capitalSleeveId: rows[0].capitalSleeveId,
        currentWeight: rows[0].currentWeight ?? 0,
        targetWeight: rows[0].tier === "s" ? 0.06 : 0.03,
        delta: rows[0].tier === "s" ? 0.03 : 0,
        rankScore: 0.5,
        capacityAdjustedScore: 0.5,
        recommendation: "hold",
        capReasons: [],
        exclusions: [],
        evidenceRefs: [],
        requiresHumanApproval: rows[0].tier === "s",
      };
      return [line];
    });

    renderPanel();

    // Fleet resolves first; persona-league is still pending, so buildInputRow has
    // no tier/score-breakdown yet.
    await act(async () => {
      fleetDeferred.resolve([fleetRow]);
    });
    await waitFor(() => expect(evaluateCalls.length).toBeGreaterThanOrEqual(1));
    expect(evaluateCalls[0][0].tier).toBeUndefined();
    expect(evaluateCalls[0][0].pnlScore).toBeUndefined();

    // League resolves after fleet: tier and the score breakdown now populate
    // inputRows, which must trigger a fresh evaluate() call.
    await act(async () => {
      leagueDeferred.resolve([leagueRow]);
    });

    await waitFor(() => expect(evaluateCalls.length).toBeGreaterThanOrEqual(2));
    const lastCall = evaluateCalls[evaluateCalls.length - 1];
    expect(lastCall[0].tier).toBe("s");
    expect(lastCall[0].pnlScore).toBe(80);
    expect(lastCall[0].sharpeScore).toBe(75);

    // The rendered target weight must reflect the re-evaluated (post-league) line,
    // not the stale fleet-only evaluation.
    await waitFor(() => expect(screen.getByText("6.00%")).toBeInTheDocument());
  });
});
