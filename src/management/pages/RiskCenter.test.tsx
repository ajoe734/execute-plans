import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import {
  bffV1,
  managementConsoleReads,
  NON_TERMINAL_INCIDENT_STATUS_FILTER,
  normalizeCapitalPool,
  normalizeCapitalPools,
  PAGINATED_LIST_PAGE_SIZE,
  type Alert,
  type ApprovalRequest,
  type CapitalPool,
  type Incident,
  type Job,
  type Persona,
  type Runtime,
  type Strategy,
} from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { LiveStatusBanner } from "@/components/layout/LiveStatusBanner";
import { NotificationCenter, useNotificationCenter } from "@/platform/components/NotificationCenter";
import { EvolutionDetail } from "./EvolutionDetail";
import { IncidentDetail } from "./IncidentDetail";
import { DRAWDOWN_BREACH_THRESHOLD, isDrawdownBreach, RiskCenter } from "./RiskCenter";
import { StrategyDetail } from "./StrategyDetail";

function renderRiskCenter() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/management/risk"]}>
        <RiskCenter />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("RiskCenter", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  describe("drawdown breach sign check against owner-stored fractional ratio", () => {
    it("verifies drawdown breach fires when positive owner-stored max_drawdown exceeds 0.1", () => {
      expect(DRAWDOWN_BREACH_THRESHOLD).toBe(0.1);
      expect(isDrawdownBreach(0.18)).toBe(true);
      expect(isDrawdownBreach({ drawdown: 0.18 })).toBe(true);
      expect(isDrawdownBreach({ drawdown: 0.1001 })).toBe(true);
      expect(isDrawdownBreach({ drawdown: 0.1 })).toBe(false);
      expect(isDrawdownBreach({ drawdown: 0.05 })).toBe(false);
      expect(isDrawdownBreach({ drawdown: 0 })).toBe(false);
      expect(isDrawdownBreach({ drawdown: -0.18 })).toBe(false);
      expect(isDrawdownBreach({ drawdown: null })).toBe(false);
      expect(isDrawdownBreach({ drawdown: Number.NaN })).toBe(false);
    });
  });

  it("loads non-draft strategies, all-page personas/pools/runtimes, and server-filtered open incidents while stating drafts are excluded", async () => {
    const strategies: Strategy[] = Array.from({ length: 26 }, (_, idx) => ({
      id: idx === 25 ? "strategy-persona-298e138c136c9840b0e4" : `strategy-approved-${idx + 1}`,
      name: idx === 25 ? "青禾｜2330 台股 Paper 學習 R2 Paper Strategy" : `Approved Strategy ${idx + 1}`,
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "approved",
      risk: idx === 0 ? "high" : "low",
      alpha: "alpha.v1",
      capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
      personaIds: ["persona-be19a1fac471247f2b2a"],
      pnl30d: 0.04,
      sharpe: 1.5,
      drawdown: idx === 0 ? 0.18 : 0.03,
    }));

    const personas: Persona[] = Array.from({ length: 25 }, (_, idx) => ({
      id: idx === 24 ? "persona-be19a1fac471247f2b2a" : `persona-${idx + 1}`,
      name: idx === 24 ? "青禾｜2330 台股 Paper 學習 R2" : `Persona ${idx + 1}`,
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "approved",
      risk: "low",
      archetype: "quant",
      routedStrategies: 1,
      successRate: 0.65,
    }));

    const pools: CapitalPool[] = [
      {
        id: "pool-1",
        name: "Primary Pool",
        owner: "treasury",
        updatedAt: "2026-10-18T17:20:36.224810Z",
        state: "approved",
        risk: "low",
        currency: "USD",
        allocated: 1_000_000,
        utilized: 800_000,
        riskBudget: 0.05,
      },
      {
        id: "pool-persona-paper-298e138c136c9840b0e4",
        name: "pool-persona-paper-298e138c136c9840b0e4",
        owner: "treasury",
        updatedAt: "2026-10-18T17:20:36.224810Z",
        state: "approved",
        risk: "medium",
        currency: "USD",
        allocated: 1_000_000,
        utilized: 950_000,
        riskBudget: 0.05,
      },
    ];

    const runtimes: Runtime[] = [
      {
        id: "rt-535a82a3",
        name: "rt-535a82a3",
        kind: "executor",
        env: "paper",
        status: "running",
        cpu: 0.2,
        memory: 0.3,
        latencyP95Ms: 12,
        uptimePct: 99.9,
        region: "asia-east1",
        updatedAt: "2026-10-18T17:20:36.224810Z",
      },
    ];

    const incidents: Incident[] = [
      {
        id: "inc-open-1",
        title: "Active Drawdown Alert",
        severity: "high",
        status: "open",
        openedAt: "2026-10-18T17:20:36.224810Z",
        affected: ["strategy-approved-1"],
        timeline: [],
      },
      {
        id: "inc-resolved-ignored",
        title: "Historical Resolved Incident",
        severity: "low",
        status: "resolved",
        openedAt: "2026-10-10T00:00:00Z",
        affected: [],
        timeline: [],
      },
    ];

    const alerts: Alert[] = [];

    const listNonDraftSpy = vi.spyOn(bffV1.strategies, "listNonDraft").mockResolvedValue(strategies);
    const personasSpy = vi.spyOn(bffV1.personas, "list").mockResolvedValue(personas);
    const poolsSpy = vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue(pools);
    const runtimesSpy = vi.spyOn(bffV1.runtimes, "list").mockResolvedValue(runtimes);
    const incidentsSpy = vi.spyOn(bffV1.incidents, "list").mockResolvedValue(incidents);
    vi.spyOn(bffV1.alerts, "list").mockResolvedValue(alerts);
    vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);

    renderRiskCenter();

    await waitFor(() => {
      expect(listNonDraftSpy).toHaveBeenCalledTimes(1);
      expect(personasSpy).toHaveBeenCalledTimes(1);
      expect(poolsSpy).toHaveBeenCalledTimes(1);
      expect(runtimesSpy).toHaveBeenCalledTimes(1);
      expect(incidentsSpy).toHaveBeenCalledWith({ status: NON_TERMINAL_INCIDENT_STATUS_FILTER });
    });

    const incidentsCard = await screen.findByTestId("risk-card-incidents");
    expect(within(incidentsCard).getByText("1")).toBeInTheDocument();

    const drawdownCard = screen.getByTestId("risk-card-drawdown");
    expect(within(drawdownCard).getByText("1")).toBeInTheDocument();
    expect(within(drawdownCard).getByText(/Draft strategies excluded/i)).toBeInTheDocument();

    expect(screen.getByTestId("risk-matrix-drafts-excluded")).toHaveTextContent("Draft strategies excluded");
    const strategyMatrixRow = screen.getByTestId("breach-matrix-row-strategy");
    expect(within(strategyMatrixRow).getByText("1")).toBeInTheDocument();
    expect(within(strategyMatrixRow).getByText("25")).toBeInTheDocument();

    const strategiesTab = screen.getByRole("tab", { name: /Strategy/i });
    fireEvent.mouseDown(strategiesTab);
    fireEvent.click(strategiesTab);

    expect(await screen.findByTestId("risk-strategies-drafts-excluded")).toHaveTextContent(
      "Draft strategies excluded",
    );
    expect(screen.getByText("青禾｜2330 台股 Paper 學習 R2 Paper Strategy")).toBeInTheDocument();
  });

  it("shows loading state on cards while promises are pending and never shows 0 while loading", () => {
    vi.spyOn(bffV1.incidents, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.alerts, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.strategies, "listNonDraft").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.capitalPools, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.runtimes, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.personas, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.tools, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.mcpServers, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.skills, "list").mockReturnValue(new Promise(() => {}));

    renderRiskCenter();

    for (const testId of [
      "risk-card-incidents",
      "risk-card-drawdown",
      "risk-card-utilization",
      "risk-card-degraded",
    ]) {
      const card = screen.getByTestId(testId);
      expect(within(card).getByText("Loading…")).toBeInTheDocument();
      expect(within(card).queryByText("0")).not.toBeInTheDocument();
    }
  });

  it("shows unavailable state for failed reads while other cards still render their real values and never shows 0 on failure", async () => {
    vi.spyOn(bffV1.incidents, "list").mockRejectedValue(new Error("incidents down"));
    vi.spyOn(bffV1.strategies, "listNonDraft").mockRejectedValue(new Error("strategies down"));
    vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.personas, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue([
      {
        id: "pool-util-breach",
        name: "High Util Pool",
        owner: "treasury",
        updatedAt: "2026-10-18T17:20:36.224810Z",
        state: "approved",
        risk: "high",
        currency: "USD",
        allocated: 1_000_000,
        utilized: 950_000,
        riskBudget: 0.05,
      },
    ]);
    vi.spyOn(bffV1.runtimes, "list").mockResolvedValue([
      {
        id: "rt-degraded-1",
        name: "rt-degraded-1",
        kind: "executor",
        env: "paper",
        status: "warning",
        cpu: 0.8,
        memory: 0.7,
        latencyP95Ms: 140,
        uptimePct: 98.1,
        region: "asia-east1",
        updatedAt: "2026-10-18T17:20:36.224810Z",
      },
    ]);

    renderRiskCenter();

    const incidentsCard = await screen.findByTestId("risk-card-incidents");
    const drawdownCard = screen.getByTestId("risk-card-drawdown");
    const utilCard = screen.getByTestId("risk-card-utilization");
    const degradedCard = screen.getByTestId("risk-card-degraded");

    await waitFor(() => {
      expect(within(incidentsCard).getByText("Unavailable")).toBeInTheDocument();
      expect(within(drawdownCard).getByText("Unavailable")).toBeInTheDocument();
      expect(within(utilCard).getByText("1")).toBeInTheDocument();
      expect(within(degradedCard).getByText("1")).toBeInTheDocument();
    });

    expect(within(incidentsCard).queryByText("0")).not.toBeInTheDocument();
    expect(within(drawdownCard).queryByText("0")).not.toBeInTheDocument();
  });

  it("counts all 21 open incidents across two paginated BFF pages and preserves the non-terminal status filter on every page read", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    const encodedStatus = encodeURIComponent(NON_TERMINAL_INCIDENT_STATUS_FILTER);
    const page1OpenIncidents = Array.from({ length: 20 }, (_, idx) => ({
      incident_id: `inc-open-${idx + 1}`,
      severity: idx % 2 === 0 ? "high" : "medium",
      status: (["open", "investigating", "mitigating", "in_progress"] as const)[idx % 4],
      summary: `Open Incident ${idx + 1}`,
      detected_at: "2026-10-18T17:20:36.224810Z",
    }));
    const page2OpenIncidents = [
      {
        incident_id: "inc-open-21",
        severity: "critical",
        status: "open",
        summary: "Open Incident 21 Beyond First Page",
        detected_at: "2026-10-18T18:20:36.224810Z",
      },
    ];

    const incidentUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("/bff/incidents")) {
        incidentUrls.push(url);
      }
      if (url === `/bff/incidents?status=${encodedStatus}&page_size=${PAGINATED_LIST_PAGE_SIZE}`) {
        return new Response(
          JSON.stringify({
            incidents: page1OpenIncidents,
            page_info: { page_size: 20, total: 21, next_page_token: "20" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url ===
        `/bff/incidents?status=${encodedStatus}&page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=20`
      ) {
        return new Response(
          JSON.stringify({
            incidents: page2OpenIncidents,
            page_info: { page_size: 20, total: 21, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.spyOn(bffV1.strategies, "listNonDraft").mockResolvedValue([
      {
        id: "strategy-persona-298e138c136c9840b0e4",
        name: "青禾｜2330 台股 Paper 學習 R2 Paper Strategy",
        owner: "operator",
        updatedAt: "2026-10-18T17:20:36.224810Z",
        state: "approved",
        risk: "low",
        alpha: "alpha.tw.2330",
        capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
        personaIds: ["persona-be19a1fac471247f2b2a"],
        pnl30d: null,
        sharpe: null,
        drawdown: null,
      },
    ]);
    vi.spyOn(bffV1.personas, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.runtimes, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);

    renderRiskCenter();

    const incidentsCard = await screen.findByTestId("risk-card-incidents");
    await waitFor(() => {
      expect(within(incidentsCard).getByText("21")).toBeInTheDocument();
    });

    expect(incidentUrls).toEqual([
      `/bff/incidents?status=${encodedStatus}&page_size=${PAGINATED_LIST_PAGE_SIZE}`,
      `/bff/incidents?status=${encodedStatus}&page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=20`,
    ]);

    const incidentsTab = screen.getByRole("tab", { name: /Incident/i });
    fireEvent.mouseDown(incidentsTab);
    fireEvent.click(incidentsTab);
    expect(await screen.findByText("Open Incident 21 Beyond First Page")).toBeInTheDocument();
  });

  describe("alerts timeout_fallback vs healthy/degraded-composed payloads (FE-ALERTS-NOT-EMPTY-20261107)", () => {
    const timeoutFallbackPayload = {
      alerts: [],
      summary: {
        total_active: 0,
        highest_severity: null,
        by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        by_category: { incident: 0, runtime: 0, risk: 0, governance: 0 },
      },
      meta: {
        snapshot_at: "2026-11-07T00:00:00Z",
        acknowledgement_supported: true,
        surfaces: {
          alerts: {
            status: "degraded",
            source: "timeout_fallback",
            message: "Alert aggregation timed out under concurrent read fanout; degraded empty response returned.",
            reason: "read_timeout",
          },
        },
      },
    };

    const realAlertRow = {
      alert_id: "alert-incident-inc-001",
      severity: "critical",
      category: "incident",
      raised_at: "2026-04-18T06:05:00Z",
      summary: "Active incident: Unexpected drawdown in persona-alpha.",
      target_ref: {
        surface_id: "PKT-002",
        label: "Open incident response",
        href: "/management/incidents/inc-001",
        target_id: "inc-001",
      },
    };

    it("shows the existing error state in the RiskCenter alert table when GET /bff/alerts returns timeout_fallback while other slices still render and no site-wide banner opens", async () => {
      vi.stubEnv("MODE", "development");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("VITE_BFF_MODE", "live");
      vi.stubEnv("VITE_BFF_FALLBACK", "strict");
      liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/bff/alerts") {
          return new Response(JSON.stringify(timeoutFallbackPayload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      vi.spyOn(bffV1.strategies, "listNonDraft").mockResolvedValue([
        {
          id: "strategy-persona-298e138c136c9840b0e4",
          name: "青禾｜2330 台股 Paper 學習 R2 Paper Strategy",
          owner: "operator",
          updatedAt: "2026-10-18T17:20:36.224810Z",
          state: "approved",
          risk: "high",
          alpha: "alpha.tw.2330",
          capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
          personaIds: ["persona-be19a1fac471247f2b2a"],
          pnl30d: 0.04,
          sharpe: 1.5,
          drawdown: 0.18,
        },
      ]);
      vi.spyOn(bffV1.personas, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue([
        {
          id: "pool-persona-paper-298e138c136c9840b0e4",
          name: "Primary Paper Pool",
          owner: "treasury",
          updatedAt: "2026-10-18T17:20:36.224810Z",
          state: "approved",
          risk: "medium",
          currency: "USD",
          allocated: 1_000_000,
          utilized: 950_000,
          riskBudget: 0.05,
        },
      ]);
      vi.spyOn(bffV1.runtimes, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.incidents, "list").mockResolvedValue([
        {
          id: "inc-open-1",
          title: "Active Drawdown Incident",
          severity: "high",
          status: "open",
          openedAt: "2026-10-18T17:20:36.224810Z",
          affected: ["strategy-persona-298e138c136c9840b0e4"],
          timeline: [],
        },
      ]);

      const { container } = render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={["/management/risk"]}>
            <LiveStatusBanner />
            <RiskCenter />
          </MemoryRouter>
        </I18nextProvider>,
      );

      const incidentsCard = await screen.findByTestId("risk-card-incidents");
      const utilCard = screen.getByTestId("risk-card-utilization");
      const drawdownCard = screen.getByTestId("risk-card-drawdown");
      await waitFor(() => {
        expect(within(incidentsCard).getByText("1")).toBeInTheDocument();
        expect(within(utilCard).getByText("1")).toBeInTheDocument();
        expect(within(drawdownCard).getByText("1")).toBeInTheDocument();
      });

      expect(screen.getByText("Primary Paper Pool")).toBeInTheDocument();

      const incidentsTab = screen.getByRole("tab", { name: /Incident/i });
      fireEvent.mouseDown(incidentsTab);
      fireEvent.click(incidentsTab);

      expect(await screen.findByText("Active Drawdown Incident")).toBeInTheDocument();
      const emptyCell = await screen.findByTestId("data-table-empty");
      expect(emptyCell).toHaveTextContent("Unavailable");
      expect(emptyCell).not.toHaveTextContent("No results found.");

      expect(liveStatus.get().effective).toBe("live");
      expect(liveStatus.get().lastError).toBeUndefined();
      expect(container.textContent).not.toMatch(/strict typed error|seed fallback|資料來源：seed/i);
    });

    it("shows empty state for a healthy zero-alert response and renders real alert rows when a contributing surface is degraded", async () => {
      vi.stubEnv("MODE", "development");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("VITE_BFF_MODE", "live");
      vi.stubEnv("VITE_BFF_FALLBACK", "strict");
      liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

      const healthyZeroPayload = {
        alerts: [],
        summary: {
          total_active: 0,
          highest_severity: null,
          by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          by_category: { incident: 0, runtime: 0, risk: 0, governance: 0 },
        },
        meta: {
          snapshot_at: "2026-11-07T00:00:00Z",
          acknowledgement_supported: true,
          surfaces: {
            alerts: { status: "ok", source: "bff_composed" },
          },
        },
      };

      const degradedComposedPayload = {
        alerts: [realAlertRow],
        summary: {
          total_active: 1,
          highest_severity: "critical",
          by_severity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
          by_category: { incident: 1, runtime: 0, risk: 0, governance: 0 },
        },
        meta: {
          snapshot_at: "2026-11-07T00:00:00Z",
          acknowledgement_supported: true,
          surfaces: {
            alerts: {
              status: "degraded",
              source: "bff_composed",
              message: "Operator alert feed is available, but one or more contributing surfaces are degraded.",
            },
          },
        },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(healthyZeroPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      vi.spyOn(bffV1.strategies, "listNonDraft").mockResolvedValue([]);
      vi.spyOn(bffV1.personas, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.runtimes, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.incidents, "list").mockResolvedValue([
        {
          id: "inc-open-1",
          title: "Open Incident Row",
          severity: "high",
          status: "open",
          openedAt: "2026-10-18T17:20:36.224810Z",
          affected: [],
          timeline: [],
        },
      ]);

      const firstRender = renderRiskCenter();
      const incidentsTab = screen.getByRole("tab", { name: /Incident/i });
      fireEvent.mouseDown(incidentsTab);
      fireEvent.click(incidentsTab);

      expect(await screen.findByText("Open Incident Row")).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId("data-table-empty")).toHaveTextContent("No results found.");
      });
      firstRender.unmount();

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(degradedComposedPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      renderRiskCenter();
      const incidentsTab2 = screen.getByRole("tab", { name: /Incident/i });
      fireEvent.mouseDown(incidentsTab2);
      fireEvent.click(incidentsTab2);

      expect(
        await screen.findByText("Active incident: Unexpected drawdown in persona-alpha."),
      ).toBeInTheDocument();
      expect(screen.getByText("incident")).toBeInTheDocument();
    });

    it("keeps NotificationCenter approvals/jobs/incidents and StrategyDetail, IncidentDetail, and EvolutionDetail rendering when only GET /bff/alerts fell back", async () => {
      vi.stubEnv("MODE", "development");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("VITE_BFF_MODE", "live");
      vi.stubEnv("VITE_BFF_FALLBACK", "strict");
      liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/bff/alerts") {
          return new Response(JSON.stringify(timeoutFallbackPayload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/bff/evolution-programs/evo-001")) {
          return new Response(
            JSON.stringify({
              data: {
                id: "evo-001",
                name: "Alpha Evolution Program",
                targetId: "strategy-001",
                status: "running",
                originKind: "manual",
                allowedActions: [],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ data: [], items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      vi.spyOn(bffV1.approvals, "list").mockResolvedValue([
        {
          id: "apv-101",
          kind: "StrategyPromotion",
          subject: "Promote Strategy 001",
          requester: "operator",
          riskLevel: "medium",
          state: "pending",
          createdAt: "2026-11-07T00:00:00Z",
        } as ApprovalRequest,
      ]);
      vi.spyOn(bffV1.jobs, "list").mockResolvedValue([
        {
          id: "job-101",
          kind: "backtest",
          status: "running",
          owner: "operator",
          startedAt: "2026-11-07T00:00:00Z",
        } as Job,
      ]);
      vi.spyOn(bffV1.incidents, "list").mockResolvedValue([
        {
          id: "inc-101",
          title: "Feed Latency Spike",
          severity: "high",
          status: "open",
          openedAt: "2026-11-07T00:00:00Z",
        } as Incident,
      ]);

      act(() => {
        useNotificationCenter.getState().setOpen(true);
      });

      const ncRender = render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <NotificationCenter />
          </MemoryRouter>
        </I18nextProvider>,
      );

      const approvalsTab = await screen.findByRole("tab", { name: /Approvals/i });
      fireEvent.mouseDown(approvalsTab);
      fireEvent.click(approvalsTab);
      expect(await screen.findByText("Promote Strategy 001")).toBeInTheDocument();

      const jobsTab = screen.getByRole("tab", { name: /work items/i });
      fireEvent.mouseDown(jobsTab);
      fireEvent.click(jobsTab);
      expect(await screen.findByText("backtest")).toBeInTheDocument();

      const incidentsTab = screen.getByRole("tab", { name: /Incidents/i });
      fireEvent.mouseDown(incidentsTab);
      fireEvent.click(incidentsTab);
      expect(await screen.findByText("Feed Latency Spike")).toBeInTheDocument();

      act(() => {
        useNotificationCenter.getState().setOpen(false);
      });
      ncRender.unmount();

      // StrategyDetail still renders
      vi.spyOn(bffV1.strategies, "get").mockResolvedValue({
        id: "strategy-001",
        name: "Resilient Strategy 001",
        alpha: "alpha-001",
        state: "approved",
        risk: "low",
        owner: "operator",
        capitalPoolId: "pool-001",
        personaIds: ["persona-001"],
        pnl30d: 0.02,
        sharpe: 1.4,
        drawdown: 0.03,
        updatedAt: "2026-11-07T00:00:00Z",
      } as Strategy);
      vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.research, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.evolution, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.watchers, "forSubject").mockResolvedValue([]);
      vi.spyOn(bffV1.decisionJournal, "forSubject").mockResolvedValue([]);
      vi.spyOn(managementConsoleReads, "lineage").mockResolvedValue({
        nodes: [],
        edges: [],
        meta: { status: "ok", source: "service_client", surfaces: {} },
        page_info: { total: 0, page_size: 0, has_more: false },
        has_more: false,
      });

      const stratRender = render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={["/management/strategies/strategy-001"]}>
            <Routes>
              <Route path="/management/strategies/:id" element={<StrategyDetail />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>,
      );
      expect(await screen.findByText("Resilient Strategy 001")).toBeInTheDocument();
      stratRender.unmount();

      // IncidentDetail still renders
      vi.spyOn(bffV1.incidents, "get").mockResolvedValue({
        id: "inc-101",
        title: "Feed Latency Spike",
        severity: "high",
        status: "open",
        openedAt: "2026-11-07T00:00:00Z",
        affected: [],
        timeline: [],
      } as Incident);
      vi.spyOn(bffV1.strategies, "listNonDraft").mockResolvedValue([]);
      vi.spyOn(bffV1.runtimes, "list").mockResolvedValue([]);

      const incRender = render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={["/management/incidents/inc-101"]}>
            <Routes>
              <Route path="/management/incidents/:id" element={<IncidentDetail />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>,
      );
      expect(await screen.findByText("Feed Latency Spike")).toBeInTheDocument();
      incRender.unmount();

      // EvolutionDetail still renders
      const evoRender = render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={["/management/evolution/evo-001"]}>
            <Routes>
              <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>,
      );
      expect(await screen.findByText("Alpha Evolution Program")).toBeInTheDocument();
      evoRender.unmount();
    });
  });

  describe("archived and retired capital pool exclusion (FE-RISK-CENTER-ARCHIVED-POOLS-20261107)", () => {
    const REAL_CAPITAL_POOL_ROW_KEYS = [
      "approval_digest",
      "pool_id",
      "tenant_id",
      "name",
      "owner_id",
      "owner_type",
      "status",
      "created_at",
      "description",
      "currency",
      "budget",
      "risk_policy_ref",
      "single_runtime_enforced",
      "updated_at",
      "metadata",
      "idempotent_replay",
      "id",
      "capital_pool_id",
      "risk_limits",
    ] as const;

    type RealRawCapitalPoolRow = Record<(typeof REAL_CAPITAL_POOL_ROW_KEYS)[number], unknown>;

    function buildRealRawCapitalPoolRow(overrides: {
      id: string;
      name: string;
      status: string | null | undefined;
      currency?: string;
      budget?: number | null;
      single_runtime_enforced?: boolean;
    }): RealRawCapitalPoolRow {
      return {
        approval_digest: "sha256:722683662ad5b1bff909722683662ad5b1bff909722683662ad5b1bff9090000",
        pool_id: overrides.id,
        tenant_id: "default",
        name: overrides.name,
        owner_id: "persona-722683662ad5b1bff909",
        owner_type: "persona",
        status: overrides.status,
        created_at: "2026-10-18T17:20:36.224810Z",
        description: null,
        currency: overrides.currency ?? "TWD",
        budget: overrides.budget !== undefined ? overrides.budget : null,
        risk_policy_ref: "policy-default",
        single_runtime_enforced: overrides.single_runtime_enforced ?? true,
        updated_at: "2026-10-18T17:20:36.224810Z",
        metadata: {},
        idempotent_replay: false,
        id: overrides.id,
        capital_pool_id: overrides.id,
        risk_limits: null,
      };
    }

    it("feeds 142 rows with the exact real BFF key set (136 archived, 5 active, 1 suspended) and asserts 6 table rows, matrix capital count of 6, and note count of 136", async () => {
      const archivedRows: RealRawCapitalPoolRow[] = Array.from({ length: 136 }, (_, idx) =>
        idx === 0
          ? buildRealRawCapitalPoolRow({
              id: "pool-persona-paper-722683662ad5b1bff909",
              name: "衡岳｜台股 Paper 操盤學習 paper pool",
              status: "archived",
              currency: "TWD",
              budget: null,
              single_runtime_enforced: true,
            })
          : buildRealRawCapitalPoolRow({
              id: `pool-persona-paper-archived-${idx + 1}`,
              name: `Archived Persona Paper Pool ${idx + 1}`,
              status: "archived",
              currency: "TWD",
              budget: null,
              single_runtime_enforced: true,
            }),
      );

      const activeRows: RealRawCapitalPoolRow[] = Array.from({ length: 5 }, (_, idx) =>
        buildRealRawCapitalPoolRow({
          id: `pool-persona-paper-active-${idx + 1}`,
          name: `Active Persona Pool ${idx + 1}`,
          status: "active",
          currency: "TWD",
          budget: 1_000_000,
          single_runtime_enforced: true,
        }),
      );

      const suspendedRows: RealRawCapitalPoolRow[] = [
        buildRealRawCapitalPoolRow({
          id: "pool-persona-paper-suspended-1",
          name: "Suspended Persona Pool 1",
          status: "suspended",
          currency: "TWD",
          budget: 500_000,
          single_runtime_enforced: true,
        }),
      ];

      const rawRows: RealRawCapitalPoolRow[] = [...archivedRows, ...activeRows, ...suspendedRows];
      expect(rawRows).toHaveLength(142);

      const expectedSortedKeys = [...REAL_CAPITAL_POOL_ROW_KEYS].sort();
      for (const row of rawRows) {
        expect(Object.keys(row).sort()).toEqual(expectedSortedKeys);
        expect("state" in row).toBe(false);
      }

      const normalizedPools = normalizeCapitalPools(rawRows);
      expect(normalizedPools).toHaveLength(142);

      const poolsSpy = vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue(normalizedPools);
      vi.spyOn(bffV1.strategies, "listNonDraft").mockResolvedValue([]);
      vi.spyOn(bffV1.personas, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.runtimes, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.incidents, "list").mockResolvedValue([]);

      renderRiskCenter();

      await waitFor(() => {
        expect(poolsSpy).toHaveBeenCalledTimes(1);
      });

      const capitalNote = await screen.findByTestId("risk-capital-archived-pools-excluded");
      const matrixNote = screen.getByTestId("risk-matrix-archived-pools-excluded");
      await waitFor(() => {
        expect(capitalNote).toHaveTextContent("Archived capital pools excluded (136)");
        expect(matrixNote).toHaveTextContent("Archived capital pools excluded (136)");
      });

      const capitalMatrixRow = screen.getByTestId("breach-matrix-row-capital");
      expect(capitalMatrixRow.firstElementChild?.textContent).toBe(
        "Capital (Archived capital pools excluded)",
      );
      expect(
        within(capitalMatrixRow).getByText("Capital (Archived capital pools excluded)"),
      ).toBeInTheDocument();
      expect(within(capitalMatrixRow).getByText("6")).toBeInTheDocument();
      expect(within(capitalMatrixRow).queryByText("136")).not.toBeInTheDocument();
      expect(within(capitalMatrixRow).queryByText("142")).not.toBeInTheDocument();

      const tableRows = screen.getAllByRole("row").slice(1); // exclude header row
      expect(tableRows).toHaveLength(6);
      for (let i = 1; i <= 5; i += 1) {
        expect(screen.getByText(`Active Persona Pool ${i}`)).toBeInTheDocument();
      }
      expect(screen.getByText("Suspended Persona Pool 1")).toBeInTheDocument();
      expect(screen.queryByText("衡岳｜台股 Paper 操盤學習 paper pool")).not.toBeInTheDocument();

      await act(async () => {
        await i18n.changeLanguage("zh-TW");
      });
      expect(screen.getByTestId("risk-capital-archived-pools-excluded")).toHaveTextContent(
        "不含已封存資金池（已排除 136 筆）",
      );
      expect(screen.getByTestId("risk-matrix-archived-pools-excluded")).toHaveTextContent(
        "不含已封存資金池（已排除 136 筆）",
      );
      expect(capitalMatrixRow.firstElementChild?.textContent).toBe("資金 (不含已封存資金池)");
      expect(within(capitalMatrixRow).getByText("資金 (不含已封存資金池)")).toBeInTheDocument();
    });

    it("keeps pools with status active, suspended, or no status in every view and excludes archived and retired pools from the table, matrix, utilization breach card, and critical/high cards", async () => {
      const rawActive = buildRealRawCapitalPoolRow({
        id: "pool-active",
        name: "Active Pool Kept",
        status: "active",
        budget: 1_000_000,
      });
      const rawSuspended = buildRealRawCapitalPoolRow({
        id: "pool-suspended",
        name: "Suspended Pool Kept",
        status: "suspended",
        budget: 1_000_000,
      });
      const rawNoStatus = buildRealRawCapitalPoolRow({
        id: "pool-no-status",
        name: "No-Status Pool Kept",
        status: null,
        budget: 1_000_000,
      });
      const rawArchived = buildRealRawCapitalPoolRow({
        id: "pool-archived",
        name: "Archived Pool Dropped",
        status: "archived",
        budget: 1_000_000,
      });
      const rawRetired = buildRealRawCapitalPoolRow({
        id: "pool-retired",
        name: "Retired Pool Dropped",
        status: "retired",
        budget: 1_000_000,
      });

      const normActive = normalizeCapitalPool(rawActive)!;
      const normSuspended = normalizeCapitalPool(rawSuspended)!;
      const normNoStatus = normalizeCapitalPool(rawNoStatus)!;
      const normArchived = normalizeCapitalPool(rawArchived)!;
      const normRetired = normalizeCapitalPool(rawRetired)!;

      expect(normActive.state).toBeUndefined();
      expect(normSuspended.state).toBe("paused");
      expect(normNoStatus.state).toBeUndefined();
      expect(normArchived.state).toBe("retired");
      expect(normRetired.state).toBe("retired");

      const poolsForView: CapitalPool[] = [
        { ...normActive, allocated: 1_000_000, utilized: 950_000, risk: "high" },
        { ...normSuspended, allocated: 1_000_000, utilized: 500_000, risk: "critical" },
        { ...normNoStatus, allocated: 1_000_000, utilized: 200_000, risk: "low" },
        { ...normArchived, allocated: 1_000_000, utilized: 990_000, risk: "critical" },
        { ...normRetired, allocated: 1_000_000, utilized: 980_000, risk: "high" },
      ];

      vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue(poolsForView);
      vi.spyOn(bffV1.strategies, "listNonDraft").mockResolvedValue([]);
      vi.spyOn(bffV1.personas, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.runtimes, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.incidents, "list").mockResolvedValue([]);

      renderRiskCenter();

      await waitFor(() => {
        expect(screen.getByTestId("risk-capital-archived-pools-excluded")).toHaveTextContent(
          "Archived capital pools excluded (2)",
        );
        expect(screen.getByTestId("risk-matrix-archived-pools-excluded")).toHaveTextContent(
          "Archived capital pools excluded (2)",
        );
      });

      // Capital tab table keeps active, suspended, and no-status pools and drops archived + retired
      const tableRows = screen.getAllByRole("row").slice(1);
      expect(tableRows).toHaveLength(3);
      expect(screen.getByText("Active Pool Kept")).toBeInTheDocument();
      expect(screen.getByText("Suspended Pool Kept")).toBeInTheDocument();
      expect(screen.getByText("No-Status Pool Kept")).toBeInTheDocument();
      expect(screen.queryByText("Archived Pool Dropped")).not.toBeInTheDocument();
      expect(screen.queryByText("Retired Pool Dropped")).not.toBeInTheDocument();

      // Utilization breach card counts only Active Pool Kept (1), not the two retired >90% pools
      const utilCard = screen.getByTestId("risk-card-utilization");
      expect(within(utilCard).getByText("1")).toBeInTheDocument();

      // Critical and High object cards count only the non-retired pools (1 critical, 1 high)
      const criticalCard = screen.getByTestId("risk-card-critical");
      const highCard = screen.getByTestId("risk-card-high");
      expect(within(criticalCard).getByText("1")).toBeInTheDocument();
      expect(within(highCard).getByText("1")).toBeInTheDocument();

      // Breach matrix capital row shows 1 low, 1 high, 1 critical (total 3, excluding the 2 retired pools)
      const capitalMatrixRow = screen.getByTestId("breach-matrix-row-capital");
      expect(capitalMatrixRow.firstElementChild?.textContent).toBe(
        "Capital (Archived capital pools excluded)",
      );
      expect(
        within(capitalMatrixRow).getByText("Capital (Archived capital pools excluded)"),
      ).toBeInTheDocument();
      expect(within(capitalMatrixRow).getAllByText("1")).toHaveLength(3);
    });

    it("renders the exact breach matrix capital row label without count or nested parentheses for a ready pool read while keeping the excluded count in the matrix header and capital tab notes (FE-RISK-MATRIX-POOL-LABEL-20261108)", async () => {
      const normalizedPools = normalizeCapitalPools([
        buildRealRawCapitalPoolRow({
          id: "pool-active-1",
          name: "Active Pool 1",
          status: "active",
          budget: 1_000_000,
        }),
        ...Array.from({ length: 142 }, (_, idx) =>
          buildRealRawCapitalPoolRow({
            id: `pool-archived-${idx + 1}`,
            name: `Archived Pool ${idx + 1}`,
            status: "archived",
            budget: null,
          }),
        ),
      ]);

      vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue(normalizedPools);
      vi.spyOn(bffV1.strategies, "listNonDraft").mockResolvedValue([]);
      vi.spyOn(bffV1.personas, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.runtimes, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.incidents, "list").mockResolvedValue([]);

      renderRiskCenter();

      await waitFor(() => {
        expect(screen.getByTestId("risk-matrix-archived-pools-excluded")).toHaveTextContent(
          /^Archived capital pools excluded \(142\)$/,
        );
        expect(screen.getByTestId("risk-capital-archived-pools-excluded")).toHaveTextContent(
          /^Archived capital pools excluded \(142\)$/,
        );
      });

      const strategyMatrixRow = screen.getByTestId("breach-matrix-row-strategy");
      const capitalMatrixRow = screen.getByTestId("breach-matrix-row-capital");
      expect(strategyMatrixRow.firstElementChild?.textContent).toBe(
        "Strategy (Draft strategies excluded)",
      );
      expect(capitalMatrixRow.firstElementChild?.textContent).toBe(
        "Capital (Archived capital pools excluded)",
      );
      expect(capitalMatrixRow.firstElementChild?.textContent).not.toMatch(/\d/);
      expect(capitalMatrixRow.firstElementChild?.textContent).not.toMatch(/\(.*\(|\).*\)/);

      await act(async () => {
        await i18n.changeLanguage("zh-TW");
      });

      expect(screen.getByTestId("risk-matrix-archived-pools-excluded")).toHaveTextContent(
        /^不含已封存資金池（已排除 142 筆）$/,
      );
      expect(screen.getByTestId("risk-capital-archived-pools-excluded")).toHaveTextContent(
        /^不含已封存資金池（已排除 142 筆）$/,
      );
      expect(strategyMatrixRow.firstElementChild?.textContent).toBe("策略 (不含草稿策略)");
      expect(capitalMatrixRow.firstElementChild?.textContent).toBe("資金 (不含已封存資金池)");
      expect(capitalMatrixRow.firstElementChild?.textContent).not.toMatch(/\d/);
      expect(capitalMatrixRow.firstElementChild?.textContent).not.toContain("（");
      expect(capitalMatrixRow.firstElementChild?.textContent).not.toContain("）");
    });

    it("shows loading state on pending pool read and unavailable state on failed pool read without ever showing 0", async () => {
      vi.spyOn(bffV1.strategies, "listNonDraft").mockResolvedValue([]);
      vi.spyOn(bffV1.personas, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.runtimes, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
      vi.spyOn(bffV1.incidents, "list").mockResolvedValue([]);

      const poolsSpy = vi.spyOn(bffV1.capitalPools, "list").mockReturnValue(new Promise(() => {}));

      const pendingRender = renderRiskCenter();

      const utilCardPending = screen.getByTestId("risk-card-utilization");
      expect(within(utilCardPending).getByText("Loading…")).toBeInTheDocument();
      expect(within(utilCardPending).queryByText("0")).not.toBeInTheDocument();
      expect(screen.getByTestId("risk-capital-archived-pools-excluded")).toHaveTextContent(
        "Archived capital pools excluded",
      );
      expect(screen.getByTestId("risk-capital-archived-pools-excluded").textContent).not.toContain("0");
      expect(screen.getByTestId("risk-matrix-archived-pools-excluded").textContent).not.toContain("0");

      pendingRender.unmount();

      poolsSpy.mockRejectedValue(new Error("capital pools read failed"));
      renderRiskCenter();

      const utilCardError = await screen.findByTestId("risk-card-utilization");
      const criticalCardError = screen.getByTestId("risk-card-critical");
      const highCardError = screen.getByTestId("risk-card-high");
      const capitalMatrixRow = screen.getByTestId("breach-matrix-row-capital");

      await waitFor(() => {
        expect(within(utilCardError).getByText("Unavailable")).toBeInTheDocument();
        expect(within(criticalCardError).getByText("Unavailable")).toBeInTheDocument();
        expect(within(highCardError).getByText("Unavailable")).toBeInTheDocument();
        expect(within(capitalMatrixRow).getAllByText("Unavailable")).toHaveLength(4);
        expect(screen.getByTestId("data-table-empty")).toHaveTextContent("Unavailable");
      });

      expect(within(utilCardError).queryByText("0")).not.toBeInTheDocument();
      expect(within(criticalCardError).queryByText("0")).not.toBeInTheDocument();
      expect(within(highCardError).queryByText("0")).not.toBeInTheDocument();
      expect(within(capitalMatrixRow).queryByText("0")).not.toBeInTheDocument();
      expect(screen.getByTestId("risk-capital-archived-pools-excluded").textContent).not.toContain("0");
      expect(screen.getByTestId("risk-matrix-archived-pools-excluded").textContent).not.toContain("0");
    });
  });
});
