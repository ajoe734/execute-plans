import { describe, expect, it } from "vitest";
import type { ManagementPersonaFleetRow, ManagementDataSource } from "@/lib/bff-v1/management";
import {
  personaFleetArtifactHref,
  personaFleetCapitalHref,
  personaFleetDataSourcesHref,
  personaFleetHumanGateHref,
  personaFleetMutationHref,
  personaFleetOodaHref,
  personaFleetPerformanceHref,
  personaFleetPersonaHref,
  personaFleetRankHref,
  personaFleetResearchHref,
  personaFleetResearchLoopHref,
  personaFleetResearchItems,
  personaFleetRuntimeHref,
} from "./personaFleetLinks";
import { PERSONA_FLEET_ACTION_LABELS } from "./personaFleetActionLabels";
import { visibleDataSources } from "./personaFleetDataSources";
import { filterEvolutionJournalRowsForFocus, normalizeEvolutionFocusToken } from "./evolutionJournalFocus";

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
        capitalPool: "/management/governance-decisions?tab=capital&capital_id=pool-tw-paper",
        dataSources: "/management/data-sources?persona=persona%2Ftw%20equity",
        research: "/management/experiments/exp-mgmt-qlib-006",
        artifact: "/management/artifacts/qlib-tw-cross-sectional-alpha-model-draft-v1",
        performance: "/management/performance?tab=attribution&dimension=persona&persona=persona%2Ftw%20equity",
        mutation: "/management/evolution-journal?persona=persona%2Ftw%20equity",
        humanGate: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona%2Ftw%20equity",
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetPersonaHref(row)).toBe("/management/personas/persona%2Ftw%20equity");
    expect(personaFleetCapitalHref(row)).toBe("/management/performance?tab=overview&persona_id=persona%2Ftw+equity");
    expect(personaFleetResearchHref(row)).toBe("/management/experiments/exp-mgmt-qlib-006");
    expect(personaFleetArtifactHref(row)).toBe(
      "/management/artifacts/qlib-tw-cross-sectional-alpha-model-draft-v1",
    );
    expect(personaFleetDataSourcesHref(row)).toBe(
      "/management/data-sources?persona=persona%2Ftw%20equity",
    );
    expect(personaFleetPerformanceHref(row)).toBe(
      "/management/performance?tab=attribution&dimension=persona&persona=persona%2Ftw%20equity",
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

  it("routes paper persona rank links to the standalone quarterly ranking", () => {
    const row = {
      personaId: "persona-paper-alpha",
      capitalMode: "paper",
      paperLedgerId: "paper-ledger-persona-paper-alpha",
      linkTargets: {
        rank: "/management/promotion-allocation?tab=real-ranking&persona=persona-paper-alpha",
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetRankHref(row)).toBe(
      "/management/rankings?tab=quarterly&persona=persona-paper-alpha",
    );
  });

  it("routes live persona rank links to the standalone Persona League", () => {
    const row = {
      personaId: "persona-live-alpha",
      capitalMode: "live",
      capitalPoolId: "pool-live-alpha",
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetRankHref(row)).toBe(
      "/management/rankings?tab=rolling&persona=persona-live-alpha",
    );
  });

  it("keeps capital links on persona performance even when stale link targets point at promotion", () => {
    const row = {
      personaId: "persona-paper-capital",
      capitalMode: "paper",
      paperCapitalPoolId: "pool-paper-alpha",
      paperLedgerId: "paper-ledger-persona-paper-capital",
      linkTargets: {
        capital: "/management/promotion-allocation?tab=real-ranking&persona=persona-paper-capital",
      },
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetCapitalHref(row)).toBe(
      "/management/performance?tab=overview&persona_id=persona-paper-capital&capital_pool_id=paper-ledger-persona-paper-capital",
    );
  });

  it("ignores retired capital targets and keeps persona performance context", () => {
    expect(personaFleetCapitalHref({
      personaId: "persona-old-capital-path",
      linkTargets: {
        capitalPool: "/management/capital/pool-tw-paper",
      },
    } as unknown as ManagementPersonaFleetRow)).toBe(
      "/management/performance?tab=overview&persona_id=persona-old-capital-path",
    );

    expect(personaFleetCapitalHref({
      personaId: "persona-old-capital-query",
      linkTargets: {
        capitalPool: "/management/capital?pool=pool-from-query",
      },
    } as unknown as ManagementPersonaFleetRow)).toBe(
      "/management/performance?tab=overview&persona_id=persona-old-capital-query",
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
      "/management/performance?tab=attribution&dimension=persona&persona=persona-snake-case",
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
    const shioaji = { providerKey: "shioaji", provider: "Shioaji quote", status: "read_ok" } as unknown as ManagementDataSource;
    const mops = { providerKey: "mops", provider: "MOPS", status: "public_reference_unavailable" } as unknown as ManagementDataSource;

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
    const source = { providerKey: "shioaji", provider: "Shioaji quote", status: "read_ok" } as unknown as ManagementDataSource;

    expect(personaFleetDataSourcesHref(row)).toBeNull();
    expect(personaFleetDataSourcesHref(row, source)).toBeNull();
  });

  it("links to research loop focus when no canonical experiment target exists", () => {
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
    expect(personaFleetResearchLoopHref(row)).toBe(
      "/management/loops/research?persona=persona-crypto&project=research-crypto-paper-001",
    );
    expect(personaFleetArtifactHref(row)).toBeNull();
  });

  it("does not treat non-detail research targets as research title hrefs", () => {
    const row = {
      personaId: "persona-detail-scope",
      currentResearchProjects: [
        {
          projectId: "research-project-with-wrong-target",
          title: "Research project with wrong target",
          stage: "orient",
          frameworks: ["qlib"],
          blockedByTaskIds: [],
          canDeploy: false,
        },
      ],
      linkTargets: {
        research: "/management/data-sources?persona=persona-detail-scope",
        orient: "/management/human-inbox?persona=persona-detail-scope",
      },
    } as ManagementPersonaFleetRow;

    const [item] = personaFleetResearchItems(row);

    expect(personaFleetResearchHref(row, item)).toBeNull();
    expect(personaFleetResearchLoopHref(row, item)).toBe(
      "/management/loops/research?persona=persona-detail-scope&project=research-project-with-wrong-target",
    );
  });

  it("keeps loop-only research targets out of title hrefs and removes unavailable query values", () => {
    const row = {
      personaId: "persona-loop-only",
      currentResearchProjects: [
        {
          projectId: "nan",
          title: "Loop-only research execution",
          stage: "act",
          frameworks: ["vectorbt"],
          blockedByTaskIds: [],
          canDeploy: false,
          linkTargets: {
            research: "/management/loops/research?persona=persona-loop-only&project=nan",
          },
        },
      ],
    } as unknown as ManagementPersonaFleetRow;

    const [item] = personaFleetResearchItems(row);

    expect(personaFleetResearchHref(row, item)).toBeNull();
    expect(personaFleetResearchLoopHref(row)).toBe(
      "/management/loops/research?persona=persona-loop-only",
    );
    expect(personaFleetResearchLoopHref(row, item)).toBe(
      "/management/loops/research?persona=persona-loop-only",
    );
  });

  it("uses each research project's own detail href instead of the first project href", () => {
    const row = {
      personaId: "persona-multi-research",
      currentResearchProjects: [
        {
          projectId: "research-project-alpha",
          title: "Alpha project",
          stage: "orient",
          frameworks: ["qlib"],
          experimentId: "exp-alpha",
          blockedByTaskIds: [],
          canDeploy: true,
          linkTargets: {
            research: "/management/experiments/exp-alpha",
          },
        },
        {
          projectId: "research-project-beta",
          title: "Beta project",
          stage: "review",
          frameworks: ["vectorbt"],
          experimentId: "exp-beta",
          blockedByTaskIds: [],
          canDeploy: false,
          linkTargets: {
            research: "/management/research/exp-beta",
          },
        },
      ],
      linkTargets: {
        research: "/management/experiments/exp-row-level",
      },
    } as unknown as ManagementPersonaFleetRow;

    const [alpha, beta] = personaFleetResearchItems(row);

    expect(personaFleetResearchHref(row, alpha)).toBe("/management/experiments/exp-alpha");
    expect(personaFleetResearchHref(row, beta)).toBe("/management/experiments/exp-beta");
  });

  it("derives stable capital, performance, and mutation links from slim rows", () => {
    const row = {
      persona_id: "persona-crypto-paper",
      capital_pool_id: "pool-crypto-paper",
      perf_delta: 0.182,
      last_mutation: "2026-06-03",
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetCapitalHref(row)).toBe(
      "/management/performance?tab=overview&persona_id=persona-crypto-paper&capital_pool_id=pool-crypto-paper",
    );
    expect(personaFleetPerformanceHref(row)).toBe(
      "/management/performance?tab=attribution&dimension=persona&persona=persona-crypto-paper",
    );
    expect(personaFleetMutationHref(row)).toBe(
      "/management/evolution-journal?persona=persona-crypto-paper&source=fleet_summary",
    );
  });

  it("uses persona performance capital context for paper rows", () => {
    const row = {
      persona_id: "persona-crypto-paper",
      capital_mode: "paper",
      capital_pool_id: "pool-crypto-paper",
      paper_ledger_id: "paper-ledger-persona-crypto-paper",
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetCapitalHref(row)).toBe(
      "/management/performance?tab=overview&persona_id=persona-crypto-paper&capital_pool_id=paper-ledger-persona-crypto-paper",
    );

    expect(personaFleetCapitalHref({
      ...row,
      paper_capital_pool_id: "pool-explicit-shared-paper",
    } as unknown as ManagementPersonaFleetRow)).toBe(
      "/management/performance?tab=overview&persona_id=persona-crypto-paper&capital_pool_id=paper-ledger-persona-crypto-paper",
    );

    expect(personaFleetCapitalHref({
      persona_id: "persona-paper-slim",
      capital_pool_id: "pool-crypto-paper",
      paper_ledger_id: "paper-ledger-persona-paper-slim",
    } as unknown as ManagementPersonaFleetRow)).toBe(
      "/management/performance?tab=overview&persona_id=persona-paper-slim&capital_pool_id=paper-ledger-persona-paper-slim",
    );

    expect(personaFleetCapitalHref({
      persona_id: "persona-shared-paper",
      capital_mode: "paper",
      paper_capital_pool_id: "pool-explicit-shared-paper",
    } as unknown as ManagementPersonaFleetRow)).toBe(
      "/management/performance?tab=overview&persona_id=persona-shared-paper",
    );
  });

  it("derives capital links from paper ledger ids when no capital pool is declared", () => {
    const row = {
      persona_id: "persona-paper-ledger",
      paper_ledger_id: "paper-ledger-persona-paper-ledger",
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetCapitalHref(row)).toBe(
      "/management/performance?tab=overview&persona_id=persona-paper-ledger&capital_pool_id=paper-ledger-persona-paper-ledger",
    );
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

  it("uses a persona-scoped research loop when no active project target exists", () => {
    const row = {
      personaId: "persona-live-without-project",
    } as ManagementPersonaFleetRow;

    expect(personaFleetResearchHref(row)).toBeNull();
    expect(personaFleetResearchLoopHref(row)).toBe(
      "/management/loops/research?persona=persona-live-without-project",
    );
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

  it("links performance display to persona-scoped attribution when no canonical target exists", () => {
    const row = {
      personaId: "persona-with-performance",
      perfDelta: 0.42,
    } as ManagementPersonaFleetRow;

    expect(personaFleetPerformanceHref(row)).toBe(
      "/management/performance?tab=attribution&dimension=persona&persona=persona-with-performance",
    );
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
  it("normalizes unavailable and date-shaped mutation query values case-insensitively", () => {
    expect(normalizeEvolutionFocusToken("NaN", true)).toBe("");
    expect(normalizeEvolutionFocusToken("UNDEFINED", true)).toBe("");
    expect(normalizeEvolutionFocusToken("2026-06-03", true)).toBe("");
    expect(normalizeEvolutionFocusToken("evo-dec-formal", true)).toBe("evo-dec-formal");
  });

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

describe("MGMT-OPS-009 Persona Fleet and Evolution Journal Link Semantics", () => {
  it("uses formal mutation link when mutation_entry_id or evolution_entry_id is present", () => {
    const row = {
      personaId: "persona-20260528-04688755",
      mutationEntryId: "mutation-review-123",
      evolutionEntryId: "evo-456",
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetMutationHref(row)).toBe(
      "/management/evolution-journal?persona=persona-20260528-04688755&mutation_review=mutation-review-123"
    );
  });

  it("uses fallback-only link for persona-20260528-04688755 when formal ids are absent but last mutation context is useful", () => {
    const row = {
      personaId: "persona-20260528-04688755",
      lastMutation: "2026-06-03",
      lastMutationKind: "fleet_summary",
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetMutationHref(row)).toBe(
      "/management/evolution-journal?persona=persona-20260528-04688755&source=fleet_summary"
    );
  });

  it("suppresses invalid ids (like nan or date format as ID) and avoids emitting them in query params", () => {
    const row = {
      personaId: "persona-20260528-04688755",
      mutationEntryId: "nan",
      evolutionEntryId: "2026-06-03",
      lastMutation: "2026-06-03",
      lastMutationKind: "fleet_summary",
    } as unknown as ManagementPersonaFleetRow;

    // should fallback to fleet_summary URL rather than emitting invalid mutation_review
    expect(personaFleetMutationHref(row)).toBe(
      "/management/evolution-journal?persona=persona-20260528-04688755&source=fleet_summary"
    );
  });

  it("returns null for no-data/no-link state", () => {
    const row = {
      personaId: "persona-20260528-04688755",
      lastMutation: "—",
      lastMutationKind: "unavailable",
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetMutationHref(row)).toBeNull();
  });
});
