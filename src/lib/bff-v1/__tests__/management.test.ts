// 2026-05-22 PM-Live — verifies the mgmt.* façade returns seed shape in mock
// mode and that all 14 mgmt paths are reachable through the helpers.

import { describe, it, expect, beforeEach } from "vitest";
import {
  adaptHumanInboxDetail,
  adaptHumanInboxList,
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

  it("adapts live Human Inbox list records to existing FE detail routes", () => {
    const out = adaptHumanInboxList({
      data: {
        items: [
          {
            id: "readiness_blocker:persona:persona-us-equity",
            inboxType: "readiness_blocker",
            title: "Persona needs review: US Equity Persona",
            summary: "paper observation and OOS cost review",
            action_state: "pending",
            can_proceed: false,
            allowed_actions: { can_decide: false },
            route: "/management/persona-fleet?persona=persona-us-equity",
            blocking_reasons: ["Missing validation packet"],
          },
          {
            id: "governance-review:approval-1",
            source_type: "governance_review",
            title: "Governance review: ApprovalDecision",
            route: "/governance-review-queue?item=approval-1",
          },
        ],
      },
    });

    expect(out).toHaveLength(2);
    expect(out?.[0]).toMatchObject({
      id: "readiness_blocker:persona:persona-us-equity",
      kind: "readiness_blocker",
      canDecide: false,
      canProceed: false,
      detailHref: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-us-equity",
      blockingReasons: ["Missing validation packet"],
      links: {
        manageHref: "/management/persona-fleet?persona=persona-us-equity",
        recommendedActionHref: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-us-equity",
      },
    });
    expect(out?.[1]).toMatchObject({
      kind: "approval",
      detailHref: "/management/human-inbox/governance-review%3Aapproval-1",
      links: {
        manageHref: "/management/governance?item=approval-1",
      },
    });
  });

  it("adapts live Human Inbox detail records with safe detail-page defaults", () => {
    const out = adaptHumanInboxDetail({
      data: {
        item: {
          id: "readiness_blocker:persona:persona-crypto",
          source_type: "readiness_blocker",
          title: "Persona needs review: Crypto Persona",
          summary: "paper broker sandbox readback and funding-rate stress review",
          canProceed: false,
          allowedActions: { canDecide: false },
          route: "/management/persona-fleet?persona=persona-crypto",
          evidence_refs: ["support/evidence/research/crypto.json"],
        },
      },
    });

    expect(out).toMatchObject({
      id: "readiness_blocker:persona:persona-crypto",
      kind: "readiness_blocker",
      decisionType: "single",
      signatures: [],
      evidenceRefs: ["support/evidence/research/crypto.json"],
      decisionHistory: [],
      auditRefs: [],
      detailHref: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-crypto",
      links: {
        manageHref: "/management/persona-fleet?persona=persona-crypto",
      },
    });
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
            data_source_status: {
              state: "partial_readback",
              provider_statuses: {
                twse: "read_unavailable",
                tpex: "read_unavailable",
                mops: "public_reference_unavailable",
                tej: "credential_unavailable",
                shioaji: "read_ok",
              },
              readback_refs: ["support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-quote-readback/shioaji.json"],
              unavailable_refs: ["support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-uncredentialed/twse.json"],
              live_ingestion_enabled: false,
              order_side_effects_allowed: false,
              capital_side_effects_allowed: false,
            },
            data_sources: [
              {
                provider_key: "shioaji",
                provider: "Shioaji quote",
                source_class: "broker_execution",
                status: "read_ok",
                evidence_ref: "support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-quote-readback/shioaji.json",
                order_path: "disabled_for_marketdata_smoke",
                order_capable_provider: true,
                read_only: true,
                order_side_effects_allowed: false,
                capital_side_effects_allowed: false,
              },
              {
                provider_key: "twse",
                provider: "TWSE OpenAPI",
                source_class: "official_reference",
                status: "read_unavailable",
                evidence_ref: "support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-uncredentialed/twse.json",
                order_path: "not_applicable",
              },
            ],
            research_status: {
              stage: "management_review_linked",
              framework: "qlib",
              frameworks: ["qlib", "vectorbt"],
              experiment_id: "exp-mgmt-qlib-006",
              artifact_id: "qlib-tw-cross-sectional-alpha-model-draft-v1",
              registry_admission_status: "pending_upstream_task",
              pending_task_ids: ["MGMT-QLIB-003", "MGMT-QLIB-005"],
              can_deploy: false,
            },
            current_research_projects: [
              {
                project_id: "MGMT-QLIB-006",
                title: "Qlib TW cross-sectional equity alpha admission linkage",
                stage: "management_review_linked",
                frameworks: ["qlib", "vectorbt"],
                artifact_id: "qlib-tw-cross-sectional-alpha-model-draft-v1",
                experiment_id: "exp-mgmt-qlib-006",
                blocked_by_task_ids: ["MGMT-QLIB-003", "MGMT-QLIB-005"],
                can_deploy: false,
              },
            ],
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
    expect(rows?.[0].dataSourceStatus).toMatchObject({
      state: "partial_readback",
      providerStatuses: {
        twse: "read_unavailable",
        shioaji: "read_ok",
      },
      liveIngestionEnabled: false,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
    });
    expect(rows?.[0].dataSources?.map((source) => source.providerKey)).toEqual(["shioaji", "twse"]);
    expect(rows?.[0].researchStatus).toMatchObject({
      stage: "management_review_linked",
      framework: "qlib",
      experimentId: "exp-mgmt-qlib-006",
      artifactId: "qlib-tw-cross-sectional-alpha-model-draft-v1",
      registryAdmissionStatus: "pending_upstream_task",
      canDeploy: false,
    });
    expect(rows?.[0].currentResearchProjects?.[0]).toMatchObject({
      projectId: "MGMT-QLIB-006",
      artifactId: "qlib-tw-cross-sectional-alpha-model-draft-v1",
      blockedByTaskIds: ["MGMT-QLIB-003", "MGMT-QLIB-005"],
      canDeploy: false,
    });
    expect(Number.isFinite(rows?.[0].perfDelta)).toBe(true);
  });

  it("all 14 mgmt paths exist on paths catalog", () => {
    expect(paths.mgmtCockpit()).toMatch(/management\/cockpit$/);
    expect(paths.mgmtPersonaFleet()).toMatch(/management\/persona-fleet$/);
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
