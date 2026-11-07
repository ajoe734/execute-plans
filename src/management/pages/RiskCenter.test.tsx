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
});
