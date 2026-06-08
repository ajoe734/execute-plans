// 2026-05-22 PM-Live — verifies the mgmt.* façade returns seed shape in mock
// mode and that all 14 mgmt paths are reachable through the helpers.

import { describe, it, expect, beforeEach } from "vitest";
import {
  adaptManagementPersonaFleet,
  mgmt,
  type ManagementPersonaFleetRow,
} from "@/lib/bff-v1/management";
import { paths } from "@/lib/bff-v1/paths";
import { composeCockpit, defaultCockpitSeed } from "@/lib/v5/management/cockpit";
import { defaultPulseRankings } from "@/lib/v5/management/tradingRankings";

beforeEach(() => {
  // Force mock mode regardless of env (matches detectMode test-mode pinning).
});

describe("mgmt façade (PM-Live)", () => {
  it("cockpit.get falls through to seed in mock/test mode", async () => {
    const out = await mgmt.cockpit.get();
    const expected = composeCockpit(defaultCockpitSeed());
    expect(out.strip.fields.length).toBe(expected.strip.fields.length);
    expect(out.loopFlow.nodes.length).toBe(expected.loopFlow.nodes.length);
    expect(out.matrix.phases).toEqual(expected.matrix.phases);
  });

  it("tradingPulse.rankings returns default 8 blocks", async () => {
    const out = await mgmt.tradingPulse.rankings();
    expect(out).toEqual(defaultPulseRankings());
  });

  it("humanInbox.list uses provided seed", async () => {
    const seed = [{ id: "x", kind: "approval" as const }] as never;
    const out = await mgmt.humanInbox.list(() => seed);
    expect(out).toBe(seed);
  });

  it("humanInbox.get uses provided seed for given id", async () => {
    const seed = { id: "abc-1", kind: "approval" } as never;
    const out = await mgmt.humanInbox.get("abc-1", () => seed);
    expect(out).toBe(seed);
  });

  it("readiness helpers all pass seed through", async () => {
    const seed = { header: { title: "t" }, checklist: [], packets: [], blockers: [] } as never;
    for (const fn of [
      mgmt.readiness.ep5, mgmt.readiness.brokerLive,
      mgmt.readiness.capitalBinding, mgmt.readiness.bffHa,
      mgmt.readiness.strictPublish,
    ]) {
      const out = await fn(() => seed);
      expect(out).toBe(seed);
    }
  });

  it("array helpers pass seed through", async () => {
    const seed = [{ id: 1 }, { id: 2 }] as never[];
    expect(await mgmt.evolutionJournal.list(() => seed)).toBe(seed);
    expect(await mgmt.evidence.list(() => seed)).toBe(seed);
    expect(await mgmt.tradingPulse.get(() => seed)).toBe(seed);
    expect(await mgmt.personaIntent.list(() => seed as never)).toBe(seed);
  });

  it("personaFleet.get passes canonical seed through in mock mode", async () => {
    const seed: ManagementPersonaFleetRow[] = [{
      personaId: "persona-tw-equity",
      owner: "pathreon-management",
      ooda: "Decide",
      autonomy: "supervised",
      perfDelta: 0.095,
      humanNeeded: true,
      lastMutation: "2026-06-07",
      state: "needs_human_approval",
    }];
    expect(await mgmt.personaFleet.get(() => seed)).toBe(seed);
  });

  it("adapts Pathreon management fleet envelopes into UI-safe rows", () => {
    const rows = adaptManagementPersonaFleet({
      data: {
        persona_fleet: [
          {
            persona_id: "persona-tw-equity",
            persona_name: "Taiwan Equity Persona",
            owner: "pathreon-management",
            ooda_stage: "decide",
            governance_required: true,
            recommendation: "hold_for_risk_owner_review",
            metrics: { training_improvement_pct: 9.5 },
            updated_at: "2026-06-07T13:00:00Z",
            status: "needs_human_approval",
          },
          {},
        ],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      personaId: "persona-tw-equity",
      personaName: "Taiwan Equity Persona",
      owner: "pathreon-management",
      ooda: "Decide",
      autonomy: "supervised",
      perfDelta: 0.095,
      humanNeeded: true,
      lastMutation: "2026-06-07",
      state: "needs_human_approval",
    });
    expect(Number.isFinite(rows?.[0].perfDelta)).toBe(true);
  });

  it("all 14 mgmt paths exist on paths catalog", () => {
    expect(paths.mgmtCockpit()).toMatch(/management\/cockpit$/);
    expect(paths.mgmtPersonaFleet()).toMatch(/management\/fleet$/);
    expect(paths.mgmtHumanInbox()).toMatch(/human-inbox$/);
    expect(paths.mgmtHumanInboxItem("xyz")).toMatch(/human-inbox\/xyz$/);
    expect(paths.mgmtTradingPulse()).toMatch(/trading-pulse$/);
    expect(paths.mgmtTradingRankings()).toMatch(/trading-pulse\/rankings$/);
    expect(paths.mgmtEvolutionJournal()).toMatch(/evolution-journal$/);
    expect(paths.mgmtEvidenceExplorer()).toMatch(/management\/evidence$/);
    expect(paths.mgmtPersonaIntent()).toMatch(/persona-intent$/);
    expect(paths.mgmtReadinessEp5()).toMatch(/readiness\/ep5$/);
    expect(paths.mgmtReadinessBrokerLive()).toMatch(/readiness\/broker-live$/);
    expect(paths.mgmtReadinessCapitalBinding()).toMatch(/capital-binding-live$/);
    expect(paths.mgmtReadinessBffHa()).toMatch(/bff-ha$/);
    expect(paths.mgmtReadinessStrictPublish()).toMatch(/strict-publish$/);
  });
});
