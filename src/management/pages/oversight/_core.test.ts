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

describe("PersonaFleetPage data source badges", () => {
  it("prioritizes readable providers before truncating", () => {
    const row = {
      dataSources: [
        { providerKey: "twse", provider: "TWSE OpenAPI", status: "read_unavailable" },
        { providerKey: "tpex", provider: "TPEx E-Data", status: "read_unavailable" },
        { providerKey: "mops", provider: "MOPS", status: "public_reference_unavailable" },
        { providerKey: "tej", provider: "TEJ API", status: "credential_unavailable" },
        { providerKey: "shioaji", provider: "Shioaji quote", status: "read_ok" },
      ],
    } as ManagementPersonaFleetRow;

    expect(visibleDataSources(row).map((source) => source.providerKey)).toEqual([
      "shioaji",
      "twse",
      "tpex",
      "mops",
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
    } as ManagementPersonaFleetRow;

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

  it("routes OODA stages to the existing stage-specific management pages", () => {
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
    } as ManagementPersonaFleetRow;

    expect(personaFleetOodaHref({ ...baseRow, ooda: "Observe" })).toBe(
      "/management/data-sources?persona=persona-tw-live",
    );
    expect(personaFleetOodaHref({ ...baseRow, ooda: "Orient" })).toBe(
      "/management/experiments/exp-mgmt-qlib-006",
    );
    expect(personaFleetOodaHref({ ...baseRow, ooda: "Decide" })).toBe(
      "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-tw-live",
    );
    expect(personaFleetOodaHref({ ...baseRow, ooda: "Act" })).toBe(
      "/management/runtimes?persona=persona-tw-live",
    );
    expect(personaFleetOodaHref({ ...baseRow, ooda: "Learn" })).toBe(
      "/management/evolution-journal?persona=persona-tw-live",
    );
  });

  it("includes runtime and binding context on Act links when live rows declare them", () => {
    const row = {
      personaId: "persona-tw-live",
      ooda: "Act",
      runtime_id: "rt-rescue-0260528-5937dea1",
      runtime_binding_id: "rb-433f2a614995432b9e7a463c882dbefb",
    } as unknown as ManagementPersonaFleetRow;

    expect(personaFleetRuntimeHref(row)).toBe(
      "/management/runtimes?persona=persona-tw-live&runtime=rt-rescue-0260528-5937dea1&binding=rb-433f2a614995432b9e7a463c882dbefb",
    );
    expect(personaFleetOodaHref(row)).toBe(
      "/management/runtimes?persona=persona-tw-live&runtime=rt-rescue-0260528-5937dea1&binding=rb-433f2a614995432b9e7a463c882dbefb",
    );
  });

  it("falls back to the research loop when an item has no experiment detail id", () => {
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

    expect(personaFleetResearchHref(row)).toBe(
      "/management/loops/research?persona=persona-crypto&project=research-crypto-paper-001",
    );
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
    } as unknown as ManagementPersonaFleetRow;

    const [item] = personaFleetResearchItems(row);

    expect(item.title).toBe("Qlib TW cross-sectional equity alpha admission linkage");
    expect(item.canDeploy).toBe(false);
    expect(personaFleetResearchHref(row, item)).toBe("/management/experiments/exp-mgmt-qlib-006");
    expect(personaFleetArtifactHref(row, item)).toBe(
      "/management/artifacts/qlib-tw-cross-sectional-alpha-model-draft-v1",
    );
  });

  it("links to the persona-scoped research loop when there is no active research project", () => {
    const row = {
      personaId: "persona-live-without-project",
    } as ManagementPersonaFleetRow;

    expect(personaFleetResearchHref(row)).toBe(
      "/management/loops/research?persona=persona-live-without-project",
    );
  });
});
