import { describe, it, expect } from "vitest";
import {
  composeCockpit, defaultCockpitSeed, OODA_PHASES,
} from "@/lib/v5/management/cockpit";
import {
  MANAGEMENT_ANOMALY_SEVERITIES, MANAGEMENT_ANOMALY_DOMAINS,
  sortAnomaliesBySeverity, severityWeight,
} from "@/lib/v5/management/anomaly";
import {
  HUMAN_INBOX_KINDS, humanInboxRank,
} from "@/lib/v5/management/humanInbox";
import {
  RANKING_BLOCKS, defaultPulseRankings,
} from "@/lib/v5/management/tradingRankings";
import { askManagementNl, ManagementNlError } from "@/lib/bff-v1/managementNl";
import { paths } from "@/lib/bff-v1/paths";

describe("PM-3 composeCockpit", () => {
  it("produces 9 system-state fields, 10 loop nodes, 10 edges, OODA cells per persona", () => {
    const m = composeCockpit(defaultCockpitSeed());
    expect(m.strip.fields).toHaveLength(9);
    expect(m.loopFlow.nodes).toHaveLength(10);
    expect(m.loopFlow.edges).toHaveLength(10);
    expect(m.matrix.phases).toEqual(OODA_PHASES);
    expect(m.matrix.cells.length).toBe(m.matrix.personas.length * OODA_PHASES.length);
    expect(m.anomalies.length).toBeLessThanOrEqual(8);
  });
  it("sorts anomalies critical-first", () => {
    const m = composeCockpit(defaultCockpitSeed());
    expect(m.anomalies[0].severity).toBe("critical");
  });
});

describe("PM-5 anomaly model", () => {
  it("exposes 5 severities and 12 domains", () => {
    expect(MANAGEMENT_ANOMALY_SEVERITIES).toHaveLength(5);
    expect(MANAGEMENT_ANOMALY_DOMAINS).toHaveLength(12);
  });
  it("severityWeight orders correctly", () => {
    expect(severityWeight("critical")).toBeGreaterThan(severityWeight("high"));
    expect(severityWeight("low")).toBeGreaterThan(severityWeight("info"));
  });
  it("sortAnomaliesBySeverity is descending", () => {
    const seed = defaultCockpitSeed();
    const out = sortAnomaliesBySeverity(seed.anomalies);
    for (let i = 1; i < out.length; i++) {
      expect(severityWeight(out[i - 1].severity)).toBeGreaterThanOrEqual(severityWeight(out[i].severity));
    }
  });
});

describe("PM-6 human inbox", () => {
  it("exposes 10 kinds with unique rank (PM-12: ranking_recommendation added)", () => {
    expect(HUMAN_INBOX_KINDS).toHaveLength(10);
    const ranks = new Set(HUMAN_INBOX_KINDS.map((k) => humanInboxRank(k)));
    expect(ranks.size).toBe(10);
  });
});

describe("PM-4 trading rankings", () => {
  it("provides 8 ranking blocks and default rows", () => {
    expect(RANKING_BLOCKS).toHaveLength(8);
    const blocks = defaultPulseRankings();
    expect(blocks).toHaveLength(8);
    expect(blocks.every((b) => b.rows.every((r) => !!r.links.manageHref))).toBe(true);
  });
});

describe("PM-8 NL: explain intents in fixed mock", () => {
  it("answers explain_current_page without throwing", () => {
    const ans = askManagementNl(
      { prompt: "explain this page" },
      { provider: "fixed_mock", gatewayEnabled: false, strict: false },
    );
    expect(ans.intent).toBe("explain_current_page");
    expect(ans.provider).toBe("fixed_mock");
  });
  it("strict mode refuses (no silent mock fallback)", () => {
    expect(() => askManagementNl(
      { prompt: "anything" },
      { provider: "fixed_mock", gatewayEnabled: false, strict: true },
    )).toThrow(ManagementNlError);
  });
  it("gateway enabled is forbidden in Phase 1", () => {
    expect(() => askManagementNl(
      { prompt: "anything" },
      { provider: "fixed_mock", gatewayEnabled: true, strict: false },
    )).toThrow(ManagementNlError);
  });
});

describe("PM-9 aggregate paths + PM-10 canonical write path", () => {
  it("management aggregate paths are all prefixed under /bff/management/", () => {
    const aggregates = [
      paths.mgmtCockpit(), paths.mgmtPersonaFleet(), paths.mgmtHumanInbox(),
      paths.mgmtHumanInboxItem("x"), paths.mgmtTradingPulse(), paths.mgmtTradingRankings(),
      paths.mgmtEvolutionJournal(), paths.mgmtEvidenceExplorer(), paths.mgmtPersonaIntent(),
      paths.mgmtReadinessEp5(), paths.mgmtReadinessBrokerLive(), paths.mgmtReadinessCapitalBinding(),
      paths.mgmtReadinessBffHa(), paths.mgmtReadinessStrictPublish(),
    ];
    expect(aggregates).toHaveLength(14);
    expect(aggregates.every((p) => p.startsWith("/bff/management/"))).toBe(true);
  });
  it("paths.action builds the canonical /bff/actions/{type}/{id}/{action} shape", () => {
    expect(paths.action("persona", "alpha", "suspend")).toBe("/bff/actions/persona/alpha/suspend");
  });
});

// Debug transparency guard — visibility labels must not hide fields in the UI.
describe("Persona Intent Trace shape is debug-transparent", () => {
  it("renders restricted rows with the same field set as summary rows", async () => {
    const mod = await import("@/lib/v5/management/personaIntent");
    expect(mod.intentDisplayRules("restricted")).toMatchObject({
      showSummary: true,
      showInterpretation: true,
      showToolsUsed: true,
      showRiskFlags: true,
      showEvidenceRefs: true,
      showOnlyMetadata: false,
    });
  });
});
