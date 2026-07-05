import { describe, expect, it } from "vitest";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import {
  personaFleetArtifactHref,
  personaFleetDataSourcesHref,
  personaFleetHumanGateHref,
  personaFleetMutationHref,
  personaFleetOodaHref,
  personaFleetPerformanceHref,
  personaFleetPersonaHref,
  personaFleetResearchHref,
  personaFleetResearchItems,
  personaFleetRuntimeHref,
} from "./personaFleetLinks";
import { PERSONA_FLEET_ACTION_LABELS } from "./personaFleetActionLabels";
import { visibleDataSources } from "./personaFleetDataSources";
import { filterEvolutionJournalRowsForFocus } from "./evolutionJournalFocus";

describe("PersonaFleetPage data source badges", () => {
  it("prioritizes readable providers and keeps every declared source visible", () => {
    const row = {
      dataSources: [
        { providerKey: "twse", provider: "TWSE OpenAPI", status: "read_unavailable" },
        { providerKey: "tpex", provider: "TPEx E-Data", status: "read_unavailable" },
        { providerKey: "mops", provider: "MOPS", status: "public_reference_unavailable" },
        { providerKey: "tej", provider: "TEJ API", status: "credential_unavailable" },
        { providerKey: "shioaji", provider: "Shioaji quote", status: "read_ok" },
      ],
    } as unknown as ManagementPersonaFleetRow;

    expect(visibleDataSources(row).map((source) => source.providerKey)).toEqual([
      "shioaji",
      "twse",
      "tpex",
      "mops",
      "tej",
    ]);
  });

  it("builds visible providers from live snake_case status payloads", () => {
    const row = {
      dataSourceStatus: {
        provider_statuses: {
          kraken: "datasource_smoke_ok",
          coingecko: "read_ok",
        },
        live_source_connector_ids: ["crypto-coingecko-spot"],
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(visibleDataSources(row).map((source) => `${source.providerKey}:${source.status}`)).toEqual([
      "kraken:datasource_smoke_ok",
      "coingecko:read_ok",
      "crypto-coingecko-spot:declared",
    ]);
  });

  it("does not fabricate provider chips from provider status counts", () => {
    const row = {
      dataSourceStatus: {
        state: "datasource_smoke_ok",
        providerStatuses: {},
        providerStatusCounts: {
          datasource_smoke_ok: 1,
          read_unavailable: 1,
        },
        providerCount: 2,
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(visibleDataSources(row)).toEqual([]);
  });

  it("uses dataSourceSummary entries as individual provider chips", () => {
    const row = {
      dataSourceSummary: {
        state: "datasource_smoke_ok",
        providerStatusCounts: {
          datasource_smoke_ok: 2,
        },
        entries: [
          { providerKey: "kraken", provider: "Kraken REST", status: "datasource_smoke_ok" },
          { provider_key: "coingecko", provider: "CoinGecko", status: "read_ok" },
        ],
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(visibleDataSources(row).map((source) => `${source.providerKey}:${source.status}`)).toEqual([
      "kraken:datasource_smoke_ok",
      "coingecko:read_ok",
    ]);
  });
});

describe("PersonaFleetPage deep links", () => {
  it("uses explicit action labels for linked fleet cells", () => {
    expect(Object.values(PERSONA_FLEET_ACTION_LABELS)).toEqual([
      "查看資料來源",
      "查看研究",
      "查看績效",
      "Mutation 日誌",
      "人類收件匣",
      "狀態詳情",
    ]);
  });

  it("links a row to represented management surfaces", () => {
    const row = {
      personaId: "persona/tw equity",
      ooda: "Decide",
      perfDelta: 0.095,
      humanNeeded: true,
      lastMutation: "2026-06-07",
      currentResearchProjects: [
        {
          projectId: "MGMT-QLIB-006",
          title: "Qlib TW cross-sectional equity alpha admission linkage",
          stage: "management_review_linked",
          frameworks: ["qlib"],
          artifactId: "qlib-tw-cross-sectional-alpha-model-draft-v1",
          experimentId: "exp-mgmt-qlib-006",
          blockedByTaskIds: [],
          canDeploy: false,
        },
      ],
      linkTargets: {
        persona: "/management/personas/persona%2Ftw%20equity",
        dataSources: "/management/data-sources?persona=persona%2Ftw%20equity",
        research: "/management/experiments/exp-mgmt-qlib-006",
        artifact: "/management/artifacts/qlib-tw-cross-sectional-alpha-model-draft-v1",
        performance: "/management/performance-attribution?dimension=persona&persona=persona%2Ftw%20equity",
        mutation: "/management/evolution-journal?persona=persona%2Ftw%20equity",
        humanGate: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona%2Ftw%20equity",
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetPersonaHref(row)).toBe("/management/personas/persona%2Ftw%20equity");
    expect(personaFleetResearchHref(row)).toBe("/management/experiments/exp-mgmt-qlib-006");
    expect(personaFleetArtifactHref(row)).toBe(
      "/management/artifacts/qlib-tw-cross-sectional-alpha-model-draft-v1",
    );
    expect(personaFleetDataSourcesHref(row)).toBe(
      "/management/data-sources?persona=persona%2Ftw%20equity",
    );
    expect(personaFleetPerformanceHref(row)).toBe(
      "/management/performance-attribution?dimension=persona&persona=persona%2Ftw%20equity",
    );
    expect(personaFleetMutationHref(row)).toBe(
      "/management/evolution-journal?persona=persona%2Ftw%20equity",
    );
    expect(personaFleetHumanGateHref(row)).toBe(
      "/management/human-inbox/readiness_blocker%3Apersona%3Apersona%2Ftw%20equity",
    );
    expect(personaFleetOodaHref(row)).toBe(
      "/management/human-inbox/readiness_blocker%3Apersona%3Apersona%2Ftw%20equity",
    );
  });

  it("routes OODA stages through canonical targets", () => {
    const baseRow = {
      personaId: "persona-tw-live",
      currentResearchProjects: [
        {
          projectId: "MGMT-QLIB-006",
          title: "Qlib TW cross-sectional equity alpha admission linkage",
          stage: "management_review_linked",
          frameworks: ["qlib"],
          experimentId: "exp-mgmt-qlib-006",
          blockedByTaskIds: [],
          canDeploy: false,
        },
      ],
      linkTargets: {
        observe: "/management/data-sources?persona=persona-tw-live",
        orient: "/management/experiments/exp-canonical-orient",
        decide: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-tw-live",
        act: "/management/runtimes?persona=persona-tw-live&runtime=rt-canonical-act",
        learn: "/management/evolution-journal?persona=persona-tw-live",
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetOodaHref({ ...baseRow, ooda: "Observe" })).toBe(
      "/management/data-sources?persona=persona-tw-live",
    );
    expect(personaFleetOodaHref({ ...baseRow, ooda: "Orient" })).toBe(
      "/management/experiments/exp-canonical-orient",
    );
    expect(personaFleetOodaHref({ ...baseRow, ooda: "Decide" })).toBe(
      "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-tw-live",
    );
    expect(personaFleetOodaHref({ ...baseRow, ooda: "Act" })).toBe(
      "/management/runtimes?persona=persona-tw-live&runtime=rt-canonical-act",
    );
    expect(personaFleetOodaHref({ ...baseRow, ooda: "Learn" })).toBe(
      "/management/evolution-journal?persona=persona-tw-live",
    );
  });

  it("uses canonical runtime targets instead of persona-only Act links", () => {
    const row = {
      personaId: "persona-tw-live",
      ooda: "Act",
      runtime_id: "rt-rescue-0260528-5937dea1",
      runtime_binding_id: "rb-433f2a614995432b9e7a463c882dbefb",
      linkTargets: {
        act: "/management/runtimes?persona=persona-tw-live&runtime=rt-rescue-0260528-5937dea1&binding=rb-433f2a614995432b9e7a463c882dbefb",
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetRuntimeHref(row)).toBe(
      "/management/runtimes?persona=persona-tw-live&runtime=rt-rescue-0260528-5937dea1&binding=rb-433f2a614995432b9e7a463c882dbefb",
    );
    expect(personaFleetOodaHref(row)).toBe(
      "/management/runtimes?persona=persona-tw-live&runtime=rt-rescue-0260528-5937dea1&binding=rb-433f2a614995432b9e7a463c882dbefb",
    );
  });

  it("builds links from slim live persona fleet rows without linkTargets", () => {
    const row = {
      id: "persona-20260528-5937dea1",
      persona_id: "persona-20260528-5937dea1",
      name: "TW-Index-Arbitrage",
      ooda: "Decide",
      runtime_id: "runtime-tw-equity-paper",
      runtime_binding_id: "runtime-tw-equity-paper",
      inbox_id: "human_gate_review:approval-rescue-0260528-5937dea1",
      review: {
        route: "/bff/management/human-inbox/human_gate_review:approval-rescue-0260528-5937dea1",
      },
      links: {
        detail: "/personas/persona-20260528-5937dea1",
        runtime: "/management/runtimes/runtime-tw-equity-paper",
      },
      research_status: {
        stage: "management_review_linked",
        framework: "qlib",
        frameworks: ["qlib"],
        framework_count: 3,
        experiment_id: "exp-mgmt-qlib-006",
        artifact_id: "qlib-tw-cross-sectional-alpha-model-draft-v1",
        pending_task_ids: [],
        can_deploy: false,
      },
    } as unknown as ManagementPersonaFleetRow;

    const [item] = personaFleetResearchItems(row);

    expect(personaFleetPersonaHref(row)).toBe("/management/personas/persona-20260528-5937dea1");
    expect(personaFleetResearchHref(row, item)).toBe("/management/experiments/exp-mgmt-qlib-006");
    expect(personaFleetArtifactHref(row, item)).toBeNull();
    const shioaji = {
      providerKey: "shioaji",
      provider: "Shioaji quote",
      status: "read_ok",
    } as NonNullable<ManagementPersonaFleetRow["dataSources"]>[number];

    expect(personaFleetDataSourcesHref(row, shioaji)).toBe(
      "/management/data-sources?persona=persona-20260528-5937dea1&source=shioaji",
    );
    expect(personaFleetHumanGateHref(row)).toBe(
      "/management/human-inbox?persona=persona-20260528-5937dea1",
    );
    expect(personaFleetRuntimeHref(row)).toBe(
      "/management/runtimes?persona=persona-20260528-5937dea1&runtime=runtime-tw-equity-paper&binding=runtime-tw-equity-paper",
    );
    expect(personaFleetOodaHref(row)).toBe(
      "/management/human-inbox?persona=persona-20260528-5937dea1",
    );
  });

  it("accepts snake_case canonical link_targets from live rows", () => {
    const row = {
      personaId: "persona-snake-case",
      ooda: "Observe",
      link_targets: {
        data_sources: "/management/data-sources?persona=persona-snake-case",
        performance_attribution: "/management/performance-attribution?dimension=persona&persona=persona-snake-case",
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetDataSourcesHref(row)).toBe("/management/data-sources?persona=persona-snake-case");
    expect(personaFleetPerformanceHref(row)).toBe(
      "/management/performance-attribution?dimension=persona&persona=persona-snake-case",
    );
    expect(personaFleetOodaHref(row)).toBe("/management/data-sources?persona=persona-snake-case");
  });

  it("uses each provider key for data-source chip hrefs instead of the row primary source", () => {
    const row = {
      personaId: "persona-20260528-ba7de5a4",
      linkTargets: {
        dataSources: "/management/data-sources?persona=persona-20260528-ba7de5a4&source=mops",
      },
    } as unknown as ManagementPersonaFleetRow;
    const shioaji = { providerKey: "shioaji", provider: "Shioaji quote", status: "read_ok" };
    const mops = { providerKey: "mops", provider: "MOPS", status: "public_reference_unavailable" };

    expect(personaFleetDataSourcesHref(row)).toBe(
      "/management/data-sources?persona=persona-20260528-ba7de5a4",
    );
    expect(personaFleetDataSourcesHref(row, shioaji)).toBe(
      "/management/data-sources?persona=persona-20260528-ba7de5a4&source=shioaji",
    );
    expect(personaFleetDataSourcesHref(row, mops)).toBe(
      "/management/data-sources?persona=persona-20260528-ba7de5a4&source=mops",
    );
  });

  it("does not use nan or not declared values in synthesized data-source hrefs", () => {
    const row = {
      personaId: "not declared",
      linkTargets: {
        dataSources: "/management/data-sources?persona=not%20declared&source=mops",
      },
    } as unknown as ManagementPersonaFleetRow;
    const source = { providerKey: "shioaji", provider: "Shioaji quote", status: "read_ok" };

    expect(personaFleetDataSourcesHref(row)).toBeNull();
    expect(personaFleetDataSourcesHref(row, source)).toBeNull();
  });

  it("does not fabricate a research-loop project link when no canonical target exists", () => {
    const row = {
      personaId: "persona-crypto",
      currentResearchProjects: [
        {
          projectId: "research-crypto-paper-001",
          title: "paper broker sandbox readback",
          stage: "act",
          frameworks: ["vectorbt"],
          blockedByTaskIds: [],
          canDeploy: false,
        },
      ],
    } as ManagementPersonaFleetRow;

    expect(personaFleetResearchHref(row)).toBeNull();
    expect(personaFleetArtifactHref(row)).toBeNull();
  });

  it("uses snake_case live research project fields for detail links and labels", () => {
    const row = {
      personaId: "persona-tw-live",
      current_research_projects: [
        {
          project_id: "MGMT-QLIB-006",
          title: "Qlib TW cross-sectional equity alpha admission linkage",
          stage: "management_review_linked",
          frameworks: ["qlib", "vectorbt"],
          artifact_id: "qlib-tw-cross-sectional-alpha-model-draft-v1",
          experiment_id: "exp-mgmt-qlib-006",
          blocked_by_task_ids: ["MGMT-QLIB-003"],
          can_deploy: false,
        },
      ],
      linkTargets: {
        research: "/management/experiments/exp-mgmt-qlib-006",
        artifact: "/management/artifacts/qlib-tw-cross-sectional-alpha-model-draft-v1",
      },
    } as unknown as ManagementPersonaFleetRow;

    const [item] = personaFleetResearchItems(row);

    expect(item.title).toBe("Qlib TW cross-sectional equity alpha admission linkage");
    expect(item.canDeploy).toBe(false);
    expect(personaFleetResearchHref(row, item)).toBe("/management/experiments/exp-mgmt-qlib-006");
    expect(personaFleetArtifactHref(row, item)).toBe(
      "/management/artifacts/qlib-tw-cross-sectional-alpha-model-draft-v1",
    );
  });

  it("keeps summary-only research rows as structured research items", () => {
    const row = {
      personaId: "persona-crypto",
      currentWork: "paper broker sandbox readback and funding-rate stress review",
      researchStatus: {
        stage: "act",
        framework: "vectorbt",
        frameworks: ["vectorbt"],
        frameworkCount: 3,
        artifactId: "artifact-crypto-trend-carry-v1",
        pendingTaskIds: [],
        canDeploy: false,
      },
    } as ManagementPersonaFleetRow;

    const [item] = personaFleetResearchItems(row);

    expect(item).toMatchObject({
      title: "paper broker sandbox readback and funding-rate stress review",
      stage: "act",
      frameworks: ["vectorbt"],
      frameworkCount: 3,
      artifactId: "artifact-crypto-trend-carry-v1",
      canDeploy: false,
    });
  });

  it("does not fabricate a persona-scoped research loop when there is no active project target", () => {
    const row = {
      personaId: "persona-live-without-project",
    } as ManagementPersonaFleetRow;

    expect(personaFleetResearchHref(row)).toBeNull();
  });

  it("does not turn nan values into hrefs or filter keys", () => {
    const row = {
      personaId: "nan",
      ooda: "Observe",
      perfDelta: 0.12,
    } as ManagementPersonaFleetRow;
    const source = { providerKey: "nan", provider: "nan", status: "nan" } as NonNullable<ManagementPersonaFleetRow["dataSources"]>[number];

    expect(personaFleetPersonaHref(row)).toBeNull();
    expect(personaFleetDataSourcesHref(row, source)).toBeNull();
    expect(personaFleetPerformanceHref(row)).toBeNull();
    expect(personaFleetOodaHref(row)).toBeNull();
  });

  it("keeps performance display unlinkable when no canonical performance target exists", () => {
    const row = {
      personaId: "persona-with-performance",
      perfDelta: 0.42,
    } as ManagementPersonaFleetRow;

    expect(personaFleetPerformanceHref(row)).toBeNull();
  });

  it("ignores legacy unvalidated links when no canonical link target exists", () => {
    const row = {
      personaId: "persona-with-stale-runtime",
      ooda: "Act",
      links: {
        runtime: "/management/runtimes/runtime-stale",
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetRuntimeHref(row)).toBeNull();
    expect(personaFleetOodaHref(row)).toBeNull();
  });
});

describe("EvolutionJournalPage focus filtering", () => {
  it("does not fall back to global evolution items when persona focus misses", () => {
    type EvolutionEntry = Parameters<typeof filterEvolutionJournalRowsForFocus>[0][number];
    const rows: EvolutionEntry[] = [{
      id: "mutation-crypto",
      title: "Crypto mutation review",
      summary: "persona-crypto approved",
      status: "approved",
    }];

    const focus = filterEvolutionJournalRowsForFocus(rows, {
      personaFocus: "persona-tw",
    });

    expect(focus.matched).toBe(false);
    expect(focus.rows).toEqual([]);
  });
});
