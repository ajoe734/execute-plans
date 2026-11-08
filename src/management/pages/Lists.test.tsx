import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lists, type Deployment, type Persona, type Strategy } from "@/lib/bff-v1";
import {
  DeploymentsList,
  PersonasList,
  RankingFormulasList,
  StrategiesList,
  extractHiddenRetiredPersonaCount,
  extractStrategyPageInfoTotal,
  extractStrategyStateCounts,
  normalizeStrategyFilterParam,
  normalizeStrategyOperationalStatus,
  resolveStrategyListQuery,
  shortenHash,
} from "./Lists";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shortenHash", () => {
  it("shortens the real artifact sha256 and keeps prefix", () => {
    const full = "sha256:38fb8f49fbee0b7131014b14c432fdd8dc521d522b4c76be2e04d002608e008e";
    const short = shortenHash(full);
    expect(short).toBe("sha256:38fb8f49…e008e".replace("…e008e", "…" + full.slice(-6)));
    expect(short.length).toBeLessThan(full.length / 2);
    expect(full.startsWith("sha256:38fb8f49")).toBe(true);
    expect(full.endsWith(short.slice(-6))).toBe(true);
  });
  it("leaves short values alone", () => {
    expect(shortenHash("abc123")).toBe("abc123");
  });
});

describe("StrategiesList state filter and query helpers", () => {
  it("maps default, all, and explicit DTO state filters to BFF query options", () => {
    expect(normalizeStrategyFilterParam(null)).toBe("default");
    expect(normalizeStrategyFilterParam("")).toBe("default");
    expect(normalizeStrategyFilterParam("default")).toBe("default");
    expect(normalizeStrategyFilterParam("approved")).toBe("approved");
    expect(normalizeStrategyFilterParam("paper_running")).toBe("paper_running");
    expect(normalizeStrategyFilterParam("all")).toBe("all");

    expect(resolveStrategyListQuery("default")).toEqual({
      exclude_state: "draft",
      hide_retired_personas: true,
      page_size: 20,
    });
    expect(resolveStrategyListQuery("all", "20")).toEqual({
      page_size: 20,
      page_token: "20",
    });
    expect(resolveStrategyListQuery("approved", "40")).toEqual({
      state: "approved",
      page_size: 20,
      page_token: "40",
    });
  });

  it("extracts per-state counts, page_info.total, and hidden_retired_persona_count without client-side defaultCount summing", () => {
    const meta = {
      state_counts: {
        draft: 3217,
        review: 1,
        approved: 140,
        paper_running: 0,
        canary_running: 0,
        live_running: 0,
        deployed: 0,
        paused: 0,
        retired: 1556,
      },
      hidden_retired_persona_count: 134,
      page_info: { page_size: 20, total: 7, next_page_token: null },
    };
    const counts = extractStrategyStateCounts(meta);
    expect(counts).toEqual({
      byState: {
        draft: 3217,
        review: 1,
        approved: 140,
        paper_running: 0,
        canary_running: 0,
        live_running: 0,
        deployed: 0,
        paused: 0,
        retired: 1556,
      },
      allCount: 3358,
      draftCount: 3217,
    });
    expect("defaultCount" in (counts ?? {})).toBe(false);
    expect(extractStrategyPageInfoTotal(meta)).toBe(7);
    expect(extractHiddenRetiredPersonaCount(meta)).toBe(134);

    expect(extractStrategyStateCounts({ state_counts: null })).toBeNull();
    expect(extractStrategyStateCounts({})).toBeNull();
    expect(extractStrategyStateCounts(null)).toBeNull();
    expect(extractStrategyPageInfoTotal({ page_info: {} })).toBeUndefined();
    expect(extractHiddenRetiredPersonaCount({})).toBeUndefined();
  });

  it("renders distinct operationalStatus labels for running, idle, retired, unbound, and unknown and never shows unknown as running or retired", async () => {
    expect(normalizeStrategyOperationalStatus("running")).toBe("running");
    expect(normalizeStrategyOperationalStatus("idle")).toBe("idle");
    expect(normalizeStrategyOperationalStatus("retired")).toBe("retired");
    expect(normalizeStrategyOperationalStatus("unbound")).toBe("unbound");
    expect(normalizeStrategyOperationalStatus("unknown")).toBe("unknown");

    const rows: Strategy[] = [
      {
        id: "strategy-persona-b9f9e2e4d44cdd44d160",
        name: "Pantheon Dev Paper Release 42345302114 Attempt 1",
        owner: "persona-22582e56e0ad8a4f0ca7",
        updatedAt: "2026-11-07T07:40:00Z",
        state: "approved",
        risk: "low",
        alpha: "",
        capitalPoolId: "pool-persona-paper-b9f9e2e4d44cdd44d160",
        personaIds: ["persona-22582e56e0ad8a4f0ca7"],
        personaStates: [{ personaId: "persona-22582e56e0ad8a4f0ca7", state: "paper_running" }],
        operationalStatus: "running",
        symbols: ["2330.TW"],
        pnl: 0,
        pnl30d: 0,
        sharpe: null,
        drawdown: null,
        totalTrades: 0,
      },
      {
        id: "strategy-persona-idle-row",
        name: "Research Only Strategy",
        owner: "operator",
        updatedAt: "2026-11-07T07:40:00Z",
        state: "approved",
        risk: "low",
        alpha: "",
        capitalPoolId: "",
        personaIds: ["persona-research-1"],
        personaStates: [{ personaId: "persona-research-1", state: "research_only" }],
        operationalStatus: "idle",
        symbols: ["2330.TWSE"],
        pnl: null,
        pnl30d: null,
        sharpe: null,
        drawdown: null,
      },
      {
        id: "strategy-persona-retired-row",
        name: "Retired Persona Strategy",
        owner: "operator",
        updatedAt: "2026-11-07T07:40:00Z",
        state: "approved",
        risk: "low",
        alpha: "",
        capitalPoolId: "",
        personaIds: ["persona-retired-1"],
        personaStates: [{ personaId: "persona-retired-1", state: "retired" }],
        operationalStatus: "retired",
        symbols: ["2330.TW"],
        pnl: null,
        pnl30d: null,
        sharpe: null,
        drawdown: null,
      },
      {
        id: "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
        name: "TW Official 2330 Unbound",
        owner: "operator",
        updatedAt: "2026-11-07T07:40:00Z",
        state: "approved",
        risk: "low",
        alpha: "",
        capitalPoolId: "",
        personaIds: [],
        personaStates: [],
        operationalStatus: "unbound",
        symbols: ["2330.TW"],
        pnl: null,
        pnl30d: null,
        sharpe: null,
        drawdown: null,
      },
      {
        id: "strategy-persona-unknown-row",
        name: "Degraded Directory Strategy",
        owner: "operator",
        updatedAt: "2026-11-07T07:40:00Z",
        state: "approved",
        risk: "low",
        alpha: "",
        capitalPoolId: "",
        personaIds: ["persona-22582e56e0ad8a4f0ca7"],
        personaStates: [{ personaId: "persona-22582e56e0ad8a4f0ca7", state: "unknown" }],
        operationalStatus: "unknown",
        symbols: [],
        pnl: null,
        pnl30d: null,
        sharpe: null,
        drawdown: null,
      },
    ];

    vi.spyOn(lists, "strategies").mockResolvedValue({
      items: rows,
      cursor: {},
      pageSize: rows.length,
      estimatedTotal: rows.length,
      totalCountExact: true,
      meta: {
        state_counts: { draft: 3217, review: 1, approved: 140, retired: 1556 },
        hidden_retired_persona_count: 134,
        page_info: { page_size: 20, total: 7, next_page_token: null },
      },
    });

    render(
      <MemoryRouter initialEntries={["/management/strategies"]}>
        <StrategiesList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Pantheon Dev Paper Release 42345302114 Attempt 1")).toBeInTheDocument();
    });

    const badges = screen.getAllByTestId("strategy-operational-status");
    expect(badges).toHaveLength(5);
    const labelSet = new Set(badges.map((el) => el.textContent));
    expect(labelSet.size).toBe(5);
    expect(badges[4]).toHaveAttribute("data-operational-status", "unknown");
    expect(badges[4].textContent).toMatch(/Persona state could not be read|無法讀取 Persona 狀態/);
    expect(badges[4].textContent).not.toBe(badges[0].textContent);
    expect(badges[4].textContent).not.toBe(badges[2].textContent);

    const symbolCells = screen.getAllByTestId("strategy-symbols");
    expect(symbolCells[0]).toHaveTextContent("2330.TW");
    expect(symbolCells[1]).toHaveTextContent("2330.TWSE");
  });
});

describe("PersonasList and DeploymentsList show every row across pages", () => {
  it("renders every persona row past the first 20 rows including provisioning-only retired row", async () => {
    const personaRows: Persona[] = Array.from({ length: 25 }, (_, index) => ({
      id: index === 24 ? "persona-c6ef44745087d11cc138" : `persona-row-${index + 1}`,
      name:
        index === 0
          ? "青禾｜2330 台股 Paper 學習 R2"
          : index === 24
            ? "persona-c6ef44745087d11cc138"
            : `Persona Row ${index + 1}`,
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: index === 24 ? "retired" : "approved",
      risk: "low",
      archetype: "quant",
      routedStrategies: 1,
      successRate: 0.62,
    }));

    vi.spyOn(lists, "personas").mockResolvedValue({
      items: personaRows,
      cursor: {},
      pageSize: personaRows.length,
      estimatedTotal: personaRows.length,
      totalCountExact: true,
    });

    render(
      <MemoryRouter initialEntries={["/management/personas"]}>
        <PersonasList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("青禾｜2330 台股 Paper 學習 R2")).toBeInTheDocument();
      expect(screen.getByText("Persona Row 21")).toBeInTheDocument();
      expect(screen.getByText("persona-c6ef44745087d11cc138")).toBeInTheDocument();
    });
  });

  it("renders every deployment row past the first 20 rows normalized from plan_id", async () => {
    const deploymentRows: Deployment[] = Array.from({ length: 25 }, (_, index) => ({
      id:
        index === 24
          ? "plan-persona-paper-298e138c136c9840b0e4"
          : `plan-persona-paper-row-${index + 1}`,
      name:
        index === 24
          ? "plan-persona-paper-298e138c136c9840b0e4"
          : `plan-persona-paper-row-${index + 1}`,
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "deployed",
      risk: "low",
      target: "paper",
      artifactId: "artifact-persona-298e138c136c9840b0e4",
      version: "1",
    }));

    vi.spyOn(lists, "deployments").mockResolvedValue({
      items: deploymentRows,
      cursor: {},
      pageSize: deploymentRows.length,
      estimatedTotal: deploymentRows.length,
      totalCountExact: true,
    });

    render(
      <MemoryRouter initialEntries={["/management/deployments"]}>
        <DeploymentsList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("plan-persona-paper-row-1")).toBeInTheDocument();
      expect(screen.getByText("plan-persona-paper-row-21")).toBeInTheDocument();
      expect(screen.getByText("plan-persona-paper-298e138c136c9840b0e4")).toBeInTheDocument();
    });
  });
});

describe("RankingFormulasList real payload", () => {
  it("shows version and weight summary with no blank cells", async () => {
    vi.spyOn(lists, "rankingFormulas").mockResolvedValue({
      items: [{
        id: "pm12-quarterly-ranking-formula",
        version: "pm12-default-v1",
        formula_version: "pm12-default-v1",
        weights: { pnl: 0.35, risk: 0.25, execution: 0.25, activity: 0.15 },
        components: [
          { key: "pnl", label: "PnL", weight: 0.35 },
          { key: "risk", label: "Risk", weight: 0.25 },
          { key: "execution", label: "Execution", weight: 0.25 },
          { key: "activity", label: "Activity", weight: 0.15 },
        ],
      }],
      meta: {},
    } as never);
    render(<MemoryRouter><RankingFormulasList /></MemoryRouter>);
    expect(await screen.findByText("pm12-default-v1")).toBeInTheDocument();
    expect(screen.getByText("PnL 35% · Risk 25% · Execution 25% · Activity 15%")).toBeInTheDocument();
    document.querySelectorAll("tbody td").forEach((td) => expect(td.textContent?.trim()).not.toBe(""));
  });
});
