import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { bffV1 } from "@/lib/bff-v1";
import * as transport from "@/lib/bff-v1/client";
import { decisionsHref } from "@/lib/entityLinks";
import { StrategyDetail } from "@/management/pages/StrategyDetail";
import { PostmortemLibraryPage } from "@/management/pages/phase2/PostmortemLibrary";

type PublicBffSurface = typeof import("@/lib/bff-v1");
type RequiredLiveClient =
  | "askManagementAi"
  | "bffFetch"
  | "bffV1"
  | "commandReceiptDescription"
  | "fetchAssistantModeStatus"
  | "listTradeJourneys"
  | "normalizeAlertTimestampFields"
  | "readBffEnv"
  | "strictLiveRead";
type MissingLiveClient = Exclude<RequiredLiveClient, keyof PublicBffSurface>;
type Assert<T extends true> = T;
type CompleteLiveClient = Assert<[MissingLiveClient] extends [never] ? true : false>;

const completeLiveClient: CompleteLiveClient = true;
void completeLiveClient;

const COMPLETE_BFF_PUBLIC_MODULES = [
  "./dto",
  "./errors",
  "./headers",
  "./paths",
  "./client",
  "./sse/channels",
  "./sse/protocol",
  "./sse/bridge",
  "./sse/liveSse",
  "./lists",
  "./degradation",
  "./useLiveListV1",
  "./writes",
  "./me",
  "./writeGate",
  "./personas",
  "./liveStatus",
  "./liveTransport",
  "./seedTaxonomy",
  "./capitalPools",
  "./strategies",
  "./rankingFormulas",
  "./rebalances",
  "./deployments",
  "./evolution",
  "./research",
  "./artifacts",
  "./capabilities",
  "./operations",
  "./governance",
  "./search",
  "./writeOverlay",
  "./evidenceOperations",
  "./v5",
  "./management",
  "./managementConsoleReads",
  "./shellSummary",
  "./agora/types",
  "./agora/governance",
  "./tradeJournal",
  "./agora/interaction",
  "./managementDataSources",
  "./managementAi",
  "./loopTruthTypes",
  "./tradeJourneys",
  "./commandReceipt",
  "./eventTimestamps",
  "./domainReads",
  "./runtimeEnv",
  "./bffV1",
] as const;

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), "src", relativePath), "utf8");
}

function publicExportSources(index: string): string[] {
  return Array.from(index.matchAll(/^export \* from "([^"]+)";$/gm), ([, module]) => module);
}

describe("full production operation assembly", () => {
  it("keeps the desktop route graph on protected production route modules", () => {
    const app = source("App.tsx");

    expect(app).toContain("<Route element={<ProtectedRoute><PlatformShellRoute /></ProtectedRoute>}>");
    expect(app).toContain('<Route path="/management" element={<ManagementLayoutRoute />}>');
    expect(app).toContain('<Route path="cockpit" element={<CockpitRoute />} />');
    expect(app).toContain('<Route path="personas" element={<PersonasListRoute />} />');
    expect(app).toContain('<Route path="postmortems" element={<PostmortemLibraryRoute />} />');
    expect(app).toContain('<Route path="/agora" element={<ProtectedRoute><AgoraLayoutRoute /></ProtectedRoute>}>');
    expect(app).not.toMatch(/(?:from|import\()\s*["'][^"']*(?:\/mocks?\/|mock[A-Z_a-z-]*)/i);
  });

  it("keeps the Management shell projected from its typed production manifest", () => {
    const layout = source("management/ManagementLayout.tsx");

    expect(layout).toContain('import { MANAGEMENT_SIDEBAR_GROUPS } from "@/management/navigation/managementRouteManifest";');
    expect(layout).toContain("const groups: NavGroup[] = MANAGEMENT_SIDEBAR_GROUPS.map");
    expect(layout).toContain("<SideNav groups={groups} />");
    expect(layout).toContain('<ErrorBoundary key={useLocation().pathname} scope="Management page">');
    expect(layout).toContain("<Outlet />");
    expect(layout).not.toMatch(/(?:from|import\()\s*["'][^"']*(?:\/mocks?\/|mock[A-Z_a-z-]*)/i);
  });

  it("exports the complete typed live BFF client set without a mock public export", () => {
    const index = source("lib/bff-v1/index.ts");
    const exports = publicExportSources(index);

    expect(exports).toEqual(COMPLETE_BFF_PUBLIC_MODULES);
    expect(exports).not.toContain("./mocks/adapters");
    expect(exports).not.toContain("./mocks/registry");
    expect(index).toContain('export { runActionSafe, type RunActionSafeOpts } from "./runActionSafe";');
    expect(index).toContain('export { useLiveList, useRealtimeStatus } from "./useLiveList";');
  });
});

describe("management reads after retiring dead Agora clients", () => {
  beforeEach(() => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue({
      id: "stg_test", name: "Surviving strategy", alpha: "alpha_test", state: "draft",
      risk: "low", owner: "operator", capitalPoolId: "pool_test", personaIds: [],
      pnl30d: 0, sharpe: 0, drawdown: 0,
      updatedAt: "2026-09-30T00:00:00Z",
    });
    const lists: Array<{ list: () => Promise<unknown[]> }> = [bffV1.jobs, bffV1.audit, bffV1.approvals, bffV1.alerts, bffV1.incidents, bffV1.artifacts, bffV1.research, bffV1.evolution];
    for (const client of lists) {
      vi.spyOn(client, "list").mockResolvedValue([]);
    }
    vi.spyOn(bffV1.watchers, "forSubject").mockResolvedValue([]);
    vi.spyOn(bffV1.decisionJournal, "forSubject").mockResolvedValue([
      { id: "j1", subjectKind: "Strategy", subjectId: "stg_test", title: "Journal still available", decidedBy: "operator", decidedAt: "" },
    ]);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  function renderStrategy() {
    return render(<MemoryRouter initialEntries={["/management/strategies/stg_test"]}>
      <Routes><Route path="/management/strategies/:id" element={<StrategyDetail />} /></Routes>
    </MemoryRouter>);
  }

  it.each(["jobs", "audit", "approvals", "alerts", "incidents", "artifacts", "research", "evolution"] as const)("keeps the strategy and journal visible when %s fails", async (client) => {
    vi.mocked(bffV1[client].list as () => Promise<unknown[]>).mockRejectedValueOnce(new Error("Unavailable"));
    renderStrategy();
    expect(await screen.findByText("Surviving strategy")).toBeInTheDocument();
    expect(screen.getByText("Journal still available")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Some strategy data could not be loaded");
  });

  it.each(["watchers", "decisionJournal"] as const)("keeps the strategy visible when %s fails", async (client) => {
    vi.mocked(bffV1[client].forSubject).mockRejectedValueOnce(new Error("Unavailable"));
    renderStrategy();
    expect(await screen.findByText("Surviving strategy")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Some strategy data could not be loaded");
  });

  it("ends loading with an explicit error when the strategy read fails", async () => {
    vi.mocked(bffV1.strategies.get).mockRejectedValueOnce(new Error("Unavailable"));
    renderStrategy();
    expect(await screen.findByRole("alert")).toHaveTextContent("Strategy could not be loaded.");
  });

  it("shows real API postmortem records and opens their canonical detail", async () => {
    const record = { report_id: "report-1", title: "Persisted review", root_cause: "Read-store timeout" };
    const fetch = vi.spyOn(transport, "bffFetch").mockResolvedValueOnce({ data: [record], meta: { total: 1 } })
      .mockResolvedValueOnce({ data: record });
    render(<MemoryRouter><PostmortemLibraryPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Persisted review"));
    expect(await screen.findByText("Read-store timeout")).toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(1, { method: "GET", path: "/api/v1/postmortems" });
    expect(fetch).toHaveBeenNthCalledWith(2, { method: "GET", path: "/api/v1/postmortems/report-1" });
  });

  it("links decisions to live strategy or audit pages", () => {
    expect(decisionsHref("stg_test")).toBe("/management/strategies/stg_test");
    expect(decisionsHref("Strategy", "a/b")).toBe("/management/strategies/a%2Fb");
    expect(decisionsHref("Persona", "p1")).toBe("/management/audit?target=p1");
    expect(decisionsHref()).toBe("/management/audit");
  });
});
